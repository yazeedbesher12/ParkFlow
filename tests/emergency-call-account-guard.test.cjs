const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function helper({ check = async () => true, intent, request = async () => 'granted' } = {}) {
  const launches = [], dials = [], requests = [];
  const load = createClientLoader({ stubs: {
    'react-native': {
      Platform: { OS: 'android' },
      PermissionsAndroid: {
        PERMISSIONS: { CALL_PHONE: 'call' }, RESULTS: { GRANTED: 'granted' },
        check, request: permission => { requests.push(permission); return request(permission); },
      },
      Linking: { openURL: async url => { dials.push(url); } },
    },
    'expo-intent-launcher': intent ?? {
      startActivityAsync: async (action, options) => { launches.push({ action, ...options }); },
    },
  } });
  return { ...load('@parkflow/client/utils/emergencyCall'), launches, dials, requests };
}

test('a changed account while permission is checked prevents an emergency launch', async () => {
  const permission = deferred();
  let active = true;
  const call = helper({ check: () => permission.promise });
  const pending = call.placeEmergencyCall('1234', () => active);
  active = false;
  permission.resolve(true);
  assert.equal(await pending, 'cancelled');
  assert.deepEqual(call.launches, []);
  assert.deepEqual(call.dials, []);
});

test('a changed account during native module loading prevents an emergency launch', async () => {
  let active = true;
  const launches = [];
  const intent = { startActivityAsync: async (...args) => { launches.push(args); } };
  // The CommonJS boundary models a module becoming available after the guard
  // was invalidated, without importing or launching a real native activity.
  Object.defineProperty(intent, '__esModule', { get() { active = false; return true; } });
  const call = helper({ intent });
  assert.equal(await call.placeEmergencyCall('1234', () => active), 'cancelled');
  assert.deepEqual(launches, []);
  assert.deepEqual(call.dials, []);
});

test('a delayed native rejection cannot open the dialer after the account changes', async () => {
  const activity = deferred();
  let active = true;
  const call = helper({ intent: { startActivityAsync: () => activity.promise } });
  assert.equal(await call.placeEmergencyCall('1234', () => active), 'called');
  active = false;
  activity.reject(new Error('Activity unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(call.dials, []);
});

test('manual calls retain the dialer fallback without an account guard', async () => {
  const call = helper({ intent: { startActivityAsync: async () => { throw new Error('Activity unavailable'); } } });
  assert.equal(await call.placeEmergencyCall('12 34'), 'called');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(call.dials, ['tel:1234']);
});

test('a cancelled countdown performs no permission check or launch', async () => {
  let checks = 0;
  const call = helper({ check: async () => { checks++; return true; } });
  assert.equal(await call.placeEmergencyCall('1234', () => false), 'cancelled');
  assert.equal(checks, 0);
  assert.deepEqual(call.launches, []);
  assert.deepEqual(call.dials, []);
});

test('a changed account during permission checking cannot open a permission prompt', async () => {
  const permission = deferred();
  let active = true;
  const call = helper({ check: () => permission.promise });
  const pending = call.ensureCallPermission(() => active);
  active = false;
  permission.resolve(false);
  assert.equal(await pending, false);
  assert.deepEqual(call.requests, []);
});
