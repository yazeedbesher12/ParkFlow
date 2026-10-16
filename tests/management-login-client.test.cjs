const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let harness;

function managementHarness() {
  const calls = [], routes = [], persisted = new Map(), services = {};
  const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'OnboardingStepper', 'InlineNotice', 'Reveal', 'Screen', 'TextField'].map(name => [name, props => React.createElement(name, props, props.children)]));
  const load = createClientLoader({ application: 'management', stubs: {
    'react-native': { View: props => React.createElement('View', props, props.children) },
    'expo-router': {
      useRouter: () => ({ push: route => routes.push(['push', route]), replace: route => routes.push(['replace', route]) }),
      Redirect: props => React.createElement('Redirect', props),
      useFocusEffect: callback => React.useEffect(callback, [callback]),
    },
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t: key => key }) },
    '@parkflow/client/hooks/useBlockHardwareBack': { useBlockHardwareBack() {} },
    '@parkflow/client/utils/haptics': { haptics: { success() {}, error() {} } },
    '@parkflow/client/services': { services },
    '@parkflow/client/store/reservationRouteStore': { clearReservationRouteForAccountChange: async () => () => {} },
    '@parkflow/client/services/storage': {
      secureStorage: {
        getItem: async key => persisted.get(key) ?? null,
        setItem: async (key, value) => { persisted.set(key, value); },
        removeItem: async key => { persisted.delete(key); },
      },
      STORAGE_KEYS: { authSession: 'management-test-auth' },
    },
    '@parkflow/client/services/http/apiClient': { api: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) },
  } });
  services.auth = load('@parkflow/client/services/http/authService').httpAuthService;
  const auth = load('@parkflow/client/store/authStore').useAuthStore;
  const phone = load('@parkflow/client/store/phoneAuthStore').usePhoneAuthStore;
  auth.setState({ session: undefined, user: undefined, hydrated: true });
  phone.getState().begin('login');
  phone.getState().setPhoneInput('0599 123 456');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let renderer;
  const mount = async screen => {
    const Screen = load(`apps/management/app/(onboarding)/${screen}.tsx`).default;
    await act(async () => {
      renderer?.unmount();
      renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Screen)));
    });
  };
  const settle = async (index, value) => {
    assert.ok(calls[index], `Expected management request ${index}`);
    await act(async () => { calls[index].resolve(value); await new Promise(resolve => setTimeout(resolve, 10)); });
  };
  return {
    calls, routes, auth, phone, mount, settle,
    async enterEmail() { await act(async () => renderer.root.findByProps({ testID: 'email-input' }).props.onChangeText('manager@example.com')); },
    async submit() { await act(async () => renderer.root.findByType('AppButton').props.onPress()); },
    redirect() { return renderer.root.findByType('Redirect').props.href; },
    async cleanup() { await act(async () => renderer?.unmount()); client.clear(); },
  };
}

const config = method => ({ developmentLoginEnabled: method === 'phone', developmentEmailLoginEnabled: method === 'email', loginMethod: method });
const result = (role, profileCompletedAt = '2026-10-07T00:00:00Z') => ({
  session: { accessToken: 'test-management-access', refreshToken: 'test-management-refresh', expiresAt: '2099-01-01T00:00:00Z', userId: 'manager-1' },
  user: { id: 'manager-1', fullName: 'Parking Manager', email: 'manager@example.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null, role, profileCompletedAt },
  isNewUser: false,
});

beforeEach(() => { harness = managementHarness(); });
afterEach(async () => { await harness.cleanup(); });

async function login(method, signedIn) {
  await harness.mount(method);
  assert.equal(harness.calls[0].url, '/auth/config');
  await harness.settle(0, config(method));
  if (method === 'email') await harness.enterEmail();
  await harness.submit();
  assert.equal(harness.calls[1].url, method === 'email' ? '/auth/dev-login' : '/auth/phone/dev-login');
  await harness.settle(1, signedIn);
}

for (const method of ['email', 'phone']) {
  for (const [role, destination] of [['ADMIN', '/admin'], ['PARKING_OPERATOR', '/operator']]) {
    test(`management ${method} login keeps ${role} in ${destination}`, async () => {
      await login(method, result(role));
      assert.equal(harness.auth.getState().user.role, role);
      assert.deepEqual(harness.routes, [['replace', destination]]);
      assert.equal(harness.redirect(), destination);
    });
  }
}

for (const [role, destination] of [['ADMIN', '/admin'], ['PARKING_OPERATOR', '/operator']]) {
  test(`management profile completion returns ${role} to ${destination}`, async () => {
    await login('email', result(role, null));
    assert.deepEqual(harness.routes, [['replace', '/(onboarding)/details']]);
    await act(async () => harness.phone.getState().setVehicleSetup('stale-customer-vehicle-step'));
    await harness.mount('details');
    await harness.submit();
    assert.equal(harness.calls[2].url, '/users/me/complete-profile');
    assert.deepEqual(harness.calls[2].options.body, { email: 'manager@example.com' });
    await harness.settle(2, result(role).user);
    assert.equal(harness.auth.getState().user.profileCompletedAt, '2026-10-07T00:00:00Z');
    assert.equal(harness.phone.getState().vehicleSetupUserId, undefined);
    assert.deepEqual(harness.routes, [['replace', '/(onboarding)/details'], ['replace', destination]]);
  });
}

test('management email login denies an ordinary customer before profile completion', async () => {
  await login('email', result('USER', null));
  assert.deepEqual(harness.routes, [['replace', '/access-denied']]);
  assert.equal(harness.redirect(), '/access-denied');
});
