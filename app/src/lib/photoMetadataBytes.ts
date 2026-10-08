// The prebuilt bundles initialize browser rotation helpers and crash without
// navigator.userAgent in React Native. Load only the binary EXIF/GPS parsers.
import { parse } from 'exifr/src/core.mjs';
import 'exifr/src/file-parsers/jpeg.mjs';
import 'exifr/src/file-parsers/heif.mjs';
import 'exifr/src/file-parsers/tiff.mjs';
import 'exifr/src/segment-parsers/tiff-exif.mjs';
import 'exifr/src/dicts/tiff-ifd0-keys.mjs';
import 'exifr/src/dicts/tiff-exif-keys.mjs';
import 'exifr/src/dicts/tiff-gps-keys.mjs';
import 'exifr/src/dicts/tiff-revivers.mjs';
import type { Coordinates } from './types';

function exifBytes(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 8 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a)
    return data;
  // PNG's eXIf chunk is raw TIFF. Avoid the library's Node zlib/dynamic import.
  for (let offset = 8; offset + 12 <= data.length; ) {
    const size = view.getUint32(offset);
    if (size > data.length - offset - 12) throw new Error('照片文件不完整');
    const type = view.getUint32(offset + 4);
    if (type === 0x65584966) return data.subarray(offset + 8, offset + 8 + size);
    if (type === 0x49454e44) break;
    offset += size + 12;
  }
}

export async function photoMetadataBytes(bytes: ArrayBuffer | Uint8Array) {
  const input = exifBytes(bytes);
  const tags = (input && (await parse(input, { xmp: false, icc: false, iptc: false }))) || {};
  const latitude = Number(tags.latitude),
    longitude = Number(tags.longitude);
  const gps: Coordinates | undefined =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
      ? { latitude, longitude }
      : undefined;
  const date = tags.DateTimeOriginal;
  const capturedAt = date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  return { gps, capturedAt };
}
