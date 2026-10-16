const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

const userA = { id: 'account-a', fullName: 'First account', role: 'USER' };
const userB = { id: 'account-b', fullName: 'Second account', role: 'USER' };
const session = (id, suffix = '') => ({ userId: id, accessToken: `access-${id}${suffix}`, refreshToken: `refresh-${id}${suffix}`, expiresAt: '2099-01-01T00:00:00Z' });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function scenario(run) {
  const originalFetch = global.fetch;
  const originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
  const values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const load = createClientLoader({ stubs: {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
  } });
  const store = load('@parkflow/client/store/authStore').useAuthStore;
  const { refreshSession } = load('@parkflow/client/services/http/apiClient');
  const pending = [];
  global.fetch = (url, options) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(response(userB));
    assert.equal(url, 'https://parkflow-test.invalid/api/v1/auth/refresh');
    return new Promise(resolve => pending.push({ token: JSON.parse(options.body).refreshToken, resolve }));
  };
  try { await run({ store, refreshSession, pending, reload: () => {
    const next = createClientLoader({ stubs: { 'react-native': { Platform: { OS: 'android' } }, '@react-native-async-storage/async-storage': storage, 'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem } } });
    return next('@parkflow/client/store/authStore').useAuthStore;
  } }); }
  finally {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
  }
}

test('a late successful refresh cannot erase the account signed in after logout', async () => {
  await scenario(async ({ store, refreshSession, pending, reload }) => {
    await store.getState().signIn(session(userA.id), userA);
    const old = refreshSession();
    const rejected = assert.rejects(old, /Session changed/);
    await store.getState().signOut();
    await store.getState().signIn(session(userB.id), userB);
    pending[0].resolve(response(session(userA.id, '-rotated')));
    await rejected;
    assert.equal(store.getState().user?.id, 'account-b');
    const reloaded = reload(); await reloaded.getState().hydrate();
    assert.equal(reloaded.getState().session?.refreshToken, 'refresh-account-b');
  });
});

test('a rejected old refresh cannot sign out a newer account', async () => {
  await scenario(async ({ store, refreshSession, pending }) => {
    await store.getState().signIn(session(userA.id), userA);
    const old = refreshSession(); const rejected = assert.rejects(old, /Revoked/);
    await store.getState().signOut();
    await store.getState().signIn(session(userB.id), userB);
    pending[0].resolve(response({ error: { code: 'UNAUTHORIZED', message: 'Revoked' } }, 401));
    await rejected;
    assert.equal(store.getState().session?.refreshToken, 'refresh-account-b');
  });
});

test('a newer login refreshes its own token while the older account refresh is pending', async () => {
  await scenario(async ({ store, refreshSession, pending }) => {
    await store.getState().signIn(session(userA.id), userA);
    const old = refreshSession(); const oldRejected = assert.rejects(old);
    await store.getState().signOut();
    await store.getState().signIn(session(userB.id), userB);
    const current = refreshSession();
    const observed = current.then(value => ({ value }), error => ({ error }));
    const tokens = pending.map(item => item.token);
    if (pending[1]) pending[1].resolve(response(session(userB.id, '-rotated')));
    pending[0].resolve(response(session(userA.id, '-rotated')));
    await oldRejected; const result = await observed;
    assert.deepEqual(tokens, ['refresh-account-a', 'refresh-account-b']);
    assert.equal(result.value?.refreshToken, 'refresh-account-b-rotated');
    assert.equal(store.getState().user?.id, 'account-b');
  });
});
