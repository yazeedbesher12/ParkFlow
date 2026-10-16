const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

async function withConfiguration(ambientUrl, configuredUrl, run) {
  const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
  const previousFetch = global.fetch;
  if (ambientUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = ambientUrl;
  const values = new Map();
  const load = createClientLoader({ application: 'management', stubs: {
    'expo-constants': { expoConfig: { extra: { parkflowApplication: 'management', apiBaseUrl: configuredUrl } } },
    'react-native': { Platform: { OS: 'web' } },
    '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } },
    'expo-secure-store': {},
  } });
  const urls = [];
  global.fetch = async url => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ developmentLoginEnabled: false, developmentEmailLoginEnabled: true, loginMethod: 'email' }) };
  };
  try { await run(load('@parkflow/client/services/http/apiClient'), urls); }
  finally {
    global.fetch = previousFetch;
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previous;
  }
}

test('shared API client can load sign-in configuration from its frontend runtime without ambient process variables', async () => {
  await withConfiguration(undefined, 'https://shared-api.example/api/v1/', async ({ api }, urls) => {
    const result = await api('/auth/config', { public: true });
    assert.equal(result.loginMethod, 'email');
    assert.deepEqual(urls, ['https://shared-api.example/api/v1/auth/config']);
  });
});

test('frontend runtime API destination takes precedence over another app ambient environment', async () => {
  await withConfiguration('https://other-api.example/api/v1', 'https://shared-api.example/api/v1', async ({ api }, urls) => {
    await api('/auth/config', { public: true });
    assert.deepEqual(urls, ['https://shared-api.example/api/v1/auth/config']);
  });
});
