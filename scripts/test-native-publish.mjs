import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appRequire = createRequire(new URL('../app/package.json', import.meta.url));
const React = appRequire('react');
const { create, act } = appRequire('react-test-renderer');
const ts = appRequire('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__DEV__ = true;
const user = { id: 'test-user', username: 'fixture', nickname: '测试旅人' };

// Run the real native TypeScript modules. Only native adapters/router and the
// unreachable network are replaced; file copies use real bytes on disk.
function loadNative(mocks) {
  const modules = new Map();
  const load = (filename) => {
    if (mocks.has(filename)) return mocks.get(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const require = (name) => {
      if (mocks.has(name)) return mocks.get(name);
      if (!name.startsWith('.')) return appRequire(name);
      const path = resolve(dirname(filename), name);
      return load(/\.tsx?$/.test(path) ? path : path + (name.endsWith('Context') ? '.tsx' : '.ts'));
    };
    vm.runInThisContext(`(function(exports,require,module){${code}\n})`, { filename })(module.exports, require, module);
    return module.exports;
  };
  return (name) => load(resolve(root, 'app/src', name));
}

function storage(values = new Map()) {
  return { getItem: async (key) => values.get(key) || null,
    setItem: async (key, value) => { values.set(key, value); } };
}

async function nativeDraft(t, fixture, options = {}) {
  const localRoot = resolve(root, '.local');
  await mkdir(localRoot, { recursive: true });
  const directory = await mkdtemp(resolve(localRoot, 'native-publish-'));
  const within = (uri) => {
    const path = resolve(fileURLToPath(uri));
    assert.ok(path.startsWith(directory + sep), 'photo operations must stay in the test directory');
    return path;
  };
  const values = new Map(), routes = [], requests = [], reverse = [];
  let rejectSync, notes, draft, renderer;
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const selected = pathToFileURL(resolve(root, 'scripts/fixtures', fixture)).href;
  const folder = 'content://com.android.externalstorage.documents/tree/primary%3ADCIM%2FCamera';
  const contentUri = (name) => folder + '/document/' + encodeURIComponent('primary:DCIM/Camera/' + name);
  const fixtures = options.fixtures || [fixture];
  const sourcePath = (uri) => uri.startsWith('content:')
    ? resolve(root, 'scripts/fixtures', decodeURIComponent(uri.split('/document/')[1]).split('/').at(-1))
    : fileURLToPath(uri);
  const mocks = new Map([
    ['react', React],
    ['react-native', { Platform: { OS: 'android' }, Keyboard: { dismiss() {} },
      BackHandler: { addEventListener: () => ({ remove() {} }) },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      Image: { getSize: (_, success) => success(300, 400) } }],
    ['expo-router', { router: { replace: (route) => routes.push(route), canGoBack: () => false } }],
    ['@react-native-async-storage/async-storage', storage(values)],
    ['expo-document-picker', { getDocumentAsync: async () => ({ canceled: false,
      assets: [{ uri: selected, mimeType: 'image/jpeg' }] }) }],
    ['expo-image-picker', {}], ['expo-media-library/legacy', {}],
    ['expo-file-system', { File: class {
      constructor(uri) { this.path = fileURLToPath(uri); }
      get size() { return statSync(this.path).size; }
      async arrayBuffer() { const data = await readFile(this.path); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }
    } }],
    ['expo-file-system/legacy', { documentDirectory: pathToFileURL(directory + sep).href,
      cacheDirectory: pathToFileURL(directory + sep).href,
      EncodingType: { Base64: 'base64' },
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: folder }),
        readDirectoryAsync: async () => fixtures.map(contentUri),
      },
      readAsStringAsync: async (uri, { position, length }) => (await readFile(sourcePath(uri))).subarray(position, position + length).toString('base64'),
      getInfoAsync: async (uri) => ({ exists: true, isDirectory: false, size: statSync(sourcePath(uri)).size }),
      makeDirectoryAsync: (uri) => mkdir(within(uri), { recursive: true }),
      copyAsync: ({ from, to }) => copyFile(sourcePath(from), within(to)),
      deleteAsync: (uri) => rm(within(uri), { recursive: true, force: true }) }],
    [resolve(root, 'app/src/lib/api.ts'), { ApiError, errorMessage: (error) => error.message,
      request: async (_, path, token, opts) => {
        requests.push(path);
        if (path.startsWith('/api/places/reverse')) return new Promise((resolve) => reverse.push({ resolve, signal: opts.signal, path }));
        if (!rejectSync) return new Promise((_, reject) => { rejectSync = reject; });
        throw new ApiError('离线测试', 0);
      } }],
    [resolve(root, 'app/src/lib/readPhotoMetadata.ts'), {
      readPhotoMetadata: async (uri) => {
        const { photoMetadataBytes } = await import('../app/src/lib/photoMetadataBytes.ts');
        return photoMetadataBytes(new Uint8Array(await readFile(fileURLToPath(uri))));
      } }],
    [resolve(root, 'app/src/context/AuthContext.tsx'), { useAuth: () => ({ user, token: 'fixture-token' }) }],
    [resolve(root, 'app/src/context/TravelContext.tsx'), { useTravel: () => ({ ...notes,
      apiUrl: 'http://192.168.31.138:8081', selectedPlace: options.initialPlace || null, currentPlace: null, notify() {} }) }],
  ]);
  const load = loadNative(mocks);
  const { useNotes } = load('lib/useNotes.ts');
  const { useComposeDraft } = load('lib/useComposeDraft.ts');
  function Harness() {
    notes = useNotes('http://192.168.31.138:8081', user, 'fixture-token');
    draft = useComposeDraft();
    return null;
  }
  await act(async () => { renderer = create(React.createElement(Harness)); });
  t.after(async () => {
    await act(async () => { renderer.unmount(); rejectSync?.(new ApiError('离线测试', 0)); });
    assert.ok(directory.startsWith(localRoot + sep));
    await rm(directory, { recursive: true, force: true });
  });
  assert.ok(notes.ready && notes.syncing, 'background synchronization is waiting on an unreachable API');
  const select = async (names, source) => {
    let pending;
    await act(async () => { pending = draft.pick(source); });
    for (let attempt = 0; draft.originalPicker.busy && attempt < 100; attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    assert.equal(draft.originalPicker.visible, true);
    assert.equal(draft.originalPicker.busy, false);
    for (const name of names) await act(async () => { draft.originalPicker.toggle(contentUri(name)); });
    await act(async () => { await draft.originalPicker.confirm(); await pending; });
  };
  await select(options.selection || [fixture]);
  await act(async () => { draft.setTitle('带照片离线发布'); draft.setBody('真实原图测试'); });
  return { get draft() { return draft; }, get notes() { return notes; }, routes, requests, values, select, reverse };
}

