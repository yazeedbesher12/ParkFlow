import { z } from 'zod';
import { actor, empty, operators, param, route } from '../../apiRegistry';
import * as operator from './service';

const availabilityInput = z.object({
  availability: z.enum(['available', 'limited', 'full', 'unknown']),
  availableSpaces: z.number().int().nonnegative().optional(),
  occupiedSpaces: z.number().int().nonnegative().optional(),
  source: z.enum(['ADMIN', 'OPERATOR', 'SENSOR', 'ANPR']).optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().max(500).optional(),
}).strict();

route('get', '/operator/summary', empty, (request) => operator.summary(actor(request)), operators);
route('post', '/operator/zones/:id/availability', availabilityInput, (request, input) => operator.availability(actor(request), param(request), input), operators);
route('get', '/operator/zones/:id/reservations', empty, (request) => operator.reservations(actor(request), param(request)), operators);
const checkInInput = z.object({ qrToken: z.string().trim().min(20).max(500).optional() }).strict();
const recoveryInput = z.object({ resolution: z.enum(['alternative', 'refund_requested']), note: z.string().trim().max(500).optional() }).strict();
route('post', '/operator/reservations/:id/check-in', checkInInput, (request, input) => operator.checkIn(actor(request), param(request), input), operators);
route('post', '/operator/reservations/:id/recovery', recoveryInput, (request, input) => operator.resolveReservation(actor(request), param(request), input), operators);
route('get', '/operator/feed-health', empty, (request) => operator.feedHealth(actor(request)), operators);
