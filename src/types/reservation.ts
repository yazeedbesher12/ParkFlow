import type { Currency, GeoPoint, ID, ISODateString } from './common';

export type ParkingReservationStatus =
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'checked_in'
  | 'completed';

export interface ReservationParkingZone {
  id: ID;
  code: string;
  name: string;
  nameAr: string;
  location: GeoPoint;
}

export interface ParkingReservation {
  id: ID;
  parkingZoneId: ID;
  userId: ID;
  spotId?: ID;
  spotCode?: string;
  startTime: ISODateString;
  endTime: ISODateString;
  durationMinutes: number;
  hourlyRateSnapshot: number;
  estimatedTotalPriceSnapshot: number;
  currency: Currency;
  priceIsDemo: boolean;
  /** Explicit inventory source retained alongside the legacy demo flag. */
  isDemoReservation: boolean;
  inventoryMode?: 'demo' | 'live';
  guarantee?: 'none' | 'operator_backed';
  holdExpiresAt?: ISODateString;
  checkedInAt?: ISODateString | null;
  operatorResolution?: 'none' | 'alternative' | 'refund_requested';
  operatorResolutionNote?: string | null;
  status: ParkingReservationStatus;
  publicCode: string;
  qrValue: string;
  zone: ReservationParkingZone;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ParkingReservationSelection {
  zoneId: ID;
  startTime: ISODateString;
  durationMinutes: number;
}

export interface ReservationQuoteConfirmation extends ParkingReservationSelection {
  zoneVersion: number;
  tariffId: ID;
  totalMinor: number;
  currency: Currency;
}

export interface ParkingReservationQuote extends ReservationQuoteConfirmation {
  endTime: ISODateString;
  tariffName: string;
  hourlyRate: number;
  minimumCharge: number;
  dailyCap: number | null;
  freeMinutes: number;
  incrementMinutes: number;
  maxStayMinutes: number | null;
  confirmation: ReservationQuoteConfirmation;
}

export interface CreateParkingReservationInput extends ParkingReservationSelection {
  spotId: ID;
  quote: ReservationQuoteConfirmation;
}

export interface QrValidationResult {
  valid: boolean;
  reason?: ParkingReservationStatus | 'not_found';
  reservation?: ParkingReservation;
}
