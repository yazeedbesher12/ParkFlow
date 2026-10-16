const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

const userA = { id: 'account-a', fullName: 'First account', role: 'USER' };
const userB = { id: 'account-b', fullName: 'Second account', role: 'USER' };
const session = (userId, suffix = '') => ({ userId, accessToken: `access-${userId}${suffix}`, refreshToken: `refresh-${userId}${suffix}`, expiresAt: '2099-01-01T00:00:00Z' });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function scenario(run, pauseRequestStorage = false) {
  const originalFetch = global.fetch;
  const originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
  const values = new Map(), storageEntered = deferred(), storageRelease = deferred();
  let paused = false;
  const faults = { requestWritesFail: false, removeThenReject: false, rejectWithoutRemoving: false };
  const storage = {
    getItem: async key => {
      if (pauseRequestStorage === true && key.startsWith('pf_request_') && !paused) {
        paused = true; storageEntered.resolve(); await storageRelease.promise;
      }
      return values.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (faults.requestWritesFail && key.startsWith('pf_request_')) throw new Error('Request-key write failed');
      if (pauseRequestStorage === 'write' && key.startsWith('pf_request_') && !paused) {
        paused = true; storageEntered.resolve(); await storageRelease.promise;
      }
      values.set(key, value);
    },
    removeItem: async key => {
      if (pauseRequestStorage === 'remove' && key.startsWith('pf_request_') && !paused) {
        paused = true; storageEntered.resolve(); await storageRelease.promise;
      }
      if (key.startsWith('pf_request_') && faults.rejectWithoutRemoving) throw new Error('Request-key delete failed');
      values.delete(key);
      if (key.startsWith('pf_request_') && faults.removeThenReject) throw new Error('Current preferences deleted, legacy preferences commit failed');
    },
  };
  const loaderOptions = { stubs: {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
  } };
  const load = createClientLoader(loaderOptions);
  const store = load('@parkflow/client/store/authStore').useAuthStore;
  const client = load('@parkflow/client/services/http/apiClient');
  try { await run({ store, ...client, storageEntered: storageEntered.promise, releaseStorage: () => storageRelease.resolve(), faults, reload: () => {
    const next = createClientLoader(loaderOptions);
    return { store: next('@parkflow/client/store/authStore').useAuthStore, ...next('@parkflow/client/services/http/apiClient') };
  } }); }
  finally {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
  }
}

for (const nextUser of [userB, userA]) {
  test(`a delayed 401 cannot replay an old profile edit after login to ${nextUser.id}`, async () => {
    await scenario(async ({ store, api }) => {
      const original = deferred(), calls = [], edited = new Map([[userA.id, userA.fullName], [userB.id, userB.fullName]]);
      global.fetch = async (url, options) => {
        calls.push({ url, authorization: options.headers.Authorization });
        if (calls.length === 1) return original.promise;
        if (url.endsWith('/auth/refresh')) return response(session(nextUser.id, '-refreshed'));
        edited.set(nextUser.id, JSON.parse(options.body).fullName);
        return response({ fullName: edited.get(nextUser.id) });
      };
      await store.getState().signIn(session(userA.id), userA);
      const pending = api('/users/me', { method: 'PATCH', body: { fullName: 'Old request edit' } });
      const observed = pending.then(value => ({ value }), error => ({ error }));
      await store.getState().signOut();
      await store.getState().signIn(session(nextUser.id, '-new-login'), nextUser);
      original.resolve(response({ error: { code: 'UNAUTHORIZED', message: 'The original session was revoked' } }, 401));
      const result = await observed;
      assert.equal(result.error?.code, 'unauthorized', 'The stale action must be cancelled');
      assert.equal(calls.length, 1, 'The stale 401 must neither refresh the new login nor dispatch the old action');
      assert.equal(edited.get(nextUser.id), nextUser.fullName);
      assert.equal(store.getState().session.refreshToken, `refresh-${nextUser.id}-new-login`);
    });
  });
}

test('a mutation waiting for request storage cannot dispatch its payload as a different account', async () => {
  await scenario(async ({ store, mutation, storageEntered, releaseStorage }) => {
    const requests = [];
    global.fetch = async (url, options) => { requests.push({ url, options }); return response({ createdBy: userB.id }); };
    await store.getState().signIn(session(userA.id), userA);
    const pending = mutation('/road-reports', { description: 'Account A private report' });
    const observed = pending.then(value => ({ value }), error => ({ error }));
    await storageEntered;
    await store.getState().signOut();
    await store.getState().signIn(session(userB.id), userB);
    releaseStorage();
    const result = await observed;
    assert.equal(result.error?.code, 'unauthorized');
    assert.equal(requests.length, 0, 'A cancelled mutation must never send its payload with the next login');
  }, true);
});

