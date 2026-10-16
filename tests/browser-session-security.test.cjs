const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const user = id => ({ id, fullName: `Private name ${id}`, email: `${id}@example.com`, role: 'USER' });
const session = (id, suffix = '', loginId = `login-${id}`) => ({ transport: 'cookie', userId: id, sessionId: `sid-${id}${suffix}`, loginId, csrfToken: `csrf-${id}${suffix}`, expiresAt: '2099-01-01T00:00:00Z' });
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const changed = () => reply({ error: { code: 'SESSION_CHANGED', message: 'Session changed' } }, 401);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function scenario(run) {
  const originalFetch = global.fetch, originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
  // Separate bundles share the browser cookie jar and lock manager, just as tabs do.
  const tails = new Map();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (name, operation) => {
    const result = (tails.get(name) ?? Promise.resolve()).then(operation, operation);
    tails.set(name, result.catch(() => undefined)); return result;
  } } } });
  const values = new Map(), cookies = new Map(), calls = [];
  let storageWritesFail = false, storageHook;
  const storage = { getItem: async key => { if (storageHook) await storageHook('get', key); return values.get(key) ?? null; }, setItem: async (key, value) => { if (storageHook) await storageHook('set', key); if (storageWritesFail) throw new Error('Browser storage unavailable'); values.set(key, value); }, removeItem: async key => { if (storageHook) await storageHook('remove', key); values.delete(key); } };
  let handler, offline = false, refreshCount = 0;
  global.fetch = async (url, options) => {
    const application = options.headers['X-ParkFlow-App'];
    const request = { url, path: new URL(url).pathname.replace('/api/v1', ''), options, application };
    calls.push(request);
    if (offline) throw new Error('Connection unavailable');
    if (handler) { const result = await handler(request); if (result) return result; }
    const current = cookies.get(application);
    if (request.path === '/auth/web-session/bootstrap') return reply(current ? { session: current, user: { ...user(current.userId), role: application === 'management' ? 'ADMIN' : 'USER' } } : { session: null, user: null });
    if (request.path === '/auth/web-session/logout') {
      if (!current) return reply({ ok: true });
      if (options.headers['X-ParkFlow-Session'] !== current.sessionId || options.headers['X-ParkFlow-Login'] !== current.loginId) return changed();
      assert.equal(options.headers['X-ParkFlow-CSRF'], current.csrfToken);
      cookies.delete(application); return reply({ ok: true });
    }
    if (!current || options.headers['X-ParkFlow-Session'] !== current.sessionId || options.headers['X-ParkFlow-Login'] !== current.loginId) return changed();
    if (request.path === '/auth/refresh') {
      assert.deepEqual(JSON.parse(options.body), {});
      assert.equal(options.headers['X-ParkFlow-CSRF'], current.csrfToken);
      const next = { ...session(current.userId, `-rotated-${++refreshCount}`, current.loginId), expiresAt: new Date(Date.now() + 900_000).toISOString() };
      cookies.set(application, next); return reply(next);
    }
    return reply({ userId: current.userId });
  };
  const bundle = (application = 'customer', platform = 'web', extraStubs = {}, realRoute = false) => {
    const stubs = {
      'react-native': { Platform: { OS: platform } },
      '@react-native-async-storage/async-storage': storage,
      'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
      '@parkflow/client/store/reservationRouteStore': { clearReservationRouteForAccountChange: async () => () => {} },
      ...extraStubs,
    };
    if (realRoute) delete stubs['@parkflow/client/store/reservationRouteStore'];
    const load = createClientLoader({ application, stubs });
    return { store: load('@parkflow/client/store/authStore').useAuthStore, service: load('@parkflow/client/services/http/authService').httpAuthService, ...load('@parkflow/client/services/http/apiClient'), load };
  };
  try { await run({ bundle, values, cookies, calls, setHandler: next => { handler = next; }, setOffline: value => { offline = value; }, setStorageFailure: value => { storageWritesFail = value; }, setStorageHook: next => { storageHook = next; } }); }
  finally {
    global.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
  }
}

