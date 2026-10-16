const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

const users = {
  customer: { id: 'customer-user', fullName: 'Customer', role: 'USER', profileCompletedAt: '2026-10-07', locale: 'en' },
  management: { id: 'management-user', fullName: 'Administrator', role: 'ADMIN', profileCompletedAt: '2026-10-07', locale: 'en' },
};
const sessions = Object.fromEntries(Object.entries(users).map(([application, user]) => [application, {
  transport: 'cookie', userId: user.id, sessionId: `session-${application}`, loginId: `login-${application}`,
  csrfToken: `csrf-${application}`, expiresAt: '2099-01-01T00:00:00Z',
}]));

function sharedBrowserStorage() {
  const values = new Map();
  return { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
function application(application, browserStorage) {
  const load = createClientLoader({ application, stubs: {
    'react-native': { Platform: { OS: 'web' } },
    '@react-native-async-storage/async-storage': browserStorage,
    'expo-secure-store': {
      getItemAsync() { throw new Error('Browser JWTs must not enter native SecureStore'); },
      setItemAsync() { throw new Error('Browser JWTs must not enter native SecureStore'); },
      deleteItemAsync() { throw new Error('Browser JWTs must not enter native SecureStore'); },
    },
  } });
  return { store: load('@parkflow/client/store/authStore').useAuthStore, auth: load('@parkflow/client/services/http/authService').httpAuthService };
}
async function withAuthServer(run) {
  const previousFetch = global.fetch, previousBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
  const cookies = new Map();
  global.fetch = async (url, options) => {
    assert.equal(options.credentials, 'include'); assert.equal(options.headers.Authorization, undefined);
    const app = options.headers['X-ParkFlow-App'];
    if (url.endsWith('/auth/web-session/bootstrap')) return { ok: true, status: 200, json: async () => cookies.has(app) ? { session: cookies.get(app), user: users[app] } : { session: null, user: null } };
    assert.ok(url.endsWith('/auth/web-session/logout'));
    assert.equal(options.headers['X-ParkFlow-Session'], cookies.get(app).sessionId);
    assert.equal(options.headers['X-ParkFlow-Login'], cookies.get(app).loginId);
    cookies.delete(app); return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try { await run(cookies); }
  finally {
    global.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = previousBaseUrl;
  }
}

test('customer and management logins rehydrate their own cookie sessions on the same browser origin', async () => {
  await withAuthServer(async cookies => {
    const storage = sharedBrowserStorage();
    cookies.set('customer', sessions.customer); cookies.set('management', sessions.management);
    await application('customer', storage).store.getState().signIn(sessions.customer, users.customer);
    await application('management', storage).store.getState().signIn(sessions.management, users.management);
    const customer = application('customer', storage).store, management = application('management', storage).store;
    await customer.getState().hydrate(); await management.getState().hydrate();
    assert.equal(customer.getState().hydrated, true); assert.equal(management.getState().hydrated, true);
    assert.equal(customer.getState().user?.id, 'customer-user');
    assert.equal(management.getState().user?.id, 'management-user');
    assert.equal(customer.getState().session?.transport, 'cookie');
    assert.equal(management.getState().session?.transport, 'cookie');
  });
});
test('management logout preserves the customer cookie login', async () => {
  await withAuthServer(async cookies => {
    const storage = sharedBrowserStorage();
    cookies.set('customer', sessions.customer); cookies.set('management', sessions.management);
    const customer = application('customer', storage), management = application('management', storage);
    await customer.store.getState().hydrate(); await management.store.getState().hydrate();
    await management.auth.signOut();
    const reloadedCustomer = application('customer', storage).store, reloadedManagement = application('management', storage).store;
    await reloadedCustomer.getState().hydrate(); await reloadedManagement.getState().hydrate();
    assert.equal(reloadedCustomer.getState().session?.userId, 'customer-user');
    assert.equal(reloadedManagement.getState().user, undefined);
    assert.equal(reloadedManagement.getState().session, undefined);
  });
});
test('a customer frontend does not hydrate a management-only cookie login', async () => {
  await withAuthServer(async cookies => {
    const storage = sharedBrowserStorage(); cookies.set('management', sessions.management);
    await application('management', storage).store.getState().signIn(sessions.management, users.management);
    const customer = application('customer', storage).store; await customer.getState().hydrate();
    assert.equal(customer.getState().hydrated, true);
    assert.equal(customer.getState().session, undefined); assert.equal(customer.getState().user, undefined);
  });
});