test('Android photo draft publishes with GPS and no selected map place while background sync hangs', async (t) => {
  const app = await nativeDraft(t, 'gps-photo.jpg');
  assert.equal(app.draft.photos.length, 1);
  assert.equal(app.draft.photos[0].gps.longitude, 120.1);
  assert.ok(app.draft.place, 'GPS supplies a place without a backend conversion');
  await act(async () => {
    let timer;
    try {
      await Promise.race([app.draft.publish(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('publishing waited for the backend')), 1000);
      })]);
    } finally { clearTimeout(timer); }
  });
  assert.equal(app.routes[0].pathname, '/memory/[id]');
  assert.equal(app.notes.entries.length, 1);
  const saved = app.notes.entries[0];
  assert.notEqual(saved.photos[0].uri, app.draft.photos[0].uri);
  assert.deepEqual(await readFile(fileURLToPath(saved.photos[0].uri)),
    await readFile(resolve(root, 'scripts/fixtures/gps-photo.jpg')));
  assert.equal(saved.photos[0].gps.longitude, 120.1);
  assert.equal(saved.syncStatus, 'pending');
  assert.ok([...app.values.entries()].some(([key, index]) => key.startsWith('@owltrace/notes/v2/') && JSON.parse(index)[0]?.id === saved.id));
  assert.ok(app.requests.every((path) => path === '/health' || path.startsWith('/api/places/reverse')), 'publication must not wait for photo upload');
});

