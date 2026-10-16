import { api, query, segment } from './apiClient';

export type VehicleVerificationRole = 'owner' | 'driver' | 'manager';

export interface VehicleVerificationLink {
  id: string;
  userId: string;
  vehicleId: string;
  role: VehicleVerificationRole;
  verifiedAt: string | null;
  linkedAt: string;
  user: { id: string; fullName: string; email: string | null; phone: string | null };
  vehicle: { id: string; plateNumber: string; region: string; make: string | null; model: string | null };
}

export interface VehicleVerificationDecision {
  verified: boolean;
  role: VehicleVerificationRole;
  reason: string;
}

export const vehicleVerificationService = {
  list: (search = '') => api<VehicleVerificationLink[]>(`/admin/vehicle-verifications${query({ query: search.trim() || undefined })}`),
  update: (id: string, decision: VehicleVerificationDecision) => api<unknown>(`/admin/vehicle-verifications/${segment(id)}`, {
    method: 'PATCH', body: { ...decision, reason: decision.reason.trim() },
  }),
};
