import type { RoutingService } from '../types';
import { api } from './apiClient';
export const httpRoutingService: RoutingService = {
  getRoute: (origin, destination, options) =>
    api('/routes/plan', { method: 'POST', body: { origin, destination, ...options } }),
};
