export type TopUpPayload = { amount: number; paymentMethodId: string };
export type PendingTopUp = { key: string; payload: TopUpPayload };
export interface PaymentStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export class PendingPaymentConflict extends Error {
  constructor(readonly pending: PendingTopUp) { super('Resolve the previous wallet top-up before starting another payment.'); }
}
export class TopUpRecovery {
  private readonly active = new Map<string, { pending: PendingTopUp; promise: Promise<unknown> }>();
  constructor(private readonly storage: PaymentStorage) {}
  private storageKey(userId: string) { return 'pf.topup.' + Array.from(userId).map(c => c.charCodeAt(0).toString(16)).join('_'); }
  async read(userId: string): Promise<PendingTopUp | null> {
    const raw = await this.storage.getItem(this.storageKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingTopUp;
    if (!value || typeof value.key !== 'string' || !value.key || !Number.isSafeInteger(value.payload?.amount) || value.payload.amount <= 0 || typeof value.payload.paymentMethodId !== 'string' || !value.payload.paymentMethodId) {
      throw new Error('The previous payment needs support review before another top-up can start.');
    }
    return value;
  }
  async run<T>(userId: string, payload: TopUpPayload, key: string, send: (payload: TopUpPayload, key: string) => Promise<T>): Promise<T> {
    if (!userId || !key) throw new Error('A signed-in account and payment request key are required.');
    const same = (a: TopUpPayload, b: TopUpPayload) => a.amount === b.amount && a.paymentMethodId === b.paymentMethodId;
    const running = this.active.get(userId);
    if (running) {
      if (!same(running.pending.payload, payload)) throw new PendingPaymentConflict(running.pending);
      return running.promise as Promise<T>;
    }
    const promise = (async () => {
      const previous = await this.read(userId);
      if (previous && !same(previous.payload, payload)) throw new PendingPaymentConflict(previous);
      const pending = previous ?? { key, payload };
      if (!previous) await this.storage.setItem(this.storageKey(userId), JSON.stringify(pending));
      try {
        const result = await send(pending.payload, pending.key);
        await this.storage.removeItem(this.storageKey(userId));
        return result;
      } catch (error) {
        const details = (error as { details?: { status?: number; serverCode?: string } })?.details;
        // A timeout, processing response or server error may follow a real charge.
        // Only definite pre-payment rejection/decline permits a fresh request.
        if (details?.serverCode === 'PAYMENT_FAILED' || (!previous && details?.serverCode === 'VALIDATION')) await this.storage.removeItem(this.storageKey(userId));
        throw error;
      }
    })();
    this.active.set(userId, { pending: { key, payload }, promise });
    try { return await promise; } finally { this.active.delete(userId); }
  }
}
