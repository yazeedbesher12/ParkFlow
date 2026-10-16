const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');
const { normalizePhoneInput, authLanding, secondsUntil, retryDelaySeconds, verificationRetryDelay } = createClientLoader()('@parkflow/client/utils/authFlow');

test('Palestinian local, international and Arabic numerals identify the same mobile', () => {
  for (const input of ['0599 123 456', '599123456', '+970599123456', '00970 599 123 456', '٠٥٩٩١٢٣٤٥٦']) {
    assert.equal(normalizePhoneInput(input), '+970599123456');
  }
  assert.equal(normalizePhoneInput('+972599123456'), '+970599123456');
  for (const input of ['+970', '123', '+970000000000', '0599123456x', '+12025550123']) assert.equal(normalizePhoneInput(input), null);
});

test('send quota never blocks verification of a still-valid code, while account locks do', () => {
  assert.equal(verificationRetryDelay({ details: { serverCode: 'OTP_SEND_LIMIT', retryAfterSeconds: 3600 } }, 'send'), 0);
  assert.equal(verificationRetryDelay({ details: { serverCode: 'OTP_COOLDOWN', retryAfterSeconds: 60 } }, 'send'), 0);
  assert.equal(verificationRetryDelay({ details: { serverCode: 'OTP_LOCKED', retryAfterSeconds: 900 } }, 'send'), 900);
  assert.equal(verificationRetryDelay({ details: { serverCode: 'RATE_LIMITED', retryAfterSeconds: 60 } }, 'verify'), 60);
});

test('backend incomplete profile wins over a name or role; legacy completed accounts remain usable', () => {
  assert.equal(authLanding(undefined), '/(onboarding)/welcome');
  assert.equal(authLanding({ id: 'new', fullName: 'New User', profileCompletedAt: null }), '/(onboarding)/details');
  assert.equal(authLanding({ id: 'legacy', fullName: 'Legacy User' }), '/(tabs)/map');
  assert.equal(authLanding({ id: 'admin', fullName: 'Admin', role: 'ADMIN', profileCompletedAt: '2026-10-07' }), '/(tabs)/map');
});

test('customer administrators land in the customer map', () => {
  assert.equal(authLanding({ id: 'admin', fullName: 'Admin', role: 'ADMIN', profileCompletedAt: '2026-10-07' }, 'customer'), '/(tabs)/map');
});

test('management administrators land in the administrator workspace', () => {
  assert.equal(authLanding({ id: 'admin', fullName: 'Admin', role: 'ADMIN', profileCompletedAt: '2026-10-07' }, 'management'), '/admin');
});

test('management parking operators land in their operator workspace', () => {
  assert.equal(authLanding({ id: 'operator', fullName: 'Operator', role: 'PARKING_OPERATOR', profileCompletedAt: '2026-10-07' }, 'management'), '/operator');
});

test('management denies ordinary customers with completed profiles', () => {
  assert.equal(authLanding({ id: 'customer', fullName: 'Customer', role: 'USER', profileCompletedAt: '2026-10-07' }, 'management'), '/access-denied');
});

test('management denies ordinary customers before incomplete profile onboarding', () => {
  assert.equal(authLanding({ id: 'customer', fullName: 'Customer', role: 'USER', profileCompletedAt: null }, 'management'), '/access-denied');
});

test('management denies ordinary customers before collecting a missing profile name', () => {
  assert.equal(authLanding({ id: 'customer', fullName: '', role: 'USER', profileCompletedAt: null }, 'management'), '/access-denied');
});

test('cooldowns use absolute deadlines and accept only bounded server retry values', () => {
  assert.equal(secondsUntil(5000, 2001), 3);
  assert.equal(secondsUntil(1000, 3000), 0);
  assert.equal(retryDelaySeconds({ details: { retryAfterSeconds: 900 } }), 900);
  assert.equal(retryDelaySeconds({ details: { retryAfterSeconds: -5 } }), 0);
  assert.equal(retryDelaySeconds({ details: { retryAfterSeconds: 'bad' } }), 0);
});
