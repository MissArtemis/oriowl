import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeNoteSync } from '../app/src/lib/mergeNoteSync.ts';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-typescript.mjs';
import { deviceApiUrl, preferredDevServer, sameDevBackend } from '../app/src/lib/serverAddress.ts';
import { draftPlace } from '../app/src/lib/draftPlace.ts';

const { ApiError, request } = loadTs(fileURLToPath(new URL('../app/src/lib/api.ts', import.meta.url)));

const entry = { id: 'first', title: '旅程', body: '正文', createdAt: '2026-10-08', photos: [], syncStatus: 'pending' };

test('in-flight sync preserves newly published notes and deletions instead of restoring its old snapshot', () => {
  const deleted = { ...entry, deletedAt: '2026-10-08T10:30:00Z' };
  const added = { ...entry, id: 'new-note' };
  const saved = { ...entry, syncStatus: 'synced' };
  const merged = mergeNoteSync([entry], [saved], [deleted, added]);
  assert.equal(merged.find((note) => note.id === 'first'), deleted);
  assert.equal(merged.find((note) => note.id === 'new-note'), added);
  const restored = { ...entry, restorePending: true };
  assert.equal(mergeNoteSync([deleted], [deleted], [restored])[0], restored);
  assert.deepEqual(mergeNoteSync([entry], [saved], []), []);
});

test('device address chooses the LAN computer when an Expo manifest contains loopback URLs', () => {
  assert.equal(deviceApiUrl(['localhost:8081', 'exp://192.168.31.138:8081']), 'http://192.168.31.138:8081');
  assert.equal(deviceApiUrl([undefined, 'http://127.0.0.1:8081', 'http://192.168.31.138:8081']), 'http://192.168.31.138:8081');
});

test('native scan uses the current Expo gateway without probing the old port or changing custom servers', () => {
  const gateway = 'http://192.168.31.138:8081';
  assert.equal(preferredDevServer('http://192.168.31.138:8787', gateway, true), gateway);
  assert.equal(preferredDevServer('http://192.168.31.100:8081', gateway, true), gateway);
  assert.equal(preferredDevServer('http://localhost:9000', gateway, true), gateway);
  assert.equal(preferredDevServer('https://notes.example.com', gateway, true), 'https://notes.example.com');
  assert.equal(preferredDevServer('http://192.168.31.138:9000', gateway, true), 'http://192.168.31.138:9000');
  assert.equal(preferredDevServer('http://192.168.31.138:8787', gateway, false), 'http://192.168.31.138:8787');
  assert.equal(sameDevBackend('http://192.168.31.138:8787', gateway), true);
  assert.equal(sameDevBackend('http://192.168.31.100:8787', gateway), false);
});

test('a photo with GPS supplies a publishable place offline and preserves its original GPS', () => {
  const photo = { uri: 'file:///original.jpg', gps: { longitude: 116.404, latitude: 39.915 } };
  const place = draftPlace([photo], null);
  assert.ok(Math.abs(place.longitude - 116.41024449916938) < 1e-9);
  assert.ok(Math.abs(place.latitude - 39.91640428150164) < 1e-9);
  assert.deepEqual(photo.gps, { longitude: 116.404, latitude: 39.915 });
  assert.equal(draftPlace([{ uri: 'file:///no-gps.jpg' }], null), null);
  assert.equal(draftPlace([{ gps: { longitude: NaN, latitude: 30 } }], null), null);
  const overseas = draftPlace([{ gps: { longitude: -74, latitude: 40.7 } }], null);
  assert.equal(overseas.longitude, -74);
  assert.equal(overseas.latitude, 40.7);
});

test('HTTP and non-JSON interface failures are not mislabeled as an unreachable server', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('<html>Expo preview</html>', { status: 200 });
  await assert.rejects(request('http://example.invalid', '/api/notes/mine'),
    (error) => error instanceof ApiError && error.status === 200 && error.message.includes('不是 JSON'));
  globalThis.fetch = async () => new Response('Internal Server Error', { status: 500 });
  await assert.rejects(request('http://example.invalid', '/api/notes/mine'),
    (error) => error instanceof ApiError && error.status === 500 && !error.message.includes('无法连接'));
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '登录已失效' }), { status: 401 });
  await assert.rejects(request('http://example.invalid', '/api/notes/mine'),
    (error) => error instanceof ApiError && error.status === 401 && error.message === '登录已失效');
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await request('http://example.invalid', '/api/notes/first', null, { method: 'DELETE' }), undefined);
});
