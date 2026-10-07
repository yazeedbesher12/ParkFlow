import type { User, Prisma } from '@prisma/client';
import { db, atomic, lock } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { encryptNationalId } from './identity';
import { developmentPhoneLoginEnabled, developmentEmailLoginEnabled } from '../../config/developmentAuth';

export function userView(user: User) {
  const { nationalIdEncrypted: _encrypted, phoneVerificationPending: _pending, emailVerificationPending: _emailPending, nationalIdLast4, ...publicFields } = user;
  return {...publicFields,nationalIdMasked:nationalIdLast4 ? `••••${nationalIdLast4}` : null};
}

export interface ProfileInput { fullName?: string; locale?: 'en'|'ar'; email?: string|null; nationalId?: string|null }

export async function getUser(id: string) { return userView(requireValue(await db.user.findUnique({where:{id}}))); }

async function saveProfile(id: string, input: ProfileInput, complete: boolean) {
  return atomic(async tx => {
    await lock(tx, `profile:${id}`);
    const existing = requireValue(await tx.user.findUnique({where:{id}}));
    const canEditPhoneProfile = existing.phoneVerifiedAt || (developmentPhoneLoginEnabled() && existing.phoneVerificationPending) || (developmentEmailLoginEnabled() && Boolean(existing.email));
    if (complete) assert(canEditPhoneProfile, 'PHONE_VERIFICATION_REQUIRED', 'Verify your phone before completing your profile', 403);
    if (complete) assert((input.fullName ?? existing.fullName).trim(), 'NAME_REQUIRED', 'Add your name before completing your profile', 400);
    if (input.email !== undefined || input.nationalId !== undefined) {
      assert(canEditPhoneProfile, 'VALIDATION', 'Verify your phone before changing contact or identity details');
    }
    const data: Prisma.UserUpdateInput = {};
    if (input.fullName !== undefined) {
      data.fullName = input.fullName;
      data.firstName = input.fullName.split(' ')[0];
      data.lastName = input.fullName.split(' ').slice(1).join(' ');
    }
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.email !== undefined && input.email !== existing.email) {
      assert(existing.phone || input.email, 'EMAIL_REQUIRED', 'Keep an email address for this development account', 400);
      if (input.email) {
        const owner = await tx.user.findUnique({where:{email:input.email},select:{id:true}});
        assert(!owner || owner.id === id, 'CONFLICT', 'This email is already linked to another account', 409);
      }
      data.email = input.email;
      data.emailVerifiedAt = null;
      data.emailVerificationPending = developmentEmailLoginEnabled() && !existing.phone;
    }
    if (input.nationalId !== undefined) {
      data.nationalIdEncrypted = input.nationalId ? encryptNationalId(id, input.nationalId) : null;
      data.nationalIdLast4 = input.nationalId ? input.nationalId.slice(-4) : null;
    }
    if (complete && !existing.profileCompletedAt) data.profileCompletedAt = new Date();
    return userView(await tx.user.update({where:{id},data}));
  });
}

export async function updateUser(id: string, input: ProfileInput) { return saveProfile(id,input,false); }
export async function completeProfile(id: string, input: Pick<ProfileInput,'fullName'|'email'|'nationalId'>) { return saveProfile(id,input,true); }
export async function preferences(id: string) { return (await getUser(id)).notificationPreferences; }
export async function updatePreferences(id: string,input: Record<string,boolean>) { return (await db.user.update({where:{id},data:{notificationPreferences:input}})).notificationPreferences; }
