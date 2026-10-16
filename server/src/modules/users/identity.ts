import { createCipheriv, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';

/** National IDs are never credentials and are never returned in full by the API. */
export function encryptNationalId(userId: string, value: string): string {
  const key = env.PROFILE_ENCRYPTION_KEY;
  if (!key) throw new ApiError(503, 'PROFILE_STORAGE_UNAVAILABLE', 'Identity storage is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
