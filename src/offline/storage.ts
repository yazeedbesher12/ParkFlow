import { appStorage, type KeyValueStorage } from '@/services/storage';
import { OFFLINE_SCHEMA_VERSION } from './types';
import { AppError } from '@/utils/errors';

interface Envelope<T> { version: number; value: T }

type CacheStatus = { stale: boolean; savedAt?: number };
// useSyncExternalStore requires the same snapshot reference until state changes.
export const EMPTY_CACHE_STATUS: CacheStatus = Object.freeze({ stale: false });
const cacheStatuses = new Map<string, CacheStatus>();
const cacheListeners = new Set<() => void>();

/** In-memory status for showing when a query fell back to its last saved value. */
export const cacheStatusStore = {
  get(key: string): CacheStatus { return cacheStatuses.get(key) ?? EMPTY_CACHE_STATUS; },
  set(key: string, status: CacheStatus) {
    cacheStatuses.set(key, status);
    cacheListeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) { cacheListeners.add(listener); return () => cacheListeners.delete(listener); },
};

/** Non-sensitive offline data is always isolated by account and schema version. */
export class OfflineStorage {
  constructor(private readonly adapter: KeyValueStorage = appStorage) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.adapter.getItem(`pf.offline.${key}`);
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as Envelope<T>;
      return entry.version === OFFLINE_SCHEMA_VERSION ? entry.value : undefined;
    } catch { return undefined; }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.adapter.setItem(`pf.offline.${key}`, JSON.stringify({ version: OFFLINE_SCHEMA_VERSION, value } satisfies Envelope<T>));
  }

  remove(key: string): Promise<void> { return this.adapter.removeItem(`pf.offline.${key}`); }
}

export const offlineStorage = new OfflineStorage();
export const scopedKey = (userId: string, key: string) => `${encodeURIComponent(userId)}.${key}`;

export async function cachedRead<T>(userId: string, key: string, fetcher: () => Promise<T>): Promise<T> {
  const storageKey = scopedKey(userId, key);
  let value: T;
  try {
    value = await fetcher();
  } catch (error) {
    // Access revocation, removed records, and feed validation errors must not
    // silently become a previously successful response.
    if (!(error instanceof AppError) || error.code !== 'network') throw error;
    const cached = await offlineStorage.get<{ value: T; savedAt: number }>(storageKey);
    if (cached) {
      cacheStatusStore.set(storageKey, { stale: true, savedAt: cached.savedAt });
      return cached.value;
    }
    throw error;
  }
  const savedAt = Date.now();
  // Storage quota failures must not hide a successful online response.
  try { await offlineStorage.set(storageKey, { value, savedAt }); } catch { /* optional cache */ }
  cacheStatusStore.set(storageKey, { stale: false, savedAt });
  return value;
}
