import { env } from './env';
import { assert } from '../utils/errors';

export const developmentEmailLoginEnabled = () => env.AUTH_LOGIN_METHOD === 'email' && env.NODE_ENV === 'development' && env.DEV_SKIP_EMAIL_OTP;
export const developmentPhoneLoginEnabled = () => env.AUTH_LOGIN_METHOD === 'phone' && env.NODE_ENV === 'development' && env.DEV_SKIP_PHONE_OTP;

export function requireAuthMethod(method: 'email' | 'phone') {
  assert(env.AUTH_LOGIN_METHOD === method, 'AUTH_METHOD_DISABLED', `Sign in using ${env.AUTH_LOGIN_METHOD} verification.`, 403);
}

export function requireOtpEnabled() {
  assert(!developmentPhoneLoginEnabled() && !developmentEmailLoginEnabled(), 'OTP_TEMPORARILY_DISABLED', 'Verification codes are paused for development. Return to the sign-in screen to continue.', 409);
}
