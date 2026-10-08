import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { defaultApiUrl, validateApiUrl } from '../lib/config';
import { Platform } from 'react-native';
import { preferredDevServer } from '../lib/serverAddress';

const KEY = '@oriowl/api/v1';
type Config = { apiUrl: string; ready: boolean; saveApiUrl: (url: string) => Promise<void> };
const Context = createContext<Config | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem(KEY);
      if (!stored) return;
      const saved = validateApiUrl(stored);
      const detected = defaultApiUrl();
      const url = preferredDevServer(saved, detected, Platform.OS !== 'web' && __DEV__);
      if (url !== stored) await AsyncStorage.setItem(KEY, url);
      setApiUrl(url);
    };
    void load()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const saveApiUrl = async (value: string) => {
    const url = validateApiUrl(value);
    await AsyncStorage.setItem(KEY, url);
    setApiUrl(url);
  };
  return <Context.Provider value={{ apiUrl, ready, saveApiUrl }}>{children}</Context.Provider>;
}

export function useConfig() {
  const config = useContext(Context);
  if (!config) throw new Error('ConfigProvider is required');
  return config;
}
