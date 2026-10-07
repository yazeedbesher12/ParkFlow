import { InventoryHoldStatus, ParkingReservationStatus } from '@prisma/client';
import { atomic, db, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import type { InventoryAvailability, InventoryHold, InventoryProvider, InventoryWindow } from './types';
import { AVAILABILITY_FRESH_SECONDS } from '../parking/service';

export const HOLD_MINUTES = 15;
const activeHoldStatuses = { in: [InventoryHoldStatus.active] };
const activeReservationStatuses = { in: [ParkingReservationStatus.confirmed, ParkingReservationStatus.checked_in] };

type HoldRow = { id: string; zoneId: string; spotId: string; startTime: Date; endTime: Date; expiresAt: Date; holdKey: string };
function dto(row: HoldRow): InventoryHold { return row; }

/** Manual allocations require a fresh count from an authenticated operator or admin. */
export function assertFreshOperatorFeedSnapshot(snapshot?: { source: string | null; recordedAt: Date } | null) {
  const ageSeconds = snapshot ? (Date.now() - snapshot.recordedAt.getTime()) / 1000 : Infinity;
  assert(
    Boolean(snapshot?.source && ['operator', 'admin'].includes(snapshot.source.toLowerCase()) && ageSeconds <= AVAILABILITY_FRESH_SECONDS),
    'INVENTORY_FEED_UNVERIFIED',
    'Live inventory is unavailable until a fresh operator or admin count is recorded',
    409,
  );
}

/** Manual feeds only expose explicitly configured capacity. Missing/zero capacity is unknown. */
export function spotIds(zoneId: string, capacity: number | null | undefined) {
  const count = capacity == null ? 0 : Math.min(Math.max(capacity, 0), 500);
  return Array.from({ length: count }, (_, i) => `${zoneId}:L${String(i + 1).padStart(3, '0')}`);
}

function sameWindow(row: { zoneId: string; spotId: string; startTime: Date; endTime: Date }, zoneId: string, spotId: string, window: InventoryWindow) {
  return row.zoneId === zoneId && row.spotId === spotId
    && row.startTime.getTime() === window.startTime.getTime()
    && row.endTime.getTime() === window.endTime.getTime();
}

async function inventoryPool(client: Tx | typeof db, zoneId: string, window: InventoryWindow, now: Date) {
  const zone = requireValue(await client.parkingZone.findUnique({
    where: { id: zoneId },
    select: {
      id: true, capacity: true, inventoryMode: true,
      snapshots: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
  }), 'Parking location not found');
  assert(zone.inventoryMode === 'live', 'INVENTORY_NOT_LIVE', 'Live inventory is not enabled for this location', 409);
  const tokens = spotIds(zoneId, zone.capacity);
  if (!tokens.length) return { tokens, blocked: new Set<string>(), remaining: 0 };

  const snapshot = zone.snapshots[0];
  assertFreshOperatorFeedSnapshot(snapshot);
  // These are allocation tokens in a shared pool, not observations of individual bays.
  // The latest physical count also bounds future bookings; never assume a departure.
  assert(snapshot && snapshot.availability !== 'unknown', 'INVENTORY_CAPACITY_UNKNOWN', 'An explicit operator or admin count is required before booking', 409);
  const { availableSpaces, occupiedSpaces } = snapshot;
  assert(snapshot.availability === 'full' || availableSpaces != null || occupiedSpaces != null,
    'INVENTORY_CAPACITY_UNKNOWN', 'An explicit operator or admin count is required before booking', 409);
  const capacity = zone.capacity!;
  const physicalVacancy = snapshot.availability === 'full' ? 0 : Math.max(0, Math.min(
    capacity,
    availableSpaces ?? capacity,
    capacity - (occupiedSpaces ?? 0),
  ));
  const vacancy = Math.min(tokens.length, physicalVacancy);
  const observedOccupied = capacity - physicalVacancy;
  const [holds, reservations] = await Promise.all([
    client.inventoryHold.findMany({
      where: { zoneId, status: activeHoldStatuses, expiresAt: { gt: now }, startTime: { lt: window.endTime }, endTime: { gt: window.startTime } },
      select: { spotId: true },
    }),
    client.parkingReservation.findMany({
      where: { parkingZoneId: zoneId, status: activeReservationStatuses, startTime: { lt: window.endTime }, endTime: { gt: window.startTime } },
      select: { spotId: true, status: true, checkedInAt: true, startTime: true, endTime: true },
    }),
  ]);
  // Earlier check-ins are already part of the physical occupancy count. A missing,
  // equal, or later timestamp cannot prove that, so retain its reservation demand.
  // Contradictory counts must never allow more reflected cars than observed occupancy.
  const reflected = Math.min(observedOccupied, reservations.filter((reservation) =>
    reservation.status === 'checked_in' && reservation.checkedInAt && reservation.checkedInAt < snapshot.recordedAt
    && reservation.startTime <= snapshot.recordedAt && reservation.endTime > snapshot.recordedAt,
  ).length);
  const outstanding = holds.length + reservations.length - reflected;
  const blocked = new Set([...holds.map((hold) => hold.spotId), ...reservations.flatMap((reservation) => reservation.spotId ? [reservation.spotId] : [])]);
  return { tokens, blocked, remaining: Math.max(0, vacancy - outstanding) };
}

export async function holdInTransaction(
  tx: Tx,
  zoneId: string,
  spotId: string,
  window: InventoryWindow,
  holdKey: string,
  now = new Date(),
) {
  assert(window.endTime > window.startTime, 'INVALID_TIME_RANGE', 'End time must be after start time');
  // Share the owner-update lock and serialize different tokens against one pool.
  await lock(tx, `zone:${zoneId}`);
  await lock(tx, `inventory-hold-key:${holdKey}`);
  await lock(tx, `inventory:${zoneId}:${spotId}`);
  const existing = await tx.inventoryHold.findUnique({ where: { holdKey } });
  if (existing) {
    if (existing.status !== InventoryHoldStatus.expired && existing.status !== InventoryHoldStatus.released && existing.status !== InventoryHoldStatus.active) {
      assert(sameWindow(existing, zoneId, spotId, window), 'HOLD_KEY_REUSED', 'This hold key was already used for another window', 409);
      return dto(existing);
    }
    if (existing.status === InventoryHoldStatus.active && existing.expiresAt > now) {
      assert(sameWindow(existing, zoneId, spotId, window), 'HOLD_KEY_REUSED', 'This hold key was already used for another window', 409);
      return dto(existing);
    }
    if (existing.status === InventoryHoldStatus.active && existing.expiresAt <= now) {
      await tx.inventoryHold.update({ where: { id: existing.id }, data: { status: InventoryHoldStatus.expired } });
    }
    // A released key cannot be silently reactivated; this preserves idempotency.
    if (existing.status === InventoryHoldStatus.released) {
      assert(sameWindow(existing, zoneId, spotId, window), 'HOLD_KEY_REUSED', 'This hold key was already released', 409);
      return dto(existing);
    }
  }

  const pool = await inventoryPool(tx, zoneId, window, now);
  assert(pool.tokens.includes(spotId), 'UNKNOWN_PARKING_SPOT', 'Parking allocation was not found', 404);
  assert(!pool.blocked.has(spotId), 'SPOT_ALREADY_RESERVED', 'This allocation is already reserved for that time', 409);
  assert(pool.remaining > 0, 'INVENTORY_FULL', 'No confirmed capacity remains for this time', 409);
  const expiresAt = new Date(Math.min(window.endTime.getTime(), now.getTime() + HOLD_MINUTES * 60_000));
  if (existing) {
    return dto(await tx.inventoryHold.update({ where: { id: existing.id }, data: { zoneId, spotId, startTime: window.startTime, endTime: window.endTime, expiresAt, status: InventoryHoldStatus.active } }));
  }
  return dto(await tx.inventoryHold.create({ data: { zoneId, spotId, startTime: window.startTime, endTime: window.endTime, expiresAt, holdKey } }));
}

export class ManualInventoryProvider implements InventoryProvider {
  constructor(private readonly client: typeof db = db) {}

  async getAvailability(zoneId: string, window: InventoryWindow): Promise<InventoryAvailability> {
    const pool = await inventoryPool(this.client, zoneId, window, new Date());
    let remaining = pool.remaining;
    return { zoneId, window, spots: pool.tokens.flatMap((id): InventoryAvailability['spots'] => {
      if (pool.blocked.has(id)) return [{ id, code: id.slice(zoneId.length + 1), state: 'held' as const }];
      if (remaining-- <= 0) return [];
      return [{ id, code: id.slice(zoneId.length + 1), state: 'available' as const }];
    }) };
  }

  async hold(zoneId: string, spotId: string, window: InventoryWindow, holdKey: string) {
    return atomic((tx) => holdInTransaction(tx, zoneId, spotId, window, holdKey));
  }

  async release(holdId: string) {
    await this.client.inventoryHold.updateMany({ where: { id: holdId, status: InventoryHoldStatus.active }, data: { status: InventoryHoldStatus.released } });
  }
}

export const manualProvider = new ManualInventoryProvider();
