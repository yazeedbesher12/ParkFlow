import type { AuthService } from './types';
import type { AuthSession, User } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { getDb, mutate } from './mock/db';
import { seedAccount } from './mock/demo';

/**
 * Mock auth. The OTP is generated locally and echoed back on the challenge so
 * the app is demoable without an SMS gateway; a real backend simply stops
 * returning `devCode`, and nothing else in the app changes.
 */

const OTP_TTL_MINUTES = 5;
const RESEND_SECONDS = 30;
const SESSION_TTL_DAYS = 30;

/** Fixed code keeps demos predictable; any 6 digits from the challenge work. */
const DEMO_CODE = '123456';

function buildSession(userId: string): AuthSession {
  return {
    userId,
    accessToken: `mock.${createId('at')}`,
    refreshToken: `mock.${createId('rt')}`,
    expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString(),
  };
}

export const mockAuthService: AuthService = {
  async requestOtp({ countryCode, phone }) {
    await networkDelay();
    const fullPhone = `${countryCode}${phone}`;

    return mutate((db) => {
      const challengeId = createId('otp');
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

      // Drop any earlier challenge for this number so only one code is live.
      db.otp = db.otp.filter((c) => c.phone !== fullPhone);
      db.otp.push({ challengeId, phone: fullPhone, code: DEMO_CODE, expiresAt });

      return {
        challengeId,
        phone: fullPhone,
        resendAfterSeconds: RESEND_SECONDS,
        expiresAt,
        devCode: DEMO_CODE,
      };
    });
  },

  async verifyOtp({ challengeId, code }) {
    await networkDelay();

    return mutate((db) => {
      const challenge = db.otp.find((c) => c.challengeId === challengeId);
      if (!challenge) {
        throw new AppError('not_found', 'This verification code has expired. Request a new one.');
      }
      if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        db.otp = db.otp.filter((c) => c.challengeId !== challengeId);
        throw new AppError('validation', 'This verification code has expired. Request a new one.');
      }
      if (challenge.code !== code) {
        throw new AppError('validation', 'That code is incorrect. Please try again.');
      }

      db.otp = db.otp.filter((c) => c.challengeId !== challengeId);

      const existing = db.users.find((u) => u.phone === challenge.phone);
      if (existing) {
        return { session: buildSession(existing.id), user: existing, isNewUser: false };
      }

      const user: User = {
        id: createId('usr'),
        // Filled in on the next onboarding step.
        fullName: '',
        phone: challenge.phone,
        countryCode: challenge.phone.startsWith('+970') ? '+970' : '+972',
        locale: 'en',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.users.push(user);
      // Wallet and saved card exist from the moment the account does.
      seedAccount(db, user.id);
      return { session: buildSession(user.id), user, isNewUser: true };
    });
  },

  async completeProfile({ userId, fullName }) {
    await networkDelay();
    return mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new AppError('not_found', 'User not found');
      user.fullName = fullName.trim();
      user.updatedAt = nowIso();
      return { ...user };
    });
  },

  async refresh(refreshToken) {
    await networkDelay(120, 300);
    const db = await getDb();
    const userId = db.users[0]?.id;
    if (!refreshToken.startsWith('mock.') || !userId) {
      throw new AppError('unauthorized', 'Session expired');
    }
    return buildSession(userId);
  },

  async signOut() {
    // Tokens are cleared by the auth store; the mock backend keeps user data so
    // signing back in with the same number restores the account.
    await networkDelay(80, 200);
  },
};
