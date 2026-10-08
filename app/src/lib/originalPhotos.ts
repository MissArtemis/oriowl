import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { cameraPhotoName } from './cameraOriginalRules';
import { copyCameraOriginals } from './cameraOriginals';
import { maxPhotoBytes, maxPhotosPerNote, originalPhotoTypes } from './photoConfig';
import { originalImageSize } from './originalPhotoIO';
import type { Photo } from './types';

export async function originalPhotos(remaining: number): Promise<Photo[]> {
  const limit = Math.min(maxPhotosPerNote, remaining);
  if (limit < 1) return [];
  // Launch the system UI directly from the tap: no permission dialog, custom
  // gallery, directory scan or file read precedes this call.
  const result = await DocumentPicker.getDocumentAsync({
    type: originalPhotoTypes,
    multiple: limit > 1,
    // Keep Android document URIs to verify Camera provenance BEFORE copying.
    copyToCacheDirectory: Platform.OS !== 'android',
    base64: false,
  });
  if (result.canceled) return [];
  const assets = [...new Map(result.assets.map((asset) => [asset.uri, asset])).values()];
  if (assets.length > limit) throw new Error(`本次最多还能添加 ${limit} 张照片，请重新选择`);
  for (const asset of assets) {
    if (asset.mimeType && !originalPhotoTypes.includes(asset.mimeType))
      throw new Error('只能选择 JPG、PNG、WebP 或 HEIC 原图照片');
    if (asset.size && asset.size > maxPhotoBytes) throw new Error('单张照片不能超过 30 MB');
    if (Platform.OS === 'android' && !cameraPhotoName(asset.uri))
      throw new Error('请选择手机存储 → DCIM → Camera 中的原图照片；其他目录或相册提供方的文件不能导入');
  }
  if (Platform.OS === 'android') return copyCameraOriginals(assets);
  return Promise.all(assets.map(async (asset) => ({ uri: asset.uri, mimeType: asset.mimeType,
    ...await originalImageSize(asset.uri) })));
}
