import * as FileSystem from 'expo-file-system/legacy';
import type { Photo } from './types';
import { downloadPhoto } from './downloadPhoto';

export async function persistPhotos(photos: Photo[], id: string): Promise<Photo[]> {
  if (!FileSystem.documentDirectory) throw new Error('无法访问手机存储');
  const directory = `${FileSystem.documentDirectory}oriowl/${id}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    const saved: Photo[] = [];
    for (const [index, photo] of photos.entries()) {
      const extension = photo.uri.split(/[?#]/)[0].match(/\.([a-z\d]{2,5})$/i)?.[1] || 'jpg';
      const uri = `${directory}${index}.${extension}`;
      await FileSystem.copyAsync({ from: photo.uri, to: uri });
      saved.push({ ...photo, uri });
    }
    return saved;
  } catch (error) {
    await removePhotos(id);
    throw error;
  }
}

export async function removePhotos(id: string) {
  if (!FileSystem.documentDirectory || !/^[a-z\d-]+$/i.test(id)) return;
  await FileSystem.deleteAsync(`${FileSystem.documentDirectory}oriowl/${id}/`, { idempotent: true });
}

export async function localPhoto(photo: Photo): Promise<Photo> {
  return photo;
}

async function cacheOriginal(
  photo: Photo,
  noteId: string,
  apiUrl: string,
  token: string,
  previous?: Photo,
): Promise<Photo> {
  const candidate = previous?.uri || photo.uri;
  if (candidate && !/^https?:/.test(candidate)) {
    const info = await FileSystem.getInfoAsync(candidate);
    if (info.exists && info.size > 0) return { ...photo, uri: candidate };
  }
  if (!photo.remotePath || !/^\/api\/media\/[a-f\d]{32}$/.test(photo.remotePath)) {
    throw new Error('未上传的照片在本地找不到，请重新选择');
  }
  if (!FileSystem.documentDirectory || !/^[a-z\d-]+$/i.test(noteId)) throw new Error('无法访问本地目录');
  const directory = FileSystem.documentDirectory + 'oriowl/' + noteId + '/';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = photo.mimeType?.split('/')[1] || 'jpg';
  const uri = directory + photo.id + '-' + Date.now() + '.' + extension;
  await downloadPhoto(apiUrl + photo.remotePath, uri, token);
  return { ...photo, uri };
}

export async function cachePhoto(
  photo: Photo,
  noteId: string,
  apiUrl: string,
  token: string,
  previous?: Photo,
): Promise<Photo> {
  const cached = await cacheOriginal(photo, noteId, apiUrl, token, previous);
  if (!photo.previewPath) return cached;
  if (!/^\/api\/media\/[a-f\d]{32}\/preview$/.test(photo.previewPath)) throw new Error('照片预览地址不正确');
  let previewUri = previous?.previewUri;
  if (!previewUri || /^https?:/.test(previewUri) || !(await FileSystem.getInfoAsync(previewUri)).exists) {
    previewUri = `${FileSystem.documentDirectory}oriowl/${noteId}/${photo.id}-preview-${Date.now()}.jpg`;
    await downloadPhoto(apiUrl + photo.previewPath, previewUri, token);
  }
  return { ...cached, previewUri };
}
