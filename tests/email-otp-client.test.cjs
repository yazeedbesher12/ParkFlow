const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const emailConfig = { developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'email' };
const phoneConfig = { ...emailConfig, loginMethod: 'phone' };
const challenge = (overrides = {}) => ({ challengeId: 'email-challenge-1', email: 'person@example.com', purpose: 'login', resendAfterSeconds: 60, expiresAt: new Date(Date.now() + 300000).toISOString(), ...overrides });
const result = (overrides = {}) => ({
  session: { accessToken: 'email-access', refreshToken: 'email-refresh', expiresAt: '2099-01-01T00:00:00Z', userId: 'email-user' },
  user: { id: 'email-user', fullName: 'Existing User', email: 'person@example.com', phone: null, emailVerifiedAt: '2026-10-14T00:00:00Z', phoneVerifiedAt: null, role: 'USER', profileCompletedAt: '2026-10-14T00:00:00Z', ...overrides },
  isNewUser: false,
});

function createHarness(application = 'customer') {
  const calls = [], routes = [], persisted = new Map(), services = {};
  const Focus = React.createContext(true);
  const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'OnboardingStepper', 'InlineNotice', 'Reveal', 'Screen', 'TextField', 'OtpInput', 'PressableScale'].map(name => [name, props => React.createElement(name, props, props.children)]));
  const load = createClientLoader({ application, stubs: {
    'react-native': { View: props => React.createElement('View', props, props.children) },
    'expo-router': {
      useRouter: () => ({ push: path => routes.push(['push', path]), replace: path => routes.push(['replace', path]) }),
      Redirect: props => React.createElement('Redirect', props),
      useFocusEffect: callback => {
        const focused = React.useContext(Focus);
        React.useEffect(() => focused ? callback() : undefined, [focused, callback]);
      },
    },
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ locale: 'ar', t: (key, values) => values ? `${key}:${values.email ?? values.seconds ?? ''}` : key }) },
    '@parkflow/client/hooks/useBlockHardwareBack': { useBlockHardwareBack() {} },
    '@parkflow/client/utils/haptics': { haptics: { success() {}, error() {}, light() {} } },
    '@parkflow/client/services': { services },
    '@parkflow/client/store/reservationRouteStore': { clearReservationRouteForAccountChange: async () => () => {} },
    '@parkflow/client/services/storage': { secureStorage: {
      getItem: async key => persisted.get(key) ?? null,
      setItem: async (key, value) => { persisted.set(key, value); },
      removeItem: async key => { persisted.delete(key); },
    }, STORAGE_KEYS: { authSession: 'auth' } },
    '@parkflow/client/services/http/apiClient': { api: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) },
  } });
  services.auth = load('@parkflow/client/services/http/authService').httpAuthService;
  const auth = load('@parkflow/client/store/authStore').useAuthStore;
  const intent = load('@parkflow/client/store/phoneAuthStore').usePhoneAuthStore;
  intent.getState().begin('login');
  auth.setState({ user: undefined, session: undefined, hydrated: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let renderer, Component;
  const tree = focused => React.createElement(QueryClientProvider, { client }, React.createElement(Focus.Provider, { value: focused }, React.createElement(Component)));
  return {
    calls, routes, persisted, auth, intent,
    email: () => load('packages/client/src/store/emailAuthStore.ts').useEmailAuthStore,
    root: () => renderer.root,
    flushAuthPublication: () => renderer.unstable_flushSync(() => renderer.update(tree(true))),
    button: () => renderer.root.findByType('AppButton'),
    notices: () => renderer.root.findAllByType('InlineNotice'),
    async mount(screen = 'email') {
      Component = load(`apps/${application}/app/(onboarding)/${screen}.tsx`).default;
      await act(async () => { renderer?.unmount(); renderer = create(tree(true)); });
    },
    async focus(focused) { await act(async () => renderer.update(tree(focused))); },
    async settle(index, value, failed = false) {
      assert.ok(calls[index], `Expected request ${index}`);
      await act(async () => { calls[index][failed ? 'reject' : 'resolve'](value); await new Promise(resolve => setTimeout(resolve, 10)); });
    },
    async enter(value = ' Person@Example.com ') { await act(async () => renderer.root.findByProps({ testID: 'email-input' }).props.onChangeText(value)); },
    async submit() { await act(async () => renderer.root.findByType('AppButton').props.onPress()); },
    async code(value) { await act(async () => renderer.root.findByType('OtpInput').props.onChangeText(value)); },
    async complete(value) { await act(async () => renderer.root.findByType('OtpInput').props.onComplete(value)); },
    async press(testID) { await act(async () => renderer.root.findByProps({ testID }).props.onPress()); },
    async cleanup() { await act(async () => renderer?.unmount()); client.clear(); },
  };
}
let h;
beforeEach(() => { h = createHarness(); });
afterEach(async () => h.cleanup());

async function requestEmail(overrides) {
  await h.mount(); await h.enter(); await h.settle(0, emailConfig);
  assert.equal(h.root().findAllByType('Redirect').length, 0, 'normal email OTP stays on email entry');
  assert.equal(h.button().props.disabled, false);
  await h.submit();
  assert.equal(h.calls[1].url, '/auth/request-otp');
  await h.settle(1, challenge(overrides));
}
async function openOtp(overrides) {
  await requestEmail(overrides);
  await h.mount('otp');
  assert.equal(h.calls[2].url, '/auth/config');
  await h.settle(2, emailConfig);
}

test('normal email login requests an emailed challenge without a session or phone request', async () => {
  await requestEmail();
  assert.deepEqual(h.calls[1].options, { method: 'POST', public: true, body: { email: 'person@example.com', purpose: 'login' } });
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp']]);
  assert.equal(h.email().getState().challenge.challengeId, 'email-challenge-1');
  assert.equal(h.auth.getState().user, undefined);
  assert.equal(h.persisted.size, 0);
  assert.equal(h.calls.some(call => call.url.includes('/phone/') || call.url.includes('dev-login')), false);
});

test('email signup carries a trimmed name only in request data and memory', async () => {
  h.intent.getState().setName('New Person');
  await requestEmail({ purpose: 'register' });
  assert.deepEqual(h.calls[1].options.body, { email: 'person@example.com', purpose: 'register', fullName: 'New Person' });
  assert.equal(h.email().getState().purpose, 'register');
  assert.equal(h.email().getState().fullName, 'New Person');
  assert.equal(h.persisted.size, 0);
  assert.equal(h.routes[0][1], '/(onboarding)/otp');
});

test('stale phone entry redirects to email with normal email config and sends no SMS', async () => {
  h.intent.getState().setPhoneInput('0599123456');
  await h.mount('phone'); await h.settle(0, emailConfig);
  assert.equal(h.root().findAllByType('Redirect').length, 1, 'email config redirects stale phone entry');
  assert.equal(h.root().findByType('Redirect').props.href, '/(onboarding)/email');
  assert.equal(h.calls.length, 1);
});

test('OTP refresh with no in-memory challenge returns to email only after config is ready', async () => {
  await h.mount('otp');
  assert.equal(h.calls[0]?.url, '/auth/config');
  assert.equal(h.root().findAllByType('Redirect').length, 0);
  await h.settle(0, emailConfig);
  assert.equal(h.root().findByType('Redirect').props.href, '/(onboarding)/email');
  assert.equal(h.calls.length, 1);
});

test('an expired email challenge cannot verify and offers resend without phone fallback', async () => {
  await openOtp({ expiresAt: '2020-01-01T00:00:00Z', resendAfterSeconds: 0 });
  assert.equal(h.root().findByType('OtpInput').props.disabled, true);
  await h.complete('123456');
  assert.equal(h.calls.length, 3);
  assert.equal(h.notices().some(node => node.props.title === 'onboarding.otpExpired'), true);
  await h.press('otp-resend');
  assert.equal(h.calls[3].url, '/auth/request-otp');
  assert.deepEqual(h.calls[3].options.body, { email: 'person@example.com', purpose: 'login' });
  await h.settle(3, challenge({ challengeId: 'email-challenge-2' }));
  assert.equal(h.email().getState().challenge.challengeId, 'email-challenge-2');
  assert.equal(h.root().findByType('OtpInput').props.disabled, false);
});

test('resend starts at sixty seconds and cannot send another request during cooldown', async () => {
  await openOtp();
  assert.equal(h.root().findAllByProps({ testID: 'otp-resend' }).length, 0);
  assert.ok(h.email().getState().resendAvailableAt >= Date.now() + 58000);
  assert.equal(h.root().findAllByType('AppText').some(node => String(node.props.children).startsWith('onboarding.otpResendIn:60')), true);
});

test('email verification persists only a correct-code session and clears signup/challenges', async () => {
  h.intent.getState().setName('New Person');
  await openOtp({ purpose: 'register' });
  await h.code('123456'); await h.submit();
  assert.equal(h.calls[3].url, '/auth/verify-otp');
  assert.deepEqual(h.calls[3].options.body, { challengeId: 'email-challenge-1', code: '123456' });
  await h.settle(3, result({ profileCompletedAt: null }));
  assert.equal(JSON.parse(h.persisted.get('auth')).user.emailVerifiedAt, '2026-10-14T00:00:00Z');
  assert.equal(h.email().getState().challenge, undefined);
  assert.equal(h.email().getState().fullName, '');
  assert.equal(h.intent.getState().fullName, '');
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp'], ['replace', '/(onboarding)/details']]);
});

test('auth publication can unmount the real OTP screen before mutation callbacks without leaving signup data', async () => {
  h.intent.getState().setName('New Person');
  await openOtp({ purpose: 'register' });
  const stop = h.auth.subscribe(state => {
    if (state.user) h.flushAuthPublication();
  });
  try {
    await h.complete('123456'); await h.settle(3, result({ profileCompletedAt: null }));
    assert.equal(h.root().findByType('Redirect').props.href, '/(onboarding)/details');
    assert.equal(h.email().getState().challenge, undefined);
    assert.equal(h.email().getState().fullName, '');
    assert.equal(h.intent.getState().fullName, '');
  } finally { stop(); }
});

test('verify auto-completion, Continue and resend cannot race each other', async () => {
  await openOtp({ resendAfterSeconds: 0 });
  const resend = h.root().findByProps({ testID: 'otp-resend' }).props.onPress;
  await act(async () => {
    h.root().findByType('OtpInput').props.onComplete('123456');
    h.root().findByType('OtpInput').props.onComplete('123456');
    resend();
  });
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[3].url, '/auth/verify-otp');
  await h.submit();
  assert.equal(h.calls.length, 4);
});

