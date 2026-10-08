import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import type { Coordinates, Photo } from './types';
import { readPhotoMetadata } from './readPhotoMetadata';
import { originalPhotos } from './originalPhotos';
import { photoPlace } from './draftPlace';

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

async function assetPhoto(asset: ImagePicker.ImagePickerAsset): Promise<Photo> {
  const photo: Photo = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType || 'image/jpeg',
    gps: exifGps(asset.exif),
  };
  if (!photo.gps && asset.assetId && Platform.OS !== 'web') {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (permission.granted) {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        if (info.location) photo.gps = info.location;
        if (info.creationTime) photo.capturedAt = new Date(info.creationTime).toISOString();
      }
    } catch {
      /* A limited photo picker may not expose the original library asset. */
    }
  }
  return photo;
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
    ? await Promise.all(result.assets.slice(0, limit).map(assetPhoto))
    : await selectOriginals(limit);
  if (!selected.length) return [];
  // Importing and reading GPS is entirely local. Uploads run after publishing
  // through noteSync, so a network timeout cannot delay the location preview.
  const photos: Photo[] = [];
  for (let photo of selected) {
    try {
      const metadata = await readPhotoMetadata(photo.uri);
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
