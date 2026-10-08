import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { deviceApiUrl } from './serverAddress';

export function defaultApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return __DEV__ ? window.location.origin : `http://${window.location.hostname}:8787`;
  }
  return (
    deviceApiUrl([
      Constants.expoConfig?.hostUri,
      Constants.expoGoConfig?.debuggerHost,
      Constants.expoConfig?.extra?.devApiUrl,
      Constants.experienceUrl,
    ]) ||
    'http://localhost:8787'
  );
}

export function validateApiUrl(input: string) {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('请输入 http://电脑IP:8787 或 HTTPS 服务地址');
  }
  return url.toString().replace(/\/+$/, '');
}

export function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