test('wrong code remains signed out, clears digits and permits a new code', async () => {
  await openOtp(); await h.code('111111'); await h.submit();
  await h.settle(3, { message: 'internal provider detail', details: { serverCode: 'OTP_INVALID' } }, true);
  assert.equal(h.root().findByType('OtpInput').props.value, '');
  assert.equal(h.notices().some(node => node.props.body === 'onboarding.otpEmailInvalidCode'), true);
  assert.equal(h.persisted.size, 0);
  assert.equal(h.auth.getState().user, undefined);
  await h.complete('222222');
  assert.equal(h.calls[4].url, '/auth/verify-otp');
});

test('address lock disables verification and resend for the server retry delay', async () => {
  await openOtp({ resendAfterSeconds: 0 }); await h.complete('111111');
  await h.settle(3, { message: 'locked', details: { serverCode: 'OTP_LOCKED', retryAfterSeconds: 900 } }, true);
  assert.equal(h.root().findByType('OtpInput').props.disabled, true);
  assert.equal(h.root().findAllByProps({ testID: 'otp-resend' }).length, 0);
  assert.ok(h.email().getState().verificationAvailableAt >= Date.now() + 898000);
  await h.complete('222222');
  assert.equal(h.calls.length, 4);
  assert.equal(h.notices().some(node => node.props.body === 'onboarding.otpEmailLocked'), true);
});

