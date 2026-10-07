import { z } from 'zod';
import { actor, admins, empty, route } from '../../apiRegistry';
import { appConfigSchema } from './schema';
import * as config from './service';

const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const publish = z.object({ expectedVersion: version, revisionId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).strict();
route('get', '/app-config', empty, () => config.getPublicConfig(), false);
route('get', '/admin/app-config', empty, r => config.readAdminConfig(actor(r)), admins);
route('get', '/admin/app-config/history', z.object({ beforeVersion: z.coerce.number().int().positive().optional() }).strict(), (r, b) => config.listHistory(actor(r), b.beforeVersion), admins);
route('patch', '/admin/app-config/draft', z.object({ expectedVersion: version, config: appConfigSchema }).strict(), (r, b) => config.saveDraft(actor(r), b.expectedVersion, b.config), admins);
route('post', '/admin/app-config/publish', publish, (r, b) => config.publishDraft(actor(r), b.expectedVersion, b.revisionId, b.reason), admins);
route('post', '/admin/app-config/rollback', publish, (r, b) => config.rollback(actor(r), b.expectedVersion, b.revisionId, b.reason), admins);
