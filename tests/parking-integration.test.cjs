const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const modules = new Map();
let response;
const stubs = {
  '@/services/http/apiClient': { api: async () => response, query: () => '', segment: encodeURIComponent },
  '@/utils/errors': { AppError: Error },
};
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  modules.set(filename, loaded);
  const original = loaded.require.bind(loaded);
  loaded.require = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id === './apiClient') return stubs['@/services/http/apiClient'];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.resolve(__dirname, '../src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      const resolved = [base, `${base}.ts`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (resolved) return load(path.relative(path.resolve(__dirname, '..'), resolved));
    }
    return original(id);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
  return loaded.exports;
}
const { ramallahParkingZones, publishedCollectedParkingLocations } = load('src/data/ramallahParking.ts');
const { httpParkingService } = load('src/services/http/parkingService.ts');
const { rankParkingForDestination } = load('src/utils/parkingRecommendation.ts');
const { isParkingZoneOpen } = load('src/utils/time.ts');
const now = new Date('2030-01-01T12:00:00Z');
const base = { ...ramallahParkingZones[0], active: true, lifecycle: 'published',
  operatingHours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '00:00' })),
};
test('API management restrictions and verified metadata override the collected prototype', async () => {
  response = { ...base, parkingAllowed: false, prototypeData: false, ownership: 'private', accessRestriction: 'Operator restriction', availability: 'unknown' };
  const actual = await httpParkingService.getZone(base.id);
  assert.equal(actual.parkingAllowed, false);
  assert.equal(actual.prototypeData, false);
  assert.equal(actual.accessRestriction, 'Operator restriction');
  assert.equal(actual.ownership, 'private');
  assert.equal(actual.availability, 'unknown');
});
test('collected markers omit unpublished locations and retain updated API coordinates and prices', () => {
  assert.deepEqual(publishedCollectedParkingLocations([]), []);
  const updated = { ...base, name: 'Updated parking', location: { latitude: 31.91, longitude: 35.21 }, tariff: { ...base.tariff, hourlyRate: 900 } };
  const [marker] = publishedCollectedParkingLocations([updated]);
  assert.equal(marker.name, updated.name);
  assert.deepEqual(marker.location, updated.location);
  assert.equal(marker.price.hourlyRateNis, 9);
});
test('temporary closures penalize recommendations and end exactly at their recorded boundary', () => {
  const closed = { ...base, closures: [{ startsAt: '2030-01-01T11:00:00Z', endsAt: '2030-01-01T13:00:00Z' }] };
  const open = { ...base, id: 'open-zone' };
  const ranked = rankParkingForDestination(base.location, [closed, open], now);
  assert.equal(ranked[0].zone.id, open.id);
  assert.equal(ranked.find(item => item.zone.id === closed.id).open, false);
  assert.equal(isParkingZoneOpen(closed, new Date('2030-01-01T13:00:00Z')), true);
});
test('suspended and draft locations never become destination recommendations', () => {
  const results = rankParkingForDestination(base.location, [
    { ...base, active: false }, { ...base, id: 'draft', lifecycle: 'draft' },
    { ...base, id: 'published' },
  ], now);
  assert.deepEqual(results.map(result => result.zone.id), ['published']);
});
