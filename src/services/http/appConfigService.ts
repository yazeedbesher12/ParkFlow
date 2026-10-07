import { api, query } from './apiClient';
import { readPublishedConfig, type AdminAppConfig, type AppConfig, type AppConfigHistory } from '@/types/appConfig';

export const appConfigService = {
  published: async () => readPublishedConfig(await api<unknown>('/app-config', { public: true })),
  admin: () => api<AdminAppConfig>('/admin/app-config'),
  history: (beforeVersion?: number) => api<AppConfigHistory>('/admin/app-config/history' + query({ beforeVersion })),
  saveDraft: (expectedVersion: number, config: AppConfig) => api<AdminAppConfig>('/admin/app-config/draft', { method: 'PATCH', body: { expectedVersion, config } }),
  publish: (expectedVersion: number, revisionId: string, reason: string) => api<AdminAppConfig>('/admin/app-config/publish', { method: 'POST', body: { expectedVersion, revisionId, reason } }),
  rollback: (expectedVersion: number, revisionId: string, reason: string) => api<AdminAppConfig>('/admin/app-config/rollback', { method: 'POST', body: { expectedVersion, revisionId, reason } }),
};
