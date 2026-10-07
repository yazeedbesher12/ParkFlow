const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [], pending = [];
const Native = ({ children }) => React.createElement('div', null, children);
const stubs = {
  'react-native': { View: Native },
  '@/components/ui': { Card: Native, AppText: Native },
  '@/hooks/useLocale': { useLocale: () => ({ t: key => key }) },
  '@/services/http/apiClient': { api: url => {
    calls.push(url);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } },
};
// Transpile only the target component. React, its renderer and React Query are
// real; transport and native presentation modules are the only stubs.
const filename = path.resolve(__dirname, '../src/components/domain/ZoneForecast.tsx');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const originalRequire = loaded.require.bind(loaded);
loaded.require = id => Object.hasOwn(stubs, id) ? stubs[id] : originalRequire(id);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
}).outputText, filename);
const { ZoneForecast } = loaded.exports;

const RealDate = Date;
let clock, renderer, client;
const response = { probability: 0.7, confidence: 0.8, fallback: false };
const tree = props => React.createElement(QueryClientProvider, { client }, React.createElement(ZoneForecast, { zoneId: 'zone-1', ...props }));
async function mount(props = {}) { await act(async () => { renderer = create(tree(props)); }); }
async function finish(index = 0, failed = false) {
  clock += 1000;
  await act(async () => {
    if (failed) pending[index].reject(new Error('rate limited'));
    else pending[index].resolve(response);
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
beforeEach(() => {
  clock = RealDate.parse('2030-01-01T12:00:00Z');
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  calls.length = 0; pending.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  client.clear(); renderer = undefined; global.Date = RealDate;
});

test('default forecast keeps one query after successful data and mounted screen rerenders', async () => {
  await mount(); assert.equal(calls.length, 1);
  await finish();
  await act(async () => { renderer.update(tree({})); });
  assert.equal(calls.length, 1);
  assert.equal(client.getQueryCache().getAll().length, 1);
});
test('a rejected forecast does not recursively create new requests or query keys', async () => {
  await mount(); await finish(0, true);
  assert.equal(calls.length, 1);
  assert.equal(client.getQueryCache().getAll().length, 1);
});
test('an explicit arrival selection changes the forecast on the same mounted component', async () => {
  const first = '2030-02-03T09:30:00.000Z', second = '2030-02-03T10:00:00.000Z';
  await mount({ arrivalAt: first }); await finish();
  await act(async () => { renderer.update(tree({ arrivalAt: second })); });
  assert.equal(calls.length, 2);
  await finish(1); assert.equal(calls.length, 2);
  assert.deepEqual(calls, [
    `/parking/zones/zone-1/forecast?arrivalAt=${encodeURIComponent(first)}`,
    `/parking/zones/zone-1/forecast?arrivalAt=${encodeURIComponent(second)}`,
  ]);
});
test('intentional refresh uses the current time without growing the default query cache', async () => {
  await mount(); await finish(); clock = RealDate.parse('2030-01-01T13:00:00Z');
  await act(async () => { void client.invalidateQueries({ queryKey: ['forecast', 'zone-1'] }); });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes(encodeURIComponent('2030-01-01T13:00:00.000Z')));
  await finish(1); assert.equal(calls.length, 2);
  assert.equal(client.getQueryCache().getAll().length, 1);
});
