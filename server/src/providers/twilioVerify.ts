import { env } from '../config/env';
import { ApiError } from '../utils/errors';

type Verification = {sid: string; status: string; valid?: boolean};
type Credentials = {accountSid: string; serviceSid: string; authToken: string};

function credentials(): Credentials {
  const {SMS_PROVIDER, TWILIO_ACCOUNT_SID, TWILIO_VERIFY_SERVICE_SID, TWILIO_AUTH_TOKEN} = env;
  if (SMS_PROVIDER !== 'twilio-verify' || !TWILIO_AUTH_TOKEN ||
      !/^AC[0-9a-fA-F]{32}$/.test(TWILIO_ACCOUNT_SID ?? '') ||
      !/^VA[0-9a-fA-F]{32}$/.test(TWILIO_VERIFY_SERVICE_SID ?? '')) {
    throw new Error('Twilio Verify is not configured');
  }
  return {accountSid: TWILIO_ACCOUNT_SID!, serviceSid: TWILIO_VERIFY_SERVICE_SID!, authToken: TWILIO_AUTH_TOKEN};
}

function identity(value: unknown, to: string, config: Credentials, verificationSid?: string): Verification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid verification response');
  const data = value as Record<string, unknown>;
  if (typeof data.sid !== 'string' || !/^VE[0-9a-fA-F]{32}$/.test(data.sid) ||
      (verificationSid !== undefined && data.sid !== verificationSid) || data.to !== to ||
      data.service_sid !== config.serviceSid || data.account_sid !== config.accountSid ||
      data.channel !== 'sms' || typeof data.status !== 'string') throw new Error('Verification identity mismatch');
  return data as Verification;
}

async function post(config: Credentials, resource: 'Verifications'|'VerificationCheck', fields: Record<string, string>) {
  // Trial accounts allow only To/Channel when starting and To/Code when checking.
  // https://www.twilio.com/docs/usage/trials/try-out-verify
  return fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/${resource}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: 'Basic ' + Buffer.from(config.accountSid + ':' + config.authToken).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields),
  });
}

function locked() { return new ApiError(429, 'OTP_LOCKED', 'Too many incorrect codes. Try again later.', {retryAfterSeconds: 900}); }

export const twilioVerifyProvider = {
  async start(to: string): Promise<{verificationSid: string}> {
    try {
      const config = credentials();
      if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error('Invalid destination');
      const response = await post(config, 'Verifications', {To: to, Channel: 'sms'});
      if (!response.ok) throw new Error('Verification delivery failed');
      const verification = identity(await response.json(), to, config);
      if (verification.status !== 'pending') throw new Error('Verification was not started');
      return {verificationSid: verification.sid};
    } catch {
      throw new ApiError(503, 'SMS_DELIVERY_FAILED', 'Unable to send the verification code. Please try again later.');
    }
  },

  async check(to: string, verificationSid: string, code: string): Promise<'approved'|'invalid'|'expired'> {
    try {
      const config = credentials();
      if (!/^\+[1-9]\d{7,14}$/.test(to) || !/^VE[0-9a-fA-F]{32}$/.test(verificationSid) || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid verification input');
      }
      const response = await post(config, 'VerificationCheck', {To: to, Code: code});
      // Twilio deletes resources after approval, expiry or the maximum number of checks.
      if (response.status === 404) return 'expired';
      if (!response.ok) {
        if (response.status === 400 || response.status === 429) {
          const error = await response.json() as {code?: unknown};
          if (error?.code === 60202) throw locked();
        }
        throw new Error('Verification provider rejected the check');
      }
      const verification = identity(await response.json(), to, config, verificationSid);
      if (verification.status === 'approved' && verification.valid === true) return 'approved';
      if (verification.status === 'pending') return 'invalid';
      if (['expired', 'canceled', 'deleted'].includes(verification.status)) return 'expired';
      if (verification.status === 'max_attempts_reached') throw locked();
      throw new Error('Unexpected verification status');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'OTP_LOCKED') throw error;
      throw new ApiError(503, 'SMS_VERIFICATION_FAILED', 'Unable to verify the code. Please try again later.');
    }
  },
};
