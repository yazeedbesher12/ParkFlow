import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { atomic, db, json, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { idempotent } from '../../utils/idempotency';
import { assertOpen } from '../parking/pricing';
import { getConfiguredSpot } from '../parking/layouts';
import { assertFreshOperatorFeedSnapshot, holdInTransaction, spotIds } from '../inventory/manualProvider';
import { providerFor, manualProvider } from '../inventory/service';
import { AVAILABILITY_FRESH_SECONDS } from '../parking/service';
import { buildReservationQuote, assertReservationQuote, type ReservationQuoteConfirmation } from './pricing';

const include = {
  zone: { select: { id: true, code: true, name: true, nameAr: true, latitude: true, longitude: true } },
} as const;
type ReservationRow = Prisma.ParkingReservationGetPayload<{ include: typeof include }>;

function dto(row: ReservationRow) {
  const { qrToken, zone, ...reservation } = row;
  return {
    ...reservation,
    spotCode: row.spotId?.split(':').pop(),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    qrValue: `parkflow://reservation/${qrToken}`,
    zone: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      nameAr: zone.nameAr,
      location: { latitude: zone.latitude, longitude: zone.longitude },
    },
  };
}

async function expireDue(now = new Date()) {
  await db.parkingReservation.updateMany({ where: { status: 'confirmed', endTime: { lte: now } }, data: { status: 'expired' } });
  await db.parkingReservation.updateMany({ where: { status: 'checked_in', endTime: { lte: now } }, data: { status: 'completed' } });
}

export async function expireInventoryHolds(now = new Date()) {
  return db.inventoryHold.updateMany({ where: { status: 'active', expiresAt: { lte: now } }, data: { status: 'expired' } });
}

async function owned(userId: string, id: string) {
  return requireValue(
    await db.parkingReservation.findFirst({ where: { id, userId }, include }),
    'Reservation not found',
  );
}

type ReservationSelection = { zoneId: string; startTime: string; durationMinutes: number };

async function reservationPriceContext(tx: Tx, input: ReservationSelection) {
  const startTime = new Date(input.startTime);
  const now = new Date();
  assert(startTime.getTime() >= now.getTime(), 'RESERVATION_IN_PAST', 'Start time cannot be in the past');
  assert(
    input.durationMinutes >= 30 && input.durationMinutes <= 480 && input.durationMinutes % 30 === 0,
    'INVALID_DURATION',
    'Choose 30-minute increments from 30 minutes to 8 hours',
  );
  const endTime = new Date(startTime.getTime() + input.durationMinutes * 60_000);
  assert(endTime > startTime, 'INVALID_TIME_RANGE', 'End time must be after start time');

  const zone = requireValue(await tx.parkingZone.findFirst({
    where: { id: input.zoneId, active: true, lifecycle: 'published' },
    include: {
      operatingHours: true,
      tariffs: {
        where: { validFrom: { lte: startTime }, OR: [{ validTo: null }, { validTo: { gt: startTime } }] },
        orderBy: { validFrom: 'desc' },
        take: 1,
      },
    },
  }), 'Parking location not found');
  const tariff = requireValue(zone.tariffs[0], 'No tariff configured for this reservation time');
  assert(zone.parkingAllowed, 'PARKING_RESTRICTED', 'This location is not available for normal public parking', 409);
  assert(!tariff.maxStayMinutes || input.durationMinutes <= tariff.maxStayMinutes, 'MAX_STAY', 'Maximum stay exceeded');
  assertOpen(zone.operatingHours, startTime, endTime);
  const closure = await tx.parkingClosure.findFirst({
    where: { zoneId: zone.id, startsAt: { lt: endTime }, endsAt: { gt: startTime } }, select: { id: true },
  });
  assert(!closure, 'PARKING_CLOSED', 'This parking location is closed during the requested time', 409);
  return { zone, tariff, startTime, endTime, now, price: buildReservationQuote(zone, tariff, startTime, input.durationMinutes) };
}

export async function quote(input: ReservationSelection) {
  return atomic(async (tx) => {
    await lock(tx, `zone:${input.zoneId}`);
    return (await reservationPriceContext(tx, input)).price;
  });
}

