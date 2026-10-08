import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { errorMessage, request } from './api';

export function useRemote<T>(path: string, initial: T, authenticated = true, interval = 0) {
  const { apiUrl } = useConfig();
  const { token } = useAuth();
  const [data, setData] = useState(initial),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const focused = useRef(false),
    busy = useRef(false),
    version = useRef(0);
  const reload = useCallback(async () => {
    if (busy.current || (authenticated && !token)) return;
    const id = ++version.current;
    const abort = new AbortController();
    controller.current = abort;
    busy.current = true;
    setLoading(true);
    try {
      const result = await request<T>(apiUrl, path, token, { signal: abort.signal });
      if (focused.current && id === version.current) {
        setData(result);
        setError('');
      }
    } catch (cause) {
      if (focused.current && id === version.current) setError(errorMessage(cause));
    } finally {
      if (id === version.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [apiUrl, path, token, authenticated]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void reload();
      const timer = interval
        ? setInterval(() => {
            if (AppState.currentState === 'active') void reload();
          }, interval)
        : null;
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reload();
      });
      return () => {
        focused.current = false;
        version.current++;
        busy.current = false;
        controller.current?.abort();
        if (timer) clearInterval(timer);
        listener.remove();
      };
    }, [reload, interval]),
  );
  return { data, error, loading, reload };
}
