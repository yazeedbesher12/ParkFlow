import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { atomic, db } from '../src/database/client';
import { issue } from '../src/modules/auth/service';
import * as reservations from '../src/modules/reservations/service';
import { zoneDto, zoneInclude } from '../src/modules/parking/service';

const app = createApp();
const suffix = randomUUID();
const userId = `quote-user-${suffix}`;
const operatorId = `quote-op-${suffix}`;
const zones: string[] = [];
const tomorrow = new Date(Date.now() + 24 * 3600_000);
let token: string, zoneId: string, currentTariffId: string;
const select = (durationMinutes = 30, startTime = tomorrow.toISOString()) => ({ zoneId, startTime, durationMinutes });
const quote = (selection = select()) => request(app).post('/api/v1/parking/reservations/quote').auth(token, { type: 'bearer' }).send(selection);
const book = (selection: ReturnType<typeof select>, confirmation?: unknown) => request(app).post('/api/v1/parking/reservations')
  .auth(token, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
  .send({ ...selection, spotId: `${zoneId}:L001`, ...(confirmation ? { quote: confirmation } : {}) });

beforeAll(async () => {
  const user = await db.user.create({ data: { id: userId, email: `${userId}@example.com` } });
  token = (await atomic((tx) => issue(tx, user, {}))).accessToken;
  await db.parkingOperator.create({ data: { id: operatorId, name: 'Quote regression operator' } });
});
beforeEach(async () => {
  zoneId = `quote-zone-${randomUUID()}`;
  zones.push(zoneId);
  const zone = await db.parkingZone.create({ data: {
    id: zoneId, code: zoneId, operatorId, name: 'Quoted parking', nameAr: 'موقف', city: 'Ramallah', cityAr: 'رام الله',
    latitude: 31.9, longitude: 35.2, kind: 'garage', capacity: 5, inventoryMode: 'live', inventoryProvider: 'manual',
    defaultMode: 'start_stop', supportedModes: ['start_stop'], supportedEntryMethods: ['manual'], active: true, lifecycle: 'published',
    operatingHours: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '00:00', closed: false })) },
    tariffs: { create: { name: 'Current', hourlyRate: 600, minimumCharge: 500, dailyCap: 1200, freeMinutes: 0, incrementMinutes: 15, validFrom: new Date(Date.now() - 3600_000) } },
    snapshots: { create: { source: 'OPERATOR', availability: 'available', availableSpaces: 5, confidence: 1 } },
  }, include: { tariffs: true } });
  currentTariffId = zone.tariffs[0]!.id;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.parkingReservation.deleteMany({ where: { parkingZoneId: { in: zones } } });
  await db.inventoryHold.deleteMany({ where: { zoneId: { in: zones } } });
  await db.parkingClosure.deleteMany({ where: { zoneId: { in: zones } } });
  await db.availabilitySnapshot.deleteMany({ where: { zoneId: { in: zones } } });
  await db.parkingTariff.deleteMany({ where: { zoneId: { in: zones } } });
  await db.operatingHour.deleteMany({ where: { zoneId: { in: zones } } });
  await db.parkingZone.deleteMany({ where: { id: { in: zones } } });
  await db.parkingOperator.delete({ where: { id: operatorId } });
  await db.idempotencyRecord.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { actorUserId: userId } });
  await db.refreshToken.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('reservation quote API and confirmation', () => {
  it('requires authentication and a reviewed quote for public creation', async () => {
    expect((await request(app).post('/api/v1/parking/reservations/quote').send(select())).status).toBe(401);
    expect((await book(select())).status).toBe(400);
    expect(await db.parkingReservation.count({ where: { parkingZoneId: zoneId } })).toBe(0);
  });
  it.each([{ minutes: 30, total: 500 }, { minutes: 180, total: 1200 }])('stores the server quote with minimum/cap for $minutes minutes', async ({ minutes, total }) => {
    const selection = select(minutes);
    const priced = await quote(selection);
    expect(priced.status).toBe(200);
    expect(priced.body.totalMinor).toBe(total);
    const booked = await book(selection, priced.body.confirmation);
    expect(booked.status).toBe(200);
    expect(booked.body).toMatchObject({ estimatedTotalPriceSnapshot: total, hourlyRateSnapshot: 600, currency: 'ILS' });
  });
  it('quotes a scheduled rate for future arrival while keeping the current public rate current', async () => {
    const effective = new Date(Date.now() + 12 * 3600_000);
    await db.parkingTariff.update({ where: { id: currentTariffId }, data: { validTo: effective } });
    const future = await db.parkingTariff.create({ data: { zoneId, name: 'Future', hourlyRate: 1800, minimumCharge: 1000, dailyCap: 2000, freeMinutes: 0, incrementMinutes: 15, validFrom: effective } });
    const publicZone = zoneDto(await db.parkingZone.findUniqueOrThrow({ where: { id: zoneId }, include: zoneInclude }));
    expect(publicZone.tariff?.id).toBe(currentTariffId);
    const priced = await quote();
    expect(priced.status).toBe(200);
    expect(priced.body).toMatchObject({ tariffId: future.id, totalMinor: 1000, hourlyRate: 1800 });
    expect((await book(select(), priced.body.confirmation)).body.estimatedTotalPriceSnapshot).toBe(1000);
  });
  it.each(['zoneVersion', 'totalMinor', 'tariffId', 'selection'] as const)('rejects a changed %s before acquiring inventory', async (field) => {
    const selection = select();
    const priced = await quote(selection);
    const confirmation = { ...priced.body.confirmation };
    if (field === 'zoneVersion') await db.parkingZone.update({ where: { id: zoneId }, data: { version: { increment: 1 } } });
    if (field === 'totalMinor') confirmation.totalMinor -= 1;
    if (field === 'tariffId') confirmation.tariffId = 'replaced-tariff';
    if (field === 'selection') selection.startTime = new Date(tomorrow.getTime() + 60_000).toISOString();
    const result = await book(selection, confirmation);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('QUOTE_CHANGED');
    expect(await db.parkingReservation.count({ where: { parkingZoneId: zoneId } })).toBe(0);
    expect(await db.inventoryHold.count({ where: { zoneId } })).toBe(0);
  });
  it('re-quotes a changed tariff and preserves the confirmed price afterward', async () => {
    const first = await quote();
    await db.parkingTariff.update({ where: { id: currentTariffId }, data: { minimumCharge: 800 } });
    expect((await book(select(), first.body.confirmation)).body.error.code).toBe('QUOTE_CHANGED');
    const fresh = await quote();
    const result = await book(select(), fresh.body.confirmation);
    expect(result.status).toBe(200);
    expect(result.body.estimatedTotalPriceSnapshot).toBe(800);
    await db.parkingTariff.update({ where: { id: currentTariffId }, data: { minimumCharge: 1000 } });
    expect((await reservations.get(userId, result.body.id)).estimatedTotalPriceSnapshot).toBe(800);
  });
  it('does not quote unpublished locations or a closed interval', async () => {
    await db.parkingClosure.create({ data: { zoneId, startsAt: tomorrow, endsAt: new Date(tomorrow.getTime() + 3600_000), reason: 'Maintenance' } });
    expect((await quote()).body.error.code).toBe('PARKING_CLOSED');
    await db.parkingZone.update({ where: { id: zoneId }, data: { lifecycle: 'draft' } });
    expect((await quote()).status).toBe(404);
  });
  it('does not let cancellation overwrite a check-in after an earlier ownership read', async () => {
    const priced = await quote();
    const booked = await book(select(), priced.body.confirmation);
    expect(booked.status).toBe(200);
    const id = booked.body.id;
    const staleRead = await db.parkingReservation.findUniqueOrThrow({ where: { id }, include: {
      zone: { select: { id: true, code: true, name: true, nameAr: true, latitude: true, longitude: true } },
    } });
    await db.parkingReservation.update({ where: { id }, data: { status: 'checked_in', startTime: new Date(Date.now() - 1000), checkedInAt: new Date() } });
    // Simulate a read that completed before an operator checked in the driver.
    vi.spyOn(db.parkingReservation, 'findFirst').mockResolvedValueOnce(staleRead);
    await expect(reservations.cancel(userId, id)).rejects.toMatchObject({ code: 'RESERVATION_NOT_CANCELLABLE' });
    expect((await db.parkingReservation.findUniqueOrThrow({ where: { id } })).status).toBe('checked_in');
    expect(await db.auditLog.count({ where: { resourceId: id, action: 'cancel' } })).toBe(0);
  });
  it('cancels a future confirmed reservation with a consistent audit', async () => {
    const priced = await quote();
    const booked = await book(select(), priced.body.confirmation);
    const cancelled = await reservations.cancel(userId, booked.body.id);
    expect(cancelled.status).toBe('cancelled');
    const audit = await db.auditLog.findFirstOrThrow({ where: { resourceId: booked.body.id, action: 'cancel' } });
    expect(audit.before).toMatchObject({ status: 'confirmed' });
    expect(audit.after).toMatchObject({ status: 'cancelled' });
    await expect(reservations.cancel(userId, booked.body.id)).rejects.toMatchObject({ code: 'RESERVATION_NOT_CANCELLABLE' });
  });
});
