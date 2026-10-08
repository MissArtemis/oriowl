import * as FileSystem from 'expo-file-system/legacy';
import { cameraPhotoName, originalImageMimeFromBase64 } from './cameraOriginalRules';
import { maxPhotoBytes } from './photoConfig';
import { originalImageSize, photoReadTimeout } from './originalPhotoIO';
import type { Photo } from './types';

export type CameraOriginal = { uri: string; name: string };

export async function copyCameraOriginals(files: CameraOriginal[]): Promise<Photo[]> {
  // Check every selected path before reading anything. Never enumerate the
  // camera directory or request access to unselected photos.
  if (files.some((file) => !cameraPhotoName(file.uri)))
    throw new Error('请选择手机存储 → DCIM → Camera 中的原图照片；其他目录或相册提供方的文件不能导入');
  if (!FileSystem.cacheDirectory) throw new Error('无法访问照片缓存');
  const directory = `${FileSystem.cacheDirectory}owltrace-originals/${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  const cleanup = () => FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
  let unfinished: Promise<unknown> = Promise.resolve();
  try {
    unfinished = FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await photoReadTimeout(unfinished, '创建原图缓存超时，请返回后重试');
    const photos: Photo[] = [];
    for (const [index, file] of files.entries()) {
      const read = async (): Promise<Photo> => {
        const header = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 64 });
        const mimeType = originalImageMimeFromBase64(header);
        if (!mimeType) throw new Error('所选文件不是支持的照片');
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[mimeType];
        const uri = `${directory}${index}.${extension}`;
        // Copy original bytes without compression, cropping or EXIF rewriting.
        await FileSystem.copyAsync({ from: file.uri, to: uri });
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory || !info.size) throw new Error('原图已不存在或无法读取');
        if (info.size > maxPhotoBytes) throw new Error('单张照片不能超过 30 MB');
        return { uri, mimeType, ...await originalImageSize(uri) };
      };
      const operation = read();
      unfinished = operation;
      photos.push(await photoReadTimeout(operation, `第 ${index + 1} 张原图读取超时，请重新选择本地相机原图`));
    }
    return photos;
  } catch (error) {
    // A JS timeout cannot stop an Android provider. Clean up once its operation
    // settles, so a late copy cannot recreate files after directory deletion.
    void unfinished.then(cleanup, cleanup);
    throw error;
  }
}