export async function create(
  userId: string,
  input: ReservationSelection & { spotId: string; quote?: ReservationQuoteConfirmation },
  key: string,
) {
  return idempotent(userId, 'reservation:create', key, input, async (tx) => {
  await lock(tx, `zone:${input.zoneId}`);
  const { zone, tariff, startTime, endTime, now, price } = await reservationPriceContext(tx, input);
  assertReservationQuote(price, input.quote);

  const isLive = zone.inventoryMode === 'live';
  const spot = isLive ? undefined : getConfiguredSpot(input.zoneId, input.spotId);
  if (!isLive) {
    assert(spot, 'UNKNOWN_PARKING_SPOT', 'Parking space was not found', 404);
    assert(spot.state !== 'out_of_service', 'SPOT_OUT_OF_SERVICE', 'This parking space is out of service', 409);
    assert(spot.state !== 'occupied', 'SPOT_OCCUPIED', 'This demo parking space is occupied', 409);
    await lock(tx, `parking-spot:${input.spotId}`);
    const overlap = await tx.parkingReservation.findFirst({ where: { spotId: input.spotId, status: { in: ['confirmed', 'checked_in'] }, startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
    assert(!overlap, 'SPOT_ALREADY_RESERVED', 'This parking space is already reserved for that time', 409);
  } else {
    const provider = providerFor(zone.inventoryProvider);
    assert(provider, 'INVENTORY_PROVIDER_UNAVAILABLE', 'Live inventory provider is not configured', 503);
    assert(provider === manualProvider, 'INVENTORY_PROVIDER_UNAVAILABLE', 'Live inventory provider is unavailable', 503);
    assert(spotIds(zone.id, zone.capacity).includes(input.spotId), 'UNKNOWN_PARKING_SPOT', 'Parking allocation was not found', 404);
    const snapshot = await tx.availabilitySnapshot.findFirst({ where: { zoneId: zone.id }, orderBy: { recordedAt: 'desc' }, select: { source: true, recordedAt: true } });
    assertFreshOperatorFeedSnapshot(snapshot);
  }

  const hourlyRateSnapshot = tariff.hourlyRate;
  const estimatedTotalPriceSnapshot = price.totalMinor;
  let hold: Awaited<ReturnType<typeof holdInTransaction>> | undefined;
  if (isLive) hold = await holdInTransaction(tx, zone.id, input.spotId, { startTime, endTime }, `reservation:${userId}:${key}`);
  let guarantee: 'none' | 'operator_backed' = 'none';
  if (isLive) {
    const snapshot = await tx.availabilitySnapshot.findFirst({ where: { zoneId: zone.id }, orderBy: { recordedAt: 'desc' } });
    if (!zone.prototypeData && snapshot && snapshot.source.toLowerCase() === 'operator' && Number.isFinite(snapshot.recordedAt.getTime()) && (now.getTime() - snapshot.recordedAt.getTime()) / 1000 <= AVAILABILITY_FRESH_SECONDS) guarantee = 'operator_backed';
  }
  const row = await tx.parkingReservation.create({
    data: {
      parkingZoneId: zone.id,
      spotId: isLive ? input.spotId : spot!.id,
      userId,
      startTime,
      endTime,
      durationMinutes: input.durationMinutes,
      hourlyRateSnapshot,
      estimatedTotalPriceSnapshot,
      currency: tariff.currency,
      priceIsDemo: zone.prototypeData,
      isDemoReservation: !isLive,
      inventoryMode: isLive ? 'live' : 'demo',
      guarantee,
      holdId: hold?.id,
      holdExpiresAt: hold?.expiresAt,
      publicCode: `PF-${randomBytes(6).toString('hex').toUpperCase()}`,
      qrToken: randomBytes(24).toString('base64url'),
    },
    include,
  });
  if (hold) await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'consumed' } });
  return dto(row);
  });
}

export async function list(userId: string) {
  await expireDue();
  return (await db.parkingReservation.findMany({
    where: { userId }, include, orderBy: { startTime: 'desc' }, take: 200,
  })).map(dto);
}

export async function get(userId: string, id: string) {
  await expireDue();
  return dto(await owned(userId, id));
}

export async function cancel(userId: string, id: string) {
  // This first read identifies the zone only. State and time are checked again
  // after the same lock used by operator check-in, inside the transaction.
  const location = await owned(userId, id);
  return atomic(async (tx) => {
    await lock(tx, `zone:${location.parkingZoneId}`);
    await lock(tx, `reservation-check-in:${id}`);
    const row = requireValue(await tx.parkingReservation.findFirst({ where: { id, userId }, include }), 'Reservation not found');
    const cancelled = await tx.parkingReservation.updateMany({
      where: { id, userId, status: 'confirmed', startTime: { gt: new Date() } },
      data: { status: 'cancelled' },
    });
    assert(cancelled.count === 1, 'RESERVATION_NOT_CANCELLABLE', 'Only a confirmed reservation before its start time can be cancelled', 409);
    const updated = await tx.parkingReservation.findUniqueOrThrow({ where: { id }, include });
    if (row.holdId) await tx.inventoryHold.updateMany({ where: { id: row.holdId, status: 'active' }, data: { status: 'released' } });
    await tx.auditLog.create({ data: {
      actorUserId: userId, action: 'cancel', resourceType: 'parking-reservation', resourceId: id,
      before: json(row), after: json(updated),
    } });
    return dto(updated);
  });
}

function tokenFromValue(value: string) {
  const prefix = 'parkflow://reservation/';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export async function validateQr(value: string) {
  await expireDue();
  const row = await db.parkingReservation.findUnique({ where: { qrToken: tokenFromValue(value) }, include });
  if (!row) return { valid: false, reason: 'not_found' as const };
  const valid = row.status === 'confirmed' || row.status === 'checked_in';
  return { valid, reason: valid ? undefined : row.status, reservation: dto(row) };
}
