import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import { env } from '../src/config/env';
import { emailProvider } from '../src/providers/email';
import { digest } from '../src/modules/auth/service';

const app = createApp();
const savedEnv = {...env};
const email = 'driver@example.com';
const prefix = `otp:email:${digest(email)}:`;
const send = (body: object = {email, purpose: 'register', fullName: 'First Driver'}) => request(app).post('/api/v1/auth/request-otp').send(body);
const verify = (challengeId: string, code: string) => request(app).post('/api/v1/auth/verify-otp').send({challengeId, code});
const sentCode = () => vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
const clearCooldown = () => redis.del(prefix + 'cooldown');
const clearIpLimit = async () => {const keys = await redis.keys('rate:otp:*'); if (keys.length) await redis.del(...keys);};

beforeEach(async () => {
  const tables = await db.$queryRaw<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  Object.assign(env, {AUTH_LOGIN_METHOD: 'email', NODE_ENV: 'test', DEV_SKIP_EMAIL_OTP: false, DEV_SKIP_PHONE_OTP: false});
  vi.spyOn(emailProvider, 'sendOtp').mockResolvedValue();
});
afterEach(() => {Object.assign(env, savedEnv); vi.restoreAllMocks(); vi.unstubAllEnvs();});

describe('email authentication selection', () => {
  it('advertises normal email login independently of both development switches', async () => {
    expect((await request(app).get('/api/v1/auth/config')).body).toEqual({loginMethod: 'email', developmentLoginEnabled: false, developmentEmailLoginEnabled: false});
    Object.assign(env, {NODE_ENV: 'development', DEV_SKIP_PHONE_OTP: true});
    expect((await request(app).get('/api/v1/auth/config')).body).toEqual({loginMethod: 'email', developmentLoginEnabled: false, developmentEmailLoginEnabled: false});
    expect((await send()).status).toBe(200);
  });
  it('rejects phone request, verification and shortcuts while email is selected', async () => {
    Object.assign(env, {NODE_ENV: 'development', DEV_SKIP_PHONE_OTP: true});
    for (const [path, body] of [
      ['request-otp', {phone: '+970591234567', purpose: 'register', fullName: 'Driver'}],
      ['verify-otp', {challengeId: '6f9b5d29-710e-4db8-a6e9-9df3663cd9e1', code: '123456'}],
      ['dev-login', {phone: '+970591234567', purpose: 'register', fullName: 'Driver'}],
    ] as const) {
      const result = await request(app).post('/api/v1/auth/phone/' + path).send(body);
      expect(result.status).toBe(403); expect(result.body.error.code).toBe('AUTH_METHOD_DISABLED');
    }
    expect(await redis.keys('otp:*')).toHaveLength(0); expect(await db.user.count()).toBe(0);
  });
  it('enables only the development shortcut for the configured method', async () => {
    Object.assign(env, {NODE_ENV: 'development', DEV_SKIP_EMAIL_OTP: true, DEV_SKIP_PHONE_OTP: true});
    expect((await request(app).get('/api/v1/auth/config')).body).toEqual({loginMethod: 'email', developmentLoginEnabled: false, developmentEmailLoginEnabled: true});
    expect((await send()).body.error.code).toBe('OTP_TEMPORARILY_DISABLED');
    Object.assign(env, {AUTH_LOGIN_METHOD: 'phone'});
    expect((await request(app).get('/api/v1/auth/config')).body).toEqual({loginMethod: 'phone', developmentLoginEnabled: true, developmentEmailLoginEnabled: false});
    expect((await send()).body.error.code).toBe('AUTH_METHOD_DISABLED');
    expect((await request(app).post('/api/v1/auth/dev-login').send({email})).body.error.code).toBe('AUTH_METHOD_DISABLED');
    expect(await db.user.count()).toBe(0);
  });
  it('defaults new environment configuration to email', async () => {
    vi.resetModules(); vi.stubEnv('AUTH_LOGIN_METHOD', undefined);
    const configured = await import('../src/config/env.js');
    expect((configured.env as {AUTH_LOGIN_METHOD?: string}).AUTH_LOGIN_METHOD).toBe('email');
  });
});

