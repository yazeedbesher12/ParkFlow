import type { AppConfigRevision } from '@prisma/client';
import { atomic, db, json, lock, type Tx } from '../../database/client';
import type { Actor } from '../admin/service';
import { ApiError, assert, requireValue } from '../../utils/errors';
import { appConfigSchema, defaultAppConfig, type AppConfig } from './schema';

const stateId = 'global';
function admin(actor: Actor) { assert(actor.role === 'ADMIN', 'FORBIDDEN', 'Only platform administrators can edit appearance', 403); }
function revisionDto(revision: AppConfigRevision | null) {
  if (!revision) return null;
  return { id: revision.id, version: revision.version, config: appConfigSchema.parse(revision.payload), createdBy: revision.createdBy, createdAt: revision.createdAt, publishedAt: revision.publishedAt, publication: revision.publication };
}
async function snapshot(tx: Tx) {
  const state = await tx.appConfigState.findUnique({ where: { id: stateId } });
  const [draft, published] = await Promise.all([
    state?.draftRevisionId ? tx.appConfigRevision.findUnique({ where: { id: state.draftRevisionId } }) : null,
    state?.publishedRevisionId ? tx.appConfigRevision.findUnique({ where: { id: state.publishedRevisionId } }) : null,
  ]);
  return { version: state?.version ?? 0, publishedRevisionId: state?.publishedRevisionId ?? null, draftRevisionId: state?.draftRevisionId ?? null, draft: revisionDto(draft), published: revisionDto(published) };
}
export async function getPublicConfig() {
  const state = await db.appConfigState.findUnique({ where: { id: stateId } });
  const revision = state?.publishedRevisionId ? await db.appConfigRevision.findUnique({ where: { id: state.publishedRevisionId } }) : null;
  const parsed = revision?.publishedAt ? appConfigSchema.safeParse(revision.payload) : null;
  if (!parsed?.success) return { version: 0, revisionId: null, config: defaultAppConfig };
  return { version: revision!.version, revisionId: revision!.id, config: parsed.data };
}
export async function readAdminConfig(actor: Actor) { admin(actor); return atomic(snapshot); }
export async function listHistory(actor: Actor, beforeVersion?: number) {
  admin(actor);
  const rows = await db.appConfigRevision.findMany({ where: beforeVersion === undefined ? {} : { version: { lt: beforeVersion } }, orderBy: { version: 'desc' }, take: 51 });
  return { items: rows.slice(0, 50).map(revisionDto), nextBeforeVersion: rows.length > 50 ? rows[49]!.version : null };
}
async function edit(actor: Actor, expectedVersion: number, action: 'save-draft' | 'publish' | 'rollback', source: { config?: AppConfig; revisionId?: string; reason?: string }) {
  admin(actor);
  return atomic(async tx => {
    await lock(tx, 'app-config:global');
    const state = await tx.appConfigState.upsert({ where: { id: stateId }, create: { id: stateId }, update: {} });
    if (state.version !== expectedVersion) throw new ApiError(409, 'APP_CONFIG_CONFLICT', 'Appearance changed in another editor. Reload the latest version before saving.', { currentVersion: state.version });
    let payload: AppConfig;
    if (action === 'save-draft') payload = appConfigSchema.parse(source.config);
    else {
      if (action === 'publish') assert(state.draftRevisionId === source.revisionId, 'APP_CONFIG_CONFLICT', 'This is no longer the current draft. Reload before publishing.', 409);
      const original = requireValue(await tx.appConfigRevision.findUnique({ where: { id: source.revisionId! } }), 'Appearance revision not found');
      if (action === 'rollback') assert(original.publishedAt, 'VALIDATION', 'Only a previously published revision can be restored');
      payload = appConfigSchema.parse(original.payload);
    }
    const nextVersion = state.version + 1;
    const revision = await tx.appConfigRevision.create({ data: {
      version: nextVersion, payload: json(payload), createdBy: actor.userId,
      ...(action === 'save-draft' ? {} : { publishedAt: new Date(), publication: json({ actorUserId: actor.userId, action, sourceRevisionId: source.revisionId, reason: source.reason }) }),
    } });
    const changed = await tx.appConfigState.updateMany({ where: { id: stateId, version: expectedVersion }, data: {
      version: nextVersion,
      ...(action === 'save-draft' ? { draftRevisionId: revision.id } : { publishedRevisionId: revision.id, draftRevisionId: null }),
    } });
    assert(changed.count === 1, 'APP_CONFIG_CONFLICT', 'Appearance changed in another editor. Reload before saving.', 409);
    await tx.auditLog.create({ data: { actorUserId: actor.userId, action, resourceType: 'app-config', resourceId: revision.id, before: json(state), after: json({ version: nextVersion, revisionId: revision.id, sourceRevisionId: source.revisionId, reason: source.reason }), ip: actor.ip, userAgent: actor.userAgent } });
    return snapshot(tx);
  });
}
export function saveDraft(actor: Actor, expectedVersion: number, config: AppConfig) { return edit(actor, expectedVersion, 'save-draft', { config }); }
export function publishDraft(actor: Actor, expectedVersion: number, revisionId: string, reason: string) { return edit(actor, expectedVersion, 'publish', { revisionId, reason }); }
export function rollback(actor: Actor, expectedVersion: number, revisionId: string, reason: string) { return edit(actor, expectedVersion, 'rollback', { revisionId, reason }); }
