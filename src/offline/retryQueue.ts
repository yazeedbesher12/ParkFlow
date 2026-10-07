import { AppError } from '@/utils/errors';
import { useAuthStore } from '@/store/authStore';
import { api, segment } from '@/services/http/apiClient';
import { offlineStorage, scopedKey, type OfflineStorage } from './storage';
import type { FlushResult, QueueItem } from './types';

export type QueueSender = (item: QueueItem) => Promise<unknown>;

export const sendQueueItem: QueueSender = (item) => item.mutation.kind === 'road-report'
  ? api('/road-reports', { method: 'POST', body: item.mutation.payload, key: item.idempotencyKey })
  : api(`/parking/zones/${segment(item.mutation.payload.zoneId)}/feedback`, {
      method: 'POST',
      body: (({ zoneId: _zoneId, ...body }) => body)(item.mutation.payload),
      key: item.idempotencyKey,
    });

export class RetryQueue {
  private active?: Promise<FlushResult>;
  private serial: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: OfflineStorage = offlineStorage,
    private readonly sender: QueueSender = sendQueueItem,
    private readonly currentUserId: () => string | undefined = () => useAuthStore.getState().user?.id,
  ) {}

  private key(userId: string) { return scopedKey(userId, 'retryQueue'); }
  private async list(userId: string): Promise<QueueItem[]> { return (await this.storage.get<QueueItem[]>(this.key(userId))) ?? []; }
  private lock<T>(run: () => Promise<T>): Promise<T> {
    const task = this.serial.then(run, run);
    this.serial = task.then(() => undefined, () => undefined);
    return task;
  }

  async enqueue(item: QueueItem): Promise<void> {
    if (item.mutation.kind !== 'road-report' && item.mutation.kind !== 'parking-feedback') {
      throw new AppError('validation', 'Live reservations and payments cannot be queued.');
    }
    if (!item.userId || item.userId !== this.currentUserId()) throw new AppError('unauthorized', 'Sign in to save a report.');
    await this.lock(async () => {
      const queue = await this.list(item.userId);
      if (queue.some((entry) => entry.idempotencyKey === item.idempotencyKey)) return;
      queue.push(item);
      await this.storage.set(this.key(item.userId), queue);
    });
  }

  async pending(userId = this.currentUserId()): Promise<QueueItem[]> { return userId ? this.list(userId) : []; }

  async clearUser(userId: string): Promise<void> { await this.storage.remove(this.key(userId)); }

  flush(): Promise<FlushResult> {
    if (this.active) return this.active;
    const run = this.lock(async (): Promise<FlushResult> => {
      const userId = this.currentUserId();
      if (!userId) return { sent: 0, remaining: 0 };
      let sent = 0;
      for (;;) {
        const queue = await this.list(userId);
        if (!queue.length) return { sent, remaining: 0 };
        const first = queue[0];
        if (first.userId !== userId) return { sent, remaining: queue.length };
        try { await this.sender(first); }
        catch (failed) { return { sent, remaining: queue.length, failed }; }
        // A session switch while the request was in flight must not process the next account's queue.
        const latest = await this.list(userId);
        await this.storage.set(this.key(userId), latest.filter((entry) => entry.idempotencyKey !== first.idempotencyKey));
        sent += 1;
        if (this.currentUserId() !== userId) return { sent, remaining: (await this.list(userId)).length };
      }
    });
    this.active = run.finally(() => { this.active = undefined; });
    return this.active;
  }
}

export const retryQueue = new RetryQueue();

export function newQueueKey(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function sendOrQueue(item: QueueItem): Promise<void> {
  await retryQueue.enqueue(item);
  const result = await retryQueue.flush();
  if ((await retryQueue.pending(item.userId)).some((pending) => pending.idempotencyKey === item.idempotencyKey)) {
    throw new AppError('network', 'Saved to send when online.', { queued: true, cause: result.failed });
  }
}
