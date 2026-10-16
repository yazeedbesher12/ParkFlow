import type { ID, ISODateString } from './common';

export interface User {
  id: ID;
  fullName: string;
  phone?: string | null;
  countryCode?: string | null;
  email?: string | null;
  avatarUrl?: string;
  /** Self-declared; only used to offer or join women-only rides. */
  gender?: 'female' | 'male' | null;
  /** The full ID is never returned by the server. */
  nationalIdMasked?: string | null;
  phoneVerifiedAt?: ISODateString | null;
  emailVerifiedAt?: ISODateString | null;
  profileCompletedAt?: ISODateString | null;
  locale: 'en' | 'ar';
  /** Returned by the backend for authorization-aware navigation. */
  role?: 'USER' | 'ADMIN' | 'PARKING_OPERATOR' | 'ENFORCEMENT_OFFICER';
  status?: 'ACTIVE' | 'SUSPENDED';
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Native credentials are stored in the operating system's protected store. */
export interface BearerAuthSession {
  transport?: 'bearer';
  userId: ID;
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODateString;
}

/** Browser credentials remain in HttpOnly cookies, never in this DTO. */
export interface WebAuthSession {
  transport: 'cookie';
  userId: ID;
  sessionId: ID;
  /** Stable across refresh rotation; a new login gets a different identity. */
  loginId: ID;
  expiresAt: ISODateString;
  csrfToken: string;
}

export type AuthSession = BearerAuthSession | WebAuthSession;

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
