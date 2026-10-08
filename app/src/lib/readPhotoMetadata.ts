import { File } from 'expo-file-system';
import { photoMetadataBytes } from './photoMetadataBytes';
import { maxPhotoBytes } from './photoConfig';

export async function readPhotoMetadata(uri: string) {
  const file = new File(uri);
  if (file.size > maxPhotoBytes) throw new Error('单张照片不能超过 30 MB');
  return photoMetadataBytes(await file.arrayBuffer());
}
