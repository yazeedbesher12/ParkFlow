import type { ID, ISODateString } from './common';

export interface User {
  id: ID;
  fullName: string;
  phone?: string | null;
  countryCode?: string | null;
  email?: string | null;
  avatarUrl?: string;
  /** The full ID is never returned by the server. */
  nationalIdMasked?: string | null;
  phoneVerifiedAt?: ISODateString | null;
  profileCompletedAt?: ISODateString | null;
  locale: 'en' | 'ar';
  /** Returned by the backend for authorization-aware navigation. */
  role?: 'USER' | 'ADMIN' | 'PARKING_OPERATOR' | 'ENFORCEMENT_OFFICER';
  status?: 'ACTIVE' | 'SUSPENDED';
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AuthSession {
  userId: ID;
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODateString;
}

export interface OtpChallenge {
  challengeId: ID;
  email: string;
  /** Seconds until the user may request a new code. */
  resendAfterSeconds: number;
  expiresAt: ISODateString;
}

export interface PhoneOtpChallenge {
  challengeId: ID;
  phone: string;
  resendAfterSeconds: number;
  expiresAt: ISODateString;
  delivery: 'sms' | 'development';
}
