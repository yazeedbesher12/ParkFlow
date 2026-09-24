import type { ID, ISODateString } from './common';

export interface User {
  id: ID;
  fullName: string;
  phone?: string | null;
  countryCode?: string | null;
  email?: string | null;
  avatarUrl?: string;
  /** Not collected during basic onboarding — reserved for permits/appeals. */
  nationalId?: string;
  locale: 'en' | 'ar';
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
