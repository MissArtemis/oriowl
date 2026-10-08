import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-typescript.mjs';
import { sendXhr } from '../app/src/lib/xhrTransport.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const { ApiError, request } = loadTs(resolve(root, 'app/src/lib/api.ts'));

test('SDK 57 multipart rejects legacy URI parts before sending a request', async (t) => {
  const OriginalFormData = globalThis.FormData;
  t.after(() => { globalThis.FormData = OriginalFormData; });
  class RNFormData { constructor() { this._parts = []; } }
  globalThis.FormData = RNFormData;
  const patch = loadTs(resolve(root, 'app/node_modules/expo/src/winter/FormData.ts'));
  patch.installFormDataPatch(RNFormData);
  const converter = loadTs(resolve(root, 'app/node_modules/expo/src/winter/fetch/convertFormData.ts'), new Map([
    [resolve(root, 'app/node_modules/expo/src/utils/blobUtils.ts'), { blobToArrayBufferAsync: (blob) => blob.arrayBuffer() }],
  ]));
  const form = new FormData();
  form.append('file', { uri: 'file:///original.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  await assert.rejects(converter.convertFormDataAsync(form), /Unsupported FormDataPart implementation/);
});

test('native requests bypass a broken global fetch and pass URI multipart, authorization, and DELETE through XHR once', async (t) => {
  const oldXhr = globalThis.XMLHttpRequest, oldFetch = globalThis.fetch;
  t.after(() => { globalThis.XMLHttpRequest = oldXhr; globalThis.fetch = oldFetch; });
  const calls = [];
  globalThis.fetch = async () => { throw new Error('broken Expo native fetch'); };
  globalThis.XMLHttpRequest = class {
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) {
      calls.push({ method: this.method, url: this.url, headers: this.headers, body });
      this.status = this.method === 'POST' ? 201 : this.method === 'DELETE' ? 204 : 200;
      this.responseText = this.method === 'DELETE' ? '' : JSON.stringify({ ok: true });
      queueMicrotask(() => this.onload());
    }
    abort() { this.onabort?.(); }
  };
  const adapter = loadTs(resolve(root, 'app/src/lib/httpTransport.native.ts'));
  const api = loadTs(resolve(root, 'app/src/lib/api.ts'), new Map([
    [resolve(root, 'app/src/lib/httpTransport.ts'), adapter],
  ]));
  assert.deepEqual(await api.request('http://fixture', '/health'), { ok: true });
  const form = new FormData();
  form.append('gps', '{"longitude":120,"latitude":30}');
  await api.request('http://fixture', '/api/photos', 'test-token', { method: 'POST', body: form });
  assert.equal(calls[1].body, form);
  assert.equal(calls[1].headers.Authorization, 'Bearer test-token');
  assert.equal(calls[1].headers['Content-Type'], undefined, 'native multipart generates its own boundary');
  assert.equal(await api.request('http://fixture', '/api/notes/note', 'test-token', { method: 'DELETE' }), undefined);
  assert.equal(calls.length, 3, 'mutations are not automatically retried');
  await assert.rejects(api.request('http://fixture', '/health', null, { transport: 'global-fetch' }), /broken Expo native fetch/);
});

test('XHR cancellation aborts once and ignores a late successful response', async (t) => {
  const oldXhr = globalThis.XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = oldXhr; });
  let instance, sends = 0, aborts = 0;
  globalThis.XMLHttpRequest = class {
    constructor() { instance = this; }
    open() {} setRequestHeader() {}
    send() { sends++; }
    abort() { aborts++; this.onabort?.(); }
  };
  const controller = new AbortController();
  const pending = sendXhr('http://fixture/health', { method: 'GET', headers: {}, signal: controller.signal });
  const late = instance.onload;
  controller.abort();
  instance.status = 200; instance.responseText = '{}'; late();
  await assert.rejects(pending, /请求已取消/);
  assert.equal(aborts, 1); assert.equal(sends, 1);
  await assert.rejects(sendXhr('http://fixture/health', { method: 'GET', headers: {}, signal: controller.signal }), /请求已取消/);
  assert.equal(sends, 1, 'pre-canceled requests are never sent');
});

test('network and response-body failures retain their cause and phase while hiding credentials', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new TypeError('fetch failed', { cause: new Error('native module mismatch') }); };
  await assert.rejects(request('http://fixture', '/health'), (error) => error instanceof ApiError && error.status === 0 &&
    error.message.includes('发送请求') && error.message.includes('native module mismatch'));
  globalThis.fetch = async () => ({ status: 200, ok: true, text: async () => {
    throw new Error('stream broke Bearer PRIVATE_TOKEN http://fixture/api?key=PRIVATE_KEY');
  } });
  await assert.rejects(request('http://fixture', '/health'), (error) => error instanceof ApiError && error.status === 200 &&
    error.message.includes('读取响应') && error.message.includes('stream broke') && !error.message.includes('PRIVATE_'));
});
