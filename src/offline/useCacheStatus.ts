import { useSyncExternalStore } from 'react';
import { cacheStatusStore, EMPTY_CACHE_STATUS } from './storage';

export function useCacheStatus(key: string | undefined) {
  return useSyncExternalStore(
    cacheStatusStore.subscribe,
    () => key ? cacheStatusStore.get(key) : EMPTY_CACHE_STATUS,
    () => EMPTY_CACHE_STATUS,
  );
}
