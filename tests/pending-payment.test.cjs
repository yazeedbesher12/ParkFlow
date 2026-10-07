const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { TopUpRecovery, PendingPaymentConflict } = require('../src/utils/pendingPayment.ts');
function storage() {
  const values = new Map();
  return { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
}
const body = { amount: 500, paymentMethodId: 'method-1' };
test('a remounted top-up retries the same key after an uncertain response', async () => {
  const disk = storage(); const first = new TopUpRecovery(disk);
  await assert.rejects(first.run('user-a', body, 'first-key', async () => { throw new Error('network'); }));
  const restarted = new TopUpRecovery(disk);
  let sent = '';
  await restarted.run('user-a', body, 'new-key', async (_body, key) => { sent = key; return 'completed'; });
  assert.equal(sent, 'first-key'); assert.equal(await restarted.read('user-a'), null);
});
test('a pending response prevents a second amount or method from being charged', async () => {
  const flow = new TopUpRecovery(storage());
  await assert.rejects(flow.run('user-a', body, 'key', async () => { throw { details: { serverCode: 'PAYMENT_PENDING', status: 202 } }; }));
  let called = false;
  await assert.rejects(flow.run('user-a', { ...body, amount: 1000 }, 'new-key', async () => { called = true; }), PendingPaymentConflict);
  assert.equal(called, false);
  await flow.run('user-b', body, 'independent-key', async () => 'completed');
  assert.ok(await flow.read('user-a'));
});
test('concurrent taps share a single network operation', async () => {
  const flow = new TopUpRecovery(storage()); let calls = 0;
  const send = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return 'completed'; };
  await Promise.all([flow.run('user-a', body, 'one', send), flow.run('user-a', body, 'two', send)]);
  assert.equal(calls, 1);
});
test('authorization or validation errors on recovery do not discard an uncertain charge', async () => {
  const flow = new TopUpRecovery(storage());
  await assert.rejects(flow.run('user-a', body, 'original', async () => { throw new Error('timeout'); }));
  for (const details of [{ status: 403 }, { serverCode: 'VALIDATION', status: 400 }]) {
    await assert.rejects(flow.run('user-a', body, 'replacement', async () => { throw { details }; }));
    assert.equal((await flow.read('user-a')).key, 'original');
  }
});
test('a definitive provider decline permits a new payment attempt', async () => {
  const flow = new TopUpRecovery(storage());
  await assert.rejects(flow.run('user-a', body, 'declined', async () => { throw { details: { serverCode: 'PAYMENT_FAILED' } }; }));
  assert.equal(await flow.read('user-a'), null);
});
