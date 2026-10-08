import coordinates from 'coordtransform';
import type { Photo, Place } from './types';

// Preserve the original WGS84 GPS on the photo; the note/map uses GCJ-02.
// This approximate local conversion is replaced by AMap's result after upload.
export function photoPlace(photo: Photo): Place | undefined {
  if (photo.place) return photo.place;
  const gps = photo.gps;
  if (!gps || !Number.isFinite(gps.longitude) || !Number.isFinite(gps.latitude) ||
      Math.abs(gps.longitude) > 180 || Math.abs(gps.latitude) > 90) return;
  const [longitude, latitude] = coordinates.wgs84togcj02(gps.longitude, gps.latitude);
  return { longitude, latitude, name: '照片拍摄地点', address: '' };
}

export function draftPlace(photos: Photo[], initial: Place | null, current: Place | null = null) {
  return photos.map(photoPlace).find((place) => !!place) || initial || current;
}
