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

test('only the exact Camera directory and its direct photo files can be selected', () => {
  assert.equal(isCameraDirectory(folder()), true);
  assert.equal(isCameraDirectory(folder('ABCD-1234:DCIM/Camera')), true);
  for (const dir of ['primary:DCIM', 'primary:Pictures', 'primary:DCIM/CameraBackup', 'primary:DCIM/Camera/nested', 'primary:DCIM/Camera/../Screenshots'])
    assert.equal(isCameraDirectory(folder(dir)), false, dir);
  assert.equal(isCameraDirectory(folder() + '/document/' + encodeURIComponent('primary:Pictures')), false);
  assert.equal(isCameraDirectory(folder().replace('com.android.externalstorage.documents', 'other.provider')), false);
  assert.equal(cameraPhotoName(file('IMG_20261009.jpg')), 'IMG_20261009.jpg');
  assert.equal(cameraPhotoName(file('照片.HEIC')), '照片.HEIC');
  for (const name of ['nested/picture.jpg', '../picture.jpg', '.hidden.jpg', 'movie.mp4', 'document.pdf', 'picture.jpg.exe'])
    assert.equal(cameraPhotoName(file(name)), undefined, name);
  assert.equal(cameraPhotoName(file('photo.jpg', 'primary:Pictures')), undefined);
});

test('image filtering checks original bytes rather than trusting a .jpg name or browser globals', async () => {
  for (const [name, mime] of [['gps-photo.jpg', 'image/jpeg'], ['gps-photo.png', 'image/png']]) {
    const bytes = await readFile(resolve(root, 'scripts/fixtures', name));
    assert.equal(originalImageMimeFromBase64(bytes.subarray(0, 64).toString('base64')), mime);
  }
  assert.equal(originalImageMimeFromBase64(Buffer.from('text renamed as a photo').toString('base64')), undefined);
  assert.equal(originalImageMimeFromBase64('not@base64'), undefined);
});

test('wrong-directory authorization is rejected before any listing or photo copy', async () => {
  let listings = 0, copies = 0, persisted = false;
  const picker = loadTs(resolve(root, 'app/src/lib/cameraOriginals.ts'), new Map([
    ['@react-native-async-storage/async-storage', { getItem: async () => null, setItem: async () => { persisted = true; } }],
    ['react-native', { Image: {} }],
    ['expo-file-system/legacy', { StorageAccessFramework: {
      requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: folder('primary:Pictures') }),
      readDirectoryAsync: async () => { listings++; return []; },
    }, copyAsync: async () => { copies++; } }],
  ]));
  await assert.rejects(picker.loadCameraOriginals(), /只允许相机原图目录/);
  assert.equal(listings, 0); assert.equal(copies, 0); assert.equal(persisted, false);
});

test('the camera gallery excludes non-images, nested folders, renamed text, and duplicate entries', async () => {
  const jpeg = await readFile(resolve(root, 'scripts/fixtures/gps-photo.jpg'));
  const candidate = file('IMG_20261009.jpg');
  const headersRead = [];
  const picker = loadTs(resolve(root, 'app/src/lib/cameraOriginals.ts'), new Map([
    ['@react-native-async-storage/async-storage', { getItem: async () => folder(), setItem: async () => {} }],
    ['react-native', { Image: {} }],
    ['expo-file-system/legacy', { EncodingType: { Base64: 'base64' },
      StorageAccessFramework: { readDirectoryAsync: async () => [candidate, candidate, file('note.jpg'), file('dir.jpg'),
        file('child/a.jpg'), file('movie.mp4'), file('other.jpg', 'primary:Pictures')] },
      readAsStringAsync: async (uri, opts) => {
        headersRead.push(uri);
        assert.equal(opts.length, 64); assert.equal(opts.position, 0);
        if (uri === file('dir.jpg')) throw new Error('is a directory');
        return (uri === candidate ? jpeg : Buffer.from('not a photo')).subarray(0, 64).toString('base64');
      },
    }],
  ]));
  assert.deepEqual(await picker.loadCameraOriginals(), [{ uri: candidate, name: 'IMG_20261009.jpg', mimeType: 'image/jpeg' }]);
  assert.equal(headersRead.length, 3);
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