test('a successful old-account response is not returned to the next account', async () => {
  await scenario(async ({ store, api }) => {
    const original = deferred();
    global.fetch = () => original.promise;
    await store.getState().signIn(session(userA.id), userA);
    const pending = api('/wallet');
    const observed = pending.then(value => ({ value }), error => ({ error }));
    await store.getState().signOut();
    await store.getState().signIn(session(userB.id), userB);
    original.resolve(response({ ownerId: userA.id, balance: 12345 }));
    const result = await observed;
    assert.equal(result.error?.code, 'unauthorized');
    assert.equal(result.value, undefined);
    assert.equal(store.getState().user.id, userB.id);
  });
});

test('a request stays valid across a legitimate refresh of the initiating login', async () => {
  await scenario(async ({ store, api, refreshSession }) => {
    const original = deferred(), calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      if (url.endsWith('/auth/refresh')) return response(session(userA.id, '-rotated'));
      return original.promise;
    };
    await store.getState().signIn(session(userA.id), userA);
    const pending = api('/wallet');
    await refreshSession();
    original.resolve(response({ ownerId: userA.id, balance: 12345 }));
    assert.deepEqual(await pending, { ownerId: userA.id, balance: 12345 });
    assert.equal(store.getState().session.refreshToken, 'refresh-account-a-rotated');
    assert.equal(calls.length, 2);
  });
});

test('a 401 retries the same action after refreshing its own login', async () => {
  await scenario(async ({ store, api }) => {
    const edits = [], calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      if (url.endsWith('/auth/refresh')) return response(session(userA.id, '-rotated'));
      if (options.headers.Authorization === 'Bearer access-account-a') return response({ error: { code: 'UNAUTHORIZED', message: 'Access token expired' } }, 401);
      edits.push(JSON.parse(options.body));
      return response({ fullName: 'New profile name' });
    };
    await store.getState().signIn(session(userA.id), userA);
    assert.deepEqual(await api('/users/me', { method: 'PATCH', body: { fullName: 'New profile name' } }), { fullName: 'New profile name' });
    assert.deepEqual(edits, [{ fullName: 'New profile name' }]);
    assert.deepEqual(calls.map(call => call.authorization), ['Bearer access-account-a', undefined, 'Bearer access-account-a-rotated']);
  });
});

test('parallel requests share the initiating login refresh and keep its rotated credentials', async () => {
  await scenario(async ({ store, api }) => {
    const rotated = deferred(), refreshEntered = deferred(), calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      if (url.endsWith('/auth/refresh')) { refreshEntered.resolve(); return rotated.promise; }
      return response({ ownerId: userA.id });
    };
    await store.getState().signIn({ ...session(userA.id), expiresAt: '2000-01-01T00:00:00Z' }, userA);
    const first = api('/wallet');
    await refreshEntered.promise;
    const second = api('/users/me');
    rotated.resolve(response(session(userA.id, '-rotated')));
    assert.deepEqual(await Promise.all([first, second]), [{ ownerId: userA.id }, { ownerId: userA.id }]);
    assert.equal(calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
    assert.deepEqual(calls.filter(call => !call.url.endsWith('/auth/refresh')).map(call => call.authorization), ['Bearer access-account-a-rotated', 'Bearer access-account-a-rotated']);
  });
});

