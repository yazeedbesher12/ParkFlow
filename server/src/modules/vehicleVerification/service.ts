import { atomic, db, json, lock } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import type { Actor } from '../admin/service';

const include = {
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  vehicle: { select: { id: true, plateNumber: true, region: true, make: true, model: true } },
} as const;

export async function list(actor: Actor, query?: string) {
  assert(actor.role === 'ADMIN', 'FORBIDDEN', 'Administrator access is required', 403);
  const search = query?.trim();
  return db.userVehicle.findMany({
    where: { unlinkedAt: null, ...(search ? { OR: [
      { vehicle: { plateNumber: { contains: search } } },
      { user: { fullName: { contains: search, mode: 'insensitive' as const } } },
      { user: { email: { contains: search, mode: 'insensitive' as const } } },
      { user: { phone: { contains: search } } },
    ] } : {}) }, include, orderBy: { linkedAt: 'desc' }, take: 200,
  });
}

export async function review(actor: Actor, id: string, input: { verified: boolean; role: 'owner' | 'driver' | 'manager'; reason: string }) {
  assert(actor.role === 'ADMIN', 'FORBIDDEN', 'Administrator access is required', 403);
  const reason = input.reason.trim();
  assert(reason.length >= 10 && reason.length <= 500, 'VALIDATION', 'Record the reviewed evidence or revocation reason');
  return atomic(async tx => {
    await lock(tx, `vehicle-verification:${id}`);
    const before = requireValue(await tx.userVehicle.findFirst({ where: { id, unlinkedAt: null } }), 'Vehicle association not found');
    const after = await tx.userVehicle.update({
      where: { id }, data: { verifiedAt: input.verified ? new Date() : null, role: input.verified ? input.role : 'driver' }, include,
    });
    await tx.auditLog.create({ data: {
      actorUserId: actor.userId, action: input.verified ? 'verify' : 'revoke', resourceType: 'vehicle-verification', resourceId: id,
      before: json({ role: before.role, verifiedAt: before.verifiedAt }),
      after: json({ role: after.role, verifiedAt: after.verifiedAt, userId: after.userId, vehicleId: after.vehicleId, reason }),
      ip: actor.ip, userAgent: actor.userAgent,
    } });
    return after;
  });
}
