import product from '../../../config/product.json';

if (!Number.isSafeInteger(product.maxPhotosPerNote) || product.maxPhotosPerNote < 1) {
  throw new Error('config/product.json 的 maxPhotosPerNote 必须是正整数');
}

export const maxPhotosPerNote = product.maxPhotosPerNote;
export const maxPhotoBytes = 30 * 1024 * 1024;
export const originalPhotoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
