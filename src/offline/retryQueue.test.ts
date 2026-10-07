import { RetryQueue } from './retryQueue';
import { OfflineStorage } from './storage';

const adapter = () => { const m = new Map<string,string>(); return { getItem: async (k:string) => m.get(k) ?? null, setItem: async (k:string,v:string) => { m.set(k,v); }, removeItem: async (k:string) => { m.delete(k); } }; };
const item = (key:string, userId='u') => ({ userId, createdAt: new Date().toISOString(), idempotencyKey:key, mutation:{ kind:'road-report' as const, payload:{ latitude:1, longitude:2, type:'other' as const } } });

export async function retryQueueTests() {
  {
    const sent:string[] = []; const queue = new RetryQueue(new OfflineStorage(adapter()), async (x) => { sent.push(x.idempotencyKey); });
    await queue.enqueue(item('a')); await queue.enqueue(item('a')); await queue.enqueue(item('b')); await queue.flush();
    if (sent.join(',') !== 'a,b') throw new Error('FIFO or dedupe failed');
  }
  {
    let fail = true; const queue = new RetryQueue(new OfflineStorage(adapter()), async (x) => { if (fail) throw new Error('offline'); return x; });
    await queue.enqueue(item('a')); if ((await queue.flush()).remaining !== 1) throw new Error('failure was removed'); fail = false; if ((await queue.flush()).remaining !== 0) throw new Error('success remained queued');
  }
  {
    const queue = new RetryQueue(new OfflineStorage(adapter()), async () => undefined, () => 'u');
    let rejected = false; try { await queue.enqueue(item('a','other')); } catch { rejected = true; } if (!rejected) throw new Error('cross-account queue write accepted');
  }
}
