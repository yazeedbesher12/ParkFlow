import { randomUUID } from 'node:crypto';
import { redis } from '../../database/redis';
import { twilioVerifyProvider } from '../../providers/twilioVerify';
import { ApiError } from '../../utils/errors';

// Longer than the provider's 10-second timeout. Every mutation checks ownership
// again: an expired lease can never approve a challenge or release a newer lease.
export async function acquirePhoneOperation(prefix:string) {
  const token = randomUUID();
  if (!await redis.set(prefix+'operation', token, 'EX', 30, 'NX')) {
    throw new ApiError(429, 'OTP_BUSY', 'A verification request is already in progress. Please wait.', {retryAfterSeconds:3});
  }
  return token;
}

export async function releasePhoneOperation(prefix:string, token:string) {
  await redis.eval(`
    if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
    return 0
  `, 1, prefix+'operation', token);
}

const reserveCheck = `
if redis.call('GET', KEYS[5]) ~= ARGV[2] then return {'OTP_EXPIRED'} end
local locked = redis.call('TTL', KEYS[4])
if locked > 0 then return {'OTP_LOCKED', locked} end
if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('HGET', KEYS[1], 'ready') ~= '1'
  or redis.call('HGET', KEYS[1], 'provider') ~= 'twilio-verify'
  or not redis.call('HGET', KEYS[1], 'verificationSid') then return {'OTP_EXPIRED'} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 5 then
  redis.call('SET', KEYS[4], '1', 'EX', 900)
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return {'OTP_LOCKED', 900}
end
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], 900)
return {'OK', redis.call('HGET', KEYS[1], 'verificationSid')}
`;

const finalizeCheck = `
if redis.call('GET', KEYS[5]) ~= ARGV[2] or redis.call('GET', KEYS[2]) ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'ready') ~= '1'
  or redis.call('HGET', KEYS[1], 'verificationSid') ~= ARGV[3] then return {'OTP_EXPIRED'} end
local locked = redis.call('TTL', KEYS[4])
if locked > 0 then return {'OTP_LOCKED', locked} end
if ARGV[4] == 'approved' then
  local phone = redis.call('HGET', KEYS[1], 'phone')
  local purpose = redis.call('HGET', KEYS[1], 'purpose')
  local fullName = redis.call('HGET', KEYS[1], 'fullName')
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return {'OK', phone, purpose, fullName}
end
if ARGV[4] == 'locked' or tonumber(redis.call('GET', KEYS[3]) or '0') >= 5 then
  redis.call('SET', KEYS[4], '1', 'EX', 900)
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return {'OTP_LOCKED', 900}
end
if ARGV[4] == 'expired' then
  redis.call('DEL', KEYS[1], KEYS[2])
  return {'OTP_EXPIRED'}
end
if ARGV[4] == 'unavailable' then return {'SMS_VERIFICATION_FAILED'} end
return {'OTP_INVALID'}
`;

export async function consumeRemotePhoneChallenge(input:{prefix:string;challengeId:string;phone:string;code:string}) {
  const {prefix, challengeId, phone, code} = input;
  const token = await acquirePhoneOperation(prefix);
  const keys = ['otp:phone:challenge:'+challengeId, prefix+'active', prefix+'attempts', prefix+'lock', prefix+'operation'];
  try {
    const reserved = await redis.eval(reserveCheck, keys.length, ...keys, challengeId, token) as string[];
    if (reserved[0] !== 'OK') return reserved;
    let outcome:'approved'|'invalid'|'expired'|'locked'|'unavailable';
    try {
      outcome = await twilioVerifyProvider.check(phone, reserved[1]!, code);
    } catch (error) {
      // An uncertain transport result still spent a guess at the provider.
      outcome = error instanceof ApiError && error.code === 'OTP_LOCKED' ? 'locked' : 'unavailable';
    }
    const result = await redis.eval(finalizeCheck, keys.length, ...keys, challengeId, token, reserved[1]!, outcome) as string[];
    if (result[0] === 'SMS_VERIFICATION_FAILED') {
      throw new ApiError(503, 'SMS_VERIFICATION_FAILED', 'The verification service is temporarily unavailable. Please try again later.');
    }
    return result;
  } finally {
    await releasePhoneOperation(prefix, token);
  }
}
