import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { twilioVerifyProvider } from '../src/providers/twilioVerify';

const phone = '+970591234567';
const accountSid = 'AC' + 'a'.repeat(32);
const serviceSid = 'VA' + 'b'.repeat(32);
const verificationSid = 'VE' + 'c'.repeat(32);
const original = {
  SMS_PROVIDER: env.SMS_PROVIDER, TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID: env.TWILIO_VERIFY_SERVICE_SID,
};
const verification = (status = 'pending', override: Record<string, unknown> = {}) => ({
  sid: verificationSid, account_sid: accountSid, service_sid: serviceSid,
  to: phone, channel: 'sms', status, valid: status === 'approved',
  date_created: '2026-10-07T10:00:00Z', date_updated: '2026-10-07T10:00:00Z',
  ...override,
});
const respond = (body: unknown, status = 200) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), {status}));

beforeEach(() => {
  Object.assign(env, {SMS_PROVIDER: 'twilio-verify', TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: 'test-only-token', TWILIO_VERIFY_SERVICE_SID: serviceSid});
});
afterEach(() => {Object.assign(env, original); vi.restoreAllMocks(); vi.unstubAllGlobals();});

describe('Twilio Verify provider', () => {
  it('starts a trial-compatible SMS verification using only To and Channel', async () => {
    let url: unknown, options: RequestInit | undefined;
    vi.stubGlobal('fetch', async (input: unknown, init: RequestInit) => {url = input; options = init; return new Response(JSON.stringify(verification()), {status: 201});});
    await expect(twilioVerifyProvider.start(phone)).resolves.toEqual({verificationSid});
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`);
    expect(options).toMatchObject({method: 'POST', redirect: 'error'});
    expect(Object.fromEntries(options!.body as URLSearchParams)).toEqual({To: phone, Channel: 'sms'});
    expect(new Headers(options!.headers).get('Authorization')).toBe('Basic ' + Buffer.from(accountSid + ':test-only-token').toString('base64'));
    expect(new Headers(options!.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(options!.signal).toBeInstanceOf(AbortSignal);
  });
  it('checks with trial-compatible To and Code and approves only the stored verification identity', async () => {
    let url: unknown, options: RequestInit | undefined;
    vi.stubGlobal('fetch', async (input: unknown, init: RequestInit) => {url = input; options = init; return new Response(JSON.stringify(verification('approved')), {status: 200});});
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).resolves.toBe('approved');
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`);
    expect(Object.fromEntries(options!.body as URLSearchParams)).toEqual({To: phone, Code: '123456'});
    expect(options).toMatchObject({method: 'POST', redirect: 'error'});
  });
  it('treats a pending code as invalid even when the legacy valid flag is true', async () => {
    respond(verification('pending', {valid: true}));
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).resolves.toBe('invalid');
  });
  it.each(['expired', 'canceled', 'deleted'])('treats provider status %s as an expired challenge', async status => {
    respond(verification(status));
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).resolves.toBe('expired');
  });
  it('maps Twilio deleted-resource responses to expired without accepting a replay', async () => {
    respond({code: 20404, message: 'The requested resource was not found', status: 404}, 404);
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).resolves.toBe('expired');
  });
  it('exposes a bounded phone lock for a validated max-attempts status', async () => {
    respond(verification('max_attempts_reached'));
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 429, code: 'OTP_LOCKED', details: {retryAfterSeconds: 900}});
  });
  it('maps Twilio max-check-attempt error 60202 to a bounded lock', async () => {
    respond({code: 60202, message: 'Max check attempts reached', status: 429}, 429);
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 429, code: 'OTP_LOCKED', details: {retryAfterSeconds: 900}});
  });
  it.each([
    {sid: 'VE' + 'd'.repeat(32)}, {to: '+970591234568'}, {service_sid: 'VA' + 'd'.repeat(32)},
    {account_sid: 'AC' + 'd'.repeat(32)}, {channel: 'call'}, {sid: null}, {status: 'unknown'}, {valid: false}, {valid: undefined},
  ])('rejects successful responses with mismatched or malformed identity %j', async override => {
    respond(verification('approved', override));
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 503, code: 'SMS_VERIFICATION_FAILED'});
  });
  it.each([{to: '+970591234568'}, {service_sid: 'VA' + 'd'.repeat(32)}, {account_sid: 'AC' + 'd'.repeat(32)}, {channel: 'call'}, {sid: 'invalid'}, {status: 'approved'}])('does not activate a challenge after an untrusted start response %j', async override => {
    respond(verification('pending', override), 201);
    await expect(twilioVerifyProvider.start(phone)).rejects.toMatchObject({status: 503, code: 'SMS_DELIVERY_FAILED'});
  });
  it.each([401, 403, 429, 500, 503])('keeps HTTP %s provider failures generic', async status => {
    respond({code: 99999, message: 'Secret provider internals', status}, status);
    await expect(twilioVerifyProvider.start(phone)).rejects.toMatchObject({status: 503, code: 'SMS_DELIVERY_FAILED', message: 'Unable to send the verification code. Please try again later.'});
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 503, code: 'SMS_VERIFICATION_FAILED', message: 'Unable to verify the code. Please try again later.'});
  });
  it('rejects malformed JSON and network timeouts without exposing transport details', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>provider failure</html>', {status: 200}));
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 503, code: 'SMS_VERIFICATION_FAILED'});
    vi.stubGlobal('fetch', async () => {throw new DOMException('test-only-token', 'TimeoutError');});
    await expect(twilioVerifyProvider.start(phone)).rejects.toMatchObject({status: 503, code: 'SMS_DELIVERY_FAILED'});
    await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 503, code: 'SMS_VERIFICATION_FAILED'});
  });
  it('fails before transport when credentials or the Verify service are unavailable', async () => {
    let outbound = 0;
    vi.stubGlobal('fetch', () => {outbound++; throw new Error('Unexpected outbound call');});
    for (const missing of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']) {
      const stored = (env as unknown as Record<string, unknown>)[missing];
      (env as unknown as Record<string, unknown>)[missing] = undefined;
      await expect(twilioVerifyProvider.start(phone)).rejects.toMatchObject({status: 503, code: 'SMS_DELIVERY_FAILED'});
      await expect(twilioVerifyProvider.check(phone, verificationSid, '123456')).rejects.toMatchObject({status: 503, code: 'SMS_VERIFICATION_FAILED'});
      (env as unknown as Record<string, unknown>)[missing] = stored;
    }
    expect(outbound).toBe(0);
  });
});
