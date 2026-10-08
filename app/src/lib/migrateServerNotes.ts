import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLanDevServer, isLoopbackServer } from './serverAddress';
import type { Entry } from './types';

export function canMigrateServerNotes(from: string, to: string) {
  try {
    return from !== to && (isLanDevServer(from) || isLoopbackServer(from)) && isLanDevServer(to);
  } catch {
    return false;
  }
}

// Verified server aliases, or an offline switch to the same host's Expo gateway.
// Preserve the old index too, so an interrupted migration cannot lose drafts.
export async function migrateServerNotes(from: string, to: string, userId: string) {
  const key = (url: string) => '@owltrace/notes/v2/' + encodeURIComponent(url) + '/' + userId;
  const [old, current] = await Promise.all([
    AsyncStorage.getItem(key(from)), AsyncStorage.getItem(key(to)),
  ]);
  if (!old) return;
  const source: Entry[] = JSON.parse(old);
  const target: Entry[] = current ? JSON.parse(current) : [];
  if (!Array.isArray(source) || !Array.isArray(target)) throw new Error('本地笔记索引无法迁移');
  const entries = new Map(target.map((entry) => [entry.id, entry]));
  for (const entry of source) {
    if (!entries.has(entry.id) || entry.syncStatus !== 'synced') entries.set(entry.id, entry);
  }
  await AsyncStorage.setItem(key(to), JSON.stringify([...entries.values()]));
}
