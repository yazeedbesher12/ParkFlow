const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

function serviceWithConfig(config) {
  const load = createClientLoader({ stubs: {
    '@parkflow/client/services/http/apiClient': { api: async () => config },
    '@parkflow/client/services/storage': {
      secureStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
      STORAGE_KEYS: { authSession: 'auth' },
    },
  } });
  return load('@parkflow/client/services/http/authService').httpAuthService;
}

test('real email verification is accepted without development login bypass', async () => {
  const config = { loginMethod: 'email', developmentLoginEnabled: false, developmentEmailLoginEnabled: false };
  assert.deepEqual(await serviceWithConfig(config).getConfig(), config);
});

test('authentication config rejects conflicting development methods', async () => {
  for (const config of [
    { loginMethod: 'email', developmentLoginEnabled: true, developmentEmailLoginEnabled: false },
    { loginMethod: 'phone', developmentLoginEnabled: false, developmentEmailLoginEnabled: true },
    { loginMethod: 'email', developmentLoginEnabled: true, developmentEmailLoginEnabled: true },
  ]) {
    await assert.rejects(serviceWithConfig(config).getConfig(), /Invalid authentication config/);
  }
});
