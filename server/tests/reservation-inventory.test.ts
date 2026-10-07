import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '../src/database/client';
import { ManualInventoryProvider } from '../src/modules/inventory/manualProvider';
import * as reservations from '../src/modules/reservations/service';
import { getParkingLayout } from '../src/modules/parking/layouts';

const suffix = randomUUID();
const operatorId = `inventory-op-${suffix}`;
const userId = `inventory-user-${suffix}`;
const demoZoneId = `inventory-demo-${suffix}`;
const liveZoneId = `inventory-live-${suffix}`;
const noCapacityZoneId = `inventory-no-capacity-${suffix}`;
const missingFeedZoneId = `inventory-missing-feed-${suffix}`;
const staleFeedZoneId = `inventory-stale-feed-${suffix}`;
const communityFeedZoneId = `inventory-community-feed-${suffix}`;
const capacityZoneIds: string[] = [];
const provider = new ManualInventoryProvider(db);
// Keep the fixture window comfortably ahead of a slow CI run.
const start = new Date(Date.now() + 24 * 60 * 60_000);
const window = { startTime: start, endTime: new Date(start.getTime() + 60 * 60_000) };

const baseZone = (id: string, inventoryMode: 'demo' | 'live', capacity?: number | null) => ({
  id,
  code: id,
  operatorId,
  name: 'Inventory test zone',
  nameAr: 'اختبار',
  city: 'Ramallah',
  cityAr: 'رام الله',
  latitude: 31.9,
  longitude: 35.2,
  kind: 'garage',
  parkingAllowed: true,
  prototypeData: inventoryMode === 'demo',
  defaultMode: 'start_stop' as const,
  supportedModes: ['start_stop' as const],
  supportedEntryMethods: ['manual'],
  inventoryMode,
  capacity,
});

async function capacityZone(snapshot: Omit<Prisma.AvailabilitySnapshotUncheckedCreateInput, 'zoneId'>, capacity = 3) {
  const id = `capacity-${randomUUID()}`;
  capacityZoneIds.push(id);
  await db.parkingZone.create({ data: {
    ...baseZone(id, 'live', capacity), inventoryProvider: 'manual',
    tariffs: { create: { name: 'Capacity test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) } },
    operatingHours: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '23:59' })) },
  } });
  await db.availabilitySnapshot.create({ data: { ...snapshot, zoneId: id } });
  return id;
}

const operatorSnapshot = { availability: 'available' as const, source: 'OPERATOR', confidence: 0.9 };
const createReservation = (zoneId: string, slot = 'L001', reservationWindow = window) => reservations.create(userId, {
  zoneId, spotId: `${zoneId}:${slot}`, startTime: reservationWindow.startTime.toISOString(), durationMinutes: 60,
}, `capacity-reservation-${randomUUID()}`);

beforeAll(async () => {
  await db.user.create({ data: { id: userId, email: `${userId}@example.com` } });
  await db.parkingOperator.create({ data: { id: operatorId, name: 'Inventory test operator' } });
  await db.parkingZone.createMany({ data: [
    baseZone(demoZoneId, 'demo', 2),
    baseZone(liveZoneId, 'live', 3),
    baseZone(noCapacityZoneId, 'live', null),
    baseZone(missingFeedZoneId, 'live', 2),
    baseZone(staleFeedZoneId, 'live', 2),
    baseZone(communityFeedZoneId, 'live', 2),
  ] });
  await db.availabilitySnapshot.createMany({ data: [
    { zoneId: staleFeedZoneId, availability: 'available', source: 'OPERATOR', confidence: 0.9, recordedAt: new Date(Date.now() - 16 * 60_000) },
    { zoneId: communityFeedZoneId, availability: 'available', source: 'COMMUNITY', confidence: 0.9, recordedAt: new Date() },
  ] });
  await db.parkingTariff.createMany({ data: [
    { zoneId: demoZoneId, name: 'Test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) },
    { zoneId: liveZoneId, name: 'Test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) },
    { zoneId: missingFeedZoneId, name: 'Test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) },
    { zoneId: staleFeedZoneId, name: 'Test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) },
    { zoneId: communityFeedZoneId, name: 'Test', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 3600_000) },
  ] });
  await db.operatingHour.createMany({ data: [liveZoneId, missingFeedZoneId, staleFeedZoneId, communityFeedZoneId].flatMap((zoneId) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ zoneId, weekday, opensAt: '00:00', closesAt: '23:59' }))) });
  await db.availabilitySnapshot.create({ data: { zoneId: liveZoneId, availability: 'available', availableSpaces: 3, occupiedSpaces: 0, source: 'OPERATOR', confidence: 0.9, recordedAt: new Date() } });
});

