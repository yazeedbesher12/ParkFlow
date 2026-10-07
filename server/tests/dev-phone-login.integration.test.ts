import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import { env } from '../src/config/env';
import { smsProvider } from '../src/providers/sms';
import { twilioVerifyProvider } from '../src/providers/twilioVerify';

const app = createApp();
const phone = '+970591234567';
const originalEnv = {...env};
const login = (body: object = {phone, purpose: 'register', fullName: 'Development Tester'}) => request(app).post('/api/v1/auth/phone/dev-login').send(body);
const me = (token: string) => request(app).get('/api/v1/auth/me').auth(token, {type: 'bearer'});
const refresh = (token: string) => request(app).post('/api/v1/auth/refresh').send({refreshToken: token});

beforeEach(async () => {
  const tables = await db.$queryRaw<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  Object.assign(env, {NODE_ENV: 'development', DEV_SKIP_PHONE_OTP: true, DEV_SKIP_EMAIL_OTP: false});
  vi.spyOn(smsProvider, 'sendOtp').mockRejectedValue(new Error('SMS must not be contacted'));
  vi.spyOn(twilioVerifyProvider, 'start').mockRejectedValue(new Error('Twilio must not be contacted'));
});
afterEach(() => { Object.assign(env, originalEnv); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('temporary development phone login', () => {
  it('creates a normal user and usable session without claiming phone verification or sending a code', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({phone, fullName: 'Development Tester', role: 'USER', phoneVerifiedAt: null});
    expect(result.body.isNewUser).toBe(true);
    expect(await db.wallet.count()).toBe(1);
    expect((await me(result.body.session.accessToken)).status).toBe(200);
    expect(await redis.keys('otp:phone:*')).toHaveLength(0);
    expect(smsProvider.sendOtp).not.toHaveBeenCalled();
    expect(twilioVerifyProvider.start).not.toHaveBeenCalled();
  });

  it('permits profile completion for its new accounts during development', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    const profile = await request(app).post('/api/v1/users/me/complete-profile').auth(result.body.session.accessToken, {type: 'bearer'}).send({email: 'tester@example.com'});
    expect(profile.status).toBe(200);
    expect(profile.body.profileCompletedAt).toBeTruthy();
    expect(profile.body.phoneVerifiedAt).toBeNull();
  });

  it('preserves existing names, profile and roles without accepting role input', async () => {
    const user = await db.user.create({data: {phone, phoneVerifiedAt: new Date(), fullName: 'Administrator', role: 'ADMIN', profileCompletedAt: new Date()}});
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({id: user.id, role: 'ADMIN', fullName: 'Administrator'});
    expect(result.body.isNewUser).toBe(false);
    expect((await login({phone, purpose: 'login', role: 'ADMIN'})).status).toBe(400);
  });

  it('normalizes phone aliases and reuses the same development account', async () => {
    const created = await login();
    expect(created.status).toBe(200);
    const result = await login({phone: '٠٥٩١٢٣٤٥٦٧', purpose: 'login'});
    expect(result.status).toBe(200);
    expect(result.body.user.id).toBe(created.body.user.id);
    expect(await db.user.count()).toBe(1);
  });

  it('does not silently create accounts during login or accept invalid registration', async () => {
    expect((await login({phone, purpose: 'login'})).status).toBe(404);
    expect((await login({phone, purpose: 'register'})).status).toBe(400);
    expect((await login({phone: '123', purpose: 'login'})).status).toBe(400);
    expect(await db.user.count()).toBe(0);
  });

  it('blocks suspended accounts and unverified legacy accounts', async () => {
    const user = await db.user.create({data: {phone, fullName: 'Legacy'}});
    expect((await login()).body.error.code).toBe('PHONE_MIGRATION_REQUIRED');
    await db.user.update({where: {id: user.id}, data: {phoneVerifiedAt: new Date(), status: 'SUSPENDED'}});
    expect((await login()).status).toBe(403);
    expect(await db.refreshToken.count()).toBe(0);
  });

  it('rejects ambiguous historical aliases', async () => {
    await db.user.create({data: {phone: '0591234567', phoneVerifiedAt: new Date()}});
    const result = await login();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('PHONE_MIGRATION_REQUIRED');
  });

  it('advertises the switch and rejects bypass in test, production, or when off', async () => {
    expect((await request(app).get('/api/v1/auth/config')).body).toEqual({developmentLoginEnabled: true, developmentEmailLoginEnabled: false, loginMethod: 'phone'});
    for (const state of [{NODE_ENV: 'development', DEV_SKIP_PHONE_OTP: false}, {NODE_ENV: 'test', DEV_SKIP_PHONE_OTP: true}, {NODE_ENV: 'production', DEV_SKIP_PHONE_OTP: true}]) {
      Object.assign(env, state);
      expect((await request(app).get('/api/v1/auth/config')).body).toEqual({developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'phone'});
      expect((await login()).status).toBe(403);
    }
    expect(await db.user.count()).toBe(0);
  });

  it('pauses old SMS request and verification routes without calling providers', async () => {
    const result = await request(app).post('/api/v1/auth/phone/request-otp').send({phone, purpose: 'login'});
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('OTP_TEMPORARILY_DISABLED');
    const verify = await request(app).post('/api/v1/auth/phone/verify-otp').send({challengeId: '6f9b5d29-710e-4db8-a6e9-9df3663cd9e1', code: '123456'});
    expect(verify.status).toBe(409);
    expect(smsProvider.sendOtp).not.toHaveBeenCalled();
    expect(twilioVerifyProvider.start).not.toHaveBeenCalled();
    expect(await redis.keys('otp:phone:*')).toHaveLength(0);
  });

  it('also prevents retired email screens from requesting codes while paused', async () => {
    const result = await request(app).post('/api/v1/auth/request-otp').send({email: 'tester@example.com'});
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('OTP_TEMPORARILY_DISABLED');
    expect(await redis.keys('otp:email:*')).toHaveLength(0);
  });

  it('blocks development access and rotated refresh sessions after the switch is off', async () => {
    const signed = await login();
    expect(signed.status).toBe(200);
    const rotated = await refresh(signed.body.session.refreshToken);
    expect(rotated.status).toBe(200);
    expect((await me(rotated.body.accessToken)).status).toBe(200);
    Object.assign(env, {DEV_SKIP_PHONE_OTP: false});
    expect((await me(rotated.body.accessToken)).status).toBe(401);
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
  });

  it('restores real OTP verification for development-created accounts with the flag off', async () => {
    const created = await login();
    expect(created.status).toBe(200);
    Object.assign(env, {DEV_SKIP_PHONE_OTP: false, NODE_ENV: 'test', SMS_PROVIDER: 'disabled'});
    let code = '';
    vi.mocked(smsProvider.sendOtp).mockImplementation(async (_phone, value) => {code = value; return 'development';});
    const challenge = await request(app).post('/api/v1/auth/phone/request-otp').send({phone, purpose: 'login'});
    expect(challenge.status).toBe(200);
    const verified = await request(app).post('/api/v1/auth/phone/verify-otp').send({challengeId: challenge.body.challengeId, code});
    expect(verified.status).toBe(200);
    expect(verified.body.user.id).toBe(created.body.user.id);
    expect(verified.body.user.phoneVerifiedAt).toBeTruthy();
    expect((await me(verified.body.session.accessToken)).status).toBe(200);
    expect((await refresh(verified.body.session.refreshToken)).status).toBe(200);
  });

  it('rate limits direct development logins independently of OTP send limits', async () => {
    for (let i = 0; i < 30; i++) expect((await login({phone, purpose: 'login'})).status).toBe(404);
    expect((await login({phone, purpose: 'login'})).status).toBe(429);
  });

  it('refuses to boot production with the bypass flag enabled', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_SKIP_PHONE_OTP', 'true');
    await expect(import('../src/config/env.js')).rejects.toThrow('DEV_SKIP_PHONE_OTP must be false in production');
  });
});
