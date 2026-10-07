import { z } from 'zod';
import { id } from '../../apiRegistry';

export const quoteReservationInput = z.object({
  zoneId: id,
  startTime: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(30).max(480).refine((value) => value % 30 === 0, 'Use 30-minute increments'),
}).strict();

export const reservationQuoteConfirmation = quoteReservationInput.extend({
  zoneVersion: z.number().int().positive(),
  tariffId: id,
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
}).strict();

export const createReservationInput = quoteReservationInput.extend({
  spotId: id,
  quote: reservationQuoteConfirmation,
}).strict();

export const validateQrInput = z.object({
  token: z.string().trim().min(20).max(500),
}).strict();
