import type { ParkingFeedbackOutcome } from '@prisma/client';
import { z } from 'zod';
import { db, lock } from '../../database/client';
import { idempotent } from '../../utils/idempotency';
import { assert, requireValue } from '../../utils/errors';

export interface SubmitParkingFeedbackInput {
  zoneId: string;
  outcome: ParkingFeedbackOutcome;
  delayBucket?: 'under_5m' | '5_15m' | 'over_15m';
  sessionId?: string;
  reservationId?: string;
}

/** Shared route boundary so invalid outcomes are rejected before service work. */
export const parkingFeedbackInputSchema = z.object({
  outcome: z.enum(['found', 'not_found', 'delayed']),
  delayBucket: z.enum(['under_5m', '5_15m', 'over_15m']).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  reservationId: z.string().min(1).max(200).optional(),
}).strict();

/** Store a coarse outcome while proving any supplied parking references belong
 * to the submitting driver and the reported zone. */
export async function submitParkingFeedback(
  userId: string,
  input: SubmitParkingFeedbackInput,
  requestKey: string,
) {
  return idempotent(userId, `parking-feedback:${input.zoneId}`, requestKey, input, async (tx) => {
    await lock(tx, `parking-feedback:${userId}:${input.zoneId}`);
    requireValue(await tx.parkingZone.findFirst({ where: { id: input.zoneId, active: true } }), 'Parking zone not found');
    if (input.sessionId) {
      const session = requireValue(await tx.parkingSession.findUnique({ where: { id: input.sessionId } }), 'Parking session not found');
      assert(session.userId === userId && session.parkingZoneId === input.zoneId, 'FORBIDDEN', 'Session does not belong to this zone', 403);
    }
    if (input.reservationId) {
      const reservation = requireValue(await tx.parkingReservation.findUnique({ where: { id: input.reservationId } }), 'Parking reservation not found');
      assert(reservation.userId === userId && reservation.parkingZoneId === input.zoneId, 'FORBIDDEN', 'Reservation does not belong to this zone', 403);
    }
    return tx.parkingFeedback.create({
      data: {
        userId,
        zoneId: input.zoneId,
        outcome: input.outcome,
        delayBucket: input.delayBucket === '5_15m' ? 'five_15m' : input.delayBucket,
        sessionId: input.sessionId,
        reservationId: input.reservationId,
        idempotencyKey: requestKey,
      },
    });
  });
}

export async function getParkingFeedback(id: string) {
  return requireValue(await db.parkingFeedback.findUnique({ where: { id } }));
}