describe('email code authentication', () => {
  it('creates a named ordinary account and wallet only after a valid code', async () => {
    const challenge = await send({email: ' DRIVER@Example.com ', purpose: 'register', fullName: ' First Driver '});
    expect(challenge.status).toBe(200); expect(challenge.body).toMatchObject({email, resendAfterSeconds: 60});
    expect(challenge.body).not.toHaveProperty('code'); expect(challenge.body).not.toHaveProperty('devCode');
    const code = sentCode(); expect(code).toMatch(/^\d{6}$/); expect(await db.user.count()).toBe(0);
    const state = await redis.hgetall('otp:email:' + challenge.body.challengeId);
    expect(state.hash).toHaveLength(64); expect(JSON.stringify(state)).not.toContain(code);
    expect(await redis.ttl('otp:email:' + challenge.body.challengeId)).toBeGreaterThan(295);
    const result = await verify(challenge.body.challengeId, code);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({isNewUser: true, user: {email, fullName: 'First Driver', firstName: 'First', lastName: 'Driver', role: 'USER', phone: null, profileCompletedAt: null}});
    expect(result.body.user.emailVerifiedAt).toBeTruthy(); expect(await db.wallet.count({where: {userId: result.body.user.id}})).toBe(1);
    expect((await request(app).get('/api/v1/auth/me').auth(result.body.session.accessToken, {type: 'bearer'})).status).toBe(200);
    const completed = await request(app).post('/api/v1/users/me/complete-profile').auth(result.body.session.accessToken, {type: 'bearer'}).send({});
    expect(completed.status).toBe(200); expect(completed.body.profileCompletedAt).toBeTruthy();
  });
  it('supports legacy email-only registration requests', async () => {
    const challenge = await send({email}); expect(challenge.status).toBe(200);
    const result = await verify(challenge.body.challengeId, sentCode());
    expect(result.status).toBe(200); expect(result.body.user).toMatchObject({email, role: 'USER', fullName: ''});
  });
  it('does not reveal an unknown login address before verification or create it afterward', async () => {
    const challenge = await send({email, purpose: 'login'}); expect(challenge.status).toBe(200);
    const result = await verify(challenge.body.challengeId, sentCode());
    expect(result.status).toBe(404); expect(result.body.error.code).toBe('EMAIL_ACCOUNT_NOT_FOUND');
    expect(await db.user.count()).toBe(0); expect(await db.refreshToken.count()).toBe(0);
  });
  it('requires registration names and rejects malformed addresses and role escalation', async () => {
    for (const body of [{email, purpose: 'register'}, {email, purpose: 'register', fullName: ' '}, {email: 'invalid', purpose: 'login'}, {email, purpose: 'register', fullName: 'Driver', role: 'ADMIN'}]) expect((await send(body)).status).toBe(400);
    expect(await redis.keys('otp:*')).toHaveLength(0); expect(await db.user.count()).toBe(0);
  });
  it.each(['USER', 'ADMIN', 'PARKING_OPERATOR', 'ENFORCEMENT_OFFICER'] as const)('preserves an existing $0 account, profile, role and wallet', async role => {
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    const existing = await db.user.create({data: {email, emailVerifiedAt: new Date(), fullName: 'Existing Account', role, profileCompletedAt: completedAt, wallet: {create: {balance: 1234}}}});
    const operator = role === 'PARKING_OPERATOR' ? await db.parkingOperator.create({data: {name: 'Existing Company', users: {create: {userId: existing.id, memberRole: 'owner'}}}}) : null;
    const challenge = await send({email, purpose: 'register', fullName: 'Replacement Name'});
    expect(challenge.status).toBe(200);
    const result = await verify(challenge.body.challengeId, sentCode()); expect(result.status).toBe(200);
    expect(result.body).toMatchObject({isNewUser: false, user: {id: existing.id, role, fullName: 'Existing Account', profileCompletedAt: completedAt.toISOString()}});
    expect(await db.wallet.findUnique({where: {userId: existing.id}})).toMatchObject({balance: 1234}); expect(await db.user.count()).toBe(1);
    if (operator) expect(await db.operatorUser.findUnique({where: {operatorId_userId: {operatorId: operator.id, userId: existing.id}}})).toMatchObject({memberRole: 'owner'});
    const path = role === 'ADMIN' ? '/api/v1/admin/users' : role === 'PARKING_OPERATOR' ? '/api/v1/management/zones' : '/api/v1/auth/me';
    expect((await request(app).get(path).auth(result.body.session.accessToken, {type: 'bearer'})).status).toBe(200);
  });
  it.each([{verified: false, status: 'ACTIVE' as const, code: 'EMAIL_MIGRATION_REQUIRED', expected: 409}, {verified: true, status: 'SUSPENDED' as const, code: 'ACCOUNT_SUSPENDED', expected: 403}])('blocks unsafe existing accounts with $code', async ({verified, status, code, expected}) => {
    const existing = await db.user.create({data: {email, emailVerifiedAt: verified ? new Date() : null, fullName: 'Existing', status}});
    const challenge = await send({email, purpose: 'login'}); expect(challenge.status).toBe(200);
    const result = await verify(challenge.body.challengeId, sentCode()); expect(result.status).toBe(expected); expect(result.body.error.code).toBe(code);
    expect(await db.refreshToken.count()).toBe(0); expect((await db.user.findUniqueOrThrow({where: {id: existing.id}})).lastLoginAt).toBeNull();
  });
  it('verifies a pending development email account without duplicating its wallet', async () => {
    const existing = await db.user.create({data: {email, emailVerificationPending: true, fullName: 'Pending Driver', wallet: {create: {}}}});
    const challenge = await send({email, purpose: 'login'}); expect(challenge.status).toBe(200);
    const result = await verify(challenge.body.challengeId, sentCode()); expect(result.status).toBe(200); expect(result.body.user.id).toBe(existing.id);
    expect(await db.user.findUnique({where: {id: existing.id}})).toMatchObject({emailVerificationPending: false, emailVerifiedAt: expect.any(Date)});
    expect(await db.wallet.count()).toBe(1);
  });
});

