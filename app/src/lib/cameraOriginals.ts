import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import { cameraPhotoName, isCameraDirectory, originalImageMimeFromBase64 } from './cameraOriginalRules';
import type { Photo } from './types';

export type CameraOriginal = { uri: string; name: string; mimeType: string };
const KEY = '@owltrace/camera-original-directory/v1';
const SAF = FileSystem.StorageAccessFramework;

async function imageType(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 64 });
  return originalImageMimeFromBase64(base64);
}

export async function loadCameraOriginals(reauthorize = false): Promise<CameraOriginal[] | null> {
  let directory = reauthorize ? null : await AsyncStorage.getItem(KEY);
  let uris: string[] | undefined;
  if (directory && isCameraDirectory(directory)) {
    try { uris = await SAF.readDirectoryAsync(directory); } catch { directory = null; }
  } else directory = null;
  if (!directory) {
    const id = encodeURIComponent('primary:DCIM/Camera');
    const permission = await SAF.requestDirectoryPermissionsAsync(`content://com.android.externalstorage.documents/tree/${id}/document/${id}`);
    if (!permission.granted) return null;
    if (!isCameraDirectory(permission.directoryUri)) throw new Error('只允许相机原图目录。请重新授权手机存储中的 DCIM/Camera，不能选择相册根目录或其他文件夹。');
    directory = permission.directoryUri;
    uris = await SAF.readDirectoryAsync(directory);
    await AsyncStorage.setItem(KEY, directory);
  }
  const candidates = [...new Set(uris || [])].filter((uri) => !!cameraPhotoName(uri));
  const photos: CameraOriginal[] = [];
  // Only read a small signature; never decode all full-size photos into memory.
  // A directory or a text file renamed to .jpg cannot pass this check.
  for (let offset = 0; offset < candidates.length; offset += 6) {
    const batch = await Promise.all(candidates.slice(offset, offset + 6).map(async (uri) => {
      try {
        const mimeType = await imageType(uri);
        return mimeType ? { uri, name: cameraPhotoName(uri)!, mimeType } : null;
      } catch { return null; }
    }));
    photos.push(...batch.filter((photo): photo is CameraOriginal => !!photo));
  }
  return photos.sort((a, b) => b.name.localeCompare(a.name));
}

export async function copyCameraOriginals(files: CameraOriginal[]): Promise<Photo[]> {
  if (!FileSystem.cacheDirectory) throw new Error('无法访问照片缓存');
  const directory = `${FileSystem.cacheDirectory}owltrace-originals/${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    const photos: Photo[] = [];
    for (const [index, file] of files.entries()) {
      if (!cameraPhotoName(file.uri)) throw new Error('仅能导入相机原图目录中的照片');
      const mimeType = await imageType(file.uri);
      if (!mimeType) throw new Error('所选文件不是支持的照片');
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[mimeType];
      const uri = `${directory}${index}.${extension}`;
      // Byte-for-byte copy: no compression, cropping, or metadata stripping.
      await FileSystem.copyAsync({ from: file.uri, to: uri });
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || !info.size) throw new Error('原图已不存在或无法读取');
      if (info.size > 30 * 1024 * 1024) throw new Error('单张照片不能超过 30 MB');
      const size = await new Promise<{ width: number; height: number }>((resolve) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve({ width: 0, height: 0 }));
      });
      photos.push({ uri, mimeType, ...size });
    }
    return photos;
  } catch (error) {
    await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
    throw error;
  }
}
