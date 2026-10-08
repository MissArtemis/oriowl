import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { ApiError, request } from './api';
import type { Coordinates, Photo, Place } from './types';
import { uploadPhoto } from './uploadPhoto';
import { readPhotoMetadata } from './readPhotoMetadata';
import { originalPhotos } from './originalPhotos';

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
  apiUrl: string,
  token: string | null,
) {
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new Error('请允许 Expo Go 使用相机');
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: true,
    allowsEditing: false,
  };
  const result =
    source === 'original'
      ? null
      : source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            allowsMultipleSelection: true,
            selectionLimit: limit,
            legacy: Platform.OS === 'android',
          });
  if (result?.canceled) return [];
  const selected = result
    ? await Promise.all(result.assets.slice(0, limit).map(assetPhoto))
    : await originalPhotos(limit);
  if (!selected.length) return [];
  let connectionError = '';
  let serverAvailable = Boolean(token);
  if (token) {
    try {
      await request(apiUrl, '/health', null, { timeout: 4000 });
    } catch (error) {
      serverAvailable = false;
      connectionError = error instanceof Error ? error.message : '服务器暂时不可用';
    }
  }
  const photos: Photo[] = [];
  for (let photo of selected) {
    try {
      const metadata = await readPhotoMetadata(photo.uri);
      photo.gps ||= metadata.gps;
      photo.capturedAt ||= metadata.capturedAt;
    } catch {
      if (!photo.gps) photo.locationError = '原图信息暂不可读，请尝试「导入原图」';
    }
    // The original file is parsed on the server too, including HEIC and browser uploads.
    try {
      if (serverAvailable && token) photo = await uploadPhoto(apiUrl, token, photo);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 413)) throw error;
      if (error instanceof ApiError && error.status === 0) serverAvailable = false;
      connectionError = error instanceof Error ? error.message : '照片暂未备份';
    }
    if (connectionError) photo.locationError = connectionError + '。照片已保留，联网后继续备份';
    if (photo.gps && !photo.place && serverAvailable) {
      try {
        const coords = photo.gps;
        const { place } = await request<{ place: Place }>(
          apiUrl,
          `/api/coordinates/convert?longitude=${coords.longitude}&latitude=${coords.latitude}`,
        );
        photo.place = { ...place, name: '照片拍摄地点' };
      } catch {
        photo.locationError = '拍摄坐标已读取，转换暂不可用，请手动选点';
      }
    }
    photos.push(photo);
  }
  return photos;
}
