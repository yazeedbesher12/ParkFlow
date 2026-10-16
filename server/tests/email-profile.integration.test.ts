import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import { env } from '../src/config/env';
import { issue } from '../src/modules/auth/service';

const app = createApp();
let userId: string, token: string;
let previousMethod: typeof env.AUTH_LOGIN_METHOD;
beforeEach(async () => {
  previousMethod = env.AUTH_LOGIN_METHOD;
  env.AUTH_LOGIN_METHOD = 'email';
  const tables = await db.$queryRaw<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE '+tables.map(table => '"'+table.tablename.replace(/"/g,'""')+'"').join(',')+' CASCADE');
  await redis.flushdb();
  const user = await db.user.create({data: {
    email: 'verified-profile@example.com', emailVerifiedAt: new Date(),
    fullName: 'Verified Driver', wallet: {create: {}},
  }});
  userId = user.id;
  token = (await db.$transaction(tx => issue(tx, user, {}))).accessToken;
});
afterEach(() => { env.AUTH_LOGIN_METHOD = previousMethod; });

describe('verified email account details', () => {
  it('completes an email-verified profile and encrypts its identity without phone verification', async () => {
    const response = await request(app).post('/api/v1/users/me/complete-profile')
      .auth(token, {type: 'bearer'}).send({nationalId: '123456789'});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({email: 'verified-profile@example.com', phone: null, nationalIdMasked: '••••6789'});
    expect(response.body.profileCompletedAt).toEqual(expect.any(String));
    const stored = await db.user.findUniqueOrThrow({where: {id: userId}});
    expect(stored.nationalIdEncrypted).toBeTruthy();
    expect(stored.nationalIdEncrypted).not.toContain('123456789');
    expect(stored.role).toBe('USER');
    expect(await db.wallet.count({where: {userId}})).toBe(1);
  });

  it('allows email-verified accounts to update their name and identity', async () => {
    const response = await request(app).patch('/api/v1/users/me')
      .auth(token, {type: 'bearer'}).send({fullName: 'Changed Driver', nationalId: '987654321'});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({fullName: 'Changed Driver', nationalIdMasked: '••••4321'});
  });

  it('does not replace the verified sign-in email even when the account also has a verified phone', async () => {
    await db.user.update({where: {id: userId}, data: {phone: '+970599123456', phoneVerifiedAt: new Date(), role: 'ADMIN'}});
    const response = await request(app).patch('/api/v1/users/me')
      .auth(token, {type: 'bearer'}).send({email: 'replacement@example.com'});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_CHANGE_REQUIRES_VERIFICATION');
    const stored = await db.user.findUniqueOrThrow({where: {id: userId}});
    expect(stored.email).toBe('verified-profile@example.com');
    expect(stored.emailVerifiedAt).toBeTruthy();
    expect(stored.role).toBe('ADMIN');
  });

  it('does not remove the verified sign-in email through profile completion', async () => {
    await db.user.update({where: {id: userId}, data: {phone: '+970599123456', phoneVerifiedAt: new Date()}});
    const response = await request(app).post('/api/v1/users/me/complete-profile')
      .auth(token, {type: 'bearer'}).send({email: null});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_CHANGE_REQUIRES_VERIFICATION');
    expect((await db.user.findUniqueOrThrow({where: {id: userId}})).email).toBe('verified-profile@example.com');
  });

  it('still rejects profile completion for an account with no verified contact', async () => {
    await db.user.update({where: {id: userId}, data: {emailVerifiedAt: null}});
    const response = await request(app).post('/api/v1/users/me/complete-profile')
      .auth(token, {type: 'bearer'}).send({nationalId: '123456789'});
    expect(response.status).toBe(403);
    const stored = await db.user.findUniqueOrThrow({where: {id: userId}});
    expect(stored.profileCompletedAt).toBeNull();
    expect(stored.nationalIdEncrypted).toBeNull();
  });
});
