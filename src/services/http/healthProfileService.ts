import type { User } from '@/types';
import type { HealthProfile, HealthProfileInput } from '@/types/health';
import { api } from './apiClient';

export const healthProfileService = {
  get: async () => (await api<{ profile: HealthProfile | null }>('/users/me/health-profile')).profile,
  save: (input: HealthProfileInput) => api<User>('/users/me/health-profile', { method: 'PATCH', body: input }),
  delete: () => api<User>('/users/me/health-profile', { method: 'DELETE' }),
};