test('changing the email clears the challenge and returns only to email entry', async () => {
  await openOtp(); await h.press('otp-change-email');
  assert.equal(h.email().getState().challenge, undefined);
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp'], ['replace', '/(onboarding)/email']]);
});

test('leaving email while a request is pending prevents late challenge navigation', async () => {
  await h.mount(); await h.enter(); await h.settle(0, emailConfig);
  assert.equal(h.root().findAllByType('Redirect').length, 0);
  await h.submit();
  assert.equal(h.calls[1].url, '/auth/request-otp');
  await h.focus(false); await h.settle(1, challenge());
  assert.deepEqual(h.routes, []);
  assert.equal(h.email().getState().challenge, undefined);
  await h.focus(true);
  assert.equal(h.calls[2].url, '/auth/config');
});

test('leaving OTP during verification prevents a late response from signing in', async () => {
  await openOtp(); await h.complete('123456');
  await h.focus(false); await h.settle(3, result());
  assert.equal(h.auth.getState().user, undefined);
  assert.equal(h.persisted.size, 0);
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp']]);
});

test('a pending email verification cannot overwrite a different account signed in meanwhile', async () => {
  await openOtp(); await h.complete('123456');
  const other = result({ id: 'other-user', email: 'other@example.com' });
  other.session = { ...other.session, userId: 'other-user', accessToken: 'other-access' };
  await act(async () => h.auth.getState().signIn(other.session, other.user));
  await h.settle(3, result());
  assert.equal(h.auth.getState().user.id, 'other-user');
  assert.equal(JSON.parse(h.persisted.get('auth')).session.accessToken, 'other-access');
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp']]);
});