test('web verification sends cookies and application context without persisting JWTs or profile', async () => {
  await scenario(async ({ bundle, values, cookies, calls, setHandler }) => {
    const next = session('a');
    setHandler(request => {
      if (request.path !== '/auth/verify-otp') return;
      cookies.set(request.application, next); return reply({ session: next, user: user('a'), isNewUser: false });
    });
    const browser = bundle();
    await browser.service.verifyOtp({ challengeId: 'challenge-a', code: '123456' });
    await browser.api('/users/me', { method: 'PATCH', body: { fullName: 'Updated' } });
    assert.equal(browser.store.getState().user.id, 'a');
    for (const { options } of calls) { assert.equal(options.credentials, 'include'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers['X-ParkFlow-App'], 'customer'); }
    const edit = calls.find(call => call.path === '/users/me');
    assert.equal(edit.options.headers['X-ParkFlow-Session'], next.sessionId);
    assert.equal(edit.options.headers['X-ParkFlow-Login'], next.loginId);
    assert.equal(edit.options.headers['X-ParkFlow-CSRF'], next.csrfToken);
    const persisted = [...values.values()].join('\n');
    for (const sensitive of [next.csrfToken, 'Private name a', 'a@example.com', 'accessToken', 'refreshToken']) assert.equal(persisted.includes(sensitive), false);
  });
});

test('web startup removes legacy browser JWTs and authenticates exclusively through cookie bootstrap', async () => {
  await scenario(async ({ bundle, values, cookies, calls }) => {
    values.set('sp.auth.session', JSON.stringify({ session: { userId: 'legacy', accessToken: 'legacy-access', refreshToken: 'legacy-refresh' }, user: user('legacy') }));
    cookies.set('customer', session('current'));
    const browser = bundle(); await browser.store.getState().hydrate();
    assert.equal(browser.store.getState().user?.id, 'current');
    assert.equal(values.has('sp.auth.session'), false);
    assert.equal(calls.some(call => call.options.headers.Authorization), false);
    assert.equal(calls[0].path, '/auth/web-session/bootstrap');
  });
});

test('reloading a server-verified web login preserves its saved car location', async () => {
  await scenario(async ({ bundle, cookies }) => {
    cookies.set('customer', session('a'));
    const browser = bundle('customer', 'web', {}, true);
    await browser.store.getState().hydrate();
    const route = browser.load('@parkflow/client/store/reservationRouteStore').useReservationRouteStore;
    await route.persist.rehydrate();
    route.getState().saveReturnToCar({ savedLocation: { latitude: 31.9, longitude: 35.2 }, note: 'Find my car' });
    await new Promise(resolve => setImmediate(resolve));
    const reloaded = bundle('customer', 'web', {}, true);
    await reloaded.store.getState().hydrate();
    const restored = reloaded.load('@parkflow/client/store/reservationRouteStore').useReservationRouteStore;
    await restored.persist.rehydrate();
    assert.equal(reloaded.store.getState().user.id, 'a');
    assert.deepEqual(restored.getState().returnToCar, { savedLocation: { latitude: 31.9, longitude: 35.2 }, note: 'Find my car' });
  });
});

test('customer and management cookie sessions restore independently even when cookies share a host', async () => {
  await scenario(async ({ bundle, cookies }) => {
    cookies.set('customer', session('customer')); cookies.set('management', session('management'));
    const customer = bundle(), management = bundle('management');
    await customer.store.getState().hydrate(); await management.store.getState().hydrate();
    assert.equal(customer.store.getState().user?.id, 'customer');
    assert.equal(management.store.getState().user?.id, 'management');
    await management.service.signOut();
    assert.equal(cookies.has('management'), false);
    assert.equal(cookies.get('customer').userId, 'customer');
    assert.equal(customer.store.getState().user.id, 'customer');
  });
});

test('an offline web logout cannot silently restore its HttpOnly cookie on reload', async () => {
  await scenario(async ({ bundle, cookies, setOffline }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setOffline(true); await browser.service.signOut().catch(() => undefined);
    assert.equal(browser.store.getState().user, undefined);
    assert.equal(cookies.has('customer'), true, 'Browser scripts cannot delete the HttpOnly cookie offline');
    const offlineReload = bundle(); await offlineReload.store.getState().hydrate();
    assert.equal(offlineReload.store.getState().user, undefined);
    setOffline(false); const reloaded = bundle(); await reloaded.store.getState().hydrate();
    assert.equal(reloaded.store.getState().user, undefined);
    assert.equal(cookies.has('customer'), false, 'Pending logout is completed before auth publication');
  });
});

