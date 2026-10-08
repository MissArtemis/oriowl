import { photoMetadataBytes } from './photoMetadataBytes';

export async function readPhotoMetadata(uri: string) {
  const blob = await fetch(uri).then((response) => response.blob());
  if (blob.size > 30 * 1024 * 1024) throw new Error('单张照片不能超过 30 MB');
  return photoMetadataBytes(await blob.arrayBuffer());
}
