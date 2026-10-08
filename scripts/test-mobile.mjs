import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { apiGateway } from '../app/scripts/apiGateway.cjs';
import { photoMetadataBytes } from '../app/src/lib/photoMetadataBytes.ts';
import { apiFromHost, isLanDevServer, isLoopbackServer } from '../app/src/lib/serverAddress.ts';

test('original JPEG and PNG GPS is read locally without the API or media-library permission', async () => {
  for (const extension of ['jpg', 'png']) {
    const image = await readFile(new URL(`./fixtures/gps-photo.${extension}`, import.meta.url));
    const metadata = await photoMetadataBytes(new Uint8Array(image));
    assert.ok(Math.abs(metadata.gps.latitude - 30.2) < 0.000001, extension);
    assert.ok(Math.abs(metadata.gps.longitude - 120.1) < 0.000001, extension);
    assert.ok(metadata.capturedAt.startsWith('2026-10-08'), extension);
  }
  const ordinary = await photoMetadataBytes(new Uint8Array(await readFile(new URL('./fixtures/no-gps-photo.jpg', import.meta.url))));
  assert.equal(ordinary.gps, undefined);
});

test('the photo parser loads and reads GPS when React Native has no navigator.userAgent', () => {
  const parser = new URL('../app/src/lib/photoMetadataBytes.ts', import.meta.url).href;
  const fixtures = ['jpg', 'png'].map((extension) =>
    new URL(`./fixtures/gps-photo.${extension}`, import.meta.url).href,
  );
  const script = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    Object.defineProperty(globalThis, 'navigator', {
      value: { product: 'ReactNative' }, configurable: true,
    });
    const { photoMetadataBytes } = await import(${JSON.stringify(parser)});
    for (const fixture of ${JSON.stringify(fixtures)}) {
      const metadata = await photoMetadataBytes(new Uint8Array(await readFile(new URL(fixture))));
      assert.equal(metadata.gps.latitude, 30.2);
      assert.equal(metadata.gps.longitude, 120.1);
      assert.ok(metadata.capturedAt.startsWith('2026-10-08'));
    }
    assert.equal(navigator.userAgent, undefined);
  `;
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module', '--eval', script,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('LAN addresses resolve from Expo URLs and phone loopback is identified without replacing remote servers', () => {
  assert.equal(apiFromHost('192.168.31.138:8081'), 'http://192.168.31.138:8081');
  assert.equal(apiFromHost('exp://192.168.31.138:8081/--/'), 'http://192.168.31.138:8081');
  assert.equal(apiFromHost('http://[::1]:8081'), 'http://[::1]:8081');
  assert.equal(isLoopbackServer('http://localhost:8787'), true);
  assert.equal(isLanDevServer('http://192.168.31.100:8787'), true);
  assert.equal(isLanDevServer('https://photos.example.com'), false);
  assert.equal(isLanDevServer('http://192.168.31.100:9000'), false);
});

test('the Expo gateway preserves photo bytes, authorization and query strings while leaving Metro paths alone', async (t) => {
  const photo = await readFile(new URL('./fixtures/gps-photo.jpg', import.meta.url));
  const backend = createServer(async (request, response) => {
    assert.equal(request.url, '/api/photos?source=original');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer test-only-token');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), photo);
    response.writeHead(201, { 'Content-Type': 'image/jpeg' });
    response.end(photo);
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const proxy = apiGateway(backend.address().port);
  const gateway = createServer((request, response) => proxy(request, response, () => response.end('metro')));
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => { gateway.closeAllConnections(); backend.closeAllConnections(); gateway.close(); backend.close(); });
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const response = await fetch(base + '/api/photos?source=original', {
    method: 'POST', headers: { Authorization: 'Bearer test-only-token' }, body: photo,
  });
  assert.equal(response.status, 201);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
  assert.equal(await fetch(base + '/index.bundle?platform=android').then((result) => result.text()), 'metro');
});
