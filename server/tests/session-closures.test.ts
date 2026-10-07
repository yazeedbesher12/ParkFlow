import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/database/client';
import * as sessions from '../src/modules/sessions/service';
import { byCode, getZone, listZones } from '../src/modules/parking/service';

const operatorId = `session-closures-${randomUUID()}`;

async function fixture() {
  const suffix = randomUUID();
  const userId = `closure-user-${suffix}`;
  const zoneId = `closure-zone-${suffix}`;
  await db.user.create({ data: { id: userId, email: `${suffix}@example.com`, wallet: { create: { balance: 10000 } } } });
  const vehicle = await db.vehicle.create({ data: { plateNumber: suffix, type: 'private', users: { create: { userId, role: 'driver' } } } });
  await db.parkingZone.create({ data: {
    id: zoneId, operatorId, code: zoneId.toUpperCase(), name: 'Session closures', nameAr: 'إغلاق الموقف',
    city: 'Ramallah', cityAr: 'رام الله', latitude: 31.9, longitude: 35.2, kind: 'garage',
    active: true, lifecycle: 'published', parkingAllowed: true,
    defaultMode: 'prepaid', supportedModes: ['prepaid', 'start_stop'], supportedEntryMethods: ['manual'],
    tariffs: { create: { name: 'Original price', hourlyRate: 600, incrementMinutes: 15, freeMinutes: 0, minimumCharge: 0, maxStayMinutes: 240, validFrom: new Date('2020-01-01') } },
    operatingHours: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '00:00' })) },
  } });
  return { userId, zoneId, input: { vehicleId: vehicle.id, zoneId, mode: 'prepaid' as const, durationMinutes: 30, entryMethod: 'manual' } };
}

async function resetTestDatabase() {
  // Financial rows cannot be deleted: use the same isolated-DB reset as core tests.
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Refusing a non-test database');
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map((table) => '"' + table.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
}

beforeAll(async () => {
  await resetTestDatabase();
  await db.parkingOperator.create({ data: { id: operatorId, name: 'Closure test operator' } });
});
afterAll(resetTestDatabase);

describe('parking session availability', () => {
  it('rejects a prepaid interval crossing a dated closure without charging', async () => {
    const { userId, zoneId, input } = await fixture();
    await db.parkingClosure.create({ data: { zoneId, startsAt: new Date(Date.now() + 15 * 60000), endsAt: new Date(Date.now() + 90 * 60000), reason: 'Scheduled maintenance' } });
    await expect(sessions.start(userId, input, randomUUID())).rejects.toMatchObject({ code: 'PARKING_CLOSED' });
    expect(await db.parkingSession.count({ where: { userId } })).toBe(0);
    expect(await db.walletTransaction.count({ where: { wallet: { userId } } })).toBe(0);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(10000);
  });

  it('rejects starting metered parking during a dated closure', async () => {
    const { userId, zoneId, input } = await fixture();
    await db.parkingClosure.create({ data: { zoneId, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60 * 60000), reason: 'Closed now' } });
    await expect(sessions.start(userId, { ...input, mode: 'start_stop', durationMinutes: undefined }, randomUUID())).rejects.toMatchObject({ code: 'PARKING_CLOSED' });
    expect(await db.parkingSession.count({ where: { userId } })).toBe(0);
  });

  it.each([
    { name: 'inactive', active: false, lifecycle: 'published' },
    { name: 'draft', active: true, lifecycle: 'draft' },
    { name: 'archived', active: true, lifecycle: 'archived' },
  ])('rejects new sessions in an $name zone', async ({ active, lifecycle }) => {
    const { userId, zoneId, input } = await fixture();
    await db.parkingZone.update({ where: { id: zoneId }, data: { active, lifecycle } });
    await expect(sessions.start(userId, input, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.parkingSession.count({ where: { userId } })).toBe(0);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(10000);
  });

  it('rejects extensions crossing a closure without changing the session or charging', async () => {
    const { userId, zoneId, input } = await fixture();
    const session = await sessions.start(userId, input, randomUUID());
    await db.parkingClosure.create({ data: { zoneId, startsAt: new Date(session.endsAt!.getTime() + 15 * 60000), endsAt: new Date(session.endsAt!.getTime() + 60 * 60000), reason: 'Scheduled maintenance' } });
    await expect(sessions.extend(userId, session.id, 30, randomUUID())).rejects.toMatchObject({ code: 'PARKING_CLOSED' });
    expect(await db.parkingSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ endsAt: session.endsAt, currentCost: 300 });
    expect(await db.walletTransaction.count({ where: { parkingSessionId: session.id } })).toBe(1);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(9700);
  });

  it('allows an extension ending exactly when a closure starts and keeps the original tariff', async () => {
    const { userId, zoneId, input } = await fixture();
    const session = await sessions.start(userId, input, randomUUID());
    const closureStart = new Date(session.endsAt!.getTime() + 15 * 60000);
    await db.parkingClosure.create({ data: { zoneId, startsAt: closureStart, endsAt: new Date(closureStart.getTime() + 60 * 60000), reason: 'Scheduled maintenance' } });
    await db.parkingTariff.updateMany({ where: { zoneId }, data: { hourlyRate: 900 } });
    expect(await sessions.extend(userId, session.id, 15, randomUUID())).toMatchObject({ endsAt: closureStart, currentCost: 450 });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(9550);
  });

  it.each([
    { name: 'inactive', active: false, lifecycle: 'published' },
    { name: 'draft', active: true, lifecycle: 'draft' },
  ])('rejects extensions after a zone becomes $name', async ({ active, lifecycle }) => {
    const { userId, zoneId, input } = await fixture();
    const session = await sessions.start(userId, input, randomUUID());
    await db.parkingZone.update({ where: { id: zoneId }, data: { active, lifecycle } });
    await expect(sessions.extend(userId, session.id, 15, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.parkingSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ endsAt: session.endsAt, currentCost: 300 });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(9700);
  });
});

describe('public parking lifecycle', () => {
  it('includes management closures in public details and recommendations data', async () => {
    const { zoneId } = await fixture();
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 60 * 60_000);
    await db.parkingClosure.create({ data: { zoneId, startsAt, endsAt, reason: 'Maintenance' } });
    expect((await getZone(zoneId)).closures).toEqual([expect.objectContaining({ startsAt, endsAt })]);
    expect((await listZones({ search: zoneId }))[0].closures).toEqual([expect.objectContaining({ reason: 'Maintenance' })]);
  });

  it('shows an active published zone in search, details and code lookup', async () => {
    const { zoneId } = await fixture();
    expect(await listZones({ search: zoneId })).toEqual([expect.objectContaining({ id: zoneId })]);
    await expect(getZone(zoneId)).resolves.toMatchObject({ id: zoneId });
    await expect(byCode(zoneId.toUpperCase())).resolves.toMatchObject({ id: zoneId });
  });

  it.each([
    { name: 'inactive', active: false, lifecycle: 'published' },
    { name: 'draft', active: true, lifecycle: 'draft' },
    { name: 'archived', active: true, lifecycle: 'archived' },
  ])('hides an $name zone from search, details and code lookup', async ({ active, lifecycle }) => {
    const { zoneId } = await fixture();
    await db.parkingZone.update({ where: { id: zoneId }, data: { active, lifecycle } });
    expect(await listZones({ search: zoneId })).toEqual([]);
    await expect(getZone(zoneId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(byCode(zoneId.toUpperCase())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
