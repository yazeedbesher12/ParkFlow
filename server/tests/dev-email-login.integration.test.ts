import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import { env } from '../src/config/env';
import { emailProvider } from '../src/providers/email';
import { smsProvider } from '../src/providers/sms';
import { twilioVerifyProvider } from '../src/providers/twilioVerify';

const app = createApp();
const originalEnv = {...env};
const email = 'developer@example.com';
const login = (body: object = {email, purpose: 'register', fullName: 'Team Developer'}) => request(app).post('/api/v1/auth/dev-login').send(body);
const me = (token: string) => request(app).get('/api/v1/auth/me').auth(token, {type: 'bearer'});
const refresh = (token: string) => request(app).post('/api/v1/auth/refresh').send({refreshToken: token});

beforeEach(async () => {
  const tables = await db.$queryRaw<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  Object.assign(env, {NODE_ENV: 'development', DEV_SKIP_EMAIL_OTP: true, DEV_SKIP_PHONE_OTP: true});
  vi.spyOn(emailProvider, 'sendOtp').mockRejectedValue(new Error('Email codes must not be sent'));
  vi.spyOn(smsProvider, 'sendOtp').mockRejectedValue(new Error('SMS must not be sent'));
  vi.spyOn(twilioVerifyProvider, 'start').mockRejectedValue(new Error('Twilio must not be contacted'));
});
afterEach(() => {Object.assign(env, originalEnv); vi.restoreAllMocks(); vi.unstubAllEnvs();});

