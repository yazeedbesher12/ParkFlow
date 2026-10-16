import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/database/client';
import { buildAvailabilityProvenance, zoneDto, zoneInclude } from '../src/modules/parking/service';
import { parkingFeedbackInputSchema, submitParkingFeedback } from '../src/modules/parking/feedback';

const now = new Date('2026-10-01T12:00:00.000Z');
const feedbackUserId = `feedback-test-user-${randomUUID()}`;
const feedbackOperatorId = `feedback-test-operator-${randomUUID()}`;
const feedbackZoneId = `feedback-test-zone-${randomUUID()}`;
let fixturesReady = false;

beforeAll(async () => {
  await db.user.create({ data: { id: feedbackUserId, email: `${feedbackUserId}@example.com` } });
  await db.parkingOperator.create({ data: { id: feedbackOperatorId, name: 'Feedback test operator' } });
  await db.parkingZone.create({
    data: {
      id: feedbackZoneId,
      operatorId: feedbackOperatorId,
      code: `FEEDBACK-${feedbackZoneId.slice(-8)}`,
      name: 'Feedback test zone',
      nameAr: 'منطقة اختبار الملاحظات',
      city: 'Ramallah',
      cityAr: 'رام الله',
      latitude: 31.9,
      longitude: 35.2,
      kind: 'street',
      defaultMode: 'start_stop',
      supportedModes: ['start_stop'],
      supportedEntryMethods: ['manual'],
      inventoryMode: 'live',
      inventoryProvider: 'manual',
      capacity: 4,
      prototypeData: false,
    },
  });
  fixturesReady = true;
});

afterAll(async () => {
  if (!fixturesReady) return;
  await db.parkingFeedback.deleteMany({ where: { userId: feedbackUserId } });
  await db.idempotencyRecord.deleteMany({ where: { userId: feedbackUserId } });
  await db.parkingReport.deleteMany({ where: { zoneId: feedbackZoneId } });
  await db.availabilitySnapshot.deleteMany({ where: { zoneId: feedbackZoneId } });
  await db.parkingZone.delete({ where: { id: feedbackZoneId } });
  await db.parkingOperator.delete({ where: { id: feedbackOperatorId } });
  await db.user.delete({ where: { id: feedbackUserId } });
});

describe('parking availability provenance', () => {
  it('marks a fresh operator snapshot fresh without a guarantee', () => {
    const result = buildAvailabilityProvenance({
      source: 'OPERATOR', confidence: 0.92, availability: 'available',
      availableSpaces: 12, recordedAt: new Date(now.getTime() - 5 * 60_000),
    }, undefined, now);
    expect(result).toMatchObject({ source: 'operator', freshness: 'fresh', confidence: 0.92, availableSpaces: 12, isGuaranteed: false });
  });

  it('marks snapshots past the aging window stale', () => {
    const result = buildAvailabilityProvenance({ source: 'OPERATOR', confidence: 0.7, recordedAt: new Date(now.getTime() - 90 * 60_000) }, undefined, now);
    expect(result.freshness).toBe('stale');
  });

  it('retains the trusted operator source when a newer community report disagrees', () => {
    const result = buildAvailabilityProvenance({ source: 'OPERATOR', confidence: 0.9, recordedAt: new Date(now.getTime() - 30 * 60_000) }, { availability: 'limited', reportCount: 2, minutesSinceReport: 4 }, now);
    expect(result).toMatchObject({ source: 'operator', freshness: 'aging', ageSeconds: 1800, confidence: 0.9, isGuaranteed: false });
  });

  it('uses community evidence when no trusted snapshot exists', () => {
    const result = buildAvailabilityProvenance(undefined, { availability: 'limited', reportCount: 2, minutesSinceReport: 4 }, now);
    expect(result).toMatchObject({ source: 'community', freshness: 'fresh', ageSeconds: 240, isGuaranteed: false });
  });

  it('represents missing snapshots as unknown', () => {
    expect(buildAvailabilityProvenance(undefined, undefined, now)).toEqual({ source: 'unknown', recordedAt: null, ageSeconds: null, confidence: 0, freshness: 'unknown', isGuaranteed: false });
  });

  it('rejects an invalid feedback outcome at the request schema boundary', () => {
    expect(parkingFeedbackInputSchema.safeParse({ outcome: 'maybe' }).success).toBe(false);
  });

  it('accepts and replays an idempotent valid feedback submission', async () => {
    const input = { zoneId: feedbackZoneId, outcome: 'delayed' as const, delayBucket: '5_15m' as const };
    const key = `feedback-idempotency-${randomUUID()}`;
    const first = await submitParkingFeedback(feedbackUserId, input, key);
    const replay = await submitParkingFeedback(feedbackUserId, input, key);
    expect(replay).toMatchObject({ id: first.id, userId: feedbackUserId, zoneId: feedbackZoneId, outcome: 'delayed', delayBucket: 'five_15m' });
    expect(await db.parkingFeedback.count({ where: { userId: feedbackUserId, zoneId: feedbackZoneId } })).toBe(1);
  });
});

describe('zone availability and provenance agree', () => {
  beforeEach(async () => {
    await db.parkingReport.deleteMany({ where: { zoneId: feedbackZoneId } });
    await db.availabilitySnapshot.deleteMany({ where: { zoneId: feedbackZoneId } });
  });

  const readZone = async () => zoneDto(await db.parkingZone.findUniqueOrThrow({ where: { id: feedbackZoneId }, include: zoneInclude }));

  it('shows the operator availability and keeps a contradictory crowd report separate', async () => {
    await db.availabilitySnapshot.create({ data: { zoneId: feedbackZoneId, availability: 'available', source: 'OPERATOR', confidence: 0.95, availableSpaces: 4, recordedAt: new Date(Date.now() - 5 * 60_000) } });
    await db.parkingReport.create({ data: { zoneId: feedbackZoneId, userId: feedbackUserId, availability: 'full', reportedAt: new Date(Date.now() - 60_000) } });

    const zone = await readZone();
    expect(zone.availability).toBe('available');
    expect(zone.availabilityProvenance).toMatchObject({ source: 'operator', freshness: 'fresh', availableSpaces: 4, isGuaranteed: true });
    expect(zone.crowd).toMatchObject({ availability: 'full', baseAvailability: 'available', reportCount: 1 });
  });

  it('does not present a report as trusted live availability when the operator feed has expired', async () => {
    await db.availabilitySnapshot.create({ data: { zoneId: feedbackZoneId, availability: 'available', source: 'OPERATOR', confidence: 0.9, recordedAt: new Date(Date.now() - 3 * 60 * 60_000) } });
    await db.parkingReport.create({ data: { zoneId: feedbackZoneId, userId: feedbackUserId, availability: 'full', reportedAt: new Date(Date.now() - 60_000) } });

    const zone = await readZone();
    expect(zone.availability).toBe('unknown');
    expect(zone.availabilityProvenance).toMatchObject({ source: 'operator', freshness: 'stale', isGuaranteed: false });
    expect(zone.crowd?.availability).toBe('full');
  });

  it('labels the selected community-only availability as unguaranteed', async () => {
    await db.parkingReport.create({ data: { zoneId: feedbackZoneId, userId: feedbackUserId, availability: 'limited', reportedAt: new Date(Date.now() - 60_000) } });

    const zone = await readZone();
    expect(zone.availability).toBe('limited');
    expect(zone.availabilityProvenance).toMatchObject({ source: 'community', freshness: 'fresh', isGuaranteed: false });
  });

});
