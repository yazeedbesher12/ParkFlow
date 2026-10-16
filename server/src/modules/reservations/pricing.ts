import { computeCost, type Rate } from '../parking/pricing';
import { ApiError } from '../../utils/errors';

export interface ReservationQuoteConfirmation {
  zoneId: string;
  zoneVersion: number;
  tariffId: string;
  startTime: string;
  durationMinutes: number;
  totalMinor: number;
  currency: string;
}
type QuoteTariff = Rate & { id: string; name: string; currency: string };

export function buildReservationQuote(
  zone: { id: string; version: number }, tariff: QuoteTariff, startTime: Date, durationMinutes: number,
) {
  const confirmation: ReservationQuoteConfirmation = {
    zoneId: zone.id, zoneVersion: zone.version, tariffId: tariff.id,
    startTime: startTime.toISOString(), durationMinutes,
    totalMinor: computeCost(tariff, durationMinutes * 60), currency: tariff.currency,
  };
  return {
    ...confirmation,
    endTime: new Date(startTime.getTime() + durationMinutes * 60_000).toISOString(),
    tariffName: tariff.name, hourlyRate: tariff.hourlyRate,
    minimumCharge: tariff.minimumCharge, dailyCap: tariff.dailyCap ?? null,
    freeMinutes: tariff.freeMinutes, incrementMinutes: tariff.incrementMinutes,
    maxStayMinutes: tariff.maxStayMinutes ?? null,
    confirmation,
  };
}

export function assertReservationQuote(
  current: ReturnType<typeof buildReservationQuote>, expected?: ReservationQuoteConfirmation,
) {
  // Internal callers may omit the quote; the public creation schema requires it.
  if (!expected) return;
  const keys = Object.keys(current.confirmation) as (keyof ReservationQuoteConfirmation)[];
  if (keys.some((key) => expected[key] !== current.confirmation[key])) {
    throw new ApiError(409, 'QUOTE_CHANGED', 'The reservation price or parking details changed. Review a new quote before confirming.');
  }
}
