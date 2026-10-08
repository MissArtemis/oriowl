import { useCallback, useEffect, useRef, useState } from 'react';
import type { Place } from './types';
import { request } from './api';

export function usePlaceSearch(apiUrl: string, enabled: boolean, currentPlace: Place | null) {
  const city = currentPlace?.city || '';
  const longitude = currentPlace?.longitude;
  const latitude = currentPlace?.latitude;
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'suggest' | 'search'>('suggest');
  const [closed, setClosed] = useState(false);
  const [fullQuery, setFullQuery] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const cancel = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    setSearching(false);
  }, []);
  const close = useCallback(() => {
    cancel();
    setClosed(true);
    setFullQuery('');
    setResults(null);
    setError('');
  }, [cancel]);
  const change = (value: string) => {
    cancel();
    setKeyword(value);
    setClosed(false);
    setFullQuery('');
    setResults(null);
    setError('');
  };
  const run = useCallback(
    async (query: string, kind: 'suggest' | 'search') => {
      abort.current?.abort();
      const version = ++generation.current;
      const controller = new AbortController();
      abort.current = controller;
      const timer = setTimeout(() => controller.abort(), 15000);
      setSearching(true);
      setError('');
      setMode(kind);
      try {
        const origin = longitude === undefined ? '' : `&longitude=${longitude}&latitude=${latitude}`;
        const path = `/api/places/${kind}?q=${encodeURIComponent(query)}${city ? `&city=${encodeURIComponent(city)}` : ''}${origin}`;
        const data = await request<{ places: Place[]; partial?: boolean }>(apiUrl, path, null, { signal: controller.signal, timeout: 15000 });
        if (!Array.isArray(data.places)) throw new Error('地址搜索返回异常，请重试');
        if (generation.current === version) {
          setResults(data.places);
          if (data.partial) setError('部分搜索服务暂不可用，已显示可用结果');
        }
      } catch (e) {
        if (generation.current === version) {
          setResults([]);
          setError(
            controller.signal.aborted
              ? '搜索超时，请检查网络后重试'
              : e instanceof Error
                ? e.message
                : '地址搜索失败',
          );
        }
      } finally {
        clearTimeout(timer);
        if (generation.current === version) setSearching(false);
      }
    },
    [apiUrl, city, longitude, latitude],
  );

  useEffect(() => {
    if (!enabled || closed || keyword.trim().length < 2) return;
    const timer = setTimeout(() => void run(keyword.trim(), 'suggest'), 450);
    return () => clearTimeout(timer);
  }, [keyword, enabled, closed, run]);
  useEffect(() => {
    if (!enabled || !fullQuery) return;
    // Refresh distance ordering when the first GPS fix or a new location arrives.
    const timer = setTimeout(() => void run(fullQuery, 'search'), 0);
    return () => clearTimeout(timer);
  }, [enabled, fullQuery, searchRevision, run]);
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
    },
    [],
  );
  const search = () => {
    setClosed(true);
    setFullQuery(keyword.trim());
    setSearchRevision((value) => value + 1);
  };
  return { keyword, change, results, searching, error, mode, close, search };
}
