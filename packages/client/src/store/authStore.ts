import { create } from 'zustand';
import type { AuthSession, User } from '@parkflow/contracts';
import { secureStorage, STORAGE_KEYS } from '../services/storage';
import { useInAppNotificationStore } from './inAppNotificationStore';
import { useCrashAlertStore } from './crashAlertStore';
import { bindingOf, bootstrapBrowserSession, browserLogout, clearLogoutFence, isWebSession, markBrowserLogout, readBrowserBinding, sameBrowserLogin, saveBrowserBinding, validateWebSession, webSessionsEnabled, withBrowserAuthLock } from '../services/http/browserSession';

function setFeatureOwner(userId?: string) {
  useInAppNotificationStore.getState().setOwner(userId);
  useCrashAlertStore.getState().setOwner(userId);
}

/**
 * Native credentials live in SecureStore. Browser credentials live only in
 * HttpOnly cookies; the store keeps server-proven session metadata in memory.
 */
interface AuthState {
  session?: AuthSession;
  user?: User;
  /** False until SecureStore has been read on boot — gates the router. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  signIn: (session: AuthSession, user: User, shouldApply?: () => boolean) => Promise<void>;
  setUser: (user: User) => void;
  signOut: (serverLogoutCompleted?: boolean) => Promise<void>;
}

interface PersistedAuth {
  session: AuthSession;
  user: User;
}

let authenticationEpoch = 0;
const restoredWebSessions = new WeakSet<AuthSession>();
let persistenceTail: Promise<unknown> = Promise.resolve();
function persistInOrder<T>(operation: () => Promise<T>): Promise<T> {
  const pending = persistenceTail.then(operation, operation);
  persistenceTail = pending.catch(() => undefined);
  return pending;
}
/** Serialize completion of authenticated storage operations with login publication. */
export function withAuthenticationPersistence<T>(operation: () => Promise<T>): Promise<T> {
  return persistInOrder(operation);
}
function cancelledVerification() {
  const error = new Error('Authentication changed while verification was completing');
  error.name = 'AbortError';
  return error;
}
async function persistAuthentication(session: AuthSession, user: User) {
  if (webSessionsEnabled) {
    validateWebSession(session);
    await secureStorage.removeItem(STORAGE_KEYS.authSession);
    await saveBrowserBinding(session as Extract<AuthSession, { transport: 'cookie' }>);
    await clearLogoutFence();
  } else {
    await secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session, user }));
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: undefined,
  user: undefined,
  hydrated: false,

  hydrate: async () => {
    let parsed: PersistedAuth | undefined;
    const epoch = authenticationEpoch;
    const resetOnBoot = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_START_FROM_BEGINNING === 'true';
    if (webSessionsEnabled) {
      try {
        await withBrowserAuthLock(async () => {
          await persistInOrder(() => secureStorage.removeItem(STORAGE_KEYS.authSession));
          if (epoch !== authenticationEpoch) return;
          const remembered = await readBrowserBinding();
          const verified = await bootstrapBrowserSession();
          if (epoch !== authenticationEpoch) return;
          if (verified) {
            if (resetOnBoot) {
              // The development reset must revoke the cookie login as well as
              // discard local state; it never revives browser JWT storage.
              await markBrowserLogout(verified.session);
              await browserLogout(verified.session);
              await clearLogoutFence(verified.session);
              setFeatureOwner(undefined);
              return;
            }
            // Preserve the car marker only after the server proves the same
            // previously published login. A cache alone never authorizes it.
            if (sameBrowserLogin(remembered, bindingOf(verified.session))) restoredWebSessions.add(verified.session);
            await useAuthStore.getState().signIn(verified.session, verified.user);
          }
        });
      } catch {
        // Offline startup has no proof of cookie identity. Never revive a cache.
      } finally { set({ hydrated: true }); }
      return;
    }
    try {
      await persistInOrder(async () => {
        if (epoch !== authenticationEpoch) return;
        try {
          const raw = await secureStorage.getItem(STORAGE_KEYS.authSession);
          if (epoch !== authenticationEpoch || !raw) return;
          parsed = JSON.parse(raw) as PersistedAuth;
          if (resetOnBoot) {
            const { clearCrashEventsForUser } = await import('../services/crashEvents');
            if (parsed.user?.id) await clearCrashEventsForUser(parsed.user.id);
            await secureStorage.removeItem(STORAGE_KEYS.authSession);
            parsed = undefined;
            setFeatureOwner(undefined);
            set({ session: undefined, user: undefined });
            return;
          }
          // A stored user is a rendering cache; the backend refreshes identity and authorizes every request.
          setFeatureOwner(parsed.user.id);
          set({ session: parsed.session, user: parsed.user });
        } catch {
          await secureStorage.removeItem(STORAGE_KEYS.authSession).catch(() => undefined);
        }
      });
      if (!parsed) {
        set({ hydrated: true });
        return;
      }
      // Network verification stays outside the queue: refreshing may itself
      // publish a session and must be able to acquire the persistence queue.
      const { api } = await import('../services/http/apiClient');
      try {
        const user = await api<User>('/auth/me');
        useAuthStore.getState().setUser(user);
      } catch (error) {
        // Preserve the refresh token for a temporary network outage, never for a revoked session.
        if (error instanceof Error && 'code' in error && error.code === 'unauthorized'
          && epoch === authenticationEpoch
          && (error as { details?: { serverCode?: string } }).details?.serverCode !== 'SESSION_CHANGED') {
          await useAuthStore.getState().signOut();
        }
      }
      set({ hydrated: true });
    } catch {
      // Storage failure must never brick boot or remove a newer session.
      set({ hydrated: true });
    }
  },

  signIn: async (session, user, shouldApply) => {
    if (shouldApply?.() === false) throw cancelledVerification();
    if (webSessionsEnabled) validateWebSession(session);
    if (session.userId !== user.id) throw new Error('Authentication identity does not match session');
    const restoringSameWebLogin = restoredWebSessions.delete(session);
    const epoch = ++authenticationEpoch;
    const current = () => epoch === authenticationEpoch && shouldApply?.() !== false;
    await persistInOrder(async () => {
      let finishRouteChange: (() => void) | undefined;
      try {
        if (!current()) throw cancelledVerification();
        const previousUser = useAuthStore.getState().user;
        if (previousUser?.id && previousUser.id !== user.id) {
          setFeatureOwner(undefined);
          const { clearCrashEventsForUser } = await import('../services/crashEvents');
          await clearCrashEventsForUser(previousUser.id);
          const [{ useCarServicesStore }, { useTourismPlacesStore }, { useWarningServiceNavigationStore }] = await Promise.all([
            import('./carServicesStore'), import('./tourismPlacesStore'), import('./warningServiceNavigationStore'),
          ]);
          useCarServicesStore.getState().setCategory(useCarServicesStore.getState().category ?? 'car_wash');
          useTourismPlacesStore.getState().setCategories(useTourismPlacesStore.getState().categories);
          useWarningServiceNavigationStore.getState().clear();
          if (!current()) throw cancelledVerification();
        }
        if (previousUser?.id !== user.id && !(restoringSameWebLogin && !previousUser)) {
          const { clearReservationRouteForAccountChange } = await import('./reservationRouteStore');
          finishRouteChange = await clearReservationRouteForAccountChange();
          if (!current()) throw cancelledVerification();
        }
        await persistAuthentication(session, user);
        if (!current()) {
          // No later auth write can run until this restoration completes.
          const state = useAuthStore.getState();
          if (state.session && state.user) {
            await persistAuthentication(state.session, state.user);
          } else {
            await secureStorage.removeItem(STORAGE_KEYS.authSession);
          }
          throw cancelledVerification();
        }
        setFeatureOwner(user.id);
        set({ session, user });
      } finally {
        finishRouteChange?.();
      }
    });
  },

  setUser: (user) => {
    const session = useAuthStore.getState().session;
    if (session && session.userId !== user.id) return;
    set({ user });
    if (session && !webSessionsEnabled) {
      void persistInOrder(async () => {
        const state = useAuthStore.getState();
        if (state.session && state.user) await secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session: state.session, user: state.user }));
      }).catch(() => undefined);
    }
  },

  signOut: async (serverLogoutCompleted = false) => {
    ++authenticationEpoch;
    setFeatureOwner(undefined);
    const previousUserId = useAuthStore.getState().user?.id;
    const previousSession = useAuthStore.getState().session;
    await persistInOrder(async () => {
      let finishRouteChange: (() => void) | undefined;
      try {
        if (webSessionsEnabled && isWebSession(previousSession)) {
          if (serverLogoutCompleted) await clearLogoutFence(previousSession);
          else await markBrowserLogout(previousSession);
        }
        const { clearReservationRouteForAccountChange } = await import('./reservationRouteStore');
        finishRouteChange = await clearReservationRouteForAccountChange();
        if (previousUserId) {
          const { clearCrashEventsForUser } = await import('../services/crashEvents');
          await clearCrashEventsForUser(previousUserId);
          const [{ useCarServicesStore }, { useTourismPlacesStore }, { useWarningServiceNavigationStore }] = await Promise.all([
            import('./carServicesStore'), import('./tourismPlacesStore'), import('./warningServiceNavigationStore'),
          ]);
          useCarServicesStore.getState().setCategory(useCarServicesStore.getState().category ?? 'car_wash');
          useTourismPlacesStore.getState().setCategories(useTourismPlacesStore.getState().categories);
          useWarningServiceNavigationStore.getState().clear();
          const { retryQueue } = await import('../offline/retryQueue');
          await retryQueue.clearUser(previousUserId);
        }
        await secureStorage.removeItem(STORAGE_KEYS.authSession);
        set({ session: undefined, user: undefined });
      } finally {
        if (webSessionsEnabled) set({ session: undefined, user: undefined });
        finishRouteChange?.();
      }
    });
  },
}));

export const currentUserId = (): string | undefined => useAuthStore.getState().user?.id;
