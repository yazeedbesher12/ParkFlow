import type { GeoPoint, ID, ISODateString } from './common';
import type { AvailabilityLevel } from './parking';

/** Community-reported state of a checkpoint. "open" is also the assumed default. */
export type CheckpointStatus = 'open' | 'congested' | 'closed';

/** Where a road report came from — weighted by credibility when statuses are computed. */
export type RoadSource = 'telegram' | 'whatsapp' | 'driver';

export interface Checkpoint {
  id: ID;
  nameAr: string;
  nameEn: string;
  location: GeoPoint;
  /** Spellings people actually use in posts ("الكونتينر", "Container", ...). */
  aliases: string[];
}

export interface CheckpointState extends Checkpoint {
  status: CheckpointStatus;
  /** True when there is no recent report and "open" is only an assumption. */
  assumed: boolean;
  /** Minutes since the newest report; undefined when there are none. */
  minutesSinceReport?: number;
  reportCount: number;
}

export interface RoadEvent {
  id: ID;
  checkpointId: ID;
  status: CheckpointStatus;
  source: RoadSource;
  /** The original post for telegram/whatsapp; absent for one-tap driver reports. */
  rawText?: string;
  userId?: ID;
  reportedAt: ISODateString;
}

export interface RoadFeedItem extends RoadEvent {
  checkpointNameAr: string;
  checkpointNameEn: string;
}

export interface RoadPostResult {
  /** Present only when both a checkpoint and a status were read from the post. */
  event?: RoadFeedItem;
  checkpoint?: Checkpoint;
  status?: CheckpointStatus;
}

export type ReportedAvailability = Exclude<AvailabilityLevel, 'unknown'>;

export interface ZoneReport {
  id: ID;
  zoneId: ID;
  userId?: ID;
  availability: ReportedAvailability;
  reportedAt: ISODateString;
}

/** Driver-reported availability, overlaid on the zone's official level. */
export interface CrowdAvailability {
  availability: ReportedAvailability;
  /** The operator's own level, kept so crowd reports never block parking. */
  baseAvailability: AvailabilityLevel;
  reportCount: number;
  minutesSinceReport: number;
}

export type PointsReason = 'zone_report' | 'road_report';

export interface PointsEntry {
  id: ID;
  userId: ID;
  points: number;
  reason: PointsReason;
  /** Points start pending; they verify once nobody contradicts the report. */
  state: 'pending' | 'verified' | 'revoked';
  /** The zone or checkpoint reported on — used to stop repeat-tap farming. */
  placeId: ID;
  /** The report that earned the points. */
  refId: ID;
  createdAt: ISODateString;
}

export type TrustTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type TrustFactorKey =
  | 'verified_phone'
  | 'vehicle'
  | 'paid_sessions'
  | 'reports'
  | 'unpaid_fines';

export interface TrustFactor {
  key: TrustFactorKey;
  count: number;
  points: number;
}

export interface TrustSummary {
  score: number;
  tier: TrustTier;
  discountPercent: number;
  next?: { tier: TrustTier; at: number; discountPercent: number };
  pendingPoints: number;
  factors: TrustFactor[];
  recent: PointsEntry[];
}

export interface Landmark {
  id: ID;
  nameAr: string;
  nameEn: string;
  kind: 'landmark' | 'building';
  location: GeoPoint;
  aliases?: string[];
}

export interface RouteClosure {
  checkpointId: ID;
  nameAr: string;
  nameEn: string;
  status: Exclude<CheckpointStatus, 'open'>;
}

export interface RouteResult {
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
  /** Delay added for closures the chosen route still passes (0 when it avoids them all). */
  penaltySeconds: number;
  closuresOnRoute: RouteClosure[];
  /** Alternatives that were not taken, and the closure that ruled each one out. */
  rejected: { coordinates: GeoPoint[]; blockedBy?: RouteClosure }[];
  source: 'osrm' | 'straight-line';
}