for (const pausedOperation of ['write']) {
  test(`same-account relogin preserves recovery after an old request key ${pausedOperation} and a lost server response`, async () => {
    await scenario(async ({ store, mutation, storageEntered, releaseStorage }) => {
      const ledger = new Map(), requests = [];
      let effects = 0;
      global.fetch = async (_url, options) => {
        const key = options.headers['Idempotency-Key'];
        requests.push({ key, authorization: options.headers.Authorization });
        if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
        const lostResponseAttempt = pausedOperation === 'write' ? 1 : 2;
        if (requests.length === lostResponseAttempt) throw new Error('Response lost after the server committed the reservation');
        return response(ledger.get(key));
      };
      await store.getState().signIn(session(userA.id), userA);
      const old = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
      const oldObserved = old.then(value => ({ value }), error => ({ error }));
      await storageEntered;
      await store.getState().signOut();
      await store.getState().signIn(session(userA.id, '-new-login'), userA);
      const fresh = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
      const freshObserved = fresh.then(value => ({ value }), error => ({ error }));
      // Let the new login reach the storage boundary while the old operation
      // remains non-cancellable. Correct serialization may keep it waiting.
      await new Promise(resolve => setImmediate(resolve));
      releaseStorage();
      assert.equal((await oldObserved).error?.code, 'unauthorized');
      assert.equal((await freshObserved).error?.code, 'network');
      const recovered = await mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
      assert.deepEqual(recovered, { reservationId: 'reservation-1' });
      assert.equal(effects, 1, 'The saved key must recover the committed reservation instead of creating another');
      const newLoginRequests = requests.filter(request => request.authorization === 'Bearer access-account-a-new-login');
      assert.equal(newLoginRequests.length, 2);
      assert.equal(newLoginRequests[1].key, newLoginRequests[0].key, 'A lost response must retry the exact persisted key');
    }, pausedOperation);
  });
}

test('a direct same-account sign-in waits for a completed mutation to acknowledge its key cleanup', async () => {
  await scenario(async ({ store, mutation, storageEntered, releaseStorage }) => {
    const ledger = new Map(), events = [];
    let effects = 0;
    global.fetch = async (_url, options) => {
      const key = options.headers['Idempotency-Key'];
      if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
      return response(ledger.get(key));
    };
    await store.getState().signIn(session(userA.id), userA);
    const old = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
    const oldObserved = old.then(value => { events.push('acknowledged'); return { value }; }, error => ({ error }));
    await storageEntered;
    const stop = store.subscribe(state => { if (state.session?.refreshToken === 'refresh-account-a-new-login') events.push('new-login'); });
    const nextLogin = store.getState().signIn(session(userA.id, '-new-login'), userA);
    await new Promise(resolve => setImmediate(resolve));
    const publishedWhileDeleting = store.getState().session.refreshToken;
    releaseStorage();
    const previous = await oldObserved;
    await nextLogin;
    stop();
    assert.equal(publishedWhileDeleting, 'refresh-account-a', 'A new login must not publish during non-cancellable key deletion');
    assert.deepEqual(previous.value, { reservationId: 'reservation-1' });
    assert.deepEqual(events, ['acknowledged', 'new-login'], 'Success must reach the original caller before the next login publishes');
    assert.deepEqual(await mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 }), { reservationId: 'reservation-2' });
    assert.equal(effects, 2, 'A confirmed successful action must not permanently suppress a later intentional action');
  }, 'remove');
});

test('when relogin publishes before mutation cleanup, restart recovers the unacknowledged committed action', async () => {
  await scenario(async ({ store, mutation, reload }) => {
    const ledger = new Map(), keys = [], firstReply = deferred(), firstCommit = deferred();
    let effects = 0;
    global.fetch = async (url, options) => {
      if (url.endsWith('/auth/me')) return response(userA);
      const key = options.headers['Idempotency-Key'];
      keys.push(key);
      if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
      if (keys.length === 1) { firstCommit.resolve(); return firstReply.promise; }
      return response(ledger.get(key));
    };
    await store.getState().signIn(session(userA.id), userA);
    const old = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
    const oldObserved = old.then(value => ({ value }), error => ({ error }));
    await firstCommit.promise;
    await store.getState().signOut();
    await store.getState().signIn(session(userA.id, '-new-login'), userA);
    firstReply.resolve(response({ reservationId: 'reservation-1' }));
    assert.equal((await oldObserved).error?.code, 'unauthorized');
    // A fresh loader discards the prior bundle's queues and in-memory repairs.
    // Only the same persistent device storage and committed server ledger survive.
    const restarted = reload();
    await restarted.store.getState().hydrate();
    assert.equal(restarted.store.getState().user.id, userA.id);
    assert.deepEqual(await restarted.mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 }), { reservationId: 'reservation-1' });
    assert.equal(effects, 1);
    assert.equal(keys[1], keys[0]);
  });
});

