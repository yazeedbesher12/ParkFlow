export type MemberRole = "owner" | "manager" | "attendant";
export type ZoneLifecycle =
  "draft" | "review" | "published" | "suspended" | "archived";
export interface ManagementHours {
  weekday: number;
  opensAt: string;
  closesAt: string;
  closed: boolean;
}
export interface ZoneMetadata {
  images: string[];
  amenities: string[];
  entrance?: { latitude: number; longitude: number; instructions?: string };
  heightLimitMeters?: number;
}
export interface ManagementTariff {
  id: string;
  name: string;
  hourlyRate: number;
  incrementMinutes: number;
  freeMinutes: number;
  minimumCharge: number;
  dailyCap: number | null;
  maxStayMinutes: number | null;
  validFrom: string;
  validTo: string | null;
}
export interface ManagementClosure {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}
export interface ManagementZone {
  id: string;
  operatorId: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
  kind: string;
  capacity: number | null;
  active: boolean;
  version: number;
  lifecycle: ZoneLifecycle;
  inventoryMode: string;
  inventoryProvider: string | null;
  defaultMode: "start_stop" | "prepaid";
  supportedModes: ("start_stop" | "prepaid")[];
  supportedEntryMethods: string[];
  metadata: ZoneMetadata | null;
  tariffs: ManagementTariff[];
  operatingHours: ManagementHours[];
  closures: ManagementClosure[];
  operator: { id: string; name: string };
  memberRole: MemberRole | "admin";
  canEdit: boolean;
}
export interface ManagementPerson {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
}
export interface ManagementOperator {
  id: string;
  name: string;
  type: string;
  memberRole: MemberRole | "admin";
  canManageStaff: boolean;
  canCreateZone: boolean;
  zoneCount: number;
  members: { userId: string; memberRole: MemberRole; user: ManagementPerson }[];
}
export interface ZoneInput {
  operatorId: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  description?: string;
  address?: string;
  latitude: number;
  longitude: number;
  kind: "street" | "garage" | "lot" | "private";
  capacity: number;
  defaultMode: "start_stop" | "prepaid";
  supportedModes: ("start_stop" | "prepaid")[];
  supportedEntryMethods: string[];
  metadata?: ZoneMetadata;
}
export interface TariffInput {
  name: string;
  hourlyRate: number;
  incrementMinutes: number;
  freeMinutes: number;
  minimumCharge: number;
  dailyCap?: number;
  maxStayMinutes?: number;
  validFrom: string;
  validTo?: string;
}
