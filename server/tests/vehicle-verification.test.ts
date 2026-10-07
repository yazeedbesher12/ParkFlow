import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as auth from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';
import { redis } from '../src/database/redis';
import { db } from '../src/database/client';
import * as vehicles from '../src/modules/vehicles/service';
import * as violations from '../src/modules/violations/service';
import * as roads from '../src/modules/roads/service';

let first: string;
let second: string;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(emailProvider, 'sendOtp').mockResolvedValue();
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  first = (await db.user.create({ data: { fullName: 'First driver' } })).id;
  second = (await db.user.create({ data: { fullName: 'Second driver' } })).id;
  await redis.flushdb();
});

describe('admin verification review', () => {
  const app = createApp();
  async function adminSession(role: 'ADMIN' | 'USER') {
    const challenge = await auth.requestOtp({ email: 'verifier@example.com' });
    const code = vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
    const session = await auth.verifyOtp({ challengeId: challenge.challengeId, code }, {});
    await db.user.update({ where: { id: session.user.id }, data: { role } });
    return session.session.accessToken;
  }
  it('rejects ordinary users attempting to inspect pending vehicle associations', async () => {
    const token = await adminSession('USER');
    expect((await request(app).get('/api/v1/admin/vehicle-verifications').auth(token, { type: 'bearer' })).status).toBe(403);
  });
  it('requires a review reason and records a reversible verification grant', async () => {
    const token = await adminSession('ADMIN');
    const vehicle = await vehicles.create(first, { plateNumber: '3211234', type: 'private' });
    const endpoint = '/api/v1/admin/vehicle-verifications/' + vehicle.linkId;
    expect((await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send({ verified: true, role: 'owner', reason: '' })).status).toBe(400);
    const result = await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send({ verified: true, role: 'owner', reason: 'Registration reviewed in person' });
    expect(result.status).toBe(200);
    expect(result.body.verifiedAt).toBeTruthy();
    expect((await vehicles.get(first, vehicle.id)).role).toBe('owner');
    expect(await db.auditLog.count({ where: { resourceId: vehicle.linkId, resourceType: 'vehicle-verification' } })).toBe(1);
    expect((await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send({ verified: false, role: 'driver', reason: 'Association disputed by the verified owner' })).status).toBe(200);
    await expect(vehicles.permits(first, vehicle.id)).rejects.toMatchObject({ status: 403 });
  });

  it('does not let the legacy grant endpoint bypass the required review reason', async () => {
    const token = await adminSession('ADMIN');
    const vehicle = await vehicles.create(first, { plateNumber: '3211234', type: 'private' });
    const endpoint = `/api/v1/admin/vehicles/${vehicle.id}/users`;
    for (const reason of [undefined, '', 'short', ' '.repeat(20), 'x'.repeat(501)]) {
      expect((await request(app).post(endpoint).auth(token, { type: 'bearer' }).send({ userId: first, role: 'owner', ...(reason === undefined ? {} : { reason }) })).status).toBe(400);
    }
    expect((await db.userVehicle.findUniqueOrThrow({ where: { id: vehicle.linkId } })).verifiedAt).toBeNull();
    expect(await db.auditLog.count({ where: { resourceId: vehicle.linkId } })).toBe(0);
  });

  it('records legacy admin grants in the verification audit with the reviewed evidence reason', async () => {
    const token = await adminSession('ADMIN');
    const vehicle = await vehicles.create(first, { plateNumber: '3211234', type: 'private' });
    const reason = 'Support case CASE-123: delegated access reviewed';
    const response = await request(app).post(`/api/v1/admin/vehicles/${vehicle.id}/users`).auth(token, { type: 'bearer' }).send({ userId: second, role: 'manager', reason });
    expect(response.status).toBe(200);
    const link = await db.userVehicle.findUniqueOrThrow({ where: { userId_vehicleId: { userId: second, vehicleId: vehicle.id } } });
    expect(link.verifiedAt).not.toBeNull();
    expect(link.role).toBe('manager');
    const audit = await db.auditLog.findFirstOrThrow({ where: { resourceType: 'vehicle-verification', resourceId: link.id } });
    expect(audit.action).toBe('verify');
    expect(audit.after).toMatchObject({ userId: second, vehicleId: vehicle.id, reason });
  });

  it('keeps violation notification details away from unverified and revoked plate associations', async () => {
    const token = await adminSession('ADMIN');
    const firstLink = await vehicles.create(first, { plateNumber: '3211234', type: 'private' });
    const secondLink = await vehicles.create(second, { plateNumber: '3211234', type: 'private' });
    await db.userVehicle.update({ where: { id: secondLink.linkId }, data: { verifiedAt: new Date(), role: 'owner' } });
    const body = {
      vehicleId: firstLink.id, type: 'expired_parking', amount: 500,
      locationName: 'Sensitive location', locationNameAr: 'موقع خاص', latitude: 31.9, longitude: 35.2,
      dueAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Sensitive enforcement reason', reasonAr: 'سبب المخالفة',
      issuingAuthority: 'Test', issuingAuthorityAr: 'اختبار',
    };
    const issued = await request(app).post('/api/v1/admin/violations').auth(token, { type: 'bearer' }).send(body);
    expect(issued.status).toBe(200);
    expect(await db.notification.count({ where: { userId: first, type: 'violation_issued' } })).toBe(0);
    expect(await db.outboxEvent.count({ where: { userId: first, topic: 'notification.created' } })).toBe(0);
    expect(await db.notification.count({ where: { userId: second, type: 'violation_issued' } })).toBe(1);
    expect((await db.notification.findFirstOrThrow({ where: { userId: second, type: 'violation_issued' } })).body).toBe(body.reason);
    expect((await request(app).patch(`/api/v1/admin/vehicle-verifications/${secondLink.linkId}`).auth(token, { type: 'bearer' }).send({ verified: false, role: 'driver', reason: 'Delegated permission revoked after review' })).status).toBe(200);
    expect((await request(app).post('/api/v1/admin/violations').auth(token, { type: 'bearer' }).send(body)).status).toBe(200);
    expect(await db.notification.count({ where: { userId: second, type: 'violation_issued' } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { userId: second, topic: 'notification.created' } })).toBe(1);
  });
});

