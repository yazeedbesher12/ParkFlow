import { create } from 'zustand';
import type { AppNotification } from '@parkflow/contracts';

interface InAppNotificationState {
  ownerUserId?: string;
  current?: AppNotification;
  shown: Set<string>;
  setOwner: (userId?: string) => void;
  show: (notification?: AppNotification | null) => void;
  dismiss: () => void;
}

/** Live notifications are visible only to the currently published account. */
export const useInAppNotificationStore = create<InAppNotificationState>((set, get) => ({
  ownerUserId: undefined,
  current: undefined,
  shown: new Set(),
  setOwner: (ownerUserId) => {
    if (get().ownerUserId !== ownerUserId) set({ ownerUserId, current: undefined, shown: new Set() });
  },
  show: (notification) => {
    const state = get();
    if (!notification?.id || notification.userId !== state.ownerUserId || state.shown.has(notification.id)) return;
    // Bound the deduplication history during long-running app sessions.
    const shown = new Set([...state.shown, notification.id].slice(-200));
    set({ current: notification, shown });
  },
  dismiss: () => set({ current: undefined }),
}));
