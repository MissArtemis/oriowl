import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTravel } from '../context/TravelContext';
import type { MapHandle, MapMessage, Place } from './types';

export function useExploreMap(send: MapHandle['send']) {
  const {
    entries,
    ready,
    apiUrl,
    setSelectedPlace,
    focusPlace,
    setFocusPlace,
    currentPlace,
    setCurrentPlace,
    notify,
  } = useTravel();
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'live' | 'demo' | 'error'>('loading');
  const [error, setError] = useState('');
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [locating, setLocating] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false),
    requestId = useRef(0),
    center = useRef(true),
    auto = useRef(false);
  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = false;
    setLocating(false);
  }, []);
  const reload = () => {
    requestId.current++;
    stop();
    auto.current = false;
    setStatus('loading');
    setError('');
    setRevision((v) => v + 1);
  };
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      setStatus('error');
      setError('地图连接超时，请确认手机和电脑连接同一 Wi-Fi。');
    }, 18000);
    return () => clearTimeout(timer);
  }, [status, revision, apiUrl]);
  useEffect(
    () => () => {
      requestId.current++;
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const receive = useCallback(
    (message: MapMessage) => {
      if (message.type === 'ready') {
        setStatus(message.configured ? 'live' : 'demo');
        setSearchConfigured(!!message.searchConfigured);
        setError('');
      }
      if (message.type === 'selected' && message.place) {
        setSelectedPlace(message.place);
        if (message.origin === 'user') center.current = false;
        if (message.origin === 'location') setCurrentPlace(message.place);
      }
      if (message.type === 'entry' && message.id)
        router.push({ pathname: '/memory/[id]', params: { id: message.id } });
      if (message.type === 'error') {
        setStatus('error');
        setError(message.message || '地图连接失败');
      }
      if (message.type === 'lookupError') notify(message.message || '地址暂不可用，已选中坐标');
      if (
        (message.type === 'located' || message.type === 'locationError') &&
        message.requestId === requestId.current
      ) {
        if (message.place) setCurrentPlace(message.place);
        if (message.settled !== false) {
          stop();
          if (message.message) notify(message.message);
        }
      }
    },
    [setSelectedPlace, setCurrentPlace, stop, notify],
  );
  useEffect(() => {
    if (status === 'live' && ready)
      send({
        type: 'entries',
        entries: entries.map((e) => ({
          id: e.id,
          title: e.title,
          place: e.place,
          hasPhoto: !!e.photos.length,
        })),
      });
  }, [status, entries, ready, send]);
  const focus = useCallback(
    (place: Place) => {
      center.current = false;
      setSelectedPlace(place);
      send({ type: 'focus', place });
    },
    [setSelectedPlace, send],
  );
  useEffect(() => {
    if (focusPlace && status === 'live') {
      focus(focusPlace);
      setFocusPlace(null);
    }
  }, [focusPlace, status, focus, setFocusPlace]);

  const locate = useCallback(async (shouldCenter = true) => {
    if (status !== 'live') {
      notify('地图连接后可定位，请检查「我的」中的服务设置');
      return;
    }
    if (currentPlace && shouldCenter) send({ type: 'focus', place: currentPlace, origin: 'location' });
    if (busy.current) return;
    center.current = shouldCenter;
    busy.current = true;
    setLocating(true);
    const id = ++requestId.current;
    const failed = (message: string) => {
      if (id === requestId.current) {
        requestId.current++;
        stop();
        notify(message);
      }
    };
    timers.current.push(setTimeout(() => failed('暂时无法获取位置，请允许位置权限后重试'), 45000));
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted)
        throw new Error('请在手机设置中允许 Expo Go 访问位置');
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('请打开手机定位服务');
      if (id !== requestId.current) return;
      if (!currentPlace) {
        const recent = await Location.getLastKnownPositionAsync({
          maxAge: 60000,
          requiredAccuracy: 150,
        }).catch(() => null);
        if (recent && id === requestId.current)
          send({
            type: 'locate',
            coords: recent.coords,
            requestId: id,
            settled: false,
            center: center.current,
          });
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          timers.current.push(setTimeout(() => reject(new Error('定位超时，请到室外或窗边重试')), 20000)),
        ),
      ]);
      if (id === requestId.current)
        send({
          type: 'locate',
          coords: position.coords,
          requestId: id,
          settled: true,
          center: center.current,
        });
    } catch (cause) {
      failed(cause instanceof Error ? cause.message : '定位失败，请重试');
    }
  }, [status, currentPlace, notify, stop, send]);
  useEffect(() => {
    if (status === 'live' && !auto.current) {
      auto.current = true;
      void locate(!focusPlace);
    }
  }, [status, locate, focusPlace]);
  return { revision, status, error, searchConfigured, locating, reload, receive, focus, locate };
}
