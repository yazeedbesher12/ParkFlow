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
const calls = [], routes = [], persisted = new Map();
const Focus = React.createContext(true);
const router = { push: route => routes.push(['push', route]), replace: route => routes.push(['replace', route]) };
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'InlineNotice', 'OnboardingStepper', 'Reveal', 'Screen', 'TextField'].map(name => [name, props => React.createElement(name, props, props.children)]));
const stubs = {
  'react-native': { View: props => React.createElement('View', props, props.children) },
  'expo-router': {
    useRouter: () => router,
    Redirect: props => React.createElement('Redirect', props),
    useFocusEffect: callback => {
      const focused = React.useContext(Focus);
      React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
    },
  },
  '@/components/ui': ui,
  '@/hooks/useLocale': { useLocale: () => ({ t: (key, values) => values ? `${key}:${values.seconds}` : key }) },
  '@/hooks/useBlockHardwareBack': { useBlockHardwareBack() {} },
  '@/utils/haptics': { haptics: { success() {}, error() {} } },
  '@/services/storage': { appStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }, secureStorage: {
    getItem: async key => persisted.get(key) ?? null,
    setItem: async (key, value) => { persisted.set(key, value); },
    removeItem: async key => { persisted.delete(key); },
  }, STORAGE_KEYS: { authSession: 'auth' } },
  '@/services/http/apiClient': { api: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) },
};
// Keep the real screen, service, stores and React Query; replace only native
// presentation, navigation and the external network/secure storage boundaries.
const modules = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  modules.set(filename, loaded);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id === '@/services') return { services: { auth: load('src/services/http/authService.ts').httpAuthService } };
    if (id === './apiClient') return stubs['@/services/http/apiClient'];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.resolve(__dirname, '../src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (resolved && !resolved.endsWith('.json')) return load(path.relative(path.resolve(__dirname, '..'), resolved));
    }
    return originalRequire(id);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText, filename);
  return loaded.exports;
}
const EmailScreen = load('app/(onboarding)/email.tsx').default;
const DetailsScreen = load('app/(onboarding)/details.tsx').default;
const { usePhoneAuthStore } = load('src/store/phoneAuthStore.ts');
const { useAuthStore } = load('src/store/authStore.ts');
const { authLanding } = load('src/utils/authFlow.ts');
let renderer, client;
const emailConfig = { developmentLoginEnabled: false, developmentEmailLoginEnabled: true, loginMethod: 'email' };
const phoneConfig = { developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'phone' };
const tree = (focused = true, Component = EmailScreen) => React.createElement(QueryClientProvider, { client }, React.createElement(Focus.Provider, { value: focused }, React.createElement(Component)));
const button = () => renderer.root.findByType('AppButton');
const input = () => renderer.root.findByProps({ testID: 'email-input' });
const notices = () => renderer.root.findAllByType('InlineNotice');
async function mount(Component = EmailScreen) { await act(async () => { renderer = create(tree(true, Component)); }); }
async function settle(index, result, failed = false) {
  assert.ok(calls[index], `Expected request ${index}`);
  await act(async () => {
    calls[index][failed ? 'reject' : 'resolve'](result);
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
async function enter(value = '  Developer@Example.com  ') { await act(async () => input().props.onChangeText(value)); }
async function submit() { await act(async () => button().props.onPress()); }
const result = (overrides = {}) => ({
  session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: '2030-01-01T00:00:00Z', userId: 'user-1' },
  user: { id: 'user-1', fullName: 'Development User', email: 'developer@example.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null, role: 'USER', profileCompletedAt: '2026-10-07T00:00:00Z', ...overrides },
  isNewUser: false,
});
beforeEach(() => {
  calls.length = 0; routes.length = 0; persisted.clear();
  usePhoneAuthStore.getState().begin('login');
  useAuthStore.setState({ session: undefined, user: undefined, hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  client.clear(); renderer = undefined;
});

test('email sign-in waits for fresh configuration and offers retry after a failed request', async () => {
  await mount();
  assert.equal(calls[0]?.url, '/auth/config');
  assert.equal(calls[0].options.public, true);
  await enter();
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
  await settle(0, new Error('offline'), true);
  assert.equal(button().props.disabled, true);
  const retry = notices().find(notice => notice.props.action?.label === 'common.retry');
  assert.ok(retry);
  await act(async () => retry.props.action.onPress());
  await settle(1, emailConfig);
  assert.equal(button().props.disabled, false);
});

test('development email registration normalizes the address, saves the session and opens profile details without OTP', async () => {
  usePhoneAuthStore.getState().setName('New User');
  usePhoneAuthStore.getState().setRetryDelay(3600);
  await mount(); await settle(0, emailConfig); await enter();
  assert.equal(button().props.disabled, false);
  assert.equal(notices().some(notice => notice.props.body === 'onboarding.devEmailLoginBody'), true);
  await submit();
  assert.equal(calls[1].url, '/auth/dev-login');
  assert.deepEqual(calls[1].options, { method: 'POST', public: true, body: { email: 'developer@example.com', purpose: 'register', fullName: 'New User' } });
  const signedIn = result({ fullName: 'New User', profileCompletedAt: null });
  await settle(1, signedIn);
  assert.deepEqual(JSON.parse(persisted.get('auth')), { session: signedIn.session, user: signedIn.user });
  assert.equal(usePhoneAuthStore.getState().fullName, '');
  assert.equal(usePhoneAuthStore.getState().retryAvailableAt, 0);
  assert.deepEqual(routes, [['replace', '/(onboarding)/details']]);
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/details');
  assert.equal(calls.some(call => call.url.includes('otp') || call.url.includes('/phone/')), false);
});

test('development email login retains the server administrator identity and destination', async () => {
  await mount(); await settle(0, emailConfig); await enter(); await submit();
  assert.deepEqual(calls[1].options.body, { email: 'developer@example.com', purpose: 'login' });
  await settle(1, result({ role: 'ADMIN', fullName: 'Existing Admin' }));
  assert.deepEqual(routes, [['replace', '/admin']]);
  assert.equal(useAuthStore.getState().user.role, 'ADMIN');
  assert.equal(useAuthStore.getState().user.fullName, 'Existing Admin');
});

test('unknown email login stays signed out and displays the localized error', async () => {
  await mount(); await settle(0, emailConfig); await enter(); await submit();
  await settle(1, new Error('No account found. Please register first.'), true);
  assert.equal(persisted.has('auth'), false);
  assert.equal(useAuthStore.getState().user, undefined);
  assert.deepEqual(routes, []);
  assert.equal(notices().some(notice => notice.props.body === 'حدث خطأ ما. حاول مرة أخرى.'), true);
});

test('email registration requires a name after configuration chooses email', async () => {
  usePhoneAuthStore.getState().begin('register');
  await mount();
  assert.equal(renderer.root.findAllByType('Redirect').length, 0);
  await settle(0, emailConfig);
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/name');
  assert.equal(calls.length, 1);
});

test('invalid email input cannot trigger development sign-in', async () => {
  await mount(); await settle(0, emailConfig); await enter('invalid@');
  await act(async () => input().props.onBlur());
  assert.equal(input().props.error, 'onboarding.emailInvalid');
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
});

test('turning email development off restores phone entry without requesting email OTP', async () => {
  await mount(); await settle(0, phoneConfig);
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/phone');
  assert.equal(calls.length, 1);
});

test('returning to email entry discards stale configuration and fails closed', async () => {
  await mount(); await settle(0, emailConfig); await enter();
  await act(async () => renderer.update(tree(false)));
  await act(async () => renderer.update(tree(true)));
  assert.equal(calls[1].url, '/auth/config');
  assert.equal(button().props.disabled, true);
  await settle(1, new Error('offline'), true);
  await submit(); assert.equal(calls.length, 2);
  await act(async () => notices().find(notice => notice.props.action).props.action.onPress());
  await settle(2, phoneConfig);
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/phone');
});

test('email development rate limits use their own deadline without changing phone OTP cooldowns', async () => {
  usePhoneAuthStore.getState().setRetryDelay(3600);
  const phoneDeadline = usePhoneAuthStore.getState().retryAvailableAt;
  await mount(); await settle(0, emailConfig); await enter(); await submit();
  await settle(1, { message: 'Too many attempts', details: { serverCode: 'RATE_LIMITED', retryAfterSeconds: 120 } }, true);
  assert.equal(button().props.disabled, true);
  assert.equal(usePhoneAuthStore.getState().retryAvailableAt, phoneDeadline);
  await submit(); assert.equal(calls.length, 2);
  assert.equal(notices().some(notice => notice.props.title === 'onboarding.otpWait'), true);
});

test('malformed or conflicting configuration cannot enable development email sign-in', async () => {
  await mount(); await enter();
  await settle(0, { developmentLoginEnabled: false, developmentEmailLoginEnabled: 'true', loginMethod: 'email' });
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
  await act(async () => notices().find(notice => notice.props.action).props.action.onPress());
  await settle(1, { developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'email' });
  assert.equal(button().props.disabled, true);
  assert.equal(renderer.root.findAllByType('Redirect').length, 0);
});

test('development email profile completion does not claim a verified phone or email', async () => {
  useAuthStore.setState({ user: result({ profileCompletedAt: null }).user });
  await mount(DetailsScreen);
  const texts = renderer.root.findAllByType('AppText').map(node => node.props.children);
  assert.equal(texts.includes('onboarding.detailsDevelopmentEmailSubtitle'), true);
  assert.equal(texts.includes('onboarding.detailsDevelopmentEmailPrivacy'), true);
  const emailField = renderer.root.findAllByType('TextField').find(node => node.props.testID === 'profile-email');
  assert.equal(emailField.props.label, 'profile.email');
  assert.equal(emailField.props.editable, false);
  await submit();
  assert.equal(calls[0].url, '/users/me/complete-profile');
  assert.deepEqual(calls[0].options.body, { email: 'developer@example.com' });
  await settle(0, result().user);
  assert.deepEqual(routes, [['replace', '/(onboarding)/vehicle']]);
});

test('an existing email account with a blank name must save a valid name before completing its profile', async () => {
  useAuthStore.setState({ user: result({ fullName: '   ', profileCompletedAt: null }).user });
  await mount(DetailsScreen);
  assert.equal(button().props.disabled, true);
  await submit();
  assert.equal(calls.length, 0);
  const nameField = () => renderer.root.findAllByType('TextField').find(node => node.props.testID === 'profile-name');
  assert.equal(nameField().props.label, 'onboarding.nameLabel');
  await act(async () => nameField().props.onChangeText(' A '));
  assert.equal(button().props.disabled, true);
  await submit();
  assert.equal(calls.length, 0);
  await act(async () => nameField().props.onChangeText('  Restored User  '));
  assert.equal(button().props.disabled, false);
  await submit();
  assert.equal(calls[0].url, '/users/me/complete-profile');
  assert.deepEqual(calls[0].options.body, { email: 'developer@example.com', fullName: 'Restored User' });
  await settle(0, result({ fullName: 'Restored User' }).user);
  assert.equal(useAuthStore.getState().user.fullName, 'Restored User');
  assert.deepEqual(routes, [['replace', '/(onboarding)/vehicle']]);
  assert.equal(authLanding(useAuthStore.getState().user), '/(tabs)/map');
});
