const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

test('an email verification response from an abandoned screen cannot replace a newer login', async () => {
  let completeVerification;
  let active = true;
  const persisted = new Map();
  const load = createClientLoader({ stubs: {
    '@parkflow/client/store/reservationRouteStore': { clearReservationRouteForAccountChange: async () => () => {} },
    '@parkflow/client/services/http/apiClient': { api: () => new Promise(resolve => { completeVerification = resolve; }) },
    '@parkflow/client/services/storage': {
      secureStorage: {
        getItem: async key => persisted.get(key) ?? null,
        setItem: async (key, value) => { persisted.set(key, value); },
        removeItem: async key => { persisted.delete(key); },
      },
      STORAGE_KEYS: { authSession: 'auth' },
    },
  } });
  const service = load('@parkflow/client/services/http/authService').httpAuthService;
  const { useAuthStore } = load('@parkflow/client/store/authStore');
  const pending = service.verifyOtp({challengeId: 'older-challenge', code: '123456'}, {shouldApply: () => active});
  active = false;
  const current = {session: {userId: 'current-user', accessToken: 'current-access', refreshToken: 'current-refresh'}, user: {id: 'current-user', fullName: 'Current User'}};
  await useAuthStore.getState().signIn(current.session, current.user);
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  completeVerification({session: {userId: 'previous-user', accessToken: 'previous-access', refreshToken: 'previous-refresh'}, user: {id: 'previous-user', fullName: 'Previous User'}});
  await rejected;
  assert.equal(useAuthStore.getState().user.id, 'current-user');
  assert.deepEqual(JSON.parse(persisted.get('auth')), current);
});

function slowVerificationStorage() {
  const persisted = new Map();
  let releaseWrite, markEntered;
  const entered = new Promise(resolve => { markEntered = resolve; });
  let first = true;
  const prior = {session: {userId: 'prior-user', accessToken: 'prior-access', refreshToken: 'prior-refresh'}, user: {id: 'prior-user', fullName: 'Prior User'}};
  const load = createClientLoader({ stubs: {
    '@parkflow/client/store/reservationRouteStore': { clearReservationRouteForAccountChange: async () => () => {} },
    '@parkflow/client/services/http/apiClient': { api: async () => prior },
    '@parkflow/client/services/storage': {
      secureStorage: {
        getItem: async key => persisted.get(key) ?? null,
        setItem: async (key, value) => {
          if (first) { first = false; markEntered(); await new Promise(resolve => { releaseWrite = resolve; }); }
          persisted.set(key, value);
        },
        removeItem: async key => { persisted.delete(key); },
      },
      STORAGE_KEYS: { authSession: 'auth' },
    },
  } });
  return {
    service: load('@parkflow/client/services/http/authService').httpAuthService,
    store: load('@parkflow/client/store/authStore').useAuthStore,
    persisted, entered, release: () => releaseWrite(),
  };
}

test('abandoning verification during secure persistence cannot publish its account', async () => {
  const fixture = slowVerificationStorage();
  let active = true;
  const pending = fixture.service.verifyOtp({challengeId: 'prior-challenge', code: '123456'}, {shouldApply: () => active});
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  await fixture.entered;
  active = false;
  fixture.release();
  await rejected;
  assert.equal(fixture.store.getState().session, undefined);
  assert.equal(fixture.store.getState().user, undefined);
  assert.equal(fixture.persisted.has('auth'), false);
});

test('a newer sign-in takes precedence while an older verification is persisting', async () => {
  const fixture = slowVerificationStorage();
  const pending = fixture.service.verifyOtp({challengeId: 'prior-challenge', code: '123456'});
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  await fixture.entered;
  const current = {session: {userId: 'current-user', accessToken: 'current-access', refreshToken: 'current-refresh'}, user: {id: 'current-user', fullName: 'Current User'}};
  const signIn = fixture.store.getState().signIn(current.session, current.user);
  fixture.release();
  await Promise.all([rejected, signIn]);
  assert.equal(fixture.store.getState().user.id, 'current-user');
  assert.deepEqual(JSON.parse(fixture.persisted.get('auth')), current);
});

test('logout invalidates a verification that is still persisting', async () => {
  const fixture = slowVerificationStorage();
  const pending = fixture.service.verifyOtp({challengeId: 'prior-challenge', code: '123456'});
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  await fixture.entered;
  const logout = fixture.store.getState().signOut();
  fixture.release();
  await Promise.all([rejected, logout]);
  assert.equal(fixture.store.getState().session, undefined);
  assert.equal(fixture.store.getState().user, undefined);
  assert.equal(fixture.persisted.has('auth'), false);
});
