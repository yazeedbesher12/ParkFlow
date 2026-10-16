import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { clientApplication } from '../runtime/application';

/**
 * Two storage tiers with one interface:
 *  - `secureStorage` for tokens and session data (Keychain / Keystore).
 *  - `appStorage`    for non-sensitive cached preferences.
 *
 * Browser login credentials are HttpOnly cookies; authStore never writes them
 * here. Browser storage keeps only non-secret login fences and request keys.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const rawAppStorage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';
export const browserSessionsEnabled = Platform.OS === 'web';

const rawSecureStorage: KeyValueStorage = secureAvailable
  ? {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    }
  : rawAppStorage;

// Preserve legacy customer data; scope every management key, including offline
// queues and pending mutations, even if both apps are hosted on the same origin.
const scopedStorage = (storage: KeyValueStorage): KeyValueStorage => {
  const keyFor = (key: string) => clientApplication === 'management' ? `pf.management.${key}` : key;
  return {
    getItem: key => storage.getItem(keyFor(key)),
    setItem: (key, value) => storage.setItem(keyFor(key), value),
    removeItem: key => storage.removeItem(keyFor(key)),
  };
};

export const appStorage = scopedStorage(rawAppStorage);
export const secureStorage = scopedStorage(rawSecureStorage);

export const STORAGE_KEYS = {
  authSession: 'sp.auth.session',
  webBinding: 'pf.web.login-binding',
  webLogoutFence: 'pf.web.logout-pending',
  preferences: 'sp.preferences',
  mapLayers: 'sp.map.layers',
  mockDb: 'sp.mock.db',
  /** Crash events from the Android service that could not be uploaded yet. */
  pendingCrashEvents: 'sp.crash.pending',
} as const;

/** Zustand `persist` adapter shape. */
export const zustandStorage = (storage: KeyValueStorage) => ({
  getItem: async (name: string) => {
    const value = await storage.getItem(name);
    return value ? (JSON.parse(value) as unknown) : null;
  },
  setItem: async (name: string, value: unknown) => {
    await storage.setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => storage.removeItem(name),
});