describe('email challenge safeguards', () => {
  it('shares a sixty second cooldown across normalized address variants', async () => {
    expect((await send()).status).toBe(200);
    const limited = await send({email: ' DRIVER@EXAMPLE.COM ', purpose: 'login'});
    expect(limited.status).toBe(429); expect(limited.body.error).toMatchObject({code: 'OTP_COOLDOWN', details: {retryAfterSeconds: expect.any(Number)}});
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(55);
  });
  it('atomically allows only one concurrent send per address', async () => {
    const results = await Promise.all([send(), send(), send()]);
    expect(results.map(r => r.status).sort()).toEqual([200, 429, 429]);
    expect(await redis.get(prefix + 'hour')).toBe('1'); expect(await redis.get(prefix + 'day')).toBe('1');
  });
  it('consumes a code once under simultaneous verification', async () => {
    const challenge = await send(), code = sentCode();
    const results = await Promise.all([verify(challenge.body.challengeId, code), verify(challenge.body.challengeId, code)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(await db.user.count()).toBe(1); expect(await db.refreshToken.count()).toBe(1);
    expect((await verify(challenge.body.challengeId, code)).body.error.code).toBe('OTP_EXPIRED');
  });
  it('replaces and invalidates the previous challenge on resend', async () => {
    const first = await send(), oldCode = sentCode(); await clearCooldown();
    const second = await send(), currentCode = sentCode(); expect(second.status).toBe(200);
    expect((await verify(first.body.challengeId, oldCode)).body.error.code).toBe('OTP_EXPIRED');
    expect((await verify(second.body.challengeId, currentCode)).status).toBe(200);
  });
  it('counts failed attempts across resends and locks the address for fifteen minutes', async () => {
    const first = await send(), wrong = sentCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) expect((await verify(first.body.challengeId, wrong)).body.error.code).toBe('OTP_INVALID');
    await clearCooldown(); const second = await send(), current = sentCode(), wrong2 = current === '000000' ? '111111' : '000000';
    expect((await verify(second.body.challengeId, wrong2)).body.error.code).toBe('OTP_INVALID');
    const locked = await verify(second.body.challengeId, wrong2);
    expect(locked.status).toBe(429); expect(locked.body.error).toMatchObject({code: 'OTP_LOCKED', details: {retryAfterSeconds: 900}});
    expect((await verify(second.body.challengeId, current)).status).not.toBe(200); await clearCooldown();
    expect((await send()).body.error.code).toBe('OTP_LOCKED'); expect(await redis.ttl(prefix + 'lock')).toBeGreaterThan(895);
    expect(await db.user.count()).toBe(0);
    await redis.del(prefix + 'lock'); const fresh = await send(); expect(fresh.status).toBe(200);
    expect((await verify(fresh.body.challengeId, sentCode())).status).toBe(200);
  });
  it('counts concurrent incorrect guesses atomically', async () => {
    const challenge = await send(), current = sentCode(), wrong = current === '000000' ? '111111' : '000000';
    const attempts = await Promise.all(Array.from({length: 5}, () => verify(challenge.body.challengeId, wrong)));
    expect(attempts.map(r => r.body.error.code).sort()).toEqual(['OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_LOCKED']);
    expect((await verify(challenge.body.challengeId, current)).status).not.toBe(200); expect(await db.user.count()).toBe(0);
  });
  it('enforces five sends per hour and ten per day despite cooldown expiry', async () => {
    for (let i = 0; i < 5; i++) {expect((await send()).status).toBe(200); await clearCooldown();}
    const hourly = await send(); expect(hourly.status).toBe(429); expect(hourly.body.error.code).toBe('OTP_SEND_LIMIT'); expect(hourly.body.error.details.retryAfterSeconds).toBeGreaterThan(3500);
    await redis.del(prefix + 'hour');
    for (let i = 0; i < 5; i++) {await clearIpLimit(); expect((await send()).status).toBe(200); await clearCooldown();}
    await redis.del(prefix + 'hour'); await clearIpLimit();
    const daily = await send(); expect(daily.status).toBe(429); expect(daily.body.error.code).toBe('OTP_SEND_LIMIT'); expect(daily.body.error.details.retryAfterSeconds).toBeGreaterThan(86000);
  });
  it('never authenticates an expired challenge', async () => {
    const challenge = await send(), code = sentCode(); await redis.del('otp:email:' + challenge.body.challengeId);
    expect((await verify(challenge.body.challengeId, code)).body.error.code).toBe('OTP_EXPIRED'); expect(await db.user.count()).toBe(0);
  });
  it('cannot verify a challenge until email delivery succeeds', async () => {
    let release!: () => void;
    vi.mocked(emailProvider.sendOtp).mockImplementationOnce(() => new Promise<void>(resolve => {release = resolve;}));
    const pending = send().then(r => r); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const challengeId = (await redis.get(prefix + 'active')) ?? (await redis.keys('otp:email:*')).find(key => /^otp:email:[0-9a-f-]{36}$/.test(key))!.split(':').at(-1)!;
    try {
      const result = await verify(challengeId, sentCode()); expect(result.status).toBe(401); expect(result.body.error.code).toBe('OTP_EXPIRED'); expect(await db.user.count()).toBe(0);
    } finally {release(); await pending;}
    const delivered = await pending; expect(delivered.status).toBe(200);
    expect((await verify(delivered.body.challengeId, sentCode())).status).toBe(200);
  });
  it('clears its failed delivery challenge and cooldown while retaining send budgets', async () => {
    vi.mocked(emailProvider.sendOtp).mockRejectedValueOnce(new Error('Delivery rejected'));
    const failed = await send(); expect(failed.status).toBe(503); expect(failed.body.error.code).toBe('EMAIL_DELIVERY_FAILED');
    expect(await redis.get(prefix + 'active')).toBeNull(); expect(await redis.get(prefix + 'cooldown')).toBeNull();
    expect(await redis.get(prefix + 'hour')).toBe('1'); expect(await redis.get(prefix + 'day')).toBe('1');
    const retried = await send(); expect(retried.status).toBe(200); expect(await redis.get(prefix + 'hour')).toBe('2');
    expect((await verify(retried.body.challengeId, sentCode())).status).toBe(200);
  });
  it('retains accounting so repeated delivery failures cannot create unrestricted retries', async () => {
    vi.mocked(emailProvider.sendOtp).mockRejectedValue(new Error('Delivery rejected'));
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(503);
    const limited = await send(); expect(limited.status).toBe(429); expect(limited.body.error.code).toBe('OTP_SEND_LIMIT');
    expect(await db.user.count()).toBe(0);
  });
  it('preserves a replacement challenge and its cooldown when an older delivery fails late', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(emailProvider.sendOtp).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {fail = reject;}));
    const older = send().then(r => r); await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    await clearCooldown(); const newer = await send(), current = sentCode();
    fail(new Error('Old delivery timed out')); expect((await older).status).toBe(503); expect(newer.status).toBe(200);
    expect((await send()).body.error.code).toBe('OTP_COOLDOWN'); expect(await redis.get(prefix + 'active')).toBe(newer.body.challengeId);
    expect((await verify(newer.body.challengeId, current)).status).toBe(200);
  });
});
