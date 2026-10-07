import { create } from 'zustand';
import type { PhoneOtpChallenge } from '@/types';

type Purpose = 'register' | 'login';
interface PhoneAuthState {
  purpose: Purpose;
  fullName: string;
  phoneInput: string;
  challenge?: PhoneOtpChallenge;
  resendAvailableAt: number;
  retryAvailableAt: number;
  verificationAvailableAt: number;
  vehicleSetupUserId?: string;
  begin: (purpose: Purpose) => void;
  setName: (fullName: string) => void;
  setPhoneInput: (phoneInput: string) => void;
  setChallenge: (challenge: PhoneOtpChallenge) => void;
  setRetryDelay: (seconds: number) => void;
  setVerificationDelay: (seconds: number) => void;
  setVehicleSetup: (userId?: string) => void;
  clearChallenge: () => void;
}

// Registration details and challenge identifiers never enter URLs or persisted storage.
export const usePhoneAuthStore = create<PhoneAuthState>((set) => ({
  purpose: 'login', fullName: '', phoneInput: '', resendAvailableAt: 0, retryAvailableAt: 0, verificationAvailableAt: 0,
  begin: (purpose) => set({ purpose, fullName: '', phoneInput: '', challenge: undefined, resendAvailableAt: 0, retryAvailableAt: 0, verificationAvailableAt: 0, vehicleSetupUserId: undefined }),
  setName: (fullName) => set({ fullName, purpose: 'register' }),
  setPhoneInput: (phoneInput) => set({ phoneInput }),
  setChallenge: (challenge) => set({ challenge, resendAvailableAt: Date.now() + challenge.resendAfterSeconds * 1000, retryAvailableAt: 0, verificationAvailableAt: 0 }),
  setRetryDelay: (seconds) => set({ retryAvailableAt: Date.now() + seconds * 1000 }),
  setVerificationDelay: (seconds) => set({ verificationAvailableAt: Date.now() + seconds * 1000 }),
  setVehicleSetup: (vehicleSetupUserId) => set({ vehicleSetupUserId }),
  clearChallenge: () => set({ challenge: undefined, fullName: '', phoneInput: '', resendAvailableAt: 0, retryAvailableAt: 0, verificationAvailableAt: 0 }),
}));
