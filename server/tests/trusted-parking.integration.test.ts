import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { paths } from '../src/apiRegistry';
import '../src/api';
import { baselineForecast } from '../src/modules/forecasting/baseline';
import { scoreParkingOption } from '../src/modules/routing/service';
import { db } from '../src/database/client';
import * as operator from '../src/modules/operator/service';
import * as reservations from '../src/modules/reservations/service';
import { forecast } from '../src/modules/forecasting/service';
import { submitParkingFeedback } from '../src/modules/parking/feedback';
import { zoneDto, zoneInclude } from '../src/modules/parking/service';

const suffix = randomUUID();
const integrationUserId = `journey-user-${suffix}`;
const integrationOperatorUserId = `journey-operator-user-${suffix}`;
const integrationOperatorId = `journey-operator-${suffix}`;
const integrationZoneId = `journey-zone-${suffix}`;
const actor = { userId: integrationOperatorUserId, role: 'PARKING_OPERATOR' as const };
let journeyReady = false;
let journeyReservationId: string | undefined;

beforeAll(async () => {
  await db.user.createMany({ data: [
    { id: integrationUserId, email: `${integrationUserId}@example.com` },
    { id: integrationOperatorUserId, email: `${integrationOperatorUserId}@example.com`, role: 'PARKING_OPERATOR' },
  ] });
  await db.parkingOperator.create({ data: { id: integrationOperatorId, name: 'Trusted journey operator' } });
  await db.operatorUser.create({ data: { operatorId: integrationOperatorId, userId: integrationOperatorUserId } });
  await db.parkingZone.create({ data: {
    id: integrationZoneId,
    operatorId: integrationOperatorId,
    code: `JOURNEY-${suffix.slice(-8)}`,
    name: 'Trusted journey zone',
    nameAr: 'منطقة الرحلة الموثوقة',
    city: 'Ramallah',
    cityAr: 'رام الله',
    latitude: 31.9,
    longitude: 35.2,
    kind: 'garage',
    inventoryMode: 'live',
    inventoryProvider: 'manual',
    capacity: 2,
    defaultMode: 'start_stop',
    supportedModes: ['start_stop'],
    supportedEntryMethods: ['manual'],
  } });
  await db.parkingTariff.create({ data: { zoneId: integrationZoneId, name: 'Journey tariff', hourlyRate: 500, incrementMinutes: 30, freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 60_000) } });
  await db.operatingHour.createMany({ data: Array.from({ length: 7 }, (_, weekday) => ({ zoneId: integrationZoneId, weekday, opensAt: '00:00', closesAt: '23:59' })) });
  journeyReady = true;
});

afterAll(async () => {
  if (!journeyReady) return;
  await db.parkingFeedback.deleteMany({ where: { userId: integrationUserId, zoneId: integrationZoneId } });
  if (journeyReservationId) {
    await db.parkingFeedback.deleteMany({ where: { reservationId: journeyReservationId } });
    await db.parkingReservation.deleteMany({ where: { id: journeyReservationId } });
  }
  await db.inventoryHold.deleteMany({ where: { zoneId: integrationZoneId } });
  await db.availabilitySnapshot.deleteMany({ where: { zoneId: integrationZoneId } });
  await db.parkingTariff.deleteMany({ where: { zoneId: integrationZoneId } });
  await db.operatingHour.deleteMany({ where: { zoneId: integrationZoneId } });
  await db.operatorUser.deleteMany({ where: { operatorId: integrationOperatorId } });
  await db.parkingZone.delete({ where: { id: integrationZoneId } });
  await db.parkingOperator.delete({ where: { id: integrationOperatorId } });
  await db.idempotencyRecord.deleteMany({ where: { userId: { in: [integrationUserId, integrationOperatorUserId] } } });
  await db.auditLog.deleteMany({ where: { actorUserId: { in: [integrationUserId, integrationOperatorUserId] } } });
  await db.user.deleteMany({ where: { id: { in: [integrationUserId, integrationOperatorUserId] } } });
});

describe('trusted parking integration contracts', () => {
  it('registers the cross-slice routes used by the pilot journey', () => {
    expect(paths['/api/v1/operator/zones/{id}/availability']).toBeTruthy();
    expect(paths['/api/v1/operator/reservations/{id}/check-in']).toBeTruthy();
    expect(paths['/api/v1/parking/zones/{id}/feedback']).toBeTruthy();
    expect(paths['/api/v1/parking/zones/{id}/forecast']).toBeTruthy();
    expect(paths['/api/v1/parking/facilities/{id}/navigation']).toBeTruthy();
  });

  it('keeps the final journey estimate bounded and explicitly unguaranteed with sparse history', () => {
    const arrivalAt = new Date('2026-10-03T10:00:00.000Z');
    const forecast = baselineForecast(arrivalAt, [], { confidence: 0.2, freshness: 'unknown' }, true, arrivalAt);
    expect(forecast.probability).toBeGreaterThanOrEqual(0);
    expect(forecast.probability).toBeLessThanOrEqual(1);
    expect(forecast.fallback).toBe(true);
    expect(forecast.guarantee).toBe('none');
    expect(scoreParkingOption({ provenance: { confidence: forecast.confidence } }).total).toBeGreaterThanOrEqual(0);
  });

  it('completes the trusted operator journey through reservation, check-in, feedback, and forecast', async () => {
    const update = await operator.availability(actor, integrationZoneId, { availability: 'available', availableSpaces: 2, occupiedSpaces: 0, confidence: 0.98, source: 'OPERATOR', reason: 'Opening count' });
    expect(update.source).toBe('OPERATOR');
    const zone = zoneDto(await db.parkingZone.findUniqueOrThrow({ where: { id: integrationZoneId }, include: zoneInclude }));
    expect(zone.availabilityProvenance).toMatchObject({ source: 'operator', freshness: 'fresh', availableSpaces: 2, isGuaranteed: true });

    const start = new Date(Date.now() + 1_000);
    const created = await reservations.create(integrationUserId, { zoneId: integrationZoneId, spotId: `${integrationZoneId}:L001`, startTime: start.toISOString(), durationMinutes: 30 }, `journey-${suffix}`);
    expect(created).toMatchObject({ id: expect.any(String), guarantee: 'operator_backed', inventoryMode: 'live' });
    journeyReservationId = created.id;
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const checkedIn = await operator.checkIn(actor, created.id, { qrToken: created.qrValue });
    expect(checkedIn).toMatchObject({ id: created.id, status: 'checked_in' });

    const feedback = await submitParkingFeedback(integrationUserId, { zoneId: integrationZoneId, reservationId: created.id, outcome: 'found' }, `journey-feedback-${suffix}`);
    expect(feedback).toMatchObject({ userId: integrationUserId, zoneId: integrationZoneId, outcome: 'found' });
    const estimate = await forecast(integrationZoneId, new Date(Date.now() + 30 * 60_000).toISOString());
    expect(estimate.guarantee).toBe('none');
    expect(estimate.probability).toBeGreaterThanOrEqual(0);
    expect(estimate.probability).toBeLessThanOrEqual(1);
  });
});