test('a pending logout from an old login never revokes a different explicitly published newer login', async () => {
  await scenario(async ({ bundle, cookies, values, setOffline }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setOffline(true); await browser.service.signOut().catch(() => undefined); setOffline(false);
    cookies.set('customer', session('b'));
    await bundle().store.getState().signIn(session('b'), user('b'));
    // Another old tab can write its logout fence after the newer login publishes.
    values.set('pf.web.logout-pending', JSON.stringify({ userId: 'a', loginId: 'login-a' }));
    const reloaded = bundle(); await reloaded.store.getState().hydrate();
    assert.equal(cookies.get('customer').userId, 'b');
    assert.equal(reloaded.store.getState().user?.id, 'b');
  });
});

test('a delayed cookie response cannot restore an old login after a newer binding survives reload', async () => {
  await scenario(async ({ bundle, cookies }) => {
    cookies.set('customer', session('b'));
    await bundle().store.getState().signIn(session('b'), user('b'));
    cookies.set('customer', session('a'));
    const reloaded = bundle(); await reloaded.store.getState().hydrate();
    assert.equal(reloaded.store.getState().user, undefined);
    assert.equal(cookies.get('customer').userId, 'a', 'Reject silently restored identity without revoking an unrelated login');
  });
});

test('same-login tab rotation is adopted before refresh without exposing a token', async () => {
  await scenario(async ({ bundle, cookies, calls }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    cookies.set('customer', session('a', '-other-tab'));
    const rotated = await browser.refreshSession();
    assert.equal(rotated.transport, 'cookie'); assert.equal(rotated.loginId, 'login-a');
    assert.equal(browser.store.getState().session.sessionId, rotated.sessionId);
    assert.equal(rotated.sessionId, 'sid-a-other-tab');
    assert.equal(calls.some(call => call.path === '/auth/refresh'), false, 'A valid rotation is adopted without rotating it again');
  });
});

for (const application of ['customer', 'management']) {
  test(`two ${application} tabs adopt the same login rotation without rotating each other out`, async () => {
    await scenario(async ({ bundle, cookies, calls }) => {
      const initial = { ...session('a'), expiresAt: new Date(Date.now() + 600_000).toISOString() };
      cookies.set(application, initial);
      const first = bundle(application), second = bundle(application);
      await first.store.getState().hydrate(); await second.store.getState().hydrate();
      const rotated = await first.refreshSession();
      assert.equal(calls.filter(call => call.path === '/auth/refresh').length, 1);
      const adopted = await second.refreshSession();
      assert.equal(calls.filter(call => call.path === '/auth/refresh').length, 1, 'Recovering the second socket must not invalidate the first socket again');
      assert.equal(adopted.sessionId, rotated.sessionId);
      assert.equal(first.store.getState().session.sessionId, cookies.get(application).sessionId);
      assert.equal(second.store.getState().session.sessionId, cookies.get(application).sessionId);
      assert.equal(first.store.getState().session.loginId, second.store.getState().session.loginId);
    });
  });
}

for (const remainingMs of [-1_000, 5_000]) {
  test(`an adopted same-login session with ${remainingMs}ms access remaining still rotates normally`, async () => {
    await scenario(async ({ bundle, cookies, calls }) => {
      cookies.set('customer', session('a'));
      const browser = bundle(); await browser.store.getState().hydrate();
      cookies.set('customer', { ...session('a', '-other-tab'), expiresAt: new Date(Date.now() + remainingMs).toISOString() });
      const result = await browser.refreshSession();
      assert.equal(calls.filter(call => call.path === '/auth/refresh').length, 1);
      assert.notEqual(result.sessionId, 'sid-a-other-tab');
      assert.ok(Date.parse(result.expiresAt) > Date.now() + 30_000);
    });
  });
}

