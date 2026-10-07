import type { User } from '@/types';

export function asciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));
}

/** Canonical Palestinian mobile number; the server validates again. */
export function normalizePhoneInput(input: string): string | null {
  let phone = asciiDigits(input).replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^05[69]\d{7}$/.test(phone)) phone = `+970${phone.slice(1)}`;
  else if (/^5[69]\d{7}$/.test(phone)) phone = `+970${phone}`;
  if (/^\+9725[69]\d{7}$/.test(phone)) phone = `+970${phone.slice(4)}`;
  return /^\+9705[69]\d{7}$/.test(phone) ? phone : null;
}

export function authLanding(user?: Pick<User, 'id' | 'fullName' | 'profileCompletedAt' | 'role'>) {
  if (!user?.id) return '/(onboarding)/welcome' as const;
  if (user.profileCompletedAt === null || !user.fullName) return '/(onboarding)/details' as const;
  return user.role === 'ADMIN' ? '/admin' as const : '/(tabs)/map' as const;
}

export const secondsUntil = (deadline: number, now = Date.now()): number => Math.max(0, Math.ceil((deadline - now) / 1000));

export function retryDelaySeconds(error: unknown): number {
  const value = Number((error as { details?: { retryAfterSeconds?: unknown } } | null)?.details?.retryAfterSeconds);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.ceil(value), 86400) : 0;
}

export function verificationRetryDelay(error: unknown, source: 'send' | 'verify'): number {
  const serverCode = (error as { details?: { serverCode?: unknown } } | null)?.details?.serverCode;
  return source === 'verify' || serverCode === 'OTP_LOCKED' ? retryDelaySeconds(error) : 0;
}
