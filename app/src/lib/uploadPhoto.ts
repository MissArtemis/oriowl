import { Platform } from 'react-native';
import { request } from './api';
import type { Photo } from './types';

export async function uploadPhoto(apiUrl: string, token: string, photo: Photo): Promise<Photo> {
  if (photo.id && photo.remotePath) return photo;
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await fetch(photo.uri).then((response) => response.blob());
    form.append('file', blob, 'photo.' + (blob.type.split('/')[1] || 'jpg'));
  } else {
    const extension = photo.uri.split(/[?#]/)[0].split('.').at(-1)?.toLowerCase() || 'jpg';
    const type =
      photo.mimeType ||
      { png: 'image/png', webp: 'image/webp', heic: 'image/heic' }[extension] ||
      'image/jpeg';
    // Native API requests use RN XMLHttpRequest, whose multipart adapter reads
    // this local URI directly. SDK 57's global expo/fetch rejects URI-only parts.
    form.append('file', { uri: photo.uri, name: 'photo.' + extension, type } as unknown as Blob);
  }
  if (photo.gps) form.append('gps', JSON.stringify(photo.gps));
  const uploaded = await request<Photo>(apiUrl, '/api/photos', token, {
    method: 'POST',
    body: form,
    timeout: 90000,
  });
  return { ...photo, ...uploaded, uri: photo.uri, locationError: uploaded.locationError };
}
