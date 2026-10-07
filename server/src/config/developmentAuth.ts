import { env } from './env';
import { assert } from '../utils/errors';

export const developmentEmailLoginEnabled = () => env.NODE_ENV === 'development' && env.DEV_SKIP_EMAIL_OTP;
export const developmentPhoneLoginEnabled = () => env.NODE_ENV === 'development' && env.DEV_SKIP_PHONE_OTP && !developmentEmailLoginEnabled();

export function requireOtpEnabled() {
  assert(!developmentPhoneLoginEnabled() && !developmentEmailLoginEnabled(), 'OTP_TEMPORARILY_DISABLED', 'Verification codes are paused for development. Return to the sign-in screen to continue.', 409);
}
