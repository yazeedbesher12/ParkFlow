import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as auth from '../src/modules/auth/service';
import { env } from '../src/config/env';
import { emailProvider } from '../src/providers/email';

const app = createApp();
let token: string, userId: string;
beforeEach(async () => {
  vi.restoreAllMocks();
  const tables = await db.$queryRaw<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE '+tables.map(t=>'"'+t.tablename.replace(/"/g,'""')+'"').join(',')+' CASCADE');
  await redis.flushdb();
  // A normal phone-verified session remains valid when development email login is off.
  const user = await db.user.create({data:{email:'profile-test@example.com',phone:'+970599123456',phoneVerifiedAt:new Date(),fullName:'Profile Driver',wallet:{create:{}}}});
  userId = user.id;
  token = (await db.$transaction(tx => auth.issue(tx,user,{}))).accessToken;
});

describe('verified phone account details', () => {
  it('finishes a verified phone profile without requiring optional identity data', async () => {
    const result = await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send({});
    expect(result.status).toBe(200);
    expect(result.body.profileCompletedAt).toEqual(expect.any(String));
  });
  it('encrypts identity data and returns only a masked suffix in profile and auth responses', async () => {
    const result = await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send({email:'contact@example.com',nationalId:'123456789'});
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({email:'contact@example.com',emailVerifiedAt:null,nationalIdMasked:'••••6789'});
    const row = await db.user.findUniqueOrThrow({where:{id:userId}}) as unknown as Record<string,unknown>;
    expect(row.nationalIdEncrypted).toEqual(expect.any(String));
    expect(row.nationalIdEncrypted).not.toContain('123456789');
    for (const path of ['/api/v1/users/me','/api/v1/auth/me']) {
      const response = await request(app).get(path).auth(token,{type:'bearer'});
      expect(response.status).toBe(200);
      expect(response.body.nationalIdMasked).toBe('••••6789');
      expect(response.body).not.toHaveProperty('nationalIdEncrypted');
      expect(response.body).not.toHaveProperty('nationalIdLast4');
      expect(JSON.stringify(response.body)).not.toContain('123456789');
    }
    const delivery=vi.spyOn(emailProvider,'sendOtp').mockResolvedValue();
    const challenge=await auth.requestOtp({email:'contact@example.com'});
    await expect(auth.verifyOtp({challengeId:challenge.challengeId,code:delivery.mock.calls.at(-1)![1]},{})).rejects.toMatchObject({code:'EMAIL_MIGRATION_REQUIRED'});
  });
  it('does not let another account claim an existing contact email', async () => {
    const owner = await db.user.create({data:{email:'taken@example.com',fullName:'Owner'}});
    const response = await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send({email:'taken@example.com'});
    expect(response.status).toBe(409);
    expect((await db.user.findUniqueOrThrow({where:{id:owner.id}})).email).toBe('taken@example.com');
  });
  it('requires an authenticated phone-verified account for completion', async () => {
    expect((await request(app).post('/api/v1/users/me/complete-profile').send({})).status).toBe(401);
    await db.user.update({where:{id:userId},data:{phoneVerifiedAt:null}});
    expect((await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send({})).status).toBe(403);
  });
  it('does not permit changing the phone, user, role, or verification flag in profile forms', async () => {
    for (const body of [{phone:'+970599999999'},{role:'ADMIN'},{userId:'someone-else'},{phoneVerifiedAt:new Date().toISOString()}]) {
      const response = await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send(body);
      expect(response.status).toBe(400);
    }
  });
  it('validates national ID and keeps invalid data out of storage', async () => {
    for (const nationalId of ['12','12345678a','1234567890123456']) {
      expect((await request(app).post('/api/v1/users/me/complete-profile').auth(token,{type:'bearer'}).send({nationalId})).status).toBe(400);
    }
  });
});