describe('temporary development email login', () => {
  it('selects email before phone and pauses all code sending and phone shortcuts', async () => {
    const config = await request(app).get('/api/v1/auth/config');
    expect(config.body).toEqual({developmentLoginEnabled: false, developmentEmailLoginEnabled: true, loginMethod: 'email'});
    for (const [url, body] of [
      ['/auth/phone/request-otp', {phone: '+970591234567', purpose: 'login'}],
      ['/auth/request-otp', {email}],
      ['/auth/phone/verify-otp', {challengeId: '6f9b5d29-710e-4db8-a6e9-9df3663cd9e1', code: '123456'}],
      ['/auth/verify-otp', {challengeId: '6f9b5d29-710e-4db8-a6e9-9df3663cd9e1', code: '123456'}],
    ] as const) expect((await request(app).post('/api/v1' + url).send(body)).status).toBe(409);
    expect((await request(app).post('/api/v1/auth/phone/dev-login').send({phone: '+970591234567', purpose: 'register', fullName: 'Test'})).status).toBe(403);
    expect(emailProvider.sendOtp).not.toHaveBeenCalled(); expect(smsProvider.sendOtp).not.toHaveBeenCalled(); expect(twilioVerifyProvider.start).not.toHaveBeenCalled();
    expect(await redis.keys('otp:*')).toHaveLength(0);
  });

  it('creates an ordinary named account and wallet without falsely verifying contact details', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({email, fullName: 'Team Developer', role: 'USER', phone: null, phoneVerifiedAt: null, emailVerifiedAt: null});
    expect(result.body.isNewUser).toBe(true);
    expect((await me(result.body.session.accessToken)).status).toBe(200);
    expect(await db.wallet.count()).toBe(1);
    expect(emailProvider.sendOtp).not.toHaveBeenCalled(); expect(smsProvider.sendOtp).not.toHaveBeenCalled();
  });

  it('completes a new email profile without asking for a phone or sending a code', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    const completed = await request(app).post('/api/v1/users/me/complete-profile').auth(result.body.session.accessToken, {type: 'bearer'}).send({});
    expect(completed.status).toBe(200);
    expect(completed.body.profileCompletedAt).toBeTruthy();
    expect(completed.body.phone).toBeNull(); expect(completed.body.emailVerifiedAt).toBeNull();
    const again = await login({email, purpose: 'login'});
    expect(again.status).toBe(200); expect(again.body.isNewUser).toBe(false);
  });

  it('logs in to the seeded email-only admin and preserves its profile and permissions', async () => {
    const admin = await db.user.create({data: {email: 'admin@parkflow.local', emailVerifiedAt: new Date(), fullName: 'Development Admin', role: 'ADMIN', profileCompletedAt: new Date()}});
    const result = await login({email: ' ADMIN@PARKFLOW.LOCAL ', purpose: 'login'});
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({id: admin.id, role: 'ADMIN', fullName: 'Development Admin', phone: null});
    expect(result.body.isNewUser).toBe(false);
    expect((await request(app).get('/api/v1/admin/users').auth(result.body.session.accessToken, {type: 'bearer'})).status).toBe(200);
  });

  it('lets an existing nameless email account finish setup with a name', async () => {
    const existing = await db.user.create({data: {email, fullName: '', emailVerifiedAt: new Date()}});
    const result = await login({email, purpose: 'login'}); expect(result.status).toBe(200);
    const completed = await request(app).post('/api/v1/users/me/complete-profile').auth(result.body.session.accessToken, {type: 'bearer'}).send({fullName: 'Recovered Developer'});
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({id: existing.id, fullName: 'Recovered Developer', firstName: 'Recovered', lastName: 'Developer'});
    expect(completed.body.profileCompletedAt).toBeTruthy();
  });

  it('does not mark a nameless account complete before receiving its name', async () => {
    const existing = await db.user.create({data: {email, fullName: '', emailVerifiedAt: new Date()}});
    const result = await login({email, purpose: 'login'}); expect(result.status).toBe(200);
    const completed = await request(app).post('/api/v1/users/me/complete-profile').auth(result.body.session.accessToken, {type: 'bearer'}).send({});
    expect(completed.status).toBe(400);
    expect(completed.body.error.code).toBe('NAME_REQUIRED');
    expect((await db.user.findUniqueOrThrow({where: {id: existing.id}})).profileCompletedAt).toBeNull();
  });

  it('uses an existing phone account contact email without duplicating or changing it', async () => {
    const user = await db.user.create({data: {email, phone: '+970591234567', phoneVerifiedAt: new Date(), fullName: 'Existing User', profileCompletedAt: new Date()}});
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({id: user.id, fullName: 'Existing User', phone: '+970591234567', role: 'USER'});
    expect(await db.user.count()).toBe(1);
  });

  it('retains owner membership and its restricted organization access', async () => {
    const operator = await db.parkingOperator.create({data: {name: 'Owner Company'}});
    const user = await db.user.create({data: {email, fullName: 'Owner', role: 'PARKING_OPERATOR', profileCompletedAt: new Date(), operators: {create: {operatorId: operator.id, memberRole: 'owner'}}}});
    const result = await login({email, purpose: 'login'});
    expect(result.status).toBe(200); expect(result.body.user).toMatchObject({id: user.id, role: 'PARKING_OPERATOR'});
    expect((await request(app).get('/api/v1/management/zones').auth(result.body.session.accessToken, {type: 'bearer'})).status).toBe(200);
    expect(await db.operatorUser.findUnique({where: {operatorId_userId: {operatorId: operator.id, userId: user.id}}})).toMatchObject({memberRole: 'owner'});
  });

  it('normalizes and reuses an account instead of creating duplicates', async () => {
    const created = await login(); expect(created.status).toBe(200);
    const again = await login({email: ' DEVELOPER@EXAMPLE.COM ', purpose: 'login'});
    expect(again.status).toBe(200); expect(again.body.user.id).toBe(created.body.user.id);
    expect(await db.user.count()).toBe(1);
  });

  it('requires registration names, rejects invalid email and refuses client role escalation', async () => {
    for (const body of [{email, purpose: 'register'}, {email: 'invalid', purpose: 'login'}, {email, purpose: 'register', fullName: 'Test', role: 'ADMIN'}]) expect((await login(body)).status).toBe(400);
    expect((await login({email, purpose: 'login'})).status).toBe(404);
    expect(await db.user.count()).toBe(0);
  });

  it('blocks suspended accounts without creating sessions', async () => {
    await db.user.create({data: {email, status: 'SUSPENDED', fullName: 'Suspended'}});
    expect((await login()).status).toBe(403);
    expect(await db.refreshToken.count()).toBe(0);
  });

  it('rejects email bypass when disabled, in test or in production', async () => {
    for (const state of [{NODE_ENV: 'development', DEV_SKIP_EMAIL_OTP: false}, {NODE_ENV: 'test', DEV_SKIP_EMAIL_OTP: true}, {NODE_ENV: 'production', DEV_SKIP_EMAIL_OTP: true}]) {
      Object.assign(env, state);
      expect((await login()).status).toBe(403);
      const config = await request(app).get('/api/v1/auth/config');
      expect(config.body.developmentEmailLoginEnabled).toBe(false); expect(config.body.loginMethod).toBe('phone');
    }
    expect(await db.user.count()).toBe(0);
  });

  it('rejects email development access and rotated refresh tokens once email is disabled', async () => {
    const signed = await login(); expect(signed.status).toBe(200);
    const rotated = await refresh(signed.body.session.refreshToken); expect(rotated.status).toBe(200);
    Object.assign(env, {DEV_SKIP_EMAIL_OTP: false});
    expect((await me(signed.body.session.accessToken)).status).toBe(401);
    expect((await me(rotated.body.accessToken)).status).toBe(401);
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
  });

  it('restores real email verification only for its new pending development accounts', async () => {
    const created = await login(); expect(created.status).toBe(200);
    Object.assign(env, {DEV_SKIP_EMAIL_OTP: false, DEV_SKIP_PHONE_OTP: false, NODE_ENV: 'test'});
    let code = '';
    vi.mocked(emailProvider.sendOtp).mockImplementation(async (_email, value) => {code = value;});
    const challenge = await request(app).post('/api/v1/auth/request-otp').send({email}); expect(challenge.status).toBe(200);
    const verified = await request(app).post('/api/v1/auth/verify-otp').send({challengeId: challenge.body.challengeId, code});
    expect(verified.status).toBe(200); expect(verified.body.user.id).toBe(created.body.user.id); expect(verified.body.user.emailVerifiedAt).toBeTruthy();
    expect((await me(verified.body.session.accessToken)).status).toBe(200);
  });

  it('keeps the remaining phone flow usable after both temporary switches are off', async () => {
    Object.assign(env, {DEV_SKIP_EMAIL_OTP: false, DEV_SKIP_PHONE_OTP: false, NODE_ENV: 'test'});
    const config = await request(app).get('/api/v1/auth/config');
    expect(config.body).toEqual({developmentLoginEnabled: false, developmentEmailLoginEnabled: false, loginMethod: 'phone'});
    let code = '';
    vi.mocked(smsProvider.sendOtp).mockImplementation(async (_phone, value) => {code = value; return 'development';});
    const challenge = await request(app).post('/api/v1/auth/phone/request-otp').send({phone: '+970591234567', purpose: 'register', fullName: 'Phone User'}); expect(challenge.status).toBe(200);
    const verified = await request(app).post('/api/v1/auth/phone/verify-otp').send({challengeId: challenge.body.challengeId, code});
    expect(verified.status).toBe(200); expect(verified.body.user.phoneVerifiedAt).toBeTruthy();
  });

  it('rate limits development email requests instead of removing throttling', async () => {
    for (let i = 0; i < 30; i++) expect((await login({email, purpose: 'login'})).status).toBe(404);
    expect((await login({email, purpose: 'login'})).status).toBe(429);
  });

  it('refuses production startup with development email login enabled', async () => {
    vi.resetModules(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEV_SKIP_PHONE_OTP', 'false'); vi.stubEnv('DEV_SKIP_EMAIL_OTP', 'true');
    await expect(import('../src/config/env.js')).rejects.toThrow('DEV_SKIP_EMAIL_OTP must be false in production');
  });
});