test('a malformed refresh response cannot mix another login with the current profile', async () => {
  await scenario(async ({ bundle, cookies, setHandler }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setHandler(request => request.path === '/auth/refresh' ? reply(session('b')) : undefined);
    await assert.rejects(browser.refreshSession());
    assert.notEqual(browser.store.getState().session?.userId, 'b');
    assert.notEqual(browser.store.getState().user?.id, 'b');
  });
});

test('web refresh publishes the server current profile and role instead of an old cached role', async () => {
  await scenario(async ({ bundle, cookies }) => {
    const initial = session('a'); cookies.set('customer', initial);
    const browser = bundle();
    await browser.store.getState().signIn(initial, { ...user('a'), role: 'ADMIN' });
    await browser.refreshSession();
    assert.equal(browser.store.getState().user.role, 'USER');
    assert.equal(browser.store.getState().user.id, 'a');
  });
});

test('an old tab can safely complete its edit after another tab rotates the same login', async () => {
  await scenario(async ({ bundle, cookies, calls }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    cookies.set('customer', session('a', '-other-tab'));
    const result = await browser.api('/users/me', { method: 'PATCH', body: { fullName: 'Intended A edit' } });
    assert.equal(result.userId, 'a');
    assert.equal(calls.filter(call => call.path === '/users/me').length, 2);
    assert.equal(browser.store.getState().session.loginId, 'login-a');
  });
});

test('online logout revokes the current rotation of the same login', async () => {
  await scenario(async ({ bundle, cookies }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    cookies.set('customer', session('a', '-other-tab'));
    await browser.service.signOut();
    assert.equal(cookies.has('customer'), false);
    assert.equal(browser.store.getState().user, undefined);
  });
});

test('online logout still revokes the cookie if browser storage cannot write its fence', async () => {
  await scenario(async ({ bundle, cookies, setStorageFailure }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setStorageFailure(true); await browser.service.signOut().catch(() => undefined);
    assert.equal(cookies.has('customer'), false);
    assert.equal(browser.store.getState().user, undefined);
  });
});

test('a failed route-cache removal cannot keep the web user authenticated after server logout', async () => {
  await scenario(async ({ bundle, cookies, setStorageHook }) => {
    cookies.set('customer', session('a'));
    const browser = bundle('customer', 'web', {}, true); await browser.store.getState().hydrate();
    setStorageHook((operation, key) => { if (operation === 'remove' && key === 'pf.reservation.route') throw new Error('Route cache unavailable'); });
    await browser.service.signOut().catch(() => undefined);
    assert.equal(cookies.has('customer'), false);
    assert.equal(browser.store.getState().user, undefined);
    assert.equal(browser.store.getState().session, undefined);
  });
});

test('cancelled verification still revokes its cookie when browser storage rejects the logout fence', async () => {
  await scenario(async ({ bundle, cookies, setHandler, setStorageFailure }) => {
    let active = true;
    setHandler(request => {
      if (request.path !== '/auth/verify-otp') return;
      const next = session('a'); cookies.set(request.application, next); active = false; setStorageFailure(true);
      return reply({ session: next, user: user('a'), isNewUser: false });
    });
    const browser = bundle();
    await browser.service.verifyOtp({ challengeId: 'challenge-a', code: '123456' }, { shouldApply: () => active }).catch(() => undefined);
    assert.equal(cookies.has('customer'), false);
    assert.equal(browser.store.getState().user, undefined);
  });
});

test('a stale tab cannot refresh or replay an old edit as a different cookie login', async () => {
  await scenario(async ({ bundle, cookies, calls }) => {
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    cookies.set('customer', session('b'));
    await assert.rejects(browser.api('/users/me', { method: 'PATCH', body: { fullName: 'Old A edit' } }), error => error.details?.serverCode === 'SESSION_CHANGED');
    assert.equal(calls.filter(call => call.path === '/users/me').length, 1);
    assert.equal(calls.filter(call => call.path === '/auth/refresh').length, 0);
    assert.equal(cookies.get('customer').userId, 'b');
    assert.notEqual(browser.store.getState().user?.id, 'b', 'An old action must never publish the new account');
  });
});

