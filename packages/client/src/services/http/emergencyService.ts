import type { EmergencyService } from '@parkflow/contracts/services';
import { api, mutation } from './apiClient';

export const httpEmergencyService: EmergencyService = {
  config: () => api('/emergency/config'),
  recordCrash: (input, idempotencyKey) => idempotencyKey
    ? api('/emergency/crash-events', { method: 'POST', body: input, key: idempotencyKey })
    : mutation('/emergency/crash-events', input),
};
