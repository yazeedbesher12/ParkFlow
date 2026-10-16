import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { atomic, db } from '../src/database/client';
import * as auth from '../src/modules/auth/service';

const app = createApp();
const userIds: string[] = [];

async function account(role: Role = 'USER') {
  const user = await db.user.create({data: {email: `session-binding-${randomUUID()}@example.com`, role, emailVerifiedAt: new Date()}});
  userIds.push(user.id);
  const session = await atomic(tx => auth.issue(tx, user, {}));
  const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
  return {user, session, sid: claims.sid as string};
}

function mismatchedAccessToken(userId: string, sid: string) {
  return jwt.sign({sub: userId, sid, kind: 'access'}, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', issuer: 'parkflow', audience: 'parkflow-api', expiresIn: 900,
  });
}

// Report only the decision so a failing assertion never prints credentials.
const outcome = (operation: Promise<unknown>) => operation.then(
  () => ({allowed: true}),
  error => ({status: error.status, code: error.code}),
);

afterAll(async () => {
  await db.refreshToken.deleteMany({where: {userId: {in: userIds}}});
  await db.user.deleteMany({where: {id: {in: userIds}}});
});

describe('access-token session identity binding', () => {
  it.each(['USER', 'ADMIN', 'PARKING_OPERATOR', 'ENFORCEMENT_OFFICER'] as const)(
    'rejects another account subject using an active %s session',
    async role => {
      const owner = await account(role);
      const victim = await account();
      await expect(auth.authenticate(owner.session.accessToken)).resolves.toMatchObject({userId: owner.user.id, role});
      const forged = mismatchedAccessToken(victim.user.id, owner.sid);
      expect(await outcome(auth.authenticate(forged))).toEqual({status: 401, code: 'UNAUTHORIZED'});
      // Rejecting a mismatch must not revoke the legitimate owner's session.
      await expect(auth.authenticate(owner.session.accessToken)).resolves.toMatchObject({userId: owner.user.id, role});
    },
  );

  it('does not expose another user through the authenticated profile endpoint', async () => {
    const owner = await account();
    const victim = await account();
    const response = await request(app).get('/api/v1/auth/me')
      .auth(mismatchedAccessToken(victim.user.id, owner.sid), {type: 'bearer'});
    expect(response.status).toBe(401);
    expect(response.body.error?.code).toBe('UNAUTHORIZED');
    expect(response.body).not.toHaveProperty('email');
  });
});
