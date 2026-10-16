const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const active = [];
const native = name => props => React.createElement(name, props, props.children);
let cachedHarness;

function routeHarness() {
  if (cachedHarness) {
    cachedHarness.reset();
    active.push(cachedHarness);
    return cachedHarness;
  }
  const routes = [], persisted = new Map();
  const storage = {
    getItem: async key => persisted.get(key) ?? null,
    setItem: async (key, value) => { persisted.set(key, value); },
    removeItem: async key => { persisted.delete(key); },
  };
  const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'OnboardingStepper', 'Card', 'Reveal', 'Screen', 'TextField'].map(name => [name, native(name)]));
  // Keep welcome/name components, locale/theme hooks and stores real. These
  // boundaries replace native rendering, navigation and device/network I/O.
  const load = createClientLoader({ stubs: {
    'react-native': {
      View: native('View'), Text: native('Text'), Image: native('Image'),
      StyleSheet: { hairlineWidth: 1 },
      Platform: { OS: 'web', select: values => values.web ?? values.default },
      I18nManager: { allowRTL() {} }, useColorScheme: () => 'light',
    },
    'react-native-svg': { __esModule: true, default: native('Svg'), ...Object.fromEntries(['Defs', 'LinearGradient', 'Path', 'Rect', 'Stop', 'Circle', 'G'].map(name => [name, native(name)])) },
    'lucide-react-native': Object.fromEntries(['ShieldCheck', 'MapPin', 'Wallet', 'BellRing'].map(name => [name, native(name)])),
    'expo-status-bar': { StatusBar: native('StatusBar') },
    'expo-router': {
      useRouter: () => ({ push: route => routes.push(['push', route]), replace: route => routes.push(['replace', route]) }),
      Redirect: native('Redirect'),
    },
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/services/storage': { appStorage: storage, secureStorage: storage, STORAGE_KEYS: { preferences: 'preferences', authSession: 'auth' } },
    '@parkflow/client/services/http/apiClient': { api: async () => { throw new Error('Routes do not request auth'); }, query: () => '' },
  } });
  const preferences = load('@parkflow/client/store/preferencesStore').usePreferencesStore;
  // These assertions exercise the published English labels; locale selection
  // is explicit now that new installations default to Arabic.
  preferences.getState().setLocale('en');
  const phone = load('@parkflow/client/store/phoneAuthStore').usePhoneAuthStore;
  const email = load('packages/client/src/store/emailAuthStore.ts').useEmailAuthStore;
  const auth = load('@parkflow/client/store/authStore').useAuthStore;
  const config = load('@parkflow/client/store/appConfigStore').useAppConfigStore;
  const defaultConfig = config.getState().config;
  const { ThemeProvider } = load('@parkflow/client/theme/ThemeProvider');
  phone.getState().begin('login');
  auth.setState({ user: undefined, session: undefined, hydrated: true });
  let renderer;
  const harness = {
    routes, phone, email, auth, config,
    reset() {
      routes.length = 0;
      preferences.getState().setLocale('en');
      phone.getState().begin('login');
      email.getState().reset();
      auth.setState({ user: undefined, session: undefined, hydrated: true });
      config.setState({ config: defaultConfig });
    },
    async mount(filename) {
      const Component = load(filename).default;
      await act(async () => { renderer = create(React.createElement(ThemeProvider, null, React.createElement(Component))); });
    },
    async press(label) {
      const button = renderer.root.findAllByType('AppButton').find(node => node.props.label === label);
      assert.ok(button, `Expected button ${label}`);
      await act(async () => button.props.onPress());
    },
    async enterName(value) { await act(async () => renderer.root.findByProps({ testID: 'name-input' }).props.onChangeText(value)); },
    root() { return renderer.root; },
    async cleanup() { await act(async () => renderer?.unmount()); renderer = undefined; },
  };
  cachedHarness = harness;
  active.push(harness);
  return harness;
}

afterEach(async () => { for (const harness of active.splice(0)) await harness.cleanup(); });

test('customer welcome login starts a fresh login and opens email entry', async () => {
  const harness = routeHarness();
  harness.phone.getState().setName('Stale Registration');
  harness.email.getState().setChallenge({ challengeId: 'stale-email', email: 'stale@example.com', resendAfterSeconds: 60, expiresAt: '2030-01-01T00:00:00Z' }, 'register', 'Stale Registration');
  await harness.mount('apps/customer/app/(onboarding)/welcome.tsx');
  await harness.press('Log In');
  assert.deepEqual(harness.routes, [['push', '/(onboarding)/email']]);
  assert.equal(harness.phone.getState().purpose, 'login');
  assert.equal(harness.phone.getState().fullName, '');
  assert.equal(harness.email.getState().challenge, undefined);
  assert.equal(harness.email.getState().fullName, '');
});

