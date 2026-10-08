import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const script = await readFile(new URL('../api/templates/map.js', import.meta.url), 'utf8');
async function mapHarness(search = '') {
  const messages = [], conversions = [], centers = [], events = {}, markers = [];
  class FakeMap {
    on(event, listener) { events[event] = listener; }
    addControl() {}
    add() {}
    remove() {}
    setZoomAndCenter(zoom, coordinates) { centers.push({ zoom, coordinates }); }
  }
  class Marker {
    constructor(options) { this.options = options; markers.push(this); }
    setPosition(position) { this.position = position; }
    on(event, handler) { this.handlers ||= {}; this.handlers[event] = handler; }
  }
  const window = {
    location: { origin: 'http://localhost:8787', search },
    ReactNativeWebView: { postMessage: raw => messages.push(JSON.parse(raw)) },
    addEventListener() {},
  };
  const AMap = {
    Map: FakeMap, Marker, Scale: class {},
    DistrictLayer: { World: class { setStyles() {} } },
    plugin(plugins, done) { done(); },
  };
  const document = { createElement: () => ({}), head: { appendChild(script) { script.onload(); } } };
  const fetch = async raw => {
    const url = new URL(raw, window.location.origin);
    assert.equal(url.searchParams.has('key'), false, 'private REST key must stay on the server');
    if (url.pathname === '/map/config') return { ok: true, json: async () => ({ configured: true, searchConfigured: true, key: 'public' }) };
    if (url.pathname === '/api/places/reverse') return { ok: true, json: async () => ({ address: '测试地址', city: '杭州市', name: '西湖区' }) };
    assert.equal(url.pathname, '/api/coordinates/convert');
    return new Promise(resolve => conversions.push({
      coords: [+url.searchParams.get('longitude'), +url.searchParams.get('latitude')],
      done(status, result) {
        const ll = result.locations?.[0];
        resolve({ ok: status === 'complete', json: async () => ll ? { place: { longitude: ll.lng, latitude: ll.lat, name: '我的当前位置', address: '' } } : { detail: '转换失败' } });
      },
    }));
  };
  const context = vm.createContext({ window, AMap, document, fetch, AbortController, setTimeout, clearTimeout, URLSearchParams });
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { messages, conversions, centers, events, markers, send: window.oriowlReceive };
}

test('GPS centers on converted coordinates and preserves the current-position name after geocoding', async () => {
  const h = await mapHarness();
  h.send({ type: 'locate', coords: { longitude: 120, latitude: 30 }, requestId: 1, settled: true });
  assert.equal(h.centers.length, 0, 'raw GPS must not be plotted on GCJ-02');
  h.conversions[0].done('complete', { locations: [{ lng: 120.006, lat: 30.002 }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.centers[0].coordinates[0], 120.006);
  assert.equal(h.centers[0].zoom, 16);
  const selected = h.messages.filter(m => m.type === 'selected').at(-1);
  assert.equal(selected.place.name, '我的当前位置');
  assert.equal(selected.place.address, '测试地址');
  assert.equal(selected.origin, 'location');
  assert.equal(h.messages.find(m => m.type === 'located').requestId, 1);
});

test('a late GPS fix updates the blue marker without stealing a newly selected place', async () => {
  const h = await mapHarness();
  h.send({ type: 'locate', coords: { longitude: 120, latitude: 30 }, requestId: 1 });
  h.events.click({ lnglat: { lng: 121, lat: 31 } });
  h.conversions[0].done('complete', { locations: [{ lng: 120.006, lat: 30.002 }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.centers.length, 0);
  assert.equal(h.messages.filter(m => m.type === 'selected').at(-1).place.longitude, 121);
  assert.equal(h.markers.find(m => m.options.content.includes('location-pin')).position[0], 120.006);
});

test('old conversions are ignored and conversion failures return a retryable location error', async () => {
  const h = await mapHarness();
  h.send({ type: 'locate', coords: { longitude: 120, latitude: 30 }, requestId: 1, settled: false });
  h.send({ type: 'locate', coords: { longitude: 121, latitude: 31 }, requestId: 1, settled: true });
  h.conversions[0].done('complete', { locations: [{ lng: 120.006, lat: 30.002 }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.centers.length, 0);
  h.conversions[1].done('error', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.messages.at(-1).type, 'locationError');
  assert.equal(h.messages.at(-1).settled, true);
});

test('world footprint markers zoom to the photo location and open the corresponding note', async () => {
  const h = await mapHarness('?mode=footprints');
  h.send({ type: 'entries', entries: [{ id: 'note', title: '旅程', hasPhoto: true, place: { longitude: 2.3, latitude: 48.8 } }] });
  h.markers[0].handlers.click();
  assert.equal(h.centers[0].zoom, 12);
  assert.deepEqual([...h.centers[0].coordinates], [2.3, 48.8]);
  assert.equal(h.messages.at(-1).id, 'note');
  assert.equal(h.messages.at(-1).place.latitude, 48.8);
  h.send({ type: 'overview' });
  assert.equal(h.centers.at(-1).zoom, 2);
});
