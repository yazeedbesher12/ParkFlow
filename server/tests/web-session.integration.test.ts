import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { db, atomic } from '../src/database/client';
import { redis } from '../src/database/redis';
import { emailProvider } from '../src/providers/email';
import * as authentication from '../src/modules/auth/service';
import { env } from '../src/config/env';

const app = createApp();
const users: string[] = [];
const delivered = new Map<string, string>();
vi.spyOn(emailProvider, 'sendOtp').mockImplementation(async (email, code) => { delivered.set(email, code); });
type Application = 'customer' | 'management';
const cookieLines = (response: any): string[] => {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};
const origin = (application: Application) => `http://localhost:${application === 'customer' ? 8081 : 8082}`;
const header = (application: Application, session?: any) => ({
  Origin: origin(application), 'X-ParkFlow-App': application,
  ...(session ? { 'X-ParkFlow-Session': session.sessionId, 'X-ParkFlow-Login': session.loginId, 'X-ParkFlow-CSRF': session.csrfToken } : {}),
});
class Jar {
  values = new Map<string, string>();
  absorb(response: any) {
    for (const line of cookieLines(response)) {
      const [pair] = line.split(';'); const at = pair.indexOf('=');
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(line)) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  get cookie() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
}
function credential(jar: Jar, session: any, kind: 'access' | 'refresh') {
  const entry = [...jar.values].find(([name]) => name.endsWith(`-${session.loginId}-${kind}`));
  if (!entry) throw new Error('Expected test credential is missing');
  return entry;
}
function cloned(jar: Jar) { const copy = new Jar(); copy.values = new Map(jar.values); return copy; }
function signedAccess(token: string, changed: Record<string, string>) {
  const { iat: _iat, exp: _exp, iss: _iss, aud: _aud, ...claims } = jwt.decode(token) as jwt.JwtPayload;
  return jwt.sign({ ...claims, ...changed }, env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', issuer: 'parkflow', audience: 'parkflow-api', expiresIn: 900 });
}
async function account(role: 'USER' | 'ADMIN' | 'PARKING_OPERATOR' = 'USER') {
  const user = await db.user.create({ data: { email: `web-${randomUUID()}@example.com`, fullName: 'Web test', role, emailVerifiedAt: new Date(), profileCompletedAt: new Date() } });
  users.push(user.id); return user;
}
async function challenge(user: Awaited<ReturnType<typeof account>>, application: Application, jar: Jar) {
  const response = await request(app).post('/api/v1/auth/request-otp').set(header(application)).set('Cookie', jar.cookie).send({ email: user.email, purpose: 'login' });
  expect(response.status).toBe(200);
  return { challengeId: response.body.challengeId, code: delivered.get(user.email!)! };
}
async function bootstrap(application: Application, jar: Jar) {
  const response = await request(app).get('/api/v1/auth/web-session/bootstrap').set(header(application)).set('Cookie', jar.cookie);
  expect(response.status).toBe(200); jar.absorb(response); return response;
}
async function login(user: Awaited<ReturnType<typeof account>>, application: Application, jar: Jar) {
  await bootstrap(application, jar);
  const input = await challenge(user, application, jar);
  const response = await request(app).post('/api/v1/auth/verify-otp').set(header(application)).set('Cookie', jar.cookie).send(input);
  expect(response.status).toBe(200); jar.absorb(response); return response;
}
beforeEach(async () => { const keys = await redis.keys('rate:*'); if (keys.length) await redis.del(...keys); });
afterAll(async () => { await db.refreshToken.deleteMany({ where: { userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); });

describe('HttpOnly browser sessions', () => {
  it('delivers token-free metadata and strict HttpOnly cookies, then restores from server proof', async () => {
    const user = await account(); const jar = new Jar(); const response = await login(user, 'customer', jar);
    expect(Object.keys(response.body.session).sort()).toEqual(['csrfToken', 'expiresAt', 'loginId', 'sessionId', 'transport', 'userId']);
    expect(response.body.session.transport).toBe('cookie');
    const options = cookieLines(response).map(line => line.split(';').slice(1).join(';').toLowerCase());
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const value of options) { expect(value).toContain('httponly'); expect(value).toContain('samesite=strict'); expect(value).toContain('path=/'); expect(value).not.toContain('domain='); }
    const restored = await bootstrap('customer', jar);
    expect(restored.body.session.sessionId).toBe(response.body.session.sessionId);
    expect(restored.body.user.id).toBe(user.id);
    const me = await request(app).get('/api/v1/auth/me').set(header('customer', response.body.session)).set('Cookie', jar.cookie);
    expect(me.status).toBe(200); expect(me.body.id).toBe(user.id);
  });
  it('keeps customer and management sessions independent on the same cookie host', async () => {
    const jar = new Jar(); const customer = await account(); const administrator = await account('ADMIN');
    const first = await login(customer, 'customer', jar); const staff = await login(administrator, 'management', jar);
    const me = await request(app).get('/api/v1/auth/me').set(header('customer', first.body.session)).set('Cookie', jar.cookie);
    const admin = await request(app).get('/api/v1/admin/users').set(header('management', staff.body.session)).set('Cookie', jar.cookie);
    expect(me.status).toBe(200); expect(me.body.id).toBe(customer.id); expect(admin.status).toBe(200);
    const mismatch = await request(app).get('/api/v1/admin/users').set(header('customer', staff.body.session)).set('Cookie', jar.cookie);
    expect(mismatch.status).not.toBe(200);
  });
  it('requires expected identity, correct app/origin, and CSRF even on multipart changes', async () => {
    const jar = new Jar(); const response = await login(await account(), 'customer', jar); const session = response.body.session;
    const noIdentity = await request(app).get('/api/v1/auth/me').set(header('customer')).set('Cookie', jar.cookie);
    expect(noIdentity.status).toBe(403);
    const crossApp = await request(app).get('/api/v1/auth/me').set({ ...header('customer', session), 'X-ParkFlow-App': 'management' }).set('Cookie', jar.cookie);
    expect(crossApp.status).toBe(403);
    const noOrigin = await request(app).get('/api/v1/auth/me').set('Cookie', jar.cookie);
    expect(noOrigin.status).toBe(401);
    const bad = await request(app).patch('/api/v1/users/me').set({ ...header('customer', session), 'X-ParkFlow-CSRF': 'invalid' }).set('Cookie', jar.cookie).send({ fullName: 'Unwanted change' });
    expect(bad.status).toBe(403);
    const multipart = await request(app).post('/api/v1/uploads').set({ ...header('customer', session), 'X-ParkFlow-CSRF': 'invalid' }).set('Cookie', jar.cookie).attach('file', Buffer.from('test'), 'test.txt');
    expect(multipart.status).toBe(403);
    const valid = await request(app).patch('/api/v1/users/me').set(header('customer', session)).set('Cookie', jar.cookie).send({ fullName: 'Allowed change' });
    expect(valid.status).toBe(200);
  });
  it('rejects browser native-mode issuance before consuming the email challenge', async () => {
    const jar = new Jar(); const user = await account(); await bootstrap('customer', jar); const input = await challenge(user, 'customer', jar);
    const bad = await request(app).post('/api/v1/auth/verify-otp').set('Origin', origin('customer')).set('Cookie', jar.cookie).send(input);
    expect(bad.status).toBe(403); expect(bad.body).not.toHaveProperty('session');
    const good = await request(app).post('/api/v1/auth/verify-otp').set(header('customer')).set('Cookie', jar.cookie).send(input);
    expect(good.status).toBe(200); expect(good.body.session.transport).toBe('cookie');
  });
  it('preserves native bearer authentication and refresh without setting browser credentials', async () => {
    const user = await account(); const native = await atomic(tx => authentication.issue(tx, user, {}));
    const me = await request(app).get('/api/v1/auth/me').auth(native.accessToken, { type: 'bearer' });
    expect(me.status).toBe(200);
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: native.refreshToken });
    expect(refreshed.status).toBe(200); expect(refreshed.body.accessToken).toBeTypeOf('string'); expect(refreshed.headers['set-cookie']).toBeUndefined();
  });
  it('rejects a stale action after another login and ignores late cookies from the older family', async () => {
    const jar = new Jar(); const old = await login(await account(), 'customer', jar); const nextUser = await account(); const next = await login(nextUser, 'customer', jar);
    jar.absorb(old); // Actual Set-Cookie application occurs before JavaScript sees a stale response.
    const stale = await request(app).patch('/api/v1/users/me').set(header('customer', old.body.session)).set('Cookie', jar.cookie).send({ fullName: 'Old action' });
    expect(stale.status).toBe(401); expect(stale.body.error.code).toBe('SESSION_CHANGED');
    const restored = await bootstrap('customer', jar); expect(restored.body.user.id).toBe(nextUser.id); expect(restored.body.session.loginId).toBe(next.body.session.loginId);
    const me = await request(app).get('/api/v1/auth/me').set(header('customer', next.body.session)).set('Cookie', jar.cookie); expect(me.status).toBe(200);
  });
  it('conditionally cleans a canceled older login without clearing the newer family', async () => {
    const jar = new Jar(); const older = await login(await account(), 'customer', jar);
    const stopped = await request(app).post('/api/v1/auth/web-session/logout').set(header('customer', older.body.session)).set('Cookie', jar.cookie).send({});
    expect(stopped.status).toBe(200);
    const user = await account(); const newer = await login(user, 'customer', jar);
    jar.absorb(stopped); // A delayed clear-cookie response must only name the old family.
    const me = await request(app).get('/api/v1/auth/me').set(header('customer', newer.body.session)).set('Cookie', jar.cookie);
    expect(me.status).toBe(200); expect(me.body.id).toBe(user.id);
    const oldCleanup = await request(app).post('/api/v1/auth/web-session/logout').set(header('customer', older.body.session)).set('Cookie', jar.cookie).send({});
    expect([200, 401]).toContain(oldCleanup.status); jar.absorb(oldCleanup);
    const still = await request(app).get('/api/v1/auth/me').set(header('customer', newer.body.session)).set('Cookie', jar.cookie); expect(still.status).toBe(200);
  });
  it('rotates browser sessions, rejects old actions, and can sign out the rotated family', async () => {
    const jar = new Jar(); const first = await login(await account(), 'customer', jar);
    const refresh = await request(app).post('/api/v1/auth/refresh').set(header('customer', first.body.session)).set('Cookie', jar.cookie).send({});
    expect(refresh.status).toBe(200); jar.absorb(refresh); expect(refresh.body.sessionId).not.toBe(first.body.session.sessionId); expect(refresh.body.loginId).toBe(first.body.session.loginId);
    const stale = await request(app).get('/api/v1/auth/me').set(header('customer', first.body.session)).set('Cookie', jar.cookie); expect(stale.status).toBe(401); expect(stale.body.error.code).toBe('SESSION_CHANGED');
    const latest = await bootstrap('customer', jar); expect(latest.body.session.sessionId).toBe(refresh.body.sessionId);
    const logout = await request(app).post('/api/v1/auth/web-session/logout').set(header('customer', first.body.session)).set('Cookie', jar.cookie).send({});
    expect(logout.status).toBe(200); jar.absorb(logout);
    expect((await bootstrap('customer', jar)).body.session).toBeNull();
  });
  it('checks revocation and the administrator absolute deadline during bootstrap', async () => {
    const jar = new Jar(); const admin = await login(await account('ADMIN'), 'management', jar);
    await db.refreshToken.updateMany({ where: { familyId: admin.body.session.loginId }, data: { createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000) } });
    expect((await bootstrap('management', jar)).body.session).toBeNull();
    expect(await db.refreshToken.count({ where: { familyId: admin.body.session.loginId, revokedAt: null } })).toBe(0);
  });
  it('rejects copied cookie JWTs through native transport without revoking their live family', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const session = signed.body.session;
    const access = credential(jar, session, 'access')[1], refresh = credential(jar, session, 'refresh')[1];
    const bearer = await request(app).get('/api/v1/auth/me').auth(access, { type: 'bearer' });
    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    expect(bearer.status).toBe(401); expect(rotated.status).toBe(401);
    expect(rotated.headers['set-cookie']).toBeUndefined();
    expect(await db.refreshToken.count({ where: { familyId: session.loginId, revokedAt: null } })).toBe(1);
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', session)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('checks signed access application, browser, and family claims against the selected cookie session', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const session = signed.body.session;
    const [name, token] = credential(jar, session, 'access');
    const changes: Array<Record<string, string>> = [
      { webApplication: 'management' }, { webBrowserId: authentication.digest('another-browser') }, { familyId: randomUUID() },
    ];
    for (const changed of changes) {
      const forged = cloned(jar); forged.values.set(name, signedAccess(token, changed));
      const rejected = await request(app).get('/api/v1/auth/me').set(header('customer', session)).set('Cookie', forged.cookie);
      expect(rejected.status).toBe(401); expect(rejected.body).not.toHaveProperty('email');
    }
    expect(await db.refreshToken.count({ where: { familyId: session.loginId, revokedAt: null } })).toBe(1);
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', session)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('rejects duplicate browser, access, and refresh cookie names without clearing the selected login', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const session = signed.body.session;
    const browser = [...jar.values].find(([name]) => name.endsWith('-customer-browser'))!;
    for (const [name, value] of [browser, credential(jar, session, 'access'), credential(jar, session, 'refresh')]) {
      const denied = await request(app).get('/api/v1/auth/me').set(header('customer', session)).set('Cookie', `${jar.cookie}; ${name}=${value}`);
      expect(denied.status).toBe(403); expect(denied.headers['set-cookie']).toBeUndefined();
    }
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', session)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('cannot bootstrap from a browser id alone and retains the current signed credential proof', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const onlyBrowser = cloned(jar);
    for (const name of [...onlyBrowser.values.keys()]) if (!name.endsWith('-browser')) onlyBrowser.values.delete(name);
    expect((await bootstrap('customer', onlyBrowser)).body).toEqual({ session: null, user: null });
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', signed.body.session)).set('Cookie', jar.cookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', signed.body.session))).status).toBe(401);
  });
  it('bootstraps an expired access deadline from the actual refresh cookie when access is missing', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const session = signed.body.session;
    jar.values.delete(credential(jar, session, 'access')[0]);
    const restored = await bootstrap('customer', jar);
    expect(restored.body.session.loginId).toBe(session.loginId); expect(restored.body.session.sessionId).toBe(session.sessionId);
    expect(Date.parse(restored.body.session.expiresAt)).toBeLessThan(Date.now());
    const refresh = await request(app).post('/api/v1/auth/refresh').set(header('customer', restored.body.session)).set('Cookie', jar.cookie).send({});
    expect(refresh.status).toBe(200); jar.absorb(refresh);
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', refresh.body)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('serializes simultaneous rotation and denies the stale nonce without revoking the winner', async () => {
    const jar = new Jar(); const signed = await login(await account(), 'customer', jar); const session = signed.body.session;
    const results = await Promise.all([0, 1].map(() => request(app).post('/api/v1/auth/refresh').set(header('customer', session)).set('Cookie', jar.cookie).send({})));
    expect(results.map(result => result.status).sort()).toEqual([200, 401]);
    const winner = results.find(result => result.status === 200)!;
    const stale = results.find(result => result.status === 401)!;
    expect(stale.body.error.code).toBe('SESSION_CHANGED'); expect(stale.headers['set-cookie']).toBeUndefined();
    expect(await db.refreshToken.count({ where: { familyId: session.loginId, revokedAt: null } })).toBe(1);
    expect(await db.refreshToken.count({ where: { familyId: session.loginId } })).toBe(2);
    jar.absorb(winner); jar.absorb(stale);
    expect((await request(app).get('/api/v1/auth/me').set(header('customer', winner.body)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('cannot publish, clear cookies, or revoke the newer login after losing its publication mutex', async () => {
    const jar = new Jar(); await login(await account(), 'customer', jar);
    const olderUser = await account(), input = await challenge(olderUser, 'customer', jar);
    const newerUser = await account();
    const browser = [...jar.values].find(([name]) => name.endsWith('-customer-browser'))![1];
    const key = `web:lock:customer:${authentication.digest(browser)}`;
    let signalIssued!: () => void, unblock!: () => void;
    const issued = new Promise<void>(resolve => { signalIssued = resolve; });
    const stalled = new Promise<void>(resolve => { unblock = resolve; });
    const original = authentication.verifyOtp;
    const paused = vi.spyOn(authentication, 'verifyOtp').mockImplementationOnce(async (...args) => {
      const result = await original(...args); signalIssued(); await stalled; return result;
    });
    const pending = request(app).post('/api/v1/auth/verify-otp').set(header('customer')).set('Cookie', jar.cookie).send(input).then(value => value);
    try {
      await issued; await redis.del(key); // Simulate a lease expiring while issuance is still awaited.
      const newer = await login(newerUser, 'customer', jar);
      await redis.set(key, 'new-operation-owner', 'PX', 30000);
      unblock(); const older = await pending;
      expect(older.status).toBe(401); expect(older.body.error.code).toBe('SESSION_CHANGED');
      expect(older.headers['set-cookie']).toBeUndefined(); jar.absorb(older);
      expect(await redis.get(key)).toBe('new-operation-owner');
      expect(await db.refreshToken.count({ where: { userId: olderUser.id, revokedAt: null } })).toBe(0);
      expect(await db.refreshToken.count({ where: { familyId: newer.body.session.loginId, revokedAt: null } })).toBe(1);
      const current = await bootstrap('customer', jar);
      expect(current.body.user.id).toBe(newerUser.id); expect(current.body.session.loginId).toBe(newer.body.session.loginId);
      expect((await request(app).get('/api/v1/auth/me').set(header('customer', newer.body.session)).set('Cookie', jar.cookie)).status).toBe(200);
    } finally { unblock(); paused.mockRestore(); await pending.catch(() => undefined); await redis.del(key); }
  });
});
