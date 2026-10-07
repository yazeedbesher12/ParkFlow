import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage, appStorage } from '@/services/storage';
import type { GeoPoint } from '@/types';

interface ReservationRouteState {
  pendingZoneId?: string;
  origin?: GeoPoint;
  originMode?: 'test' | 'gps';
  request: (zoneId: string) => void;
  setOrigin: (origin?: GeoPoint, mode?: 'test' | 'gps') => void;
  consume: () => void;
  returnToCar?: {
    zoneId?: string;
    facilityId?: string;
    savedLocation?: GeoPoint;
    entrance?: string;
    floor?: string;
    note?: string;
    /** Optional reminder delay from the time it was scheduled, in minutes. */
    reminderMinutes?: number;
    reminderNotificationId?: string;
    reminderDueAt?: number;
  };
  saveReturnToCar: (value: ReservationRouteState['returnToCar']) => void;
  clearReturnToCar: () => void;
}

export const useReservationRouteStore = create<ReservationRouteState>()(persist((set) => ({
  request: (pendingZoneId) => set({ pendingZoneId }),
  setOrigin: (origin, originMode) => set({ origin, originMode: origin ? originMode : undefined }),
  consume: () => set({ pendingZoneId: undefined }),
  saveReturnToCar: (returnToCar) => set({ returnToCar }),
  clearReturnToCar: () => set({ returnToCar: undefined }),
}), { name: 'pf.reservation.route', storage: zustandStorage(appStorage) as any }));
