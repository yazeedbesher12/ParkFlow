import { db } from '../../database/client';
import { requireValue } from '../../utils/errors';
import { aggregate } from '../reports/aggregation';
import { distanceMeters } from '../../utils/geo';
import type { Prisma } from '@prisma/client';
import { getActiveTariff } from './tariff';
export const zoneInclude={operator:true,tariffs:{orderBy:{validFrom:'desc' as const}},operatingHours:true,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}},snapshots:{orderBy:{recordedAt:'desc' as const},take:1}};

/** Availability freshness is intentionally conservative: operator feeds are
 * fresh for 15 minutes, aging through 60 minutes, and stale after two hours. */
export const AVAILABILITY_FRESH_SECONDS = 15 * 60;
export const AVAILABILITY_AGING_SECONDS = 60 * 60;
export const AVAILABILITY_STALE_SECONDS = 2 * 60 * 60;
export type AvailabilityFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';
export type AvailabilitySource = 'operator' | 'admin' | 'sensor' | 'anpr' | 'community' | 'unknown';
export interface ParkingAvailabilityProvenance {
  source: AvailabilitySource;
  recordedAt: string | null;
  ageSeconds: number | null;
  confidence: number;
  freshness: AvailabilityFreshness;
  availableSpaces?: number;
  occupiedSpaces?: number;
  isGuaranteed: boolean;
}
type AvailabilitySnapshotLike = { source?: string | null; recordedAt: Date | string; confidence?: number | null; availableSpaces?: number | null; occupiedSpaces?: number | null; availability?: string } | null | undefined;
type CrowdLike = { availability?: string; minutesSinceReport?: number; reportCount?: number } | null | undefined;

const sourceName = (source?: string | null): AvailabilitySource => {
  switch (source?.toLowerCase()) {
    case 'operator': case 'operator_feed': case 'parking_operator': return 'operator';
    case 'admin': case 'municipality': return 'admin';
    case 'sensor': return 'sensor';
    case 'anpr': return 'anpr';
    case 'community': case 'driver': case 'crowd': return 'community';
    default: return 'unknown';
  }
};

export function buildAvailabilityProvenance(
  snapshot: AvailabilitySnapshotLike,
  crowd: CrowdLike,
  now = new Date(),
): ParkingAvailabilityProvenance {
  const snapshotAt = snapshot ? new Date(snapshot.recordedAt) : undefined;
  const snapshotAge = snapshotAt ? Math.max(0, Math.floor((now.getTime() - snapshotAt.getTime()) / 1000)) : undefined;
  const crowdAge = crowd?.minutesSinceReport != null ? Math.max(0, Math.floor(crowd.minutesSinceReport * 60)) : undefined;
  // The freshest eligible signal wins. Driver reports are useful, but never a
  // guarantee and retain a distinct source in the DTO.
  // A crowd report can enrich an empty feed, but it must not override a
  // verified operator/sensor/admin/ANPR signal merely because it arrived later.
  // This keeps a fresh trusted feed authoritative while still exposing
  // community-only evidence when no trusted snapshot exists.
  const trustedSnapshot = snapshot && ['operator', 'admin', 'sensor', 'anpr'].includes(sourceName(snapshot.source));
  const useCrowd = !trustedSnapshot && crowdAge != null && (snapshotAge == null || crowdAge < snapshotAge);
  const ageSeconds = (useCrowd ? crowdAge : snapshotAge) ?? null;
  const freshness: AvailabilityFreshness = ageSeconds == null
    ? 'unknown'
    : ageSeconds <= AVAILABILITY_FRESH_SECONDS
      ? 'fresh'
      : ageSeconds <= AVAILABILITY_AGING_SECONDS
        ? 'aging'
        : ageSeconds <= AVAILABILITY_STALE_SECONDS
          ? 'stale'
          : 'stale';
  if (useCrowd) {
    const recordedAt = new Date(now.getTime() - crowdAge! * 1000).toISOString();
    return {
      source: 'community', recordedAt, ageSeconds, confidence: Math.min(0.8, 0.35 + (crowd?.reportCount ?? 1) * 0.1),
      freshness, isGuaranteed: false,
    };
  }
  if (!snapshot || snapshotAge == null || Number.isNaN(snapshotAge)) {
    return { source: 'unknown', recordedAt: null, ageSeconds: null, confidence: 0, freshness: 'unknown', isGuaranteed: false };
  }
  return {
    source: sourceName(snapshot.source), recordedAt: snapshotAt!.toISOString(), ageSeconds,
    confidence: snapshot.confidence == null ? 0 : Math.max(0, Math.min(1, snapshot.confidence)),
    freshness,
    ...(snapshot.availableSpaces == null ? {} : { availableSpaces: snapshot.availableSpaces }),
    ...(snapshot.occupiedSpaces == null ? {} : { occupiedSpaces: snapshot.occupiedSpaces }),
    isGuaranteed: false,
  };
}