test('normal email request rate limits block duplicate retries and config failures offer retry', async () => {
  await h.mount(); await h.settle(0, new Error('offline'), true);
  assert.equal(h.button().props.disabled, true);
  await act(async () => h.notices().find(node => node.props.action).props.action.onPress());
  await h.enter(); await h.settle(1, emailConfig);
  assert.equal(h.root().findAllByType('Redirect').length, 0);
  await h.submit();
  await h.settle(2, { message: 'limited', details: { serverCode: 'RATE_LIMITED', retryAfterSeconds: 120 } }, true);
  assert.equal(h.button().props.disabled, true);
  await h.submit(); assert.equal(h.calls.length, 3);
  assert.ok(h.email().getState().retryAvailableAt >= Date.now() + 118000);
});

test('normal email entry locks immediately against Continue and keyboard submit in the same turn', async () => {
  await h.mount(); await h.enter(); await h.settle(0, emailConfig);
  await act(async () => {
    h.button().props.onPress();
    h.root().findByProps({ testID: 'email-input' }).props.onSubmitEditing();
    h.button().props.onPress();
  });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].url, '/auth/request-otp');
});

test('a correct code for an unknown login address never creates or persists a user', async () => {
  await openOtp(); await h.complete('123456');
  await h.settle(3, { message: 'private internal account detail', details: { serverCode: 'EMAIL_ACCOUNT_NOT_FOUND' } }, true);
  assert.equal(h.auth.getState().user, undefined);
  assert.equal(h.persisted.size, 0);
  assert.equal(h.notices().some(node => node.props.title === 'onboarding.emailAccountNotFoundTitle'
    && node.props.body === 'onboarding.emailAccountNotFound'), true);
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp']]);
});

test('a verified legacy email requires account linking without signing in or bypassing resend limits', async () => {
  await openOtp(); await h.complete('123456');
  await act(async () => h.email().getState().setRetryDelay(120));
  const retryAvailableAt = h.email().getState().retryAvailableAt;
  const resendAvailableAt = h.email().getState().resendAvailableAt;
  await h.settle(3, { message: 'private internal account detail', details: { serverCode: 'EMAIL_MIGRATION_REQUIRED', status: 409 } }, true);
  assert.equal(h.notices().some(node => node.props.title === 'onboarding.emailAccountLinkRequiredTitle'
    && node.props.body === 'onboarding.emailAccountLinkRequired'), true);
  assert.equal(h.notices().some(node => node.props.body === 'onboarding.otpEmailInvalidCode'), false);
  assert.equal(h.auth.getState().user, undefined);
  assert.equal(h.auth.getState().session, undefined);
  assert.equal(h.persisted.size, 0);
  assert.equal(h.email().getState().retryAvailableAt, retryAvailableAt);
  assert.equal(h.email().getState().resendAvailableAt, resendAvailableAt);
  assert.equal(h.root().findAllByProps({ testID: 'otp-resend' }).length, 0);
  assert.equal(h.calls.length, 4, 'account linking never creates an automatic authentication request');
  assert.deepEqual(h.routes, [['push', '/(onboarding)/otp']]);
});

