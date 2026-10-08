import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-typescript.mjs';
import { cameraPhotoName, isCameraDirectory, originalImageMimeFromBase64 } from '../app/src/lib/cameraOriginalRules.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = (id = 'primary:DCIM/Camera') => 'content://com.android.externalstorage.documents/tree/' + encodeURIComponent(id);
const file = (name, dir = 'primary:DCIM/Camera') => folder(dir) + '/document/' + encodeURIComponent(dir + '/' + name);
const document = (name, dir = 'primary:DCIM/Camera') => 'content://com.android.externalstorage.documents/document/' + encodeURIComponent(dir + '/' + name);

test('only the exact Camera directory and its direct photo files can be selected', () => {
  assert.equal(isCameraDirectory(folder()), true);
  assert.equal(isCameraDirectory(folder('ABCD-1234:DCIM/Camera')), true);
  for (const dir of ['primary:DCIM', 'primary:Pictures', 'primary:DCIM/CameraBackup', 'primary:DCIM/Camera/nested', 'primary:DCIM/Camera/../Screenshots'])
    assert.equal(isCameraDirectory(folder(dir)), false, dir);
  assert.equal(isCameraDirectory(folder() + '/document/' + encodeURIComponent('primary:Pictures')), false);
  assert.equal(isCameraDirectory(folder().replace('com.android.externalstorage.documents', 'other.provider')), false);
  assert.equal(cameraPhotoName(file('IMG_20261009.jpg')), 'IMG_20261009.jpg');
  assert.equal(cameraPhotoName(file('照片.HEIC')), '照片.HEIC');
  assert.equal(cameraPhotoName(document('照片.HEIC')), '照片.HEIC');
  assert.equal(cameraPhotoName(document('IMG.jpg', 'ABCD-1234:DCIM/Camera')), 'IMG.jpg');
  for (const name of ['nested/picture.jpg', '../picture.jpg', '.hidden.jpg', 'movie.mp4', 'document.pdf', 'picture.jpg.exe'])
    assert.equal(cameraPhotoName(file(name)), undefined, name);
  assert.equal(cameraPhotoName(file('photo.jpg', 'primary:Pictures')), undefined);
  for (const uri of [document('x.jpg', 'primary:Pictures'), document('child/x.jpg'), document('../x.jpg'),
    document('x.jpg') + '?other=folder', document('x.jpg').replace('com.android.externalstorage.documents', 'other.provider'),
    document('movie.mp4'), document('.hidden.jpg'), document('a\\x.jpg')])
    assert.equal(cameraPhotoName(uri), undefined, uri);
});

test('image filtering checks original bytes rather than trusting a .jpg name or browser globals', async () => {
  for (const [name, mime] of [['gps-photo.jpg', 'image/jpeg'], ['gps-photo.png', 'image/png']]) {
    const bytes = await readFile(resolve(root, 'scripts/fixtures', name));
    assert.equal(originalImageMimeFromBase64(bytes.subarray(0, 64).toString('base64')), mime);
  }
  assert.equal(originalImageMimeFromBase64(Buffer.from('text renamed as a photo').toString('base64')), undefined);
  assert.equal(originalImageMimeFromBase64('not@base64'), undefined);
});

function systemPicker(getDocumentAsync, copyCameraOriginals, limit = 9) {
  return loadTs(resolve(root, 'app/src/lib/originalPhotos.ts'), new Map([
    ['expo-document-picker', { getDocumentAsync }],
    ['react-native', { Platform: { OS: 'android' }, Image: {} }],
    [resolve(root, 'config/product.json'), { maxPhotosPerNote: limit }],
    [resolve(root, 'app/src/lib/cameraOriginals.ts'), { copyCameraOriginals }],
  ]));
}

