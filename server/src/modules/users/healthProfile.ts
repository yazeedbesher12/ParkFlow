import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import { db, atomic } from '../../database/client';

export const mobilitySchema = z.object({
  avoidHighways: z.boolean(),
  preferSmootherRoads: z.boolean(),
  accessibleParking: z.boolean(),
  stepFreeAccess: z.boolean(),
}).strict();
export const healthProfileSchema = z.object({
  conditions: z.array(z.enum(['diabetes', 'hypertension', 'other_chronic', 'disability', 'none', 'prefer_not_to_disclose'])).min(1).max(4),
  mobility: mobilitySchema,
  consent: z.boolean(),
}).strict().refine(value => new Set(value.conditions).size === value.conditions.length &&
  (!value.conditions.some(c => c === 'none' || c === 'prefer_not_to_disclose') || value.conditions.length === 1),
  { message: 'None and prefer not to disclose cannot be combined with other selections' });
export type MobilityPreferences = z.infer<typeof mobilitySchema>;
export type HealthProfileInput = z.infer<typeof healthProfileSchema>;
export type HealthProfile = HealthProfileInput & { consentedAt: string; consentVersion: 1 };

// Separate derived key/domain and a per-user authenticated context. The server
// secret never leaves the backend. Rotating it requires re-encrypting these rows.
const key = Buffer.from(hkdfSync('sha256', env.JWT_REFRESH_SECRET, 'parkflow-health', 'health-profile-v1', 32));
export function encryptProfile(userId: string, profile: HealthProfile): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64')).join('.');
}
export function decryptProfile(userId: string, value: string): HealthProfile {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv!);
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(tag!);
  return JSON.parse(Buffer.concat([cipher.update(ciphertext!), cipher.final()]).toString('utf8'));
}
export async function getHealthProfile(userId: string) {
  const row = await db.healthProfile.findUnique({ where: { userId } });
  return row ? decryptProfile(userId, row.ciphertext) : null;
}
export async function saveHealthProfile(userId: string, input: HealthProfileInput) {
  const parsed = healthProfileSchema.parse(input);
  return atomic(async tx => {
    // Lock the owner row first, serializing saves/deletions for this account.
    const user = await tx.user.update({ where: { id: userId }, data: { healthProfileCompletedAt: new Date() } });
    if (parsed.consent) {
      const ciphertext = encryptProfile(userId, { ...parsed, consentedAt: new Date().toISOString(), consentVersion: 1 });
      await tx.healthProfile.upsert({ where: { userId }, create: { userId, ciphertext }, update: { ciphertext } });
    } else {
      await tx.healthProfile.deleteMany({ where: { userId } });
    }
    return user; // Only the completion marker; no health data in auth/storage caches.
  });
}
export async function deleteHealthProfile(userId: string) {
  return atomic(async tx => {
    const user = await tx.user.update({ where: { id: userId }, data: { healthProfileCompletedAt: new Date() } });
    await tx.healthProfile.deleteMany({ where: { userId } });
    return user;
  });
}
