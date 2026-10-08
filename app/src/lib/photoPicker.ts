import * as ImagePicker from 'expo-image-picker';
import type { Coordinates, Photo } from './types';
import { readPhotoMetadata } from './readPhotoMetadata';
import { originalPhotos } from './originalPhotos';
import { photoPlace } from './draftPlace';
import { photoReadTimeout } from './originalPhotoIO';

function decimal(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length === 3)
    return Number(value[0]) + Number(value[1]) / 60 + Number(value[2]) / 3600;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
}
export function exifGps(exif: ImagePicker.ImagePickerAsset['exif']): Coordinates | undefined {
  if (!exif) return;
  let latitude = decimal(exif.GPSLatitude),
    longitude = decimal(exif.GPSLongitude);
  if (latitude === undefined || longitude === undefined) return;
  if (exif.GPSLatitudeRef === 'S') latitude = -Math.abs(latitude);
  if (exif.GPSLongitudeRef === 'W') longitude = -Math.abs(longitude);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  )
    return { latitude, longitude };
}

function assetPhoto(asset: ImagePicker.ImagePickerAsset): Photo {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType || 'image/jpeg',
    gps: exifGps(asset.exif),
  };
}

export async function pickPhotos(
  source: 'camera' | 'library' | 'original',
  limit: number,
  selectOriginals: (limit: number) => Promise<Photo[]> = originalPhotos,
) {
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new Error('请允许 Expo Go 使用相机');
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: true,
    allowsEditing: false,
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : null;
  if (result?.canceled) return [];
  const selected = result
    ? result.assets.slice(0, limit).map(assetPhoto)
    : await selectOriginals(limit);
  if (!selected.length) return [];
  // Importing and reading GPS is entirely local. Uploads run after publishing
  // through noteSync, so a network timeout cannot delay the location preview.
  const photos: Photo[] = [];
  for (let photo of selected) {
    try {
      const metadata = await photoReadTimeout(readPhotoMetadata(photo.uri), '照片拍摄信息读取超时');
      photo.gps ||= metadata.gps;
      photo.capturedAt ||= metadata.capturedAt;
    } catch {
      if (!photo.gps) photo.locationError = '原图拍摄信息暂不可读，可先手动选择笔记地点';
    }
    photo.place ||= photoPlace(photo);
    photos.push(photo);
  }
  return photos;
}