test('the system picker opens immediately and reads only confirmed, deduplicated originals', async () => {
  let resolvePick, calls = 0, copied = [];
  const picker = systemPicker((opts) => {
    calls++;
    assert.equal(opts.copyToCacheDirectory, false, 'original provenance must remain available');
    assert.equal(opts.multiple, true);
    assert.ok(opts.type.every((type) => type.startsWith('image/')));
    return new Promise((resolve) => { resolvePick = resolve; });
  }, async (files) => { copied = files; return files; });
  const pending = picker.originalPhotos(9);
  assert.equal(calls, 1, 'opening does not wait on directory permissions, listing, or photo headers');
  assert.equal(copied.length, 0);
  const asset = { uri: document('IMG.jpg'), name: 'IMG.jpg', mimeType: 'image/jpeg', size: 500 };
  resolvePick({ canceled: false, assets: [asset, asset] });
  assert.equal((await pending).length, 1);
  assert.deepEqual(copied, [asset]);
});

test('cancel, excess selection, wrong folder and non-image files do not read or copy photos', async () => {
  let result, opts, copies = 0;
  const picker = systemPicker(async (options) => { opts = options; return result; }, async () => { copies++; return []; }, 2);
  result = { canceled: true, assets: null };
  assert.deepEqual(await picker.originalPhotos(2), []);
  result = { canceled: false, assets: ['a', 'b', 'c'].map((name) => ({ uri: document(name + '.jpg'), name: name + '.jpg' })) };
  await assert.rejects(picker.originalPhotos(100), /最多还能添加 2 张/);
  for (const asset of [
    { uri: document('x.jpg', 'primary:Pictures'), name: 'x.jpg', mimeType: 'image/jpeg' },
    { uri: document('x.jpg'), name: 'x.jpg', mimeType: 'application/pdf' },
    { uri: document('child/x.jpg'), name: 'x.jpg', mimeType: 'image/jpeg' },
    { uri: document('x.jpg'), name: 'x.jpg', size: 31 * 1024 * 1024 },
  ]) {
    result = { canceled: false, assets: [asset] };
    await assert.rejects(picker.originalPhotos(1));
    assert.equal(opts.multiple, false);
  }
  assert.equal(copies, 0);
});

test('renamed text is rejected by selected-file signature before copying', async () => {
  let copies = 0;
  const picker = loadTs(resolve(root, 'app/src/lib/cameraOriginals.ts'), new Map([
    ['react-native', { Image: {} }],
    ['expo-file-system/legacy', { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
      makeDirectoryAsync: async () => {}, deleteAsync: async () => {},
      readAsStringAsync: async (_, opts) => {
        assert.equal(opts.length, 64); assert.equal(opts.position, 0);
        return Buffer.from('not a photo').toString('base64');
      }, copyAsync: async () => { copies++; } }],
  ]));
  await assert.rejects(picker.copyCameraOriginals([{ uri: document('text.jpg'), name: 'text.jpg' }]), /不是支持的照片/);
  assert.equal(copies, 0);
});

