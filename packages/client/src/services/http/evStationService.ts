import type { EvStationApi } from '@parkflow/contracts';
import { api, query } from './apiClient';
export const httpEvStationService: EvStationApi = {
  list: (bounds, filters) => api('/ev-stations' + query({ ...bounds, ...filters }), { public: true }),
};
