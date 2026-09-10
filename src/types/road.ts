import type { GeoPoint, ID, ISODateString } from './common';
import type { AvailabilityLevel } from './parking';

/** Driver-reported state of a checkpoint. "open" is also the assumed default. */
export type CheckpointStatus = 'open' | 'congested' | 'closed';

export interface Checkpoint {
  id: ID;
  nameAr: string;
  nameEn: string;
  location: GeoPoint;
}

export interface CheckpointState extends Checkpoint {
  status: CheckpointStatus;
  /** True when there is no recent report and "open" is only an assumption. */
  assumed: boolean;
  /** Minutes since the newest report; undefined when there are none. */
  minutesSinceReport?: number;
  reportCount: number;
}

/** A driver's one-tap report of a checkpoint's status. */
export interface RoadEvent {
  id: ID;
  checkpointId: ID;
  status: CheckpointStatus;
  /** Absent for the demo's seeded "other drivers" reports. */
  userId?: ID;
  reportedAt: ISODateString;
}

export interface RoadFeedItem extends RoadEvent {
  checkpointNameAr: string;
  checkpointNameEn: string;
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
