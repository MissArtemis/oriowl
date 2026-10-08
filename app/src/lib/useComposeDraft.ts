import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTravel } from '../context/TravelContext';
import { errorMessage, request } from './api';
import { pickPhotos } from './photoPicker';
import { draftPlace, photoPlace } from './draftPlace';
import { maxPhotosPerNote } from './photoConfig';
import type { Category, Photo, Place } from './types';

export function useComposeDraft() {
  const { selectedPlace, currentPlace, apiUrl, addEntry, notify } = useTravel();
  const { user } = useAuth();
  const [initialPlace] = useState(selectedPlace);
  const [chosenPlace, setPlace] = useState(selectedPlace);
  const [manual, setManual] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [locationPhotoUri, setLocationPhotoUri] = useState<string | null>(null);
  const locationPhoto = photos.find((photo) => photo.uri === locationPhotoUri && photoPlace(photo)) ||
    photos.find((photo) => photoPlace(photo));
  const photoLocation = locationPhoto ? photoPlace(locationPhoto) : undefined;
  const automaticPlace = manual ? null : photoLocation;
  const longitude = automaticPlace?.longitude, latitude = automaticPlace?.latitude;
  const addressKey = automaticPlace ? `${locationPhoto?.uri}:${longitude},${latitude}` : '';
  const [resolvedAddress, setResolvedAddress] = useState<{ key: string; place: Place } | null>(null);
  const place = manual ? chosenPlace :
    (resolvedAddress?.key === addressKey ? resolvedAddress.place : automaticPlace) || initialPlace || currentPlace;
  useEffect(() => {
    if (!addressKey || longitude === undefined || latitude === undefined) return;
    const controller = new AbortController();
    void request<{ address: string; city?: string }>(apiUrl,
      `/api/places/reverse?longitude=${longitude}&latitude=${latitude}`, null,
      { signal: controller.signal, timeout: 8000 }).then((result) => {
      if (!controller.signal.aborted && result.address) setResolvedAddress({ key: addressKey,
        place: { longitude, latitude, name: '照片拍摄地点', address: result.address, city: result.city } });
    }).catch(() => {});
    return () => controller.abort();
  }, [addressKey, apiUrl, latitude, longitude]);
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
  const pick = async (source: 'camera' | 'library' | 'original' = 'original') => {
    if (working.current) return;
    if (photos.length >= maxPhotosPerNote) {
      setError(`每篇笔记最多 ${maxPhotosPerNote} 张照片`);
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const added = await pickPhotos(source, maxPhotosPerNote - photos.length);
      if (!added.length) return;
      const next = [...photos, ...added];
      setPhotos(next);
      const located = added.find((photo) => photoPlace(photo));
      if (located) {
        setManual(false);
        setLocationPhotoUri(located.uri);
      } else if (!manual) setPlace(draftPlace(next, initialPlace, currentPlace));
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
    const selected = place;
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
        locationSource: !manual && photoLocation ? 'photo' : 'manual',
        locationPhotoIndex: !manual && locationPhoto ? photos.indexOf(locationPhoto) : undefined,
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
    if (photos[index]?.uri === locationPhotoUri) setLocationPhotoUri(null);
  };
  const choosePlace = (point: Place) => {
    setManual(true);
    setPlace(point);
  };
  const choosePhoto = (uri: string) => {
    if (!photos.some((photo) => photo.uri === uri && photoPlace(photo))) return;
    setManual(false);
    setLocationPhotoUri(uri);
    // Also trigger a render when returning from a manual point to the same photo.
    setPlace(null);
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
    choosePhoto,
    usePhotoLocation: () => { if (locationPhoto) choosePhoto(locationPhoto.uri); },
    locationPhotoUri: manual ? undefined : locationPhoto?.uri,
    photoLocation,
  };
}
