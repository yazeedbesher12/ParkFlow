import type { Checkpoint, CheckpointStatus } from '@/types';
import { normalizeArabic } from './arabic';

/**
 * Reads the road chatter drivers post on Telegram and WhatsApp — "الكونتينر
 * مسكر بالكامل", "عطارة سالكة مافي زحمة" — into a checkpoint and a status.
 * Rule-based, like Wusool's offline path, so it works with no network or model.
 */

const words = (list: string[]) => new Set(list.map(normalizeArabic));

const CLOSED = words([
  'مسكر', 'مسكرة', 'سكر', 'سكرو', 'سكروا', 'مغلق', 'مغلقة', 'إغلاق', 'مقفل', 'مقفول',
  'مسدود', 'closed', 'shut',
]);
const OPEN = words([
  'سالك', 'سالكة', 'فتح', 'فتحو', 'فتحوا', 'مفتوح', 'طبيعي', 'طبيعية', 'تحسن', 'open', 'clear',
]);
const CONGESTED = words([
  'أزمة', 'زحمة', 'خانقة', 'بطيء', 'بطيئة', 'تفتيش', 'طابور', 'ازدحام', 'congested',
  'traffic', 'slow', 'queue',
]);
/** Negated congestion reads as open — "مافي زحمة" must not count as "زحمة". */
const NO_TRAFFIC = ['مافي زحمة', 'ما في زحمة', 'مافي أزمة', 'ما في أزمة', 'لا يوجد أزمة', 'no traffic'].map(
  normalizeArabic,
);
const CLOSED_PHRASES = ['ممنوع المرور'].map(normalizeArabic);

/** Words plus their clitic-free forms: "والبديل" also yields "البديل" and "بديل". */
function tokensOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const token of text.split(' ')) {
    if (!token) continue;
    const bare = token.replace(/^[وفب]/, '');
    out.add(token);
    out.add(bare);
    out.add(token.replace(/^ال/, ''));
    out.add(bare.replace(/^ال/, ''));
  }
  return out;
}

export function parseRoadStatus(text: string): CheckpointStatus | undefined {
  const normalized = normalizeArabic(text);
  const tokens = tokensOf(normalized);
  const has = (set: Set<string>) => [...set].some((word) => tokens.has(word));

  if (NO_TRAFFIC.some((phrase) => normalized.includes(phrase))) return 'open';
  if (has(CLOSED) || CLOSED_PHRASES.some((phrase) => normalized.includes(phrase))) return 'closed';
  if (has(OPEN)) return 'open';
  if (has(CONGESTED)) return 'congested';
  return undefined;
}

/** The checkpoint mentioned first in the post, matched on its name or any alias. */
export function matchCheckpoint(text: string, checkpoints: Checkpoint[]): Checkpoint | undefined {
  const normalized = normalizeArabic(text);
  let best: { checkpoint: Checkpoint; index: number } | undefined;

  for (const checkpoint of checkpoints) {
    for (const name of [checkpoint.nameAr, checkpoint.nameEn, ...checkpoint.aliases]) {
      const needle = normalizeArabic(name);
      if (needle.length < 3) continue;
      const index = normalized.indexOf(needle);
      if (index >= 0 && (!best || index < best.index)) best = { checkpoint, index };
    }
  }
  return best?.checkpoint;
}