test('a server-expired code disables further verification and Arabic digits normalize before transport', async () => {
  await openOtp({ resendAfterSeconds: 0 }); await h.complete('١٢٣٤٥٦');
  assert.deepEqual(h.calls[3].options.body, { challengeId: 'email-challenge-1', code: '123456' });
  await h.settle(3, { message: 'expired', details: { serverCode: 'OTP_EXPIRED' } }, true);
  assert.equal(h.root().findByType('OtpInput').props.disabled, true);
  assert.equal(h.notices().some(node => node.props.body === 'onboarding.otpEmailExpired'), true);
  await h.complete('222222'); assert.equal(h.calls.length, 4);
  await h.press('otp-resend'); assert.equal(h.calls[4].url, '/auth/request-otp');
});

test('resend captures registration intent and ignores a late response after focus is lost', async () => {
  h.intent.getState().setName('New Person');
  await openOtp({ purpose: 'register', resendAfterSeconds: 0 });
  await h.press('otp-resend');
  assert.deepEqual(h.calls[3].options.body, { email: 'person@example.com', purpose: 'register', fullName: 'New Person' });
  await h.focus(false); await h.settle(3, challenge({ challengeId: 'late-challenge' }));
  assert.equal(h.email().getState().challenge.challengeId, 'email-challenge-1');
  await h.focus(true); assert.equal(h.calls[4].url, '/auth/config');
});

test('OTP configuration failure never restores an existing stale phone challenge', async () => {
  h.intent.getState().setChallenge({ challengeId: 'phone-old', phone: '+970599123456', delivery: 'sms', resendAfterSeconds: 0, expiresAt: new Date(Date.now() + 300000).toISOString() });
  await h.mount('otp'); await h.settle(0, new Error('offline'), true);
  assert.equal(h.root().findAllByType('OtpInput').length, 0);
  assert.equal(h.root().findAllByType('Redirect').length, 0);
  await act(async () => h.notices().find(node => node.props.action).props.action.onPress());
  await h.settle(1, emailConfig);
  assert.equal(h.root().findByType('Redirect').props.href, '/(onboarding)/email');
  assert.equal(h.calls.some(call => call.url.includes('/phone/')), false);
});

test('explicit phone mode retains the existing phone challenge verification path', async () => {
  h.intent.getState().setChallenge({ challengeId: 'phone-challenge', phone: '+970599123456', purpose: 'login', delivery: 'sms', resendAfterSeconds: 60, expiresAt: new Date(Date.now() + 300000).toISOString() });
  await h.mount('otp'); assert.equal(h.calls[0]?.url, '/auth/config'); await h.settle(0, phoneConfig);
  await h.complete('123456');
  assert.equal(h.calls[1].url, '/auth/phone/verify-otp');
});

for (const [role, destination] of [['ADMIN', '/admin'], ['PARKING_OPERATOR', '/operator'], ['USER', '/access-denied']]) {
  test(`management email OTP sends existing ${role} to ${destination}`, async () => {
    await h.cleanup(); h = createHarness('management');
    await openOtp(); await h.complete('123456'); await h.settle(3, result({ role }));
    assert.equal(h.auth.getState().user.role, role);
    assert.deepEqual(h.routes, [['push', '/(onboarding)/otp'], ['replace', destination]]);
  });
}

test('verified email profile completion presents email verification and keeps the vehicle step', async () => {
  h.auth.setState({ user: result({ profileCompletedAt: null }).user });
  await h.mount('details');
  assert.equal(h.root().findAllByType('AppText').some(node => node.props.children === 'onboarding.detailsEmailSubtitle'), true);
  await h.submit();
  assert.equal(h.calls[0].url, '/users/me/complete-profile');
  await h.settle(0, result().user);
  assert.deepEqual(h.routes, [['replace', '/(onboarding)/vehicle']]);
});
