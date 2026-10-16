import { z } from 'zod';
import { actor, admins, param, route } from '../../apiRegistry';
import * as verification from './service';
route('get', '/admin/vehicle-verifications', z.object({ query: z.string().trim().max(200).optional() }).strict(), (r, b) => verification.list(actor(r), b.query), admins);
route('patch', '/admin/vehicle-verifications/:id', z.object({ verified: z.boolean(), role: z.enum(['owner', 'driver', 'manager']), reason: z.string().trim().min(10).max(500) }).strict(), (r, b) => verification.review(actor(r), param(r), b), admins);