export function zoneDto(z:Prisma.ParkingZoneGetPayload<{include:typeof zoneInclude}>){const now=new Date();const tariff=getActiveTariff(z.tariffs,now);const crowd=aggregate(z.reports.map(r=>({...r,status:r.availability})),30,120);const snapshot=z.snapshots[0];const baseAvailability=snapshot&&now.getTime()-snapshot.recordedAt.getTime()<7200000?snapshot.availability:'unknown';const availabilityProvenance=buildAvailabilityProvenance(snapshot,crowd.status?{availability:crowd.status,reportCount:crowd.reportCount,minutesSinceReport:crowd.minutesSinceReport}:undefined,now);const selectedAvailability=availabilityProvenance.source==='community'?crowd.status??'unknown':snapshot&&availabilityProvenance.source!=='unknown'&&availabilityProvenance.ageSeconds!=null&&availabilityProvenance.ageSeconds<=AVAILABILITY_STALE_SECONDS?snapshot.availability:'unknown';availabilityProvenance.isGuaranteed=Boolean(z.inventoryMode==='live'&&z.inventoryProvider?.toLowerCase()==='manual'&&!z.prototypeData&&(z.capacity??0)>0&&availabilityProvenance.source==='operator'&&availabilityProvenance.freshness==='fresh');return {...z,location:{latitude:z.latitude,longitude:z.longitude},operatorName:z.operator.name,tariff,availability:selectedAvailability,availabilityProvenance,provenance:availabilityProvenance,crowd:crowd.status?{availability:crowd.status,baseAvailability,reportCount:crowd.reportCount,minutesSinceReport:crowd.minutesSinceReport}:undefined,tariffs:undefined,reports:undefined,snapshots:undefined,operator:undefined};}
export async function listZones(query:{search?:string;lat?:number;lng?:number;radius?:number}={}){
 const rows=await db.parkingZone.findMany({where:{active:true,lifecycle:'published',...(query.search?{OR:['name','nameAr','code','city'].map(k=>({[k]:{contains:query.search,mode:'insensitive'}}))}:{})},include:{...zoneInclude,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}}}});
 return rows.map(zoneDto).filter(z=>z.tariff).filter(z=>query.lat==null||query.lng==null||distanceMeters(z.location,{latitude:query.lat,longitude:query.lng})<=(query.radius??5000));
}
export async function getZone(id:string){const z=requireValue(await db.parkingZone.findFirst({where:{id,active:true,lifecycle:'published'},include:{...zoneInclude,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}}}}));const dto=zoneDto(z);return {...dto,tariff:requireValue(dto.tariff,'Parking zone has no active tariff')};}
export async function byCode(code:string){let normalized=code.trim().toUpperCase();try{normalized=new URL(code).pathname.split('/').filter(Boolean).pop()!.toUpperCase();}catch{}const z=requireValue(await db.parkingZone.findFirst({where:{code:normalized,active:true,lifecycle:'published'}}));return getZone(z.id);}
export async function facility(id:string){const f=requireValue(await db.parkingFacility.findUnique({where:{id}}));return {...f,location:{latitude:f.latitude,longitude:f.longitude},availability:'unknown'};}
export async function facilityNavigation(id:string){
 const f=requireValue(await db.parkingFacility.findUnique({where:{id},select:{id:true,entrances:true,exits:true,levels:true,walkingDestinations:true}}));
 return { facilityId:f.id, levels:f.levels, entrances:Array.isArray(f.entrances)?f.entrances:[], exits:Array.isArray(f.exits)?f.exits:[], walkingDestinations:Array.isArray(f.walkingDestinations)?f.walkingDestinations:[] };
}
