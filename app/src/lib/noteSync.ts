import { ApiError, errorMessage, request } from './api';
import { cachePhoto } from './photos';
import { uploadPhoto } from './uploadPhoto';
import type { Entry, Photo } from './types';

export function remoteEntry(entry: Entry, apiUrl: string): Entry {
  return {
    ...entry,
    photos: entry.photos.map((photo) => ({
      ...photo,
      uri: apiUrl + photo.remotePath,
      previewUri: photo.previewPath ? apiUrl + photo.previewPath : undefined,
    })),
  };
}

export async function syncNotes(local: Entry[], apiUrl: string, token: string) {
  const working = [...local];
  let error = '';
  try {
    const health = await request<{ service: string }>(apiUrl, '/health', null, { timeout: 4000 });
    if (health.service !== 'oriowl-map-api') throw new Error('当前地址不是鹰迹后端，请在「我的」恢复扫码电脑的地址');
  } catch (cause) {
    error = errorMessage(cause);
    return { entries: local.map((entry) => entry.syncStatus === 'synced'
      ? entry : { ...entry, syncStatus: 'error' as const, syncError: error }), error };
  }
  for (const [index, entry] of working.entries()) {
    if (entry.syncStatus === 'synced') continue;
    const photos: Photo[] = [];
    try {
      if (entry.deletedAt) {
        const deleted = await request<{ hasBackup: boolean }>(apiUrl, '/api/notes/' + entry.id, token, { method: 'DELETE', timeout: 10000 });
        working[index] = { ...entry, deletionBackup: deleted.hasBackup, syncStatus: 'synced', syncError: undefined };
        continue;
      }
      if (entry.restorePending) {
        await request(apiUrl, '/api/notes/' + entry.id + '/restore', token, { method: 'POST', timeout: 10000 });
      }
      for (const photo of entry.photos) {
        photos.push(await uploadPhoto(apiUrl, token, photo));
        working[index] = { ...entry, photos: [...photos, ...entry.photos.slice(photos.length)] };
      }
      const saved = await request<Entry>(apiUrl, '/api/notes/' + entry.id, token, {
        method: 'PUT',
        body: {
          title: entry.title,
          body: entry.body,
          place:
            entry.locationSource === 'photo'
              ? photos[entry.locationPhotoIndex ?? 0]?.place || photos.find((photo) => photo.place)?.place || entry.place
              : entry.place,
          photoIds: photos.map((photo) => photo.id),
          category: entry.category,
          visibility: entry.visibility || 'private',
          favorite: entry.favorite,
        },
      });
      working[index] = {
        ...saved,
        locationSource: entry.locationSource,
        locationPhotoIndex: entry.locationPhotoIndex,
        photos: saved.photos.map((photo, i) => ({
          ...photo,
          uri: photos[i].uri,
          cacheKey: photos[i].cacheKey,
          previewUri: photos[i].previewUri,
        })),
      };
    } catch (cause) {
      error = errorMessage(cause);
      working[index] = { ...working[index], syncStatus: 'error', syncError: error };
      if (cause instanceof ApiError && cause.status === 0) return { entries: working, error };
    }
  }
  try {
    const [live, trash] = await Promise.all([
      request<Entry[]>(apiUrl, '/api/notes/mine', token, { timeout: 10000 }),
      request<Entry[]>(apiUrl, '/api/notes/trash', token, { timeout: 10000 }),
    ]);
    const remote = [...live, ...trash];
    for (const entry of remote) {
      const index = working.findIndex((note) => note.id === entry.id);
      const previous = working[index];
      if (previous && previous.syncStatus !== 'synced' && (!entry.deletedAt || previous.restorePending)) continue;
      const photos = [];
      for (const photo of entry.photos) {
        try {
          photos.push(
            await cachePhoto(
              photo,
              entry.id,
              apiUrl,
              token,
              previous?.photos.find((p) => p.id === photo.id),
            ),
          );
        } catch (cause) {
          error = errorMessage(cause);
          photos.push({ ...photo, uri: apiUrl + photo.remotePath });
        }
      }
      const cached = { ...entry, photos, locationSource: previous?.locationSource, locationPhotoIndex: previous?.locationPhotoIndex };
      if (index >= 0) working[index] = cached;
      else working.push(cached);
    }
  } catch (cause) {
    error = errorMessage(cause);
  }
  working.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { entries: working, error };
}
