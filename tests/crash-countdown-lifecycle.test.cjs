const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const alertFor = (userId, detectedAt) => ({
  userId,
  detectedAt,
  detection: { impactAt: Date.parse(detectedAt), peakG: 4, rotationDeg: 70, speedKmh: 40, reason: 'rollover' },
  location: { latitude: 31.9, longitude: 35.2 },
});

function fixture(context, { delayedCall = false, nativeActivity } = {}) {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const auth = createStore(() => ({ session: { userId: 'driver-a' } }));
  const calls = [];
  const reports = [];
  const launches = [];
  const dials = [];
  let completeCall;
  const stubs = {
    'react-native': {
      Modal: 'Modal', View: 'View', Vibration: { vibrate() {}, cancel() {} },
      Platform: { OS: 'android' },
      PermissionsAndroid: { PERMISSIONS: { CALL_PHONE: 'call' }, check: async () => true },
      Linking: { openURL: async url => { dials.push(url); } },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'lucide-react-native': { Phone: 'Phone', TriangleAlert: 'TriangleAlert' },
    '@parkflow/client/components/ui/AppButton': { AppButton: 'AppButton' },
    '@parkflow/client/components/ui/AppText': { AppText: 'AppText' },
    '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: { danger: '#f00', onDeep: '#fff' } }) },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t: key => key }) },
    '@parkflow/client/hooks/useCrashDetection': { useEmergencyConfig: () => ({ data: { countdownSeconds: 2, callNumber: '100' } }) },
    '@parkflow/client/store/authStore': { useAuthStore: auth },
    '@parkflow/client/services/crashEvents': { recordCrashForUser: async (userId, input) => { reports.push({ userId, ...input }); } },
  };
  if (nativeActivity) {
    // Keep the real helper, store and Countdown. Only the native phone launch
    // is deferred so no actual call/dialer can be opened by the regression.
    stubs['expo-intent-launcher'] = { startActivityAsync: (action, options) => {
      launches.push({ action, ...options });
      return nativeActivity.promise;
    } };
  } else {
    stubs['@parkflow/client/utils/emergencyCall'] = { placeEmergencyCall: (number, canProceed) => {
      calls.push({ number, canProceed });
      return delayedCall ? new Promise(resolve => { completeCall = resolve; }) : Promise.resolve('called');
    } };
  }
  const load = createClientLoader({ stubs });
  const crash = load('@parkflow/client/store/crashAlertStore').useCrashAlertStore;
  crash.getState().setOwner('driver-a');
  const Countdown = load('apps/customer/src/components/navigation/CrashCountdown.tsx').CrashCountdown;
  return {
    auth, crash, calls, reports, launches, dials, Countdown,
    completeCall: outcome => completeCall(outcome),
    tick: ms => act(async () => { context.mock.timers.tick(ms); }),
  };
}

test('a later crash gets a full countdown after the previous alert expired and cleared', async context => {
  // Losing the alert identity on countdown state used the previous zero value
  // during the next alert's first effects and called before its response window.
  const f = fixture(context);
  let renderer;
  await act(async () => { renderer = create(React.createElement(f.Countdown)); });
  context.after(async () => { await act(async () => { renderer.unmount(); }); });
  await act(async () => { f.crash.getState().raise(alertFor('driver-a', '2026-10-15T10:00:00.000Z')); });
  await f.tick(2000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.crash.getState().alert, undefined);
  assert.equal(f.reports[0].outcome, 'called');

  await act(async () => { f.crash.getState().raise(alertFor('driver-a', '2026-10-15T10:01:00.000Z')); });
  assert.equal(f.calls.length, 1, 'new alert must not inherit the expired zero countdown');
  await f.tick(1000);
  assert.equal(f.calls.length, 1, 'driver still has one second to cancel');
  await f.tick(1000);
  assert.equal(f.calls.length, 2);
  assert.equal(f.reports.length, 2);
  assert.equal(f.reports[1].detectedAt, '2026-10-15T10:01:00.000Z');
});

test('a delayed call guard rejects an old alert after another account becomes active', async context => {
  const f = fixture(context, { delayedCall: true });
  let renderer;
  await act(async () => { renderer = create(React.createElement(f.Countdown)); });
  context.after(async () => { await act(async () => { renderer.unmount(); }); });
  await act(async () => { f.crash.getState().raise(alertFor('driver-a', '2026-10-15T11:00:00.000Z')); });
  await act(async () => {
    renderer.root.findAllByType('AppButton').find(button => button.props.label === 'crash.callNow').props.onPress();
  });
  assert.equal(f.calls.length, 1);
  assert.equal(typeof f.calls[0].canProceed, 'function');
  assert.equal(f.calls[0].canProceed(), true);

  const nextAlert = alertFor('driver-b', '2026-10-15T11:01:00.000Z');
  await act(async () => {
    f.auth.setState({ session: { userId: 'driver-b' } });
    f.crash.getState().setOwner('driver-b');
    f.crash.getState().raise(nextAlert);
  });
  assert.equal(f.calls[0].canProceed(), false, 'permission/module awaits must not retain the old account authority');
  await act(async () => { f.completeCall('cancelled'); });
  assert.equal(f.reports.length, 0);
  assert.equal(f.crash.getState().alert.detectedAt, nextAlert.detectedAt, 'old call completion must not clear the new account alert');
});

function deferredActivity() {
  let reject;
  const promise = new Promise((resolve, fail) => { reject = fail; });
  return { promise, reject };
}

async function startNativeCountdown(context) {
  const nativeActivity = deferredActivity();
  const f = fixture(context, { nativeActivity });
  let renderer;
  await act(async () => { renderer = create(React.createElement(f.Countdown)); });
  context.after(async () => { await act(async () => { renderer.unmount(); }); });
  await act(async () => { f.crash.getState().raise(alertFor('driver-a', '2026-10-15T12:00:00.000Z')); });
  await f.tick(2000);
  assert.equal(f.launches.length, 1, 'countdown must start the native call without waiting for the call screen to close');
  assert.equal(f.reports.length, 1);
  assert.equal(f.crash.getState().alert, undefined, 'successful nonblocking launch normally clears its alert');
  return { ...f, nativeActivity };
}

test('a delayed native failure still opens the dialer after its countdown normally clears the alert', async context => {
  // The strict launch guard becomes false on self-clear. A separate attempt
  // authorization must preserve the team fallback without waiting on the call.
  const f = await startNativeCountdown(context);
  await act(async () => {
    f.nativeActivity.reject(new Error('Native activity unavailable'));
    await new Promise(resolve => setImmediate(resolve));
  });
  assert.deepEqual(f.dials, ['tel:100']);
  assert.equal(f.reports.length, 1, 'fallback must not create a second crash event');
});

for (const transition of ['new alert', 'new alert then cancelled', 'cancelled after cleanup', 'account changed', 'logout and same account login']) {
  test(`an old native failure cannot open the dialer after ${transition}`, async context => {
    const f = await startNativeCountdown(context);
    await act(async () => {
      if (transition.startsWith('new alert')) {
        f.crash.getState().raise(alertFor('driver-a', '2026-10-15T12:01:00.000Z'));
        if (transition === 'new alert then cancelled') f.crash.getState().clear();
      } else if (transition === 'cancelled after cleanup') {
        f.crash.getState().clear();
      } else if (transition === 'account changed') {
        f.auth.setState({ session: { userId: 'driver-b' } });
        f.crash.getState().setOwner('driver-b');
      } else {
        f.auth.setState({ session: undefined });
        f.crash.getState().setOwner(undefined);
        f.auth.setState({ session: { userId: 'driver-a' } });
        f.crash.getState().setOwner('driver-a');
      }
    });
    await act(async () => {
      f.nativeActivity.reject(new Error('Native activity unavailable'));
      await new Promise(resolve => setImmediate(resolve));
    });
    assert.deepEqual(f.dials, [], 'an intervening alert/cancellation/account transition permanently invalidates this call attempt');
    assert.equal(f.reports.length, 1);
  });
}