test('default original selection updates location before the address request finishes, and ignores stale addresses', async (t) => {
  const manual = { longitude: 116.4, latitude: 39.9, name: '预选地点', address: '预选地址' };
  const app = await nativeDraft(t, 'gps-photo.jpg', { initialPlace: manual, fixtures: ['gps-photo.jpg', 'gps-photo-2.jpg'] });
  assert.notEqual(app.draft.place.longitude, manual.longitude);
  assert.equal(app.draft.photoLocation, app.draft.photos[0].place);
  assert.equal(app.draft.place.address, '');
  assert.equal(app.reverse.length, 1);
  await act(async () => { app.draft.choosePlace(manual); });
  assert.equal(app.draft.place, manual);
  await app.select(['gps-photo-2.jpg'], 'library');
  assert.ok(Math.abs(app.draft.photos[1].gps.longitude - 121.2) < 1e-9);
  assert.equal(app.draft.locationPhotoUri, app.draft.photos[1].uri);
  assert.equal(app.draft.place.longitude, app.draft.photos[1].place.longitude);
  assert.equal(app.draft.place.address, '');
  assert.equal(app.reverse[0].signal.aborted, true);
  await act(async () => { app.reverse[0].resolve({ address: '过期地址' }); });
  assert.notEqual(app.draft.place.address, '过期地址');
  await act(async () => { app.reverse.at(-1).resolve({ address: '第二张照片的新地址', city: '测试市' }); });
  assert.equal(app.draft.place.address, '第二张照片的新地址');
  await act(async () => { await app.draft.publish(); });
  assert.equal(app.notes.entries[0].locationPhotoIndex, 1);
  assert.equal(app.notes.entries[0].place.address, '第二张照片的新地址');
});

test('choosing and removing a location photo recalculates coordinates without retaining its previous GPS', async (t) => {
  const fallback = { longitude: 116.4, latitude: 39.9, name: '预选地点', address: '' };
  const app = await nativeDraft(t, 'gps-photo.jpg', { initialPlace: fallback,
    fixtures: ['gps-photo.jpg', 'gps-photo-2.jpg'], selection: ['gps-photo.jpg', 'gps-photo-2.jpg'] });
  const [first, second] = app.draft.photos;
  await act(async () => { app.draft.choosePhoto(second.uri); });
  assert.equal(app.draft.place.longitude, second.place.longitude);
  await act(async () => { app.draft.removePhoto(1); });
  assert.equal(app.draft.place.longitude, first.place.longitude);
  assert.equal(app.draft.locationPhotoUri, first.uri);
  await act(async () => { app.draft.removePhoto(0); });
  assert.equal(app.draft.place, fallback);
  assert.equal(app.draft.photoLocation, undefined);
  assert.equal(app.draft.locationPhotoUri, undefined);
});

test('a photo without GPS or a selected place reports a visible validation error without losing the draft', async (t) => {
  const app = await nativeDraft(t, 'no-gps-photo.jpg');
  await act(async () => { await app.draft.publish(); });
  assert.match(app.draft.error, /请搜索地点/);
  assert.equal(app.draft.photos.length, 1);
  assert.equal(app.routes.length, 0);
  assert.equal(app.notes.entries.length, 0);
});

test('same-computer gateway migration retains offline login and pending photos, but rejects an invalid login', async () => {
  for (const status of [0, 503, 401]) {
    const from = 'http://192.168.31.138:8787', to = 'http://192.168.31.138:8081';
    const key = (url) => '@owltrace/notes/v2/' + encodeURIComponent(url) + '/' + user.id;
    const pending = [{ id: 'offline-note', photos: [{ uri: 'file:///original.jpg' }], syncStatus: 'pending' }];
    const values = new Map([[key(from), JSON.stringify(pending)]]);
    let session = { apiUrl: from, user, token: 'fixture-token' }, auth, renderer;
    const load = loadNative(new Map([
      ['react', React], ['@react-native-async-storage/async-storage', storage(values)],
      [resolve(root, 'app/src/context/ConfigContext.tsx'), { useConfig: () => ({ apiUrl: to, ready: true }) }],
      [resolve(root, 'app/src/lib/sessionStorage.ts'), { readSession: async () => JSON.stringify(session),
        writeSession: async (next) => { session = next; } }],
    ]));
    const api = load('lib/api.ts');
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      if (status === 0) throw new TypeError('offline');
      return new Response(JSON.stringify({ detail: 'test error' }), { status });
    };
    try {
      const { AuthProvider, useAuth } = load('context/AuthContext.tsx');
      function Harness() { auth = useAuth(); return null; }
      await act(async () => { renderer = create(React.createElement(AuthProvider, null, React.createElement(Harness))); });
      assert.equal(auth.ready, true);
      if (status === 401) {
        assert.equal(auth.user, null);
        assert.equal(values.has(key(to)), false);
      } else {
        assert.equal(auth.user.id, user.id);
        assert.equal(session.apiUrl, to);
        assert.deepEqual(JSON.parse(values.get(key(to))), pending);
        assert.deepEqual(JSON.parse(values.get(key(from))), pending);
      }
      assert.ok(api.ApiError);
    } finally {
      await act(async () => { renderer?.unmount(); });
      globalThis.fetch = original;
    }
  }
});