test('a confirmed mutation permits a fresh same-body action from its first success handler', async () => {
  await scenario(async ({ store, mutation }) => {
    const ledger = new Map();
    let effects = 0;
    global.fetch = async (_url, options) => {
      const key = options.headers['Idempotency-Key'];
      if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
      return response(ledger.get(key));
    };
    await store.getState().signIn(session(userA.id), userA);
    const second = await mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 })
      .then(first => {
        assert.deepEqual(first, { reservationId: 'reservation-1' });
        return mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
      });
    assert.deepEqual(second, { reservationId: 'reservation-2' });
    assert.equal(effects, 2);
  });
});

test('hydration cannot republish a cached identity during mutation key cleanup', async () => {
  await scenario(async ({ store, mutation, storageEntered, releaseStorage }) => {
    const events = [];
    global.fetch = async url => response(url.endsWith('/auth/me') ? userA : { reservationId: 'reservation-1' });
    await store.getState().signIn(session(userA.id), userA);
    const initialSession = store.getState().session;
    const old = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
    const oldObserved = old.then(value => { events.push('acknowledged'); return { value }; }, error => ({ error }));
    await storageEntered;
    let published = false;
    const stop = store.subscribe(state => {
      if (!published && state.session && state.session !== initialSession) { published = true; events.push('hydrated'); }
    });
    const hydrated = store.getState().hydrate();
    await new Promise(resolve => setImmediate(resolve));
    const sessionWhileDeleting = store.getState().session;
    releaseStorage();
    assert.deepEqual((await oldObserved).value, { reservationId: 'reservation-1' });
    await hydrated;
    stop();
    assert.equal(sessionWhileDeleting, initialSession);
    assert.deepEqual(events, ['acknowledged', 'hydrated']);
    assert.equal(store.getState().hydrated, true);
  }, 'remove');
});

test('native partial deletion and failed repair still acknowledge committed success before relogin and restart', async () => {
  await scenario(async ({ store, mutation, storageEntered, releaseStorage, faults, reload }) => {
    const ledger = new Map(), events = [];
    let effects = 0;
    global.fetch = async (url, options) => {
      if (url.endsWith('/auth/me')) return response(userA);
      const key = options.headers['Idempotency-Key'];
      if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
      return response(ledger.get(key));
    };
    await store.getState().signIn(session(userA.id), userA);
    const old = mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 });
    const oldObserved = old.then(value => { events.push('acknowledged'); return { value }; }, error => ({ error }));
    await storageEntered;
    faults.removeThenReject = true;
    faults.requestWritesFail = true;
    const stop = store.subscribe(state => { if (state.session?.refreshToken === 'refresh-account-a-new-login') events.push('new-login'); });
    const nextLogin = store.getState().signIn(session(userA.id, '-new-login'), userA);
    releaseStorage();
    const previous = await oldObserved;
    await nextLogin;
    stop();
    assert.deepEqual(previous.value, { reservationId: 'reservation-1' }, 'An optional storage error must not report a committed business operation as failed');
    assert.deepEqual(events, ['acknowledged', 'new-login']);
    assert.equal(effects, 1, 'Acknowledged success does not trigger an automatic business retry');
    faults.removeThenReject = false;
    faults.requestWritesFail = false;
    const restarted = reload();
    await restarted.store.getState().hydrate();
    // This is a new intentional action after a confirmed success, not recovery
    // of a reported failure. It must use a fresh key and create a new result.
    assert.deepEqual(await restarted.mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 }), { reservationId: 'reservation-2' });
    assert.equal(effects, 2);
  }, 'remove');
});

test('a known-success key left by failed deletion is retired before the next same-body action', async () => {
  await scenario(async ({ store, mutation, faults }) => {
    const ledger = new Map();
    let effects = 0;
    global.fetch = async (_url, options) => {
      const key = options.headers['Idempotency-Key'];
      if (!ledger.has(key)) ledger.set(key, { reservationId: `reservation-${++effects}` });
      return response(ledger.get(key));
    };
    await store.getState().signIn(session(userA.id), userA);
    faults.rejectWithoutRemoving = true;
    const first = await mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 })
      .then(value => ({ value }), error => ({ error }));
    assert.deepEqual(first.value, { reservationId: 'reservation-1' });
    faults.rejectWithoutRemoving = false;
    assert.deepEqual(await mutation('/parking/reservations', { zoneId: 'zone-1', durationMinutes: 30 }), { reservationId: 'reservation-2' });
    assert.equal(effects, 2);
  });
});
