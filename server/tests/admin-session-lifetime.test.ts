import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { atomic, db } from '../src/database/client';
import * as auth from '../src/modules/auth/service';

const userIds: string[] = [];
const EIGHT_HOURS = 8 * 60 * 60_000;

async function family(role: 'ADMIN' | 'USER' = 'ADMIN') {
  const user = await db.user.create({ data: { email: `admin-expiry-${randomUUID()}@example.com`, role } });
  userIds.push(user.id);
  const session = await atomic((tx) => auth.issue(tx, user, {}));
  const record = await db.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
  return { user, session, record };
}

// Failed assertions must never print access/refresh credentials.
async function outcome(operation: Promise<unknown>) {
  return operation.then(() => ({ allowed: true }), (error) => ({ status: error.status, code: error.code }));
}

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('admin absolute session lifetime', () => {
  it('allows an admin family before eight hours and preserves its original start through rotation', async () => {
    const { user, session, record } = await family();
    const originalStart = new Date(Date.now() - EIGHT_HOURS + 10 * 60_000);
    await db.refreshToken.update({ where: { id: record.id }, data: { createdAt: originalStart } });
    await expect(auth.authenticate(session.accessToken)).resolves.toMatchObject({ userId: user.id, role: 'ADMIN' });
    const rotated = await auth.refresh(session.refreshToken, {});
    await expect(auth.authenticate(rotated.accessToken)).resolves.toMatchObject({ userId: user.id, role: 'ADMIN' });
    const origin = await db.refreshToken.findFirstOrThrow({ where: { familyId: record.familyId }, orderBy: { createdAt: 'asc' } });
    expect(origin.createdAt).toEqual(originalStart);
    expect(await db.refreshToken.count({ where: { familyId: record.familyId } })).toBe(2);
  });

  it('denies access at eight hours and commits revocation of every rotated family token', async () => {
    const { session, record } = await family();
    const rotated = await auth.refresh(session.refreshToken, {});
    await db.refreshToken.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - EIGHT_HOURS) } });
    expect(await outcome(auth.authenticate(rotated.accessToken))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    expect(await db.refreshToken.count({ where: { familyId: record.familyId, revokedAt: null } })).toBe(0);
    expect(await outcome(auth.refresh(rotated.refreshToken, {}))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    expect(await outcome(auth.authenticate(session.accessToken))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('denies a refresh after eight hours without issuing a new token or rolling back revocation', async () => {
    const { session, record } = await family();
    const rotated = await auth.refresh(session.refreshToken, {});
    await db.refreshToken.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - EIGHT_HOURS - 60_000) } });
    expect(await outcome(auth.refresh(rotated.refreshToken, {}))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    expect(await db.refreshToken.count({ where: { familyId: record.familyId } })).toBe(2);
    expect(await db.refreshToken.count({ where: { familyId: record.familyId, revokedAt: null } })).toBe(0);
    expect(await outcome(auth.authenticate(rotated.accessToken))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('does not apply the admin lifetime to ordinary user sessions', async () => {
    const { user, session, record } = await family('USER');
    await db.refreshToken.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - 2 * EIGHT_HOURS) } });
    const rotated = await auth.refresh(session.refreshToken, {});
    await expect(auth.authenticate(rotated.accessToken)).resolves.toMatchObject({ userId: user.id, role: 'USER' });
    expect(await db.refreshToken.count({ where: { familyId: record.familyId, revokedAt: null } })).toBe(1);
  });

  it('allows a newly authenticated family after a previous admin family has expired', async () => {
    const { user, session, record } = await family();
    await db.refreshToken.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - EIGHT_HOURS) } });
    const fresh = await atomic((tx) => auth.issue(tx, user, {}));
    expect(await outcome(auth.authenticate(session.accessToken))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    await expect(auth.authenticate(fresh.accessToken)).resolves.toMatchObject({ userId: user.id, role: 'ADMIN' });
    const rotated = await auth.refresh(fresh.refreshToken, {});
    await expect(auth.authenticate(rotated.accessToken)).resolves.toMatchObject({ userId: user.id, role: 'ADMIN' });
  });
});
