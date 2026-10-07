import { db } from '../../database/client';
import { requireValue } from '../../utils/errors';
import { buildAvailabilityProvenance } from '../parking/service';
import { zonePermission } from '../management/permissions';
import type { Actor } from '../admin/service';
import { baselineForecast } from './baseline';
const valueFor = (availability: string) => availability === 'available' ? 0.8 : availability === 'limited' ? 0.4 : availability === 'full' ? 0 : 0.5;
export async function forecast(zoneId: string, arrivalAt: string) {
  const now = new Date();
  const zone = requireValue(await db.parkingZone.findFirst({ where: { id: zoneId, active: true } }));
  const since = new Date(now.getTime() - 90 * 86400000);
  const [snapshots, feedback] = await Promise.all([
    db.availabilitySnapshot.findMany({ where: { zoneId, recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, take: 5000 }),
    db.parkingFeedback.findMany({ where: { zoneId, createdAt: { gte: since }, outcome: { in: ['found', 'not_found'] } }, take: 5000 }),
  ]);
  const trusted = snapshots.filter(s => ['operator', 'admin', 'sensor', 'anpr'].includes(s.source.toLowerCase()));
  return baselineForecast(new Date(arrivalAt), [...trusted.map(s => ({ at: s.recordedAt, value: valueFor(s.availability), confidence: s.confidence })), ...feedback.map(f => ({ at: f.createdAt, value: f.outcome === 'found' ? 1 : 0, confidence: 0.5 }))], buildAvailabilityProvenance(snapshots[0], undefined, now), zone.prototypeData || zone.inventoryMode === 'demo', now);
}
export async function analytics(actor: Actor) {
  const now = new Date(); const since = new Date(now.getTime() - 30 * 86400000);
  // Financial summaries are scoped per membership; an attendant role elsewhere
  // must neither expose that organization nor block this user's owned locations.
  const zones = await db.parkingZone.findMany({ where: actor.role === 'ADMIN' ? {} : { operator: { users: { some: { userId: actor.userId, memberRole: { in: ['owner', 'manager'] } } } } }, take: 200 });
  return { window: { startTime: since.toISOString(), endTime: now.toISOString() }, zones: await Promise.all(zones.map(async zone => {
    await zonePermission(db, actor, zone.id, 'finance');
    const [snapshots, reservations, feedback] = await Promise.all([
      db.availabilitySnapshot.findMany({ where: { zoneId: zone.id, recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, take: 1000 }),
      db.parkingReservation.findMany({ where: { parkingZoneId: zone.id, createdAt: { gte: since } }, select: { status: true } }),
      db.parkingFeedback.groupBy({ by: ['outcome'], where: { zoneId: zone.id, createdAt: { gte: since } }, _count: true }),
    ]);
    const converted = reservations.filter(r => ['checked_in', 'completed'].includes(r.status)).length;
    return { zoneId: zone.id, name: zone.name, nameAr: zone.nameAr, occupancyTrend: snapshots.slice(0, 48).reverse().map(s => ({ recordedAt: s.recordedAt.toISOString(), occupiedSpaces: s.occupiedSpaces, availableSpaces: s.availableSpaces })), reservationConversion: { total: reservations.length, checkedIn: converted, rate: reservations.length ? converted / reservations.length : null, definition: 'checked_in_or_completed / reservations_created' }, feedback: feedback.map(f => ({ outcome: f.outcome, count: f._count })), feedQuality: { samples: snapshots.length, latest: buildAvailabilityProvenance(snapshots[0], undefined, now), trustedSamples: snapshots.filter(s => ['operator', 'admin', 'sensor', 'anpr'].includes(s.source.toLowerCase())).length } };
  })) };
}
