import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'react-native';
import type { Photo } from './types';

export async function originalPhotos(limit: number): Promise<Photo[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    multiple: limit > 1,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) return [];
  return Promise.all(
    result.assets.slice(0, limit).map(async (asset) => {
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(asset.mimeType))
        throw new Error('只能选择 JPG、PNG、WebP 或 HEIC 原图照片');
      if (asset.size && asset.size > 30 * 1024 * 1024) throw new Error('单张照片不能超过 30 MB');
      const size = await new Promise<{ width: number; height: number }>((resolve) => {
        Image.getSize(
          asset.uri,
          (width, height) => resolve({ width, height }),
          () => resolve({ width: 0, height: 0 }),
        );
      });
      return { uri: asset.uri, mimeType: asset.mimeType, ...size };
    }),
  );
}