afterAll(async () => {
  const zoneIds = [demoZoneId, liveZoneId, noCapacityZoneId, missingFeedZoneId, staleFeedZoneId, communityFeedZoneId, ...capacityZoneIds];
  // Reservations reference their consumed holds; remove the referencing rows first.
  await db.parkingReservation.deleteMany({ where: { parkingZoneId: { in: zoneIds } } });
  await db.inventoryHold.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await db.availabilitySnapshot.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await db.parkingClosure.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await db.parkingTariff.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await db.operatingHour.deleteMany({ where: { zoneId: { in: zoneIds } } });
  await db.parkingZone.deleteMany({ where: { id: { in: zoneIds } } });
  await db.parkingOperator.delete({ where: { id: operatorId } });
  await db.idempotencyRecord.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { actorUserId: userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('manual inventory provider', () => {
  it('keeps demo zones out of live provider and does not invent capacity', async () => {
    await expect(provider.getAvailability(demoZoneId, window)).rejects.toMatchObject({ code: 'INVENTORY_NOT_LIVE' });
    const availability = await provider.getAvailability(noCapacityZoneId, window);
    expect(availability.spots).toEqual([]);
  });

  it('requires a spot id from the requested zone', async () => {
    await expect(provider.hold(liveZoneId, `${demoZoneId}:L001`, window, `hold-${randomUUID()}`)).rejects.toMatchObject({ code: 'UNKNOWN_PARKING_SPOT' });
  });

  it('reuses an expired hold key without a unique constraint failure', async () => {
    const spot = `${liveZoneId}:L001`;
    const key = `hold-expired-${randomUUID()}`;
    const old = await db.inventoryHold.create({ data: { zoneId: liveZoneId, spotId: spot, startTime: new Date(Date.now() - 120 * 60_000), endTime: new Date(Date.now() - 60 * 60_000), expiresAt: new Date(Date.now() - 30 * 60_000), holdKey: key, status: 'expired' } });
    const reused = await provider.hold(liveZoneId, spot, window, key);
    expect(reused.id).toBe(old.id);
    expect(await db.inventoryHold.findUnique({ where: { id: old.id } })).toMatchObject({ status: 'active' });
  });

  it('blocks a confirmed live reservation after its fifteen minute hold expires', async () => {
    const spot = `${liveZoneId}:L002`;
    const reservation = await reservations.create(userId, { zoneId: liveZoneId, spotId: spot, startTime: start.toISOString(), durationMinutes: 60 }, `reservation-${randomUUID()}`);
    await db.inventoryHold.updateMany({ where: { id: reservation.holdId ?? undefined }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(provider.hold(liveZoneId, spot, window, `another-${randomUUID()}`)).rejects.toMatchObject({ code: 'SPOT_ALREADY_RESERVED' });
    const availability = await provider.getAvailability(liveZoneId, window);
    expect(availability.spots.find((item) => item.id === spot)?.state).toBe('held');
  });

  it('only grants operator backed guarantee for a fresh operator snapshot', async () => {
    await db.availabilitySnapshot.create({ data: { zoneId: liveZoneId, availability: 'available', availableSpaces: 3, occupiedSpaces: 0, source: 'OPERATOR', confidence: 0.9, recordedAt: new Date() } });
    const fresh = await reservations.create(userId, { zoneId: liveZoneId, spotId: `${liveZoneId}:L003`, startTime: new Date(start.getTime() + 2 * 60 * 60_000).toISOString(), durationMinutes: 60 }, `fresh-${randomUUID()}`);
    expect(fresh.guarantee).toBe('operator_backed');
    await db.availabilitySnapshot.create({ data: { zoneId: liveZoneId, availability: 'available', source: 'COMMUNITY', confidence: 0.9, recordedAt: new Date() } });
    await expect(reservations.create(userId, { zoneId: liveZoneId, spotId: `${liveZoneId}:L003`, startTime: new Date(start.getTime() + 4 * 60 * 60_000).toISOString(), durationMinutes: 60 }, `community-${randomUUID()}`)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
  });

  it.each([
    { name: 'full without counts', snapshot: { availability: 'full' as const } },
    { name: 'full despite positive vacancy', snapshot: { availability: 'full' as const, availableSpaces: 3 } },
    { name: 'zero available spaces', snapshot: { availableSpaces: 0 } },
    { name: 'all spaces occupied', snapshot: { occupiedSpaces: 3 } },
  ])('rejects new allocations when the operator reports $name', async ({ snapshot }) => {
    const zoneId = await capacityZone({ ...operatorSnapshot, ...snapshot });
    expect((await provider.getAvailability(zoneId, window)).spots.filter((spot) => spot.state === 'available')).toHaveLength(0);
    await expect(provider.hold(zoneId, `${zoneId}:L001`, window, `full-${randomUUID()}`)).rejects.toMatchObject({ code: 'INVENTORY_FULL' });
    await expect(createReservation(zoneId)).rejects.toMatchObject({ code: 'INVENTORY_FULL' });
    expect(await db.inventoryHold.count({ where: { zoneId } })).toBe(0);
    expect(await db.parkingReservation.count({ where: { parkingZoneId: zoneId } })).toBe(0);
  });

  it.each([
    { name: 'missing counts', snapshot: {} },
    { name: 'unknown availability despite counts', snapshot: { availability: 'unknown' as const, availableSpaces: 3 } },
  ])('fails closed for $name', async ({ snapshot }) => {
    const zoneId = await capacityZone({ ...operatorSnapshot, ...snapshot });
    await expect(provider.getAvailability(zoneId, window)).rejects.toMatchObject({ code: 'INVENTORY_CAPACITY_UNKNOWN' });
    await expect(provider.hold(zoneId, `${zoneId}:L001`, window, `unknown-${randomUUID()}`)).rejects.toMatchObject({ code: 'INVENTORY_CAPACITY_UNKNOWN' });
    await expect(createReservation(zoneId)).rejects.toMatchObject({ code: 'INVENTORY_CAPACITY_UNKNOWN' });
  });

  it.each([
    { name: 'vacancy only', snapshot: { availableSpaces: 1 }, remaining: 1 },
    { name: 'occupancy only', snapshot: { occupiedSpaces: 1 }, remaining: 2 },
    { name: 'contradictory counts', snapshot: { availableSpaces: 3, occupiedSpaces: 2 }, remaining: 1 },
  ])('limits allocation tokens using $name', async ({ snapshot, remaining }) => {
    const zoneId = await capacityZone({ ...operatorSnapshot, ...snapshot });
    expect((await provider.getAvailability(zoneId, window)).spots.filter((spot) => spot.state === 'available')).toHaveLength(remaining);
  });

  it('allows only one concurrent reservation for the final vacancy across different tokens', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 1, occupiedSpaces: 2 });
    const results = await Promise.allSettled([createReservation(zoneId, 'L001'), createReservation(zoneId, 'L002')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'INVENTORY_FULL' } });
    expect(await db.parkingReservation.count({ where: { parkingZoneId: zoneId } })).toBe(1);
    expect(await db.inventoryHold.count({ where: { zoneId, status: 'consumed' } })).toBe(1);
  });

  it('counts holds and confirmed reservations once and returns released capacity', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 2, occupiedSpaces: 1 });
    const key = `capacity-hold-${randomUUID()}`;
    const hold = await provider.hold(zoneId, `${zoneId}:L001`, window, key);
    await createReservation(zoneId, 'L002');
    expect((await provider.hold(zoneId, `${zoneId}:L001`, window, key)).id).toBe(hold.id);
    await expect(createReservation(zoneId, 'L003')).rejects.toMatchObject({ code: 'INVENTORY_FULL' });
    await provider.release(hold.id);
    expect((await provider.getAvailability(zoneId, window)).spots.filter((spot) => spot.state === 'available')).toHaveLength(1);
    await expect(createReservation(zoneId, 'L003')).resolves.toMatchObject({ inventoryMode: 'live' });
  });

  it.each([
    { name: 'before the snapshot', checkedInOffset: -120_000, availableSpaces: 1, occupiedSpaces: 1, remaining: 1 },
    { name: 'after the snapshot', checkedInOffset: -30_000, availableSpaces: 2, occupiedSpaces: 0, remaining: 1 },
    { name: 'at the snapshot boundary', checkedInOffset: -60_000, availableSpaces: 1, occupiedSpaces: 1, remaining: 0 },
    { name: 'without a check-in timestamp', checkedInOffset: null, availableSpaces: 1, occupiedSpaces: 1, remaining: 0 },
    { name: 'inconsistent with zero observed occupancy', checkedInOffset: -120_000, availableSpaces: 2, occupiedSpaces: 0, remaining: 1 },
  ])('accounts conservatively for a check-in $name', async ({ checkedInOffset, availableSpaces, occupiedSpaces, remaining }) => {
    const now = Date.now();
    const bookingWindow = { startTime: new Date(now + 5 * 60_000), endTime: new Date(now + 65 * 60_000) };
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces, occupiedSpaces, recordedAt: new Date(now - 60_000) }, 2);
    await db.parkingReservation.create({ data: {
      parkingZoneId: zoneId, userId, spotId: `${zoneId}:L001`, status: 'checked_in',
      startTime: new Date(now - 5 * 60_000), endTime: new Date(now + 85 * 60_000), durationMinutes: 90,
      checkedInAt: checkedInOffset == null ? null : new Date(now + checkedInOffset),
      hourlyRateSnapshot: 500, estimatedTotalPriceSnapshot: 500, inventoryMode: 'live', isDemoReservation: false,
      publicCode: `CI-${randomUUID().slice(0, 20)}`, qrToken: randomUUID(),
    } });
    expect((await provider.getAvailability(zoneId, bookingWindow)).spots.filter((spot) => spot.state === 'available')).toHaveLength(remaining);
    if (remaining) await expect(createReservation(zoneId, 'L002', bookingWindow)).resolves.toMatchObject({ inventoryMode: 'live' });
    else await expect(createReservation(zoneId, 'L002', bookingWindow)).rejects.toMatchObject({ code: 'INVENTORY_FULL' });
  });

  it('uses the same maximum allocation token in availability and direct reservations', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 600, occupiedSpaces: 0 }, 600);
    expect((await provider.getAvailability(zoneId, window)).spots).toHaveLength(500);
    await expect(createReservation(zoneId, 'L501')).rejects.toMatchObject({ code: 'UNKNOWN_PARKING_SPOT' });
    await expect(createReservation(zoneId, 'L500')).resolves.toMatchObject({ spotId: `${zoneId}:L500` });
  });

  it.each(['draft', 'archived'])('does not reserve an active zone with lifecycle %s', async (lifecycle) => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 3 });
    await db.parkingZone.update({ where: { id: zoneId }, data: { lifecycle } });
    await expect(createReservation(zoneId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getParkingLayout(zoneId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.parkingReservation.count({ where: { parkingZoneId: zoneId } })).toBe(0);
  });

  it('shows available allocations when the first forty tokens are already held', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 60, occupiedSpaces: 0 }, 60);
    const now = Date.now();
    await db.inventoryHold.createMany({ data: Array.from({ length: 40 }, (_, index) => ({
      zoneId, spotId: `${zoneId}:L${String(index + 1).padStart(3, '0')}`,
      startTime: new Date(now), endTime: new Date(now + 60 * 60_000), expiresAt: new Date(now + 15 * 60_000),
      holdKey: `layout-${zoneId}-${index}`,
    })) });
    const layout = await getParkingLayout(zoneId);
    expect(layout.spots.filter((spot) => spot.state === 'available')).toHaveLength(20);
    expect(layout.spots).toHaveLength(40);
    expect(layout.spots[0]?.id).toBe(`${zoneId}:L041`);
  });

  it('rejects an overlapping dated closure but allows its exclusive end boundary', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 3 });
    await db.parkingClosure.create({ data: {
      zoneId, startsAt: new Date(start.getTime() - 30 * 60_000), endsAt: new Date(start.getTime() + 30 * 60_000), reason: 'Maintenance',
    } });
    await expect(createReservation(zoneId)).rejects.toMatchObject({ code: 'PARKING_CLOSED' });
    const afterClosure = { startTime: new Date(start.getTime() + 30 * 60_000), endTime: new Date(start.getTime() + 90 * 60_000) };
    await expect(createReservation(zoneId, 'L001', afterClosure)).resolves.toMatchObject({ inventoryMode: 'live' });
  });

  it('prices a future reservation at its start time and preserves the stored price after a tariff update', async () => {
    const zoneId = await capacityZone({ ...operatorSnapshot, availableSpaces: 3 });
    const effectiveAt = new Date(start.getTime() - 30 * 60_000);
    await db.parkingTariff.updateMany({ where: { zoneId }, data: { validTo: effectiveAt } });
    const futureTariff = await db.parkingTariff.create({ data: {
      zoneId, name: 'Scheduled price', hourlyRate: 700, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: effectiveAt,
    } });
    const reservation = await createReservation(zoneId);
    expect(reservation).toMatchObject({ hourlyRateSnapshot: 700, estimatedTotalPriceSnapshot: 700 });
    await db.parkingTariff.update({ where: { id: futureTariff.id }, data: { hourlyRate: 900 } });
    expect(await reservations.get(userId, reservation.id)).toMatchObject({ hourlyRateSnapshot: 700, estimatedTotalPriceSnapshot: 700 });
  });

  it('rejects live availability without a fresh operator feed', async () => {
    await expect(provider.getAvailability(missingFeedZoneId, window)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
    await expect(provider.getAvailability(staleFeedZoneId, window)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
    await expect(provider.getAvailability(communityFeedZoneId, window)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
    for (const [zoneId, key] of [[missingFeedZoneId, 'reservation-missing'], [staleFeedZoneId, 'reservation-stale'], [communityFeedZoneId, 'reservation-community']] as const) {
      await expect(reservations.create(userId, { zoneId, spotId: `${zoneId}:L001`, startTime: start.toISOString(), durationMinutes: 60 }, `${key}-${randomUUID()}`)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
    }
  });

  it('accepts a fresh admin count without promising an operator-backed guarantee', async () => {
    const zoneId = await capacityZone({ availability: 'available', source: 'ADMIN', confidence: 0.9, availableSpaces: 1 });
    expect((await provider.getAvailability(zoneId, window)).spots.filter((spot) => spot.state === 'available')).toHaveLength(1);
    await expect(createReservation(zoneId)).resolves.toMatchObject({ inventoryMode: 'live', guarantee: 'none' });
    await expect(createReservation(zoneId, 'L002')).rejects.toMatchObject({ code: 'INVENTORY_FULL' });
  });

  it.each(['SENSOR', 'ANPR'])('rejects a %s feed in the manual provider', async (source) => {
    const zoneId = await capacityZone({ availability: 'available', source, confidence: 0.9, availableSpaces: 3 });
    await expect(provider.hold(zoneId, `${zoneId}:L001`, window, `unsupported-${randomUUID()}`)).rejects.toMatchObject({ code: 'INVENTORY_FEED_UNVERIFIED' });
  });
});
