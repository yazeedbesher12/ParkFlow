// Wire contract mirrored in server/src/modules/appConfig/schema.ts; validate at both trust boundaries.
import { z } from 'zod';

const plain = (max: number, required = true) => z.string().trim().min(required ? 1 : 0).max(max).refine(value => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'Use plain text without HTML');
const localized = (max: number, required = true) => z.object({ en: plain(max, required), ar: plain(max, required) }).strict();
// Images are rendered by native Image/img only; this service never fetches URLs.
export const imageUrlSchema = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host)
      && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal');
  } catch { return false; }
}, 'Use a public HTTPS image URL without credentials');
export const actionPaths = ['/(onboarding)/name', '/(onboarding)/phone'] as const;
const sectionBase = { id: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/), visible: z.boolean() };
export const sectionSchema = z.discriminatedUnion('type', [
  z.object({ ...sectionBase, type: z.literal('title'), text: localized(160) }).strict(),
  z.object({ ...sectionBase, type: z.literal('body'), text: localized(1500) }).strict(),
  z.object({ ...sectionBase, type: z.literal('image'), url: imageUrlSchema, alt: localized(160) }).strict(),
  z.object({ ...sectionBase, type: z.literal('action'), label: localized(80), path: z.enum(actionPaths) }).strict(),
]);
export const appConfigSchema = z.object({
  schemaVersion: z.literal(1),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color, for example #1F5A4A'),
  logoUrl: imageUrlSchema.nullable(),
  appName: localized(80),
  welcome: z.object({ headline: localized(160), body: localized(1500) }).strict(),
  banner: z.object({ enabled: z.boolean(), text: localized(300, false) }).strict().refine(b => !b.enabled || (b.text.en.length > 0 && b.text.ar.length > 0), 'An enabled banner needs both languages'),
  sections: z.array(sectionSchema).max(12).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Section identifiers must be unique'),
}).strict();
export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigSection = z.infer<typeof sectionSchema>;
export type LocalizedContent = { en: string; ar: string };
export const defaultAppConfig: AppConfig = {
  schemaVersion: 1, brandColor: '#1F5A4A', logoUrl: null,
  appName: { en: 'ParkFlow', ar: 'ParkFlow' },
  welcome: {
    headline: { en: 'Park. Pay. Go.', ar: 'اركن. ادفع. انطلق.' },
    body: { en: 'Easily find, pay and manage your parking.', ar: 'ابحث عن موقف وادفع وأدر وقوفك بسهولة.' },
  },
  banner: { enabled: false, text: { en: '', ar: '' } },
  sections: [
    { id: 'nearby', type: 'title', visible: true, text: { en: 'Find parking near you', ar: 'اعثر على موقف قريب منك' } },
    { id: 'minutes', type: 'title', visible: true, text: { en: 'Pay by the minute', ar: 'ادفع حسب الدقائق' } },
    { id: 'expiry', type: 'title', visible: true, text: { en: 'Never miss an expiry', ar: 'لا تفوّت انتهاء الوقت' } },
  ],
};

export interface PublishedAppConfig { version: number; revisionId: string | null; config: AppConfig }
export interface AppConfigRevision { id: string; version: number; config: AppConfig; createdAt: string; createdBy: string; publishedAt: string | null; publication: { actorUserId?: string; action?: string; sourceRevisionId?: string; reason?: string } | null }
export interface AdminAppConfig { version: number; publishedRevisionId: string | null; draftRevisionId: string | null; draft: AppConfigRevision | null; published: AppConfigRevision | null }
export interface AppConfigHistory { items: AppConfigRevision[]; nextBeforeVersion: number | null }
/** Reject unknown server versions instead of rendering an unvalidated payload. */
export function readPublishedConfig(value: unknown): PublishedAppConfig {
  const envelope = z.object({ version: z.number().int().nonnegative(), revisionId: z.string().nullable(), config: appConfigSchema }).safeParse(value);
  return envelope.success ? envelope.data : { version: 0, revisionId: null, config: appConfigSchema.parse(defaultAppConfig) };
}
