import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTravel } from '../context/TravelContext';
import { errorMessage } from './api';
import { pickPhotos } from './photoPicker';
import { draftPlace } from './draftPlace';
import type { Category, Photo, Place } from './types';

export function useComposeDraft() {
  const { selectedPlace, currentPlace, apiUrl, addEntry, notify } = useTravel();
  const { token, user } = useAuth();
  const initialPlace = useRef(selectedPlace);
  const [place, setPlace] = useState(selectedPlace);
  const manual = useRef(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState(''),
    [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('风景');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const working = useRef(false);
  const close = useCallback(() => {
    if (busy) return;
    if (title.trim() || body.trim() || photos.length) setDiscard(true);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [busy, title, body, photos.length]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => listener.remove();
  }, [close]);
  const pick = async (source: 'camera' | 'library' | 'original') => {
    if (working.current) return;
    if (photos.length >= 9) {
      setError('每篇笔记最多 9 张照片');
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const added = await pickPhotos(source, 9 - photos.length, apiUrl, token);
      const next = [...photos, ...added];
      setPhotos(next);
      if (!manual.current) setPlace(draftPlace(next, initialPlace.current, currentPlace));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const publish = async () => {
    Keyboard.dismiss();
    if (working.current) return;
    if (!user) {
      setError('请先在「我的」登录');
      return;
    }
    const selected = manual.current ? place : draftPlace(photos, place, currentPlace);
    if (!selected) {
      setError('请搜索地点，或选择一张带拍摄位置的照片');
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const id = await addEntry({
        title,
        body,
        photos,
        place: selected,
        category,
        visibility,
        locationSource: manual.current ? 'manual' : 'photo',
      });
      notify('已保存在手机，正在同步服务器');
      router.replace({ pathname: '/memory/[id]', params: { id } });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const removePhoto = (index: number) => {
    if (busy) return;
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    if (!manual.current) setPlace(draftPlace(next, initialPlace.current, currentPlace));
  };
  const choosePlace = (point: Place, automatic = false) => {
    manual.current = !automatic;
    setPlace(point);
  };
  return {
    photos,
    place,
    currentPlace,
    title,
    setTitle,
    body,
    setBody,
    category,
    setCategory,
    visibility,
    setVisibility,
    busy,
    error,
    discard,
    setDiscard,
    close,
    pick,
    publish,
    removePhoto,
    choosePlace,
  };
}