test('cancelled verification revokes its cookie before a queued newer verification publishes', async () => {
  await scenario(async ({ bundle, cookies, setHandler }) => {
    const entered = deferred(), release = deferred(); let active = true;
    setHandler(async request => {
      if (request.path !== '/auth/verify-otp') return;
      const id = JSON.parse(request.options.body).challengeId === 'challenge-a' ? 'a' : 'b';
      if (id === 'a') { entered.resolve(); await release.promise; }
      const next = session(id); cookies.set(request.application, next);
      return reply({ session: next, user: user(id), isNewUser: false });
    });
    const firstTab = bundle(), secondTab = bundle();
    const first = firstTab.service.verifyOtp({ challengeId: 'challenge-a', code: '123456' }, { shouldApply: () => active });
    const rejected = assert.rejects(first, { name: 'AbortError' });
    await entered.promise; active = false;
    const second = secondTab.service.verifyOtp({ challengeId: 'challenge-b', code: '654321' });
    release.resolve(); await Promise.all([rejected, second]);
    assert.equal(cookies.get('customer').userId, 'b');
    assert.equal(firstTab.store.getState().user, undefined);
    assert.equal(secondTab.store.getState().user.id, 'b');
  });
});

test('web sessions reject a JWT-bearing login response instead of storing it', async () => {
  await scenario(async ({ bundle, values, setHandler }) => {
    setHandler(request => request.path === '/auth/verify-otp' ? reply({ session: { userId: 'a', accessToken: 'raw-access', refreshToken: 'raw-refresh', expiresAt: '2099-01-01T00:00:00Z' }, user: user('a') }) : undefined);
    const browser = bundle();
    await assert.rejects(browser.service.verifyOtp({ challengeId: 'challenge-a', code: '123456' }));
    assert.equal(browser.store.getState().session, undefined);
    assert.equal([...values.values()].some(value => value.includes('raw-access') || value.includes('raw-refresh')), false);
  });
});

test('native verification retains the bearer flow and protected store without browser cookies', async () => {
  await scenario(async ({ bundle, calls, values, setHandler }) => {
    const native = { userId: 'a', accessToken: 'native-access', refreshToken: 'native-refresh', expiresAt: '2099-01-01T00:00:00Z' };
    setHandler(request => {
      if (request.path === '/auth/verify-otp') return reply({ session: native, user: user('a'), isNewUser: false });
      if (request.path === '/users/me') return reply({ userId: 'a' });
    });
    const android = bundle('customer', 'android');
    await android.service.verifyOtp({ challengeId: 'native-challenge', code: '123456' });
    await android.api('/users/me');
    assert.deepEqual(calls.map(call => call.path), ['/auth/verify-otp', '/users/me']);
    assert.equal(calls[0].options.credentials, undefined);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer native-access');
    assert.equal(calls[1].options.headers['X-ParkFlow-App'], undefined);
    assert.equal(JSON.parse(values.get('sp.auth.session')).session.refreshToken, 'native-refresh');
  });
});

test('local browser API requests align localhost and 127 aliases for strict cookies', async () => {
  await scenario(async ({ bundle, calls }) => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: '127.0.0.1' } } });
    try {
      await bundle().api('/auth/web-session/bootstrap', { public: true });
      assert.equal(calls[0].url, 'http://127.0.0.1:4000/api/v1/auth/web-session/bootstrap');
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    }
  });
});

test('a web mutation waiting for its request key cannot send an old payload under the next login', async () => {
  await scenario(async ({ bundle, cookies, calls, setStorageHook }) => {
    const entered = deferred(), release = deferred(); let paused = false;
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setStorageHook(async (operation, key) => {
      if (operation === 'get' && key.startsWith('pf_request_') && !paused) { paused = true; entered.resolve(); await release.promise; }
    });
    const pending = browser.mutation('/reservations', { vehicleId: 'a-private-vehicle' });
    const rejected = assert.rejects(pending, error => error.details?.serverCode === 'SESSION_CHANGED');
    await entered.promise;
    cookies.set('customer', session('b')); await browser.store.getState().signIn(session('b'), user('b'));
    release.resolve(); await rejected;
    assert.equal(calls.filter(call => call.path === '/reservations').length, 0);
    assert.equal(browser.store.getState().user.id, 'b');
  });
});

