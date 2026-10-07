import type { OperatorService } from '../types';
import { api, mutation, segment } from './apiClient';

export const httpOperatorService: OperatorService = {
  summary: async () => {
    // Older API deployments called this collection `zones`. Normalize at the
    // boundary so screens always render the operator's assigned zones.
    const response = await api<OperatorSummaryResponse>('/operator/summary');
    const assignedZones = response.assignedZones ?? response.zones ?? [];
    return {
      ...response,
      assignedZones,
      assignedZoneCount: response.assignedZoneCount ?? assignedZones.length,
      zones: response.zones ?? assignedZones,
    };
  },
  updateAvailability: (zoneId, input) => mutation(`/operator/zones/${segment(zoneId)}/availability`, input),
  listReservations: (zoneId) => api(`/operator/zones/${segment(zoneId)}/reservations`),
  checkIn: (reservationId, qrToken) => mutation(`/operator/reservations/${segment(reservationId)}/check-in`, qrToken ? { qrToken } : {}),
  resolveReservation: (reservationId, input) => mutation(`/operator/reservations/${segment(reservationId)}/recovery`, input),
  feedHealth: () => api('/operator/feed-health'),
};

type OperatorSummaryResponse = {
  assignedZones?: import('../types').OperatorSummary['assignedZones'];
  zones?: import('../types').OperatorSummary['assignedZones'];
  assignedZoneCount?: number;
};
