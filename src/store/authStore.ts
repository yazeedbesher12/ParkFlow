import { create } from 'zustand';
import type { AuthSession, User } from '@/types';
import { secureStorage, STORAGE_KEYS } from '@/services/storage';

/**
 * Auth is deliberately NOT using zustand/persist: the token lives in SecureStore
 * and is written explicitly, so we never risk it leaking into a generic
 * AsyncStorage blob alongside preferences.
 */
interface AuthState {
  session?: AuthSession;
  user?: User;
  /** False until SecureStore has been read on boot — gates the router. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  signIn: (session: AuthSession, user: User) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
}

interface PersistedAuth {
  session: AuthSession;
  user: User;
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: undefined,
  user: undefined,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await secureStorage.getItem(STORAGE_KEYS.authSession);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as PersistedAuth;
      const expired = new Date(parsed.session.expiresAt).getTime() < Date.now();
      if (expired) {
        await secureStorage.removeItem(STORAGE_KEYS.authSession);
        set({ hydrated: true });
        return;
      }
      set({ session: parsed.session, user: parsed.user, hydrated: true });
    } catch {
      // A corrupt blob must never brick the app — drop it and start signed out.
      await secureStorage.removeItem(STORAGE_KEYS.authSession).catch(() => undefined);
      set({ hydrated: true });
    }
  },

  signIn: async (session, user) => {
    await secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session, user }));
    set({ session, user });
  },

  setUser: (user) => {
    set({ user });
    const { session } = useAuthStore.getState();
    if (session) {
      void secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session, user }));
    }
  },

  signOut: async () => {
    await secureStorage.removeItem(STORAGE_KEYS.authSession);
    set({ session: undefined, user: undefined });
  },
}));

export const currentUserId = (): string | undefined => useAuthStore.getState().user?.id;
