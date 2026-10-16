import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Platform } from 'react-native';
import { zustandStorage, appStorage } from '../services/storage';
import type { GeoPoint } from '@parkflow/contracts';

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

const storageName = 'pf.reservation.route';
const storage = zustandStorage(appStorage);
let storageEpoch = 0;
let accountChangeInProgress = false;
let persistenceTail: Promise<unknown> = Promise.resolve();
let lastRemoval: Promise<void> = Promise.resolve();
function persistInOrder<T>(operation: () => Promise<T>): Promise<T> {
  const pending = persistenceTail.then(operation, operation);
  persistenceTail = pending.catch(() => undefined);
  return pending;
}
const routeStorage = {
  getItem: async (name: string) => {
    const epoch = storageEpoch;
    const value = await storage.getItem(name);
    return epoch === storageEpoch ? value : null;
  },
  setItem: (name: string, value: unknown) => persistInOrder(() => {
    const state = (value as { state?: Partial<ReservationRouteState> }).state;
    return state?.pendingZoneId != null || state?.origin != null || state?.returnToCar != null
      ? storage.setItem(name, value)
      : storage.removeItem(name);
  }),
  removeItem: (name: string) => {
    lastRemoval = persistInOrder(() => storage.removeItem(name));
    return lastRemoval;
  },
};

async function cancelReminders(ids: Iterable<string>): Promise<void> {
  if (Platform.OS === 'web') return;
  const reminderIds = [...ids];
  if (!reminderIds.length) return;
  try {
    const Notifications = await import('expo-notifications');
    await Promise.all(reminderIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  } catch {
    // Deleting the location is authoritative even if native notification services are unavailable.
  }
}

function routeActions(set: (state: Partial<ReservationRouteState>) => void): Pick<ReservationRouteState, 'request' | 'setOrigin' | 'consume' | 'saveReturnToCar' | 'clearReturnToCar'> {
  const epoch = storageEpoch;
  const current = () => epoch === storageEpoch && !accountChangeInProgress;
  return {
    request: (pendingZoneId) => { if (current()) set({ pendingZoneId }); },
    setOrigin: (origin, originMode) => { if (current()) set({ origin, originMode: origin ? originMode : undefined }); },
    consume: () => { if (current()) set({ pendingZoneId: undefined }); },
    saveReturnToCar: (returnToCar) => {
      if (current()) set({ returnToCar });
      else if (returnToCar?.reminderNotificationId) void cancelReminders([returnToCar.reminderNotificationId]);
    },
    clearReturnToCar: () => { if (current()) set({ returnToCar: undefined }); },
  };
}

export const useReservationRouteStore = create<ReservationRouteState>()(persist((set) => routeActions(set), { name: storageName, storage: routeStorage as any }));

/** Account changes must remove personal location data before the next account is published. */
export async function clearReservationRouteForAccountChange(): Promise<() => void> {
  ++storageEpoch;
  accountChangeInProgress = true;
  const transitionEpoch = storageEpoch;
  const finish = () => {
    if (storageEpoch !== transitionEpoch) return;
    ++storageEpoch;
    accountChangeInProgress = false;
    // Actions obtained by an old screen during the transition must remain stale afterwards.
    useReservationRouteStore.setState(routeActions(useReservationRouteStore.setState));
  };
  const reminderIds = new Set<string>();
  const currentReminder = useReservationRouteStore.getState().returnToCar?.reminderNotificationId;
  if (currentReminder) reminderIds.add(currentReminder);
  // Read after older writes but before clearing, including reminders whose boot hydration is pending.
  const remembered = persistInOrder(async () => {
    try {
      const value = await storage.getItem(storageName) as { state?: Partial<ReservationRouteState> } | null;
      const id = value?.state?.returnToCar?.reminderNotificationId;
      if (id) reminderIds.add(id);
    } catch {
      // A corrupt cache still needs to be removed.
    }
  });
  useReservationRouteStore.setState({ ...routeActions(useReservationRouteStore.setState), pendingZoneId: undefined, origin: undefined, originMode: undefined, returnToCar: undefined });
  // Zustand invalidates in-flight hydration; serialized removal cannot be overtaken by an old write.
  useReservationRouteStore.persist.clearStorage();
  const removed = lastRemoval;
  try {
    await remembered;
    try {
      await removed;
    } finally {
      await cancelReminders(reminderIds);
    }
    return finish;
  } catch (error) {
    finish();
    throw error;
  }
}
