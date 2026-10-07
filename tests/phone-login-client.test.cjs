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
  '@/utils/haptics': { haptics: { success() {}, error() {} } },
  '@/services/storage': { appStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }, secureStorage: {
    getItem: async key => persisted.get(key) ?? null,
    setItem: async (key, value) => { persisted.set(key, value); },
    removeItem: async key => { persisted.delete(key); },
  }, STORAGE_KEYS: { authSession: 'auth' } },
  '@/services/http/apiClient': { api: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) },
};
// Exercise the screen, real auth service, Zustand stores and React Query;
// replace only native presentation, navigation and the external transport/storage.
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
const PhoneScreen = load('app/(onboarding)/phone.tsx').default;
const { usePhoneAuthStore } = load('src/store/phoneAuthStore.ts');
const { useAuthStore } = load('src/store/authStore.ts');
let renderer, client;
const tree = (focused = true) => React.createElement(QueryClientProvider, { client }, React.createElement(Focus.Provider, { value: focused }, React.createElement(PhoneScreen)));
const button = () => renderer.root.findByType('AppButton');
const notices = () => renderer.root.findAllByType('InlineNotice');
async function mount() { await act(async () => { renderer = create(tree()); }); }
async function settle(index, result, failed = false) {
  assert.ok(calls[index], `Expected request ${index}`);
  await act(async () => {
    calls[index][failed ? 'reject' : 'resolve'](result);
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
async function submit() { await act(async () => { button().props.onPress(); }); }
const result = (overrides = {}) => ({
  session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: '2030-01-01T00:00:00Z', userId: 'user-1' },
  user: { id: 'user-1', fullName: 'Development User', phone: '+970599123456', role: 'USER', profileCompletedAt: '2026-10-07T00:00:00Z', ...overrides },
  isNewUser: false,
});
beforeEach(() => {
  calls.length = 0; routes.length = 0; persisted.clear();
  usePhoneAuthStore.getState().begin('login');
  usePhoneAuthStore.getState().setPhoneInput('٠٥٩٩١٢٣٤٥٦');
  useAuthStore.setState({ session: undefined, user: undefined, hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  client.clear(); renderer = undefined;
});

test('phone submission waits for config and a failed config offers retry without sending OTP', async () => {
  await mount();
  assert.equal(calls[0]?.url, '/auth/config');
  assert.equal(calls[0].options.public, true);
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
  await settle(0, new Error('offline'), true);
  assert.equal(button().props.disabled, true);
  assert.equal(notices().some(notice => notice.props.action?.label === 'common.retry'), true);
  await submit(); assert.equal(calls.length, 1);
  await act(async () => notices().find(notice => notice.props.action).props.action.onPress());
  assert.equal(calls[1].url, '/auth/config');
  await settle(1, { developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  assert.equal(button().props.disabled, false);
});

test('development registration skips old OTP limits, persists the session and opens incomplete profile details', async () => {
  usePhoneAuthStore.getState().setName('New User');
  usePhoneAuthStore.getState().setRetryDelay(3600);
  await mount(); await settle(0, { developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  assert.equal(button().props.disabled, false);
  assert.equal(button().props.label, 'common.continue');
  assert.equal(notices().some(notice => notice.props.title === 'onboarding.devLoginTitle'), true);
  await submit();
  assert.equal(calls[1].url, '/auth/phone/dev-login');
  assert.deepEqual(calls[1].options, { method: 'POST', public: true, body: { phone: '+970599123456', purpose: 'register', fullName: 'New User' } });
  const signedIn = result({ fullName: 'New User', profileCompletedAt: null });
  await settle(1, signedIn);
  assert.deepEqual(JSON.parse(persisted.get('auth')), { session: signedIn.session, user: signedIn.user });
  assert.equal(useAuthStore.getState().user.id, 'user-1');
  assert.equal(usePhoneAuthStore.getState().fullName, '');
  assert.deepEqual(routes, [['replace', '/(onboarding)/details']]);
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/details');
  assert.equal(calls.some(call => call.url.includes('otp')), false);
});

test('development login retains the server role and uses the standard administrator destination', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  await submit();
  assert.deepEqual(calls[1].options.body, { phone: '+970599123456', purpose: 'login' });
  await settle(1, result({ role: 'ADMIN' }));
  assert.deepEqual(routes, [['replace', '/admin']]);
  assert.equal(useAuthStore.getState().user.role, 'ADMIN');
});

test('disabled development login preserves requesting a code and opening the OTP screen', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  assert.equal(button().props.label, 'onboarding.sendCode');
  await submit();
  assert.equal(calls[1].url, '/auth/phone/request-otp');
  assert.deepEqual(calls[1].options.body, { phone: '+970599123456', purpose: 'login' });
  const challenge = { challengeId: 'challenge', phone: '+970599123456', purpose: 'login', expiresAt: '2030-01-01T00:00:00Z', resendAfterSeconds: 60, delivery: 'sms' };
  await settle(1, challenge);
  assert.deepEqual(routes, [['push', '/(onboarding)/otp']]);
  assert.deepEqual(usePhoneAuthStore.getState().challenge, challenge);
  assert.equal(persisted.has('auth'), false);
});

test('returning to the phone screen refetches config and never reuses a stale enabled mode after failure', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  await act(async () => { renderer.update(tree(false)); });
  await act(async () => { renderer.update(tree(true)); });
  assert.equal(calls[1].url, '/auth/config');
  assert.equal(button().props.disabled, true);
  await settle(1, new Error('offline'), true);
  await submit();
  assert.equal(calls.length, 2);
  assert.equal(button().props.disabled, true);
  await act(async () => notices().find(notice => notice.props.action).props.action.onPress());
  await settle(2, { developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'phone' });
  assert.equal(button().props.label, 'onboarding.sendCode');
});

test('development endpoint rate limits block retries without changing the OTP cooldown', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone' }); await submit();
  await settle(1, { message: 'Too many attempts', details: { serverCode: 'RATE_LIMITED', retryAfterSeconds: 120 } }, true);
  assert.equal(button().props.disabled, true);
  assert.equal(usePhoneAuthStore.getState().retryAvailableAt, 0);
  await submit(); assert.equal(calls.length, 2);
  assert.equal(notices().some(notice => notice.props.title === 'onboarding.otpWait'), true);
});

test('malformed config cannot select either login method', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: 'true' });
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
  assert.equal(notices().some(notice => notice.props.action?.label === 'common.retry'), true);
});

test('email development redirects phone entry before registration name checks and sends no phone requests', async () => {
  usePhoneAuthStore.getState().begin('register');
  await mount();
  assert.equal(renderer.root.findAllByType('Redirect').length, 0);
  await settle(0, { developmentLoginEnabled: false, developmentEmailLoginEnabled: true, loginMethod: 'email' });
  assert.equal(renderer.root.findByType('Redirect').props.href, '/(onboarding)/email');
  assert.equal(calls.length, 1);
});

test('incomplete configuration cannot restore phone OTP after email mode is paused', async () => {
  await mount(); await settle(0, { developmentLoginEnabled: false });
  assert.equal(button().props.disabled, true);
  await submit(); assert.equal(calls.length, 1);
  assert.equal(notices().some(notice => notice.props.action?.label === 'common.retry'), true);
});