test('customer registration clears stale email verification before collecting a new name', async () => {
  const harness = routeHarness();
  harness.email.getState().setChallenge({ challengeId: 'stale-email', email: 'stale@example.com', resendAfterSeconds: 60, expiresAt: '2030-01-01T00:00:00Z' }, 'login');
  await harness.mount('apps/customer/app/(onboarding)/welcome.tsx');
  await harness.press('Get Started');
  assert.equal(harness.phone.getState().purpose, 'register');
  assert.equal(harness.email.getState().challenge, undefined);
  assert.equal(harness.email.getState().emailInput, '');
  assert.deepEqual(harness.routes, [['push', '/(onboarding)/name']]);
});

test('published phone action links open email login while registration still opens the name form', async () => {
  const harness = routeHarness();
  harness.config.setState(state => ({ config: { ...state.config, sections: [
    { id: 'login', type: 'action', visible: true, label: { en: 'Sign in', ar: 'دخول' }, path: '/(onboarding)/phone' },
  ] } }));
  await harness.mount('apps/customer/app/(onboarding)/welcome.tsx');
  await harness.press('Sign in');
  assert.deepEqual(harness.routes, [['push', '/(onboarding)/email']]);
  assert.equal(harness.phone.getState().purpose, 'login');
  await harness.press('Get Started');
  assert.deepEqual(harness.routes[1], ['push', '/(onboarding)/name']);
  assert.equal(harness.phone.getState().purpose, 'register');
});

test('customer name entry saves a trimmed valid registration name before opening email', async () => {
  const harness = routeHarness();
  await harness.mount('apps/customer/app/(onboarding)/name.tsx');
  await harness.enterName('  New Customer  ');
  await harness.press('Continue');
  assert.equal(harness.phone.getState().fullName, 'New Customer');
  assert.equal(harness.phone.getState().purpose, 'register');
  assert.deepEqual(harness.routes, [['push', '/(onboarding)/email']]);
});

test('management staff sign in clears stale registration intent and opens email login', async () => {
  const harness = routeHarness();
  harness.phone.getState().setName('Stale Registration');
  harness.email.getState().setChallenge({ challengeId: 'stale-email', email: 'stale@example.com', resendAfterSeconds: 60, expiresAt: '2030-01-01T00:00:00Z' }, 'register', 'Stale Registration');
  await harness.mount('apps/management/app/(onboarding)/welcome.tsx');
  await harness.press('Staff sign in');
  assert.equal(harness.phone.getState().purpose, 'login');
  assert.equal(harness.phone.getState().fullName, '');
  assert.equal(harness.email.getState().challenge, undefined);
  assert.deepEqual(harness.routes, [['push', '/(onboarding)/email']]);
});

test('management name route returns to email login instead of exposing public registration', async () => {
  const harness = routeHarness();
  harness.phone.getState().setName('Stale Registration');
  harness.email.getState().setChallenge({ challengeId: 'stale-email', email: 'stale@example.com', resendAfterSeconds: 60, expiresAt: '2030-01-01T00:00:00Z' }, 'register', 'Stale Registration');
  await harness.mount('apps/management/app/(onboarding)/name.tsx');
  assert.equal(harness.root().findAllByType('TextField').length, 0);
  assert.equal(harness.root().findByType('Redirect').props.href, '/(onboarding)/email');
  assert.equal(harness.phone.getState().purpose, 'login');
  assert.equal(harness.phone.getState().fullName, '');
  assert.equal(harness.email.getState().challenge, undefined);
});

test('management name route sends authenticated staff back to their workspace', async () => {
  const harness = routeHarness();
  harness.auth.setState({ user: { id: 'admin-1', fullName: 'Administrator', role: 'ADMIN', profileCompletedAt: '2026-10-14' } });
  await harness.mount('apps/management/app/(onboarding)/name.tsx');
  const redirects = harness.root().findAllByType('Redirect');
  assert.equal(redirects.length, 1);
  assert.equal(redirects[0].props.href, '/admin');
});