describe('vehicle association is not proof of sensitive access', () => {
  it('does not give an unverified first plate claimant enforcement details', async () => {
    const vehicle = await vehicles.create(first, { plateNumber: '3211234', type: 'private' });
    const violation = await db.violation.create({ data: {
      vehicleId: vehicle.id, plateNumber: '3211234', type: 'expired_parking', amount: 500,
      locationName: 'Test', locationNameAr: 'اختبار', latitude: 31.9, longitude: 35.2,
      dueAt: new Date(Date.now() + 86400000), reason: 'Test', reasonAr: 'اختبار',
      issuingAuthority: 'Test', issuingAuthorityAr: 'اختبار',
    } });
    expect(await violations.list(first)).toEqual([]);
    await expect(violations.get(first, violation.id)).rejects.toMatchObject({ status: 404 });
    await expect(violations.evidence(first, violation.id)).rejects.toMatchObject({ status: 404 });
  });

  it('lets another driver associate a plate without claiming exclusive ownership', async () => {
    const a = await vehicles.create(first, { plateNumber: '3211234', type: 'private', make: 'Initial' });
    const b = await vehicles.create(second, { plateNumber: '3211234', type: 'private', make: 'Attempted overwrite' });
    expect(b.id).toBe(a.id);
    expect(b.role).toBe('driver');
    expect(b.make).toBe('Initial');
    await expect(vehicles.update(second, b.id, { make: 'Changed' })).rejects.toMatchObject({ status: 403 });
    await expect(vehicles.permits(second, b.id)).rejects.toMatchObject({ status: 403 });
  });

  it('does not expose stable reporter identifiers in the legacy feed', async () => {
    const checkpoint = await db.roadCheckpoint.create({ data: { nameEn: 'Test', nameAr: 'اختبار', latitude: 31.9, longitude: 35.2 } });
    await db.checkpointReport.create({ data: { userId: first, checkpointId: checkpoint.id, status: 'open' } });
    const feed = await roads.feed();
    expect(feed).toHaveLength(1);
    expect(feed[0]).not.toHaveProperty('userId');
    expect(feed[0]).toMatchObject({ checkpointId: checkpoint.id, status: 'open' });
  });
});
