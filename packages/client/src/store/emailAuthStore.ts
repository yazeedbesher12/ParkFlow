import { create } from 'zustand';
import type { OtpChallenge } from '@parkflow/contracts';

type Purpose = 'register' | 'login';
interface EmailAuthState {
  emailInput: string;
  purpose: Purpose;
  fullName: string;
  challenge?: OtpChallenge;
  resendAvailableAt: number;
  retryAvailableAt: number;
  verificationAvailableAt: number;
  setEmailInput: (emailInput: string) => void;
  setChallenge: (challenge: OtpChallenge, purpose?: Purpose, fullName?: string) => void;
  setRetryDelay: (seconds: number) => void;
  setVerificationDelay: (seconds: number) => void;
  expireChallenge: () => void;
  clearChallenge: () => void;
  reset: () => void;
}

const empty = {
  emailInput: '', purpose: 'login' as const, fullName: '', challenge: undefined,
  resendAvailableAt: 0, retryAvailableAt: 0, verificationAvailableAt: 0,
};

// Codes and challenge identifiers are held only in this bundle's memory.
export const useEmailAuthStore = create<EmailAuthState>((set, get) => ({
  ...empty,
  setEmailInput: (emailInput) => set({ emailInput }),
  setChallenge: (challenge, purpose = get().purpose, fullName = get().fullName) => set({
    challenge, purpose, fullName, emailInput: challenge.email,
    resendAvailableAt: Date.now() + challenge.resendAfterSeconds * 1000,
    retryAvailableAt: 0, verificationAvailableAt: 0,
  }),
  setRetryDelay: (seconds) => set({ retryAvailableAt: Date.now() + seconds * 1000 }),
  setVerificationDelay: (seconds) => set({ verificationAvailableAt: Date.now() + seconds * 1000 }),
  expireChallenge: () => {
    const challenge = get().challenge;
    if (challenge) set({ challenge: { ...challenge, expiresAt: new Date().toISOString() } });
  },
  clearChallenge: () => set({ ...empty }),
  reset: () => set({ ...empty }),
}));