test('a hung selected-file read times out and cleanup waits for the native operation to settle', async () => {
  const jpeg = await readFile(resolve(root, 'scripts/fixtures/gps-photo.jpg'));
  const io = loadTs(resolve(root, 'app/src/lib/originalPhotoIO.ts'), new Map([
    ['react-native', { Image: { getSize: (_, callback) => callback(300, 400) } }],
  ]));
  let finishRead, deletions = 0, copies = 0;
  const picker = loadTs(resolve(root, 'app/src/lib/cameraOriginals.ts'), new Map([
    [resolve(root, 'app/src/lib/originalPhotoIO.ts'), { ...io,
      photoReadTimeout: (promise, message) => io.photoReadTimeout(promise, message, 25) }],
    ['expo-file-system/legacy', { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
      makeDirectoryAsync: async () => {},
      readAsStringAsync: () => new Promise((resolve) => { finishRead = resolve; }),
      copyAsync: async () => { copies++; }, getInfoAsync: async () => ({ exists: true, size: jpeg.length }),
      deleteAsync: async () => { deletions++; } }],
  ]));
  await assert.rejects(picker.copyCameraOriginals([{ uri: document('IMG.jpg'), name: 'IMG.jpg' }]), /第 1 张原图读取超时/);
  assert.equal(deletions, 0, 'do not race cleanup against an unfinished native copy');
  finishRead(jpeg.subarray(0, 64).toString('base64'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copies, 1); assert.equal(deletions, 1);
});

test('camera capture reads original-file GPS without requesting media-library access', async () => {
  let mediaRequests = 0;
  const { photoMetadataBytes } = await import('../app/src/lib/photoMetadataBytes.ts');
  const bytes = new Uint8Array(await readFile(resolve(root, 'scripts/fixtures/gps-photo.jpg')));
  const picker = loadTs(resolve(root, 'app/src/lib/photoPicker.ts'), new Map([
    ['react-native', { Image: {} }],
    ['expo-image-picker', { requestCameraPermissionsAsync: async () => ({ granted: true }),
      launchCameraAsync: async (options) => {
        assert.equal(options.quality, 1); assert.equal(options.allowsEditing, false); assert.equal(options.exif, true);
        return { canceled: false, assets: [{ uri: 'file:///camera.jpg', assetId: 'camera-asset', width: 300, height: 400 }] };
      } }],
    ['expo-media-library/legacy', { requestPermissionsAsync: async () => { mediaRequests++; throw new Error('unsupported'); } }],
    [resolve(root, 'app/src/lib/originalPhotos.ts'), { originalPhotos: async () => { throw new Error('camera must not open file picker'); } }],
    [resolve(root, 'app/src/lib/readPhotoMetadata.ts'), { readPhotoMetadata: async () => photoMetadataBytes(bytes) }],
  ]));
  const photos = await picker.pickPhotos('camera', 1);
  assert.equal(mediaRequests, 0);
  assert.equal(photos[0].gps.longitude, 120.1);
  assert.equal(photos[0].gps.latitude, 30.2);
  assert.ok(photos[0].capturedAt.startsWith('2026-10-08'));
});

test('server backup keeps the user-selected photo location rather than changing back to the first photo', async () => {
  const first = { id: 'p1', remotePath: '/api/media/p1', uri: 'file:///first.jpg', place: { longitude: 120, latitude: 30, name: '第一张', address: '' } };
  const second = { id: 'p2', remotePath: '/api/media/p2', uri: 'file:///second.jpg', place: { longitude: 121, latitude: 31, name: '第二张', address: '' } };
  const entry = { id: 'note', title: '旅行', body: '正文', photos: [first, second], place: second.place,
    locationSource: 'photo', locationPhotoIndex: 1, category: '风景', visibility: 'private', favorite: false, syncStatus: 'pending' };
  let savedBody;
  const { locationSource, locationPhotoIndex, ...dto } = entry;
  const sync = loadTs(resolve(root, 'app/src/lib/noteSync.ts'), new Map([
    [resolve(root, 'app/src/lib/api.ts'), { ApiError: class extends Error {}, errorMessage: (error) => error.message,
      request: async (_, path, token, opts) => {
        if (path === '/health') return { service: 'oriowl-map-api' };
        if (path === '/api/notes/note') { savedBody = opts.body; return { ...dto, syncStatus: 'synced' }; }
        if (path === '/api/notes/mine') return [{ ...dto, syncStatus: 'synced' }];
        return [];
      } }],
    [resolve(root, 'app/src/lib/uploadPhoto.ts'), { uploadPhoto: async (_, __, photo) => photo }],
    [resolve(root, 'app/src/lib/photos.ts'), { cachePhoto: async (photo) => photo }],
  ]));
  const result = await sync.syncNotes([entry], 'http://fixture', 'test-token');
  assert.equal(result.error, '');
  assert.deepEqual(savedBody.place, second.place);
  assert.equal(result.entries[0].locationPhotoIndex, 1);
});
