export const MIN_FORECAST_HISTORY = 8;
export type HistoricalSignal = { at: Date; value: number; confidence: number };
export type ForecastFallback = { confidence: number; freshness: string; availableSpaces?: number };
const bound = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export function localBucket(at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return `${parts.find(p => p.type === 'weekday')?.value}:${Math.floor(Number(parts.find(p => p.type === 'hour')?.value) / 2)}`;
}
export function baselineForecast(arrivalAt: Date, history: HistoricalSignal[], fallback: ForecastFallback, demo: boolean, now = new Date()) {
  const bucket = localBucket(arrivalAt);
  const samples = history.filter(s => s.at <= now && localBucket(s.at) === bucket && Number.isFinite(s.value) && Number.isFinite(s.confidence) && s.confidence >= 0.5);
  const sparse = samples.length < MIN_FORECAST_HISTORY;
  const probability = sparse ? (fallback.freshness === 'fresh' && fallback.availableSpaces !== undefined ? (fallback.availableSpaces > 0 ? 0.65 : 0.1) : 0.5) : samples.reduce((sum, s) => sum + bound(s.value) * bound(s.confidence), 0) / samples.reduce((sum, s) => sum + bound(s.confidence), 0);
  return { probability: bound(probability), confidence: sparse ? Math.min(0.4, bound(fallback.confidence)) : Math.min(0.9, samples.reduce((sum, s) => sum + bound(s.confidence), 0) / samples.length * Math.min(1, samples.length / 24)), sampleSize: samples.length, fallback: sparse, provenance: sparse ? fallback : undefined, guarantee: 'none' as const, window: { startTime: arrivalAt.toISOString(), endTime: new Date(arrivalAt.getTime() + 30 * 60_000).toISOString(), timezone: 'Asia/Jerusalem', bucket }, reasonCodes: [...(sparse ? ['insufficient_history', 'provenance_fallback'] : ['local_weekday_time_history']), ...(demo ? ['demo_data'] : []), 'estimate_only'] };
}
