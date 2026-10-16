import { describe, expect, it } from 'vitest';
import { getActiveTariff } from '../src/modules/parking/tariff.ts';

describe('parking tariff selection', () => {
it('selects the tariff that is valid at the requested time', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const current = { id: 'current', validFrom: new Date('2026-09-01T00:00:00.000Z'), validTo: null };
  const future = { id: 'future', validFrom: new Date('2026-11-01T00:00:00.000Z'), validTo: null };

  expect(getActiveTariff([future, current], now)).toEqual(current);
});

it('returns no tariff when every tariff is expired or not started', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const expired = { id: 'expired', validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: new Date('2026-09-30T23:59:59.999Z') };
  const future = { id: 'future', validFrom: new Date('2026-11-01T00:00:00.000Z'), validTo: null };

  expect(getActiveTariff([expired, future], now)).toBeUndefined();
});
});