test('a successful delayed web response never returns the previous user data to a new login', async () => {
  await scenario(async ({ bundle, cookies, setHandler }) => {
    const entered = deferred(), release = deferred();
    cookies.set('customer', session('a'));
    const browser = bundle(); await browser.store.getState().hydrate();
    setHandler(async request => {
      if (request.path !== '/wallet') return;
      entered.resolve(); await release.promise; return reply({ privateBalanceFor: 'a' });
    });
    const pending = browser.api('/wallet'); const rejected = assert.rejects(pending, error => error.details?.serverCode === 'SESSION_CHANGED');
    await entered.promise;
    cookies.set('customer', session('b')); await browser.store.getState().signIn(session('b'), user('b'));
    release.resolve(); await rejected;
    assert.equal(browser.store.getState().user.id, 'b');
  });
});

for (const application of ['customer', 'management']) {
 for (const recovery of ['connect_error', 'server_disconnect_same_login', 'server_disconnect_different_login']) {
  test(`${application} socket safely handles ${recovery} while its access session is unexpired`, async () => {
    await scenario(async ({ bundle, cookies, calls }) => {
      const sockets = [];
      const io = (_url, options) => {
        const handlers = new Map();
        const socket = { options, connected: false, disconnected: false, on: (name, callback) => { handlers.set(name, callback); }, connect() {}, disconnect() { this.disconnected = true; }, handlers };
        sockets.push(socket); return socket;
      };
      const browser = bundle(application, 'web', {
        'react-native': { Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) } },
        'socket.io-client': { io },
        '@parkflow/client/store/preferencesStore': { usePreferencesStore: selector => selector({ locale: 'en' }) },
      });
      const initial = { ...session('a'), expiresAt: new Date(Date.now() + 600_000).toISOString() };
      cookies.set(application, initial);
      await browser.store.getState().signIn(initial, { ...user('a'), role: application === 'management' ? 'ADMIN' : 'USER' });
      const hook = application === 'management'
        ? browser.load('apps/management/src/hooks/useManagementSync.ts').useManagementSync
        : browser.load('@parkflow/client/hooks/useBackendSync').useBackendSync;
      const client = new QueryClient(); let rendered;
      function Probe() { hook(); return null; }
      try {
        await act(async () => { rendered = create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
        assert.equal(sockets.length, 1);
        assert.equal(sockets[0].options.withCredentials, true);
        assert.deepEqual(sockets[0].options.auth, { application, sessionId: initial.sessionId, loginId: initial.loginId, csrfToken: initial.csrfToken });
        assert.equal('token' in sockets[0].options.auth, false);
        await act(async () => {
          if (recovery === 'connect_error') sockets[0].handlers.get('connect_error')(new Error('SESSION_CHANGED'));
          else {
            assert.equal(typeof sockets[0].handlers.get('disconnect'), 'function', 'Server disconnects must have a recovery handler');
            sockets[0].connected = false; sockets[0].disconnected = true;
            cookies.set(application, recovery === 'server_disconnect_different_login'
              ? session('b') : { ...initial, sessionId: `${initial.sessionId}-other-tab`, csrfToken: 'csrf-other-tab' });
            sockets[0].handlers.get('disconnect')('io server disconnect');
          }
          for (let turn = 0; turn < 20 && browser.store.getState().session?.sessionId === initial.sessionId; turn++) await new Promise(resolve => setImmediate(resolve));
        });
        if (recovery === 'server_disconnect_different_login') {
          assert.equal(browser.store.getState().session, undefined);
          assert.equal(browser.store.getState().user, undefined);
          assert.equal(cookies.get(application).userId, 'b');
          assert.equal(calls.some(call => call.path === '/auth/refresh'), false, 'A different login must not be rotated or adopted');
          assert.equal(sockets.length, 1);
          return;
        }
        assert.equal(calls.some(call => call.path === '/auth/refresh'), recovery === 'connect_error', 'Same-login cookie rotation is adopted; a genuinely stale access session is rotated');
        assert.equal(sockets.length, 2);
        assert.equal(sockets[0].disconnected, true);
        assert.equal(sockets[1].options.auth.sessionId, browser.store.getState().session.sessionId);
      } finally {
        if (rendered) await act(async () => { rendered.unmount(); });
        client.clear();
      }
    });
  });
 }
}
