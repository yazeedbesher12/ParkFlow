import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { redis } from '../src/database/redis';
import { db } from '../src/database/client';
import { digest } from '../src/modules/auth/service';

const app = createApp();
const phone = '+970591234567';
const account = 'AC' + 'a'.repeat(32), service = 'VA' + 'b'.repeat(32), verification = 'VE' + 'c'.repeat(32);
const prefix = `otp:phone:${digest(phone)}:`;
const savedEnv = {...env};
const send = () => request(app).post('/api/v1/auth/phone/request-otp').send({phone, purpose:'register', fullName:'Trial User'});
const verify = (challengeId:string, code='123456') => request(app).post('/api/v1/auth/phone/verify-otp').send({challengeId, code});
const response = (status='pending', sid=verification) => new Response(JSON.stringify({sid, service_sid:service, account_sid:account, to:phone, channel:'sms', status, valid:status==='approved'}), {status:200});
let checkCount = 0;
let checkResponse:() => Response | Promise<Response>;
beforeEach(async () => {
  const tables = await db.$queryRaw<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE '+tables.map(t=>'"'+t.tablename.replace(/"/g,'""')+'"').join(',')+' CASCADE');
  await redis.flushdb();
  Object.assign(env, {SMS_PROVIDER:'twilio-verify', TWILIO_ACCOUNT_SID:account, TWILIO_AUTH_TOKEN:'fixture-token', TWILIO_VERIFY_SERVICE_SID:service});
  checkCount = 0;
  checkResponse = () => response('approved');
  vi.stubGlobal('fetch', async (url:string, init:RequestInit) => {
    const body = init.body as URLSearchParams;
    if (url.endsWith('/Verifications')) {
      expect(body.get('To')).toBe(phone); expect(body.get('Channel')).toBe('sms');
      expect(body.has('CustomCode')).toBe(false); expect(body.has('Body')).toBe(false); expect(body.has('From')).toBe(false);
      return response();
    }
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`);
    expect(body.get('To')).toBe(phone); expect(body.get('Code')).toMatch(/^\d{6}$/);
    checkCount++;
    return checkResponse();
  });
});
afterEach(() => { Object.assign(env, savedEnv); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('trial Verify authentication', () => {
  it('creates no account on delivery and issues a session only after remote approval', async () => {
    const challenge = await send();
    expect(challenge.status).toBe(200); expect(challenge.body.delivery).toBe('sms');
    expect(challenge.body).not.toHaveProperty('code'); expect(challenge.body).not.toHaveProperty('verificationSid');
    expect(await db.user.count()).toBe(0);
    checkResponse = () => response('pending');
    expect((await verify(challenge.body.challengeId)).body.error.code).toBe('OTP_INVALID');
    expect(await db.user.count()).toBe(0);
    checkResponse = () => response('approved');
    const result = await verify(challenge.body.challengeId);
    expect(result.status).toBe(200); expect(result.body.user).toMatchObject({phone, role:'USER', fullName:'Trial User'});
    expect(await db.refreshToken.count()).toBe(1);
    expect((await verify(challenge.body.challengeId)).status).toBe(401);
    expect(checkCount).toBe(2);
  });
  it('preserves the failed-check budget across resends and locks on the fifth wrong check', async () => {
    const first = await send(); expect(first.status).toBe(200);
    checkResponse = () => response('pending');
    for (let i=0;i<3;i++) expect((await verify(first.body.challengeId)).body.error.code).toBe('OTP_INVALID');
    await redis.del(prefix+'cooldown'); const second = await send(); expect(second.status).toBe(200);
    expect((await verify(first.body.challengeId)).body.error.code).toBe('OTP_EXPIRED');
    expect((await verify(second.body.challengeId)).body.error.code).toBe('OTP_INVALID');
    const locked = await verify(second.body.challengeId);
    expect(locked.status).toBe(429); expect(locked.body.error.code).toBe('OTP_LOCKED');
    expect(await redis.ttl(prefix+'lock')).toBeGreaterThan(895);
    expect((await send()).body.error.code).toBe('OTP_LOCKED');
    expect(checkCount).toBe(5); expect(await db.refreshToken.count()).toBe(0);
  });
  it('allows a correct fifth check', async () => {
    const challenge = await send(); expect(challenge.status).toBe(200);
    checkResponse = () => response('pending');
    for (let i=0;i<4;i++) expect((await verify(challenge.body.challengeId)).status).toBe(401);
    checkResponse = () => response('approved');
    expect((await verify(challenge.body.challengeId)).status).toBe(200);
    expect(await redis.exists(prefix+'lock')).toBe(0);
  });
  it('permits at most one remote check and blocks resend while that check is pending', async () => {
    const challenge = await send(); expect(challenge.status).toBe(200);
    let release!:(value:Response)=>void;
    checkResponse = () => new Promise(resolve => {release=resolve;});
    const pending = verify(challenge.body.challengeId).then(r=>r);
    await vi.waitFor(() => expect(checkCount).toBe(1));
    const again = await verify(challenge.body.challengeId);
    expect(again.status).toBe(429); expect(again.body.error.code).toBe('OTP_BUSY');
    await redis.del(prefix+'cooldown'); expect((await send()).body.error.code).toBe('OTP_BUSY');
    release(response('approved')); expect((await pending).status).toBe(200);
    expect(checkCount).toBe(1); expect(await db.refreshToken.count()).toBe(1);
  });
  it('rejects approval after the application challenge expires without issuing a session', async () => {
    const challenge = await send(); expect(challenge.status).toBe(200);
    let release!:(value:Response)=>void;
    checkResponse = () => new Promise(resolve => {release=resolve;});
    const pending = verify(challenge.body.challengeId).then(r=>r);
    await vi.waitFor(() => expect(checkCount).toBe(1));
    await redis.del('otp:phone:challenge:'+challenge.body.challengeId);
    release(response('approved')); expect((await pending).status).toBe(401);
    expect(await db.refreshToken.count()).toBe(0);
  });
  it('ignores a stale approval after a new challenge replaced the old operation', async () => {
    const first = await send(); expect(first.status).toBe(200);
    let release!:(value:Response)=>void;
    checkResponse = () => new Promise(resolve => {release=resolve;});
    const pending = verify(first.body.challengeId).then(r=>r);
    await vi.waitFor(() => expect(checkCount).toBe(1));
    await redis.del(prefix+'operation', prefix+'cooldown');
    const second = await send(); expect(second.status).toBe(200);
    release(response('approved')); expect((await pending).status).toBe(401);
    expect(await db.refreshToken.count()).toBe(0);
    expect(await redis.get(prefix+'active')).toBe(second.body.challengeId);
    checkResponse = () => response('approved');
    expect((await verify(second.body.challengeId)).status).toBe(200);
  });
  it('does not contact the provider for expired or superseded challenge IDs', async () => {
    const first = await send(); expect(first.status).toBe(200);
    await redis.del(prefix+'cooldown'); const second = await send(); expect(second.status).toBe(200);
    expect((await verify(first.body.challengeId)).status).toBe(401);
    await redis.del('otp:phone:challenge:'+second.body.challengeId);
    expect((await verify(second.body.challengeId)).status).toBe(401); expect(checkCount).toBe(0);
  });
  it('fails closed on an unavailable provider and retains its attempted-check budget', async () => {
    const challenge = await send(); expect(challenge.status).toBe(200);
    checkResponse = () => {throw new Error('Transport unavailable');};
    const result = await verify(challenge.body.challengeId);
    expect(result.status).toBe(503); expect(await db.refreshToken.count()).toBe(0);
    expect(await redis.get(prefix+'attempts')).toBe('1');
    checkResponse = () => response('approved'); expect((await verify(challenge.body.challengeId)).status).toBe(200);
  });
  it('never authenticates an approval belonging to another verification', async () => {
    const challenge = await send(); expect(challenge.status).toBe(200);
    checkResponse = () => response('approved', 'VE'+'d'.repeat(32));
    expect((await verify(challenge.body.challengeId)).status).toBe(503);
    expect(await db.refreshToken.count()).toBe(0);
  });
  it('invalidates an upstream expired verification and honors upstream lockout', async () => {
    const first = await send(); expect(first.status).toBe(200);
    checkResponse = () => response('expired');
    expect((await verify(first.body.challengeId)).body.error.code).toBe('OTP_EXPIRED');
    expect(await redis.exists('otp:phone:challenge:'+first.body.challengeId)).toBe(0);
    await redis.del(prefix+'cooldown'); const second = await send(); expect(second.status).toBe(200);
    checkResponse = () => response('max_attempts_reached');
    expect((await verify(second.body.challengeId)).body.error.code).toBe('OTP_LOCKED');
    expect(await redis.ttl(prefix+'lock')).toBeGreaterThan(895);
    expect((await send()).body.error.code).toBe('OTP_LOCKED');
  });
});
