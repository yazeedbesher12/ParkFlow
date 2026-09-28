import { create } from 'zustand';

interface ReservationRouteState {
  pendingZoneId?: string;
  request: (zoneId: string) => void;
  consume: () => void;
}

export const useReservationRouteStore = create<ReservationRouteState>((set) => ({
  request: (pendingZoneId) => set({ pendingZoneId }),
  consume: () => set({ pendingZoneId: undefined }),
}));
