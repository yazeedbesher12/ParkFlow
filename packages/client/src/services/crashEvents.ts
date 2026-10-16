import type { CrashEventInput } from '@parkflow/contracts';
import { useAuthStore } from '../store/authStore';
import { appStorage, secureStorage, STORAGE_KEYS } from './storage';
import { services } from './index';
import { Platform } from 'react-native';

interface QueuedCrashEvent { idempotencyKey: string; event: CrashEventInput }
const queueKey = (userId: string) => STORAGE_KEYS.pendingCrashEvents + '.' + encodeURIComponent(userId);
const eventKey = (userId: string, event: CrashEventInput) =>
  'crash-' + encodeURIComponent(userId + ':' + event.detectedAt + ':' + event.outcome);
const tails = new Map<string, Promise<unknown>>();
const ownerEpochs = new Map<string, number>();
function inOrder<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.catch(() => undefined);
  tails.set(userId, tail);
  void tail.then(() => { if (tails.get(userId) === tail) tails.delete(userId); });
  return result;
}
function isEvent(value: unknown): value is CrashEventInput {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<CrashEventInput>;
  return typeof event.detectedAt === 'string' && Number.isFinite(Date.parse(event.detectedAt))
    && typeof event.peakG === 'number' && Number.isFinite(event.peakG)
    && ['cancelled', 'called', 'call_failed', 'no_number'].includes(event.outcome ?? '');
}
async function readEvents(userId: string): Promise<QueuedCrashEvent[]> {
  const raw = await secureStorage.getItem(queueKey(userId));
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value: unknown): QueuedCrashEvent[] => {
      // Compatibility with the initial per-account queue representation.
      if (isEvent(value)) return [{ idempotencyKey: eventKey(userId, value), event: value }];
      if (value && typeof value === 'object') {
        const item = value as Partial<QueuedCrashEvent>;
        if (typeof item.idempotencyKey === 'string' && isEvent(item.event)) return [item as QueuedCrashEvent];
      }
      return [];
    });
  } catch { return []; }
}
async function flush(userId: string, additions: CrashEventInput[] = []): Promise<void> {
  const epoch = ownerEpochs.get(userId) ?? 0;
  const current = () => useAuthStore.getState().session?.userId === userId && (ownerEpochs.get(userId) ?? 0) === epoch;
  if (!current()) return;
  const combined = [...await readEvents(userId), ...additions.map(event => ({ idempotencyKey: eventKey(userId, event), event }))];
  const events = [...new Map(combined.map(item => [item.idempotencyKey, item])).values()].slice(-50);
  // Legacy unowned GPS queues cannot safely be assigned to an account.
  await secureStorage.removeItem(STORAGE_KEYS.pendingCrashEvents);
  await appStorage.removeItem(STORAGE_KEYS.pendingCrashEvents);
  if (!current()) return;
  await secureStorage.setItem(queueKey(userId), JSON.stringify(events));
  const failed: QueuedCrashEvent[] = [];
  for (const item of events) {
    if (!current()) return;
    try { await services.emergency.recordCrash(item.event, item.idempotencyKey); } catch { failed.push(item); }
  }
  if (current()) await secureStorage.setItem(queueKey(userId), JSON.stringify(failed));
}

/** Retain an offline report with a stable key and its initiating account. */
export function recordCrashForUser(userId: string, event: CrashEventInput): Promise<void> {
  const epoch = ownerEpochs.get(userId) ?? 0;
  return inOrder(userId, () => {
    if ((ownerEpochs.get(userId) ?? 0) !== epoch) return Promise.resolve();
    return flush(userId, [event]);
  });
}
export function uploadPendingCrashEvents(userId: string): Promise<void> {
  const epoch = ownerEpochs.get(userId) ?? 0;
  return inOrder(userId, async () => {
    if (useAuthStore.getState().session?.userId !== userId || (ownerEpochs.get(userId) ?? 0) !== epoch) return;
    const native = Platform.OS === 'android' ? (await import('../utils/crashDetectionNative')).nativeCrashDetection : null;
    const events = native?.consumeEvents(userId) ?? [];
    await flush(userId, events.filter(isEvent));
  });
}

/** Called inside auth's persistence fence before another account is published. */
export async function clearCrashEventsForUser(userId: string): Promise<void> {
  ownerEpochs.set(userId, (ownerEpochs.get(userId) ?? 0) + 1);
  if (Platform.OS === 'android') {
    try {
      const { nativeCrashDetection } = await import('../utils/crashDetectionNative');
      nativeCrashDetection?.clearAccount(userId);
    } catch { /* Local logout must still complete if the native module is unavailable. */ }
  }
  // Uploads may be waiting for auth's fence: queue cleanup without waiting on
  // their network work. A later upload for this account follows this cleanup.
  void inOrder(userId, async () => {
    await secureStorage.removeItem(queueKey(userId));
    await secureStorage.removeItem(STORAGE_KEYS.pendingCrashEvents);
    await appStorage.removeItem(STORAGE_KEYS.pendingCrashEvents);
  }).catch(() => undefined);
}
