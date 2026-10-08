import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { errorMessage } from './api';
import { copyCameraOriginals, loadCameraOriginals, type CameraOriginal } from './cameraOriginals';
import { originalPhotos } from './originalPhotos';
import type { Photo } from './types';

export function useOriginalPhotoPicker() {
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<CameraOriginal[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(9), [error, setError] = useState('');
  const pending = useRef<((photos: Photo[]) => void) | null>(null);
  const generation = useRef(0);
  const copying = useRef(false);
  const cancel = () => {
    if (copying.current) return;
    generation.current++;
    setVisible(false);
    setBusy(false);
    pending.current?.([]);
    pending.current = null;
  };
  useEffect(() => () => { generation.current++; pending.current?.([]); pending.current = null; }, []);
  const reload = async (reauthorize = false) => {
    const version = ++generation.current;
    setBusy(true); setError(''); setSelected([]); setFiles([]);
    try {
      const originals = await loadCameraOriginals(reauthorize);
      if (generation.current !== version) return;
      if (originals === null) { cancel(); return; }
      setFiles(originals);
    } catch (cause) {
      if (generation.current === version) setError(errorMessage(cause));
    } finally {
      if (generation.current === version) setBusy(false);
    }
  };
  const request = (maximum: number): Promise<Photo[]> => {
    if (Platform.OS !== 'android') return originalPhotos(maximum);
    if (pending.current) return Promise.reject(new Error('照片选择正在进行'));
    setLimit(Math.min(9, Math.max(1, maximum))); setVisible(true);
    const result = new Promise<Photo[]>((resolve) => { pending.current = resolve; });
    void reload();
    return result;
  };
  const toggle = (uri: string) => {
    if (busy || !files.some((file) => file.uri === uri)) return;
    setSelected((current) => current.includes(uri) ? current.filter((item) => item !== uri)
      : current.length < limit ? [...current, uri] : current);
  };
  const confirm = async () => {
    if (busy || copying.current || !selected.length) return;
    copying.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      const photos = await copyCameraOriginals(selected.map((uri) => files.find((file) => file.uri === uri)!));
      if (generation.current !== version) return;
      setVisible(false); pending.current?.(photos); pending.current = null;
    } catch (cause) {
      if (generation.current === version) setError(errorMessage(cause));
    } finally {
      copying.current = false;
      if (generation.current === version) setBusy(false);
    }
  };
  return { request, visible, busy, files, selected, limit, error, toggle, confirm, cancel, reload };
}
