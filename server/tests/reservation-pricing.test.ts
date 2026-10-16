import { describe, expect, it } from 'vitest';
import { buildReservationQuote, assertReservationQuote } from '../src/modules/reservations/pricing';
import { getActiveTariff } from '../src/modules/parking/tariff';

const start = new Date('2030-01-05T08:00:00Z');
const zone = { id: 'zone', version: 3 };
const tariff = {
  id: 'price', name: 'Standard', currency: 'ILS', hourlyRate: 600,
  minimumCharge: 500, dailyCap: 1200, freeMinutes: 0, incrementMinutes: 15,
  maxStayMinutes: null, validFrom: new Date('2030-01-01'), validTo: null,
};
const quote = (minutes = 30, rate = tariff) => buildReservationQuote(zone, rate, start, minutes);

describe('authoritative reservation quotes', () => {
  it('applies the configured minimum instead of simple hourly multiplication', () => {
    expect(quote().totalMinor).toBe(500);
  });
  it('applies the configured cap', () => {
    expect(quote(180).totalMinor).toBe(1200);
  });
  it('uses the canonical free-minutes and billing-increment rules', () => {
    expect(quote(60, { ...tariff, minimumCharge: 0, freeMinutes: 10, incrementMinutes: 30 }).totalMinor).toBe(600);
    expect(quote(30, { ...tariff, freeMinutes: 30 }).totalMinor).toBe(0);
  });
  it('accepts the exact price and selection the customer reviewed', () => {
    const reviewed = quote();
    expect(() => assertReservationQuote(reviewed, reviewed.confirmation)).not.toThrow();
  });
  it.each([
    { zoneVersion: 2 }, { tariffId: 'older-price' }, { totalMinor: 300 },
    { startTime: '2030-01-05T09:00:00.000Z' }, { durationMinutes: 60 }, { zoneId: 'other' }, { currency: 'USD' },
  ])('rejects stale or inconsistent confirmation %j', (patch) => {
    const current = quote();
    expect(() => assertReservationQuote(current, { ...current.confirmation, ...patch })).toThrowError(expect.objectContaining({ code: 'QUOTE_CHANGED' }));
  });
  it('selects future rates only when their start has arrived', () => {
    const future = { ...tariff, id: 'future', validFrom: new Date('2030-01-06'), hourlyRate: 1800 };
    const current = { ...tariff, validTo: future.validFrom };
    expect(getActiveTariff([future, current], start)?.id).toBe('price');
    expect(getActiveTariff([future, current], future.validFrom)?.id).toBe('future');
  });
});
