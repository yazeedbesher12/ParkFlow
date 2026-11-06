import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as auth from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';
import { decryptProfile } from '../src/modules/users/healthProfile';
import { routingService } from '../src/modules/routing/service';

const app = createApp();
const mobility = { avoidHighways: false, preferSmootherRoads: false, accessibleParking: false, stepFreeAccess: false };
async function login(email = `${randomUUID()}@health.example`) {
  const challenge = await auth.requestOtp({ email });
  const code = vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
  return auth.verifyOtp({ challengeId: challenge.challengeId, code }, {});
}
beforeEach(() => { vi.spyOn(emailProvider, 'sendOtp').mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('private consent-based health profiles', () => {
  it('onboards legacy accounts on login and preserves completion on later OTP logins', async () => {
    const email = `${randomUUID()}@health.example`;
    await db.user.create({ data: { email, emailVerifiedAt: new Date(), fullName: 'Existing User' } });
    const legacy = await login(email);
    expect(legacy.isNewUser).toBe(false);
    expect(legacy.user.healthProfileCompletedAt).toBeNull();
    await request(app).patch('/api/v1/users/me/health-profile').set('Authorization', `Bearer ${legacy.session.accessToken}`)
      .send({ conditions: ['prefer_not_to_disclose'], mobility, consent: false }).expect(200);
    await redis.del(`otp:email:cooldown:${email}`);
    const returning = await login(email);
    expect(returning.user.healthProfileCompletedAt).toBeInstanceOf(Date);
    expect(await db.healthProfile.count({ where: { userId: legacy.user.id } })).toBe(0);
  });

  it('starts incomplete after OTP, encrypts selections, and never puts health data in the user DTO', async () => {
    const account = await login();
    expect(account.user.healthProfileCompletedAt).toBeNull();
    const token = `Bearer ${account.session.accessToken}`;
    const body = { conditions: ['diabetes', 'hypertension'], mobility, consent: true };
    const saved = await request(app).patch('/api/v1/users/me/health-profile').set('Authorization', token).send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.healthProfileCompletedAt).toBeTruthy();
    expect(saved.body).not.toHaveProperty('conditions');
    expect(saved.body).not.toHaveProperty('healthProfile');
    const row = await db.healthProfile.findUniqueOrThrow({ where: { userId: account.user.id } });
    expect(row.ciphertext).not.toContain('diabetes');
    expect(row.ciphertext).not.toContain('avoidHighways');
    expect(decryptProfile(account.user.id, row.ciphertext)).toMatchObject(body);
    expect(() => decryptProfile('different-owner', row.ciphertext)).toThrow();
    const read = await request(app).get('/api/v1/users/me/health-profile').set('Authorization', token);
    expect(read.body.profile).toMatchObject({ ...body, consentVersion: 1 });
    expect(read.body.profile.consentedAt).toBeTruthy();
    expect(read.headers['cache-control']).toBe('no-store');
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', token);
    expect(me.body.healthProfileCompletedAt).toBe(saved.body.healthProfileCompletedAt);
    expect(JSON.stringify(me.body)).not.toContain('diabetes');
  });

  it('completes without consent or stored medical/mobility selections; deletion does not repeat onboarding', async () => {
    const { user, session } = await login();
    const token = `Bearer ${session.accessToken}`;
    const path = '/api/v1/users/me/health-profile';
    const declined = await request(app).patch(path).set('Authorization', token).send({ conditions: ['diabetes'], mobility: { ...mobility, avoidHighways: true }, consent: false });
    expect(declined.status).toBe(200);
    expect(declined.body.healthProfileCompletedAt).toBeTruthy();
    expect(await db.healthProfile.count({ where: { userId: user.id } })).toBe(0);
    await request(app).patch(path).set('Authorization', token).send({ conditions: ['prefer_not_to_disclose'], mobility: { ...mobility, avoidHighways: true }, consent: true }).expect(200);
    expect(await db.healthProfile.count({ where: { userId: user.id } })).toBe(1);
    const deleted = await request(app).delete(path).set('Authorization', token).expect(200);
    expect(deleted.body.healthProfileCompletedAt).toBeTruthy();
    expect(await db.healthProfile.count({ where: { userId: user.id } })).toBe(0);
    expect((await request(app).get(path).set('Authorization', token)).body).toEqual({ profile: null });
  });

  it('requires authentication, isolates owners, and rejects contradictory, empty or forged selections', async () => {
    const path = '/api/v1/users/me/health-profile';
    await request(app).get(path).expect(401);
    await request(app).patch(path).send({}).expect(401);
    await request(app).delete(path).expect(401);
    const first = await login(), second = await login();
    const token = `Bearer ${first.session.accessToken}`;
    for (const conditions of [[], ['none', 'diabetes'], ['prefer_not_to_disclose', 'disability'], ['diabetes', 'diabetes']]) {
      await request(app).patch(path).set('Authorization', token).send({ conditions, mobility, consent: true }).expect(400);
    }
    await request(app).patch(path).set('Authorization', token).send({ conditions: ['none'], mobility, consent: true, userId: second.user.id }).expect(400);
    await request(app).patch(path).set('Authorization', token).send({ conditions: ['diabetes'], mobility, consent: true }).expect(200);
    const other = await request(app).get(path).set('Authorization', `Bearer ${second.session.accessToken}`);
    expect(other.body.profile).toBeNull();
  });

  it('automatically uses only saved mobility preferences for authenticated route planning, then removes them on deletion', async () => {
    const account = await login();
    const token = `Bearer ${account.session.accessToken}`;
    await request(app).patch('/api/v1/users/me/health-profile').set('Authorization', token)
      .send({ conditions: ['diabetes', 'disability'], mobility: { ...mobility, avoidHighways: true }, consent: true }).expect(200);
    const route = vi.spyOn(routingService, 'getRoute').mockResolvedValue({} as never);
    const body = { origin: { latitude: 31.9, longitude: 35.2 }, destination: { latitude: 31.91, longitude: 35.21 } };
    await request(app).post('/api/v1/routes/plan').set('Authorization', token).send(body).expect(200);
    expect(route.mock.calls[0]![2]).toEqual({ ...body, mobility: { ...mobility, avoidHighways: true } });
    expect(JSON.stringify(route.mock.calls[0])).not.toContain('diabetes');
    await request(app).delete('/api/v1/users/me/health-profile').set('Authorization', token).expect(200);
    await request(app).post('/api/v1/routes/plan').set('Authorization', token).send(body).expect(200);
    expect(route.mock.calls[1]![2]?.mobility).toBeUndefined();
  });
});
