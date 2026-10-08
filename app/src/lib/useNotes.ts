import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { errorMessage } from './api';
import { localPhoto, persistPhotos, removePhotos } from './photos';
import { syncNotes } from './noteSync';
import { mergeNoteSync } from './mergeNoteSync';
import type { Entry, NewEntry, User } from './types';

export function useNotes(apiUrl: string, user: User | null, token: string | null) {
  const userId = user?.id;
  const key = '@owltrace/notes/v2/' + encodeURIComponent(apiUrl) + '/' + (user?.id || 'guest');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(!user);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const current = useRef<Entry[]>([]);
  const active = useRef(true);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const syncingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const saved = await AsyncStorage.getItem(key);
      const notes: Entry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(notes)) throw new Error('本地索引格式不正确');
      for (const entry of notes) entry.photos = await Promise.all(entry.photos.map(localPhoto));
      if (!cancelled) {
        current.current = notes;
        setEntries(notes);
      }
    };
    void load()
      .catch(() => {
        if (!cancelled) setSyncError('本地索引无法读取，将尝试从服务器恢复');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, userId]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const commit = useCallback(
    async (next: Entry[]) => {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      current.current = next;
      if (active.current) {
        setEntries(next);
        setStorageError(null);
      }
    },
    [key],
  );
  const run = useCallback(<T>(action: (notes: Entry[]) => Promise<T>): Promise<T> => {
    const operation = queue.current.catch(() => {}).then(() => action(current.current));
    queue.current = operation;
    return operation;
  }, []);
  const sync = useCallback((): Promise<void> => {
    if (!ready || !userId || !token) return Promise.resolve();
    if (syncingRef.current) return syncingRef.current;
    const operation = (async () => {
      const snapshot = current.current;
      if (active.current) setSyncing(true);
      try {
        const result = await syncNotes(snapshot, apiUrl, token);
        if (!active.current) return;
        await run((latest) => commit(mergeNoteSync(snapshot, result.entries, latest)));
        if (active.current) setSyncError(result.error);
      } catch (error) {
        if (active.current) setSyncError(errorMessage(error));
      } finally {
        if (active.current) setSyncing(false);
      }
    })();
    syncingRef.current = operation;
    void operation.finally(() => {
      syncingRef.current = null;
    });
    return operation;
  }, [ready, userId, token, run, apiUrl, commit]);

  const scheduleSync = () => {
    const running = syncingRef.current;
    if (running) void running.then(() => { if (active.current) void sync(); });
    else void sync();
  };

  useEffect(() => {
    void sync();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void sync();
    }, 30000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [sync]);

  const addEntry = async (draft: NewEntry) => {
    if (!user) throw new Error('请先在「我的」登录后发布笔记');
    if (!ready) throw new Error('本地笔记正在加载，请稍后');
    if (!draft.photos.length && !draft.body.trim()) throw new Error('添加照片或写下正文后再发布');
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    await run(async (notes) => {
      const photos = await persistPhotos(draft.photos, id);
      const entry: Entry = {
        ...draft,
        id,
        photos,
        title: draft.title.trim() || draft.body.trim().split('\n')[0].slice(0, 60) || '旅行的片刻',
        body: draft.body.trim(),
        createdAt: new Date().toISOString(),
        favorite: false,
        author: user,
        visibility: draft.visibility || 'public',
        syncStatus: 'pending',
      };
      await commit([entry, ...notes]);
    });
    scheduleSync();
    return id;
  };
  const toggleFavorite = async (id: string) => {
    await run((notes) =>
      commit(
        notes.map((note) =>
          note.id === id
            ? {
                ...note,
                favorite: !note.favorite,
                syncStatus: 'pending',
              }
            : note,
        ),
      ),
    );
    scheduleSync();
  };
  const deleteEntry = async (id: string, fallback?: Entry) => {
    if (!ready) throw new Error('本地笔记正在加载，请稍后');
    await run(async (notes) => {
      const note = notes.find((entry) => entry.id === id) || fallback;
      if (!note || note.id !== id) throw new Error('笔记尚未加载完成，请重新打开后再删除');
      if (!user || note.author?.id !== user.id) throw new Error('只能删除自己的笔记');
      const deleted: Entry = {
        ...note, deletedAt: new Date().toISOString(), syncStatus: 'pending', restorePending: false,
      };
      await commit([deleted, ...notes.filter((entry) => entry.id !== id)]);
    });
    scheduleSync();
  };
  const restoreEntry = async (id: string) => {
    await run((notes) => commit(notes.map((note) => note.id === id
      ? { ...note, deletedAt: undefined, restorePending: true, syncStatus: 'pending' }
      : note)));
    scheduleSync();
  };
  const clearCache = async () => {
    if (!ready) throw new Error('本地笔记正在加载，请稍后');
    await run(async (notes) => {
      if (notes.some((note) => note.syncStatus !== 'synced')) throw new Error('还有笔记未上传，请先完成同步');
      if (notes.some((note) => note.deletedAt && note.deletionBackup !== true))
        throw new Error('回收站中有未备份的笔记，请先恢复并同步后再清除本地副本');
      for (const entry of notes) await removePhotos(entry.id);
      await commit([]);
    });
  };
  const importLegacy = async () => {
    if (!user || !ready) throw new Error('请先登录并等待笔记加载');
    let imported = 0;
    await run(async (notes) => {
      const saved = await AsyncStorage.getItem('@oriowl/entries/v1');
      const legacy: Entry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(legacy)) throw new Error('旧相册格式无法读取');
      const next = [...notes];
      for (const note of legacy) {
        const id = note.id + '-' + user.id.slice(0, 8);
        if (next.some((entry) => entry.id === id)) continue;
        const photos = await persistPhotos(note.photos, id);
        next.push({ ...note, id, photos, author: user, visibility: 'private', syncStatus: 'pending' });
        imported++;
      }
      await commit(next);
    });
    scheduleSync();
    return imported;
  };
  return {
    entries: entries.filter((note) => !note.deletedAt),
    trashEntries: entries.filter((note) => note.deletedAt),
    pendingCount: entries.filter((note) => note.syncStatus !== 'synced').length,
    ready,
    syncing,
    syncError,
    storageError,
    sync,
    addEntry,
    toggleFavorite,
    deleteEntry,
    restoreEntry,
    clearCache,
    importLegacy,
  };
}
