import { create } from 'zustand';
import type { CrashDetection } from '../utils/crashDetector';
import type { GeoPoint } from '@parkflow/contracts';

export interface CrashAlert {
  userId: string;
  detection: CrashDetection;
  detectedAt: string;
  location?: GeoPoint;
}

interface CrashAlertState {
  ownerUserId?: string;
  alert?: CrashAlert;
  /** Invalidates pending call attempts after any owner/alert/cancel transition. */
  generation: number;
  setOwner: (userId?: string) => void;
  raise: (alert: CrashAlert) => void;
  clear: () => void;
}

export const useCrashAlertStore = create<CrashAlertState>((set, get) => ({
  ownerUserId: undefined,
  alert: undefined,
  generation: 0,
  setOwner: (ownerUserId) => {
    if (get().ownerUserId !== ownerUserId) set((state) => ({ ownerUserId, alert: undefined, generation: state.generation + 1 }));
  },
  // A second detection must not restart an existing countdown.
  raise: (alert) => {
    if (alert.userId === get().ownerUserId && !get().alert) set((state) => ({ alert, generation: state.generation + 1 }));
  },
  // Even clearing an already dismissed alert cancels any pending fallback.
  clear: () => set((state) => ({ alert: undefined, generation: state.generation + 1 })),
}));
