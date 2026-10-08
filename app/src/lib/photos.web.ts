import { deleteNotePhotos, getPhoto, photoUrl, putPhoto } from './browserPhotoCache';
import type { Photo } from './types';
import { downloadPhoto } from './downloadPhoto.web';

export async function persistPhotos(photos: Photo[], id: string): Promise<Photo[]> {
  const saved: Photo[] = [];
  for (const [index, photo] of photos.entries()) {
    const blob = await fetch(photo.uri).then((response) => response.blob());
    const cacheKey = id + '-' + index;
    await putPhoto(cacheKey, blob);
    saved.push({ ...photo, cacheKey, uri: photoUrl(cacheKey, blob) });
  }
  return saved;
}

export const removePhotos = deleteNotePhotos;

export async function localPhoto(photo: Photo): Promise<Photo> {
  if (!photo.cacheKey) return photo;
  const blob = await getPhoto(photo.cacheKey);
  const preview = await getPhoto(photo.cacheKey + '-preview');
  return blob
    ? {
        ...photo,
        uri: photoUrl(photo.cacheKey, blob),
        previewUri: preview ? photoUrl(photo.cacheKey + '-preview', preview) : undefined,
      }
    : photo;
}

export async function cachePhoto(
  photo: Photo,
  noteId: string,
  apiUrl: string,
  token: string,
  previous?: Photo,
): Promise<Photo> {
  const cacheKey = previous?.cacheKey || photo.cacheKey || noteId + '-' + photo.id;
  let blob = await getPhoto(cacheKey);
  if (!blob) {
    if (!photo.remotePath || !/^\/api\/media\/[a-f\d]{32}$/.test(photo.remotePath)) {
      throw new Error('未上传的照片在本地找不到，请重新选择');
    }
    blob = await downloadPhoto(apiUrl + photo.remotePath, token);
    await putPhoto(cacheKey, blob);
  }
  let previewUri: string | undefined;
  if (photo.previewPath) {
    const previewKey = cacheKey + '-preview';
    let preview = await getPhoto(previewKey);
    if (!preview) {
      if (!/^\/api\/media\/[a-f\d]{32}\/preview$/.test(photo.previewPath))
        throw new Error('照片预览地址不正确');
      preview = await downloadPhoto(apiUrl + photo.previewPath, token);
      await putPhoto(previewKey, preview);
    }
    previewUri = photoUrl(previewKey, preview);
  }
  return { ...photo, cacheKey, uri: photoUrl(cacheKey, blob), previewUri };
}
