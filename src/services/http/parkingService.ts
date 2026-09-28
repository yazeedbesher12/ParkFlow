import type { ParkingService } from '../types';
import type { ParkingSession, ParkingZone } from '@/types';
import { ramallahParkingZones } from '@/data/ramallahParking';
import { api, mutation, query, segment } from './apiClient';

const collectedZoneMetadata = new Map(ramallahParkingZones.map((zone) => [zone.id, zone]));

/** The API owns live availability; the collected dataset owns prototype metadata. */
const enrichCollectedZone = (zone: ParkingZone): ParkingZone => {
  const metadata = collectedZoneMetadata.get(zone.id);
  return metadata
    ? {
        ...zone,
        ownership: metadata.ownership,
        accessRestriction: metadata.accessRestriction,
        accessRestrictionAr: metadata.accessRestrictionAr,
        parkingAllowed: metadata.parkingAllowed,
        prototypeData: metadata.prototypeData,
        availability: zone.availability === 'unknown' ? metadata.availability : zone.availability,
      }
    : zone;
};

export const httpParkingService: ParkingService = {
  async listZones(options) {
    const zones = await api<ParkingZone[]>(
      '/parking/zones' +
        query({
          search: options?.search,
          lat: options?.near?.latitude,
          lng: options?.near?.longitude,
          radius: options?.radiusMeters,
        }),
    );
    return zones.map(enrichCollectedZone);
  },
  async getZone(id) {
    return enrichCollectedZone(await api<ParkingZone>(`/parking/zones/${segment(id)}`));
  },
  async getZoneByCode(code) {
    return enrichCollectedZone(await api<ParkingZone>(`/parking/zones/code/${segment(code)}`));
  },
  getFacility: (id) => api(`/parking/facilities/${segment(id)}`),
  getLayout: (id) => api(`/parking/zones/${segment(id)}/layout`),
  startSession: ({ userId, idempotencyKey, ...body }) =>
    api('/parking/sessions', { method: 'POST', body, key: idempotencyKey }),
  stopSession: (id) => mutation(`/parking/sessions/${segment(id)}/stop`),
  extendSession: (id, additionalMinutes) =>
    mutation(`/parking/sessions/${segment(id)}/extend`, { additionalMinutes }),
  settleSession: (id) => mutation(`/parking/sessions/${segment(id)}/settle`),
  getSession: (id) => api(`/parking/sessions/${segment(id)}`),
  listActiveSessions: () => api('/parking/sessions/active'),
  async getActiveSessionForVehicle(vehicleId) {
    return (
      await api<ParkingSession[]>('/parking/sessions/active' + query({ vehicleId }))
    )[0];
  },
  listSessions: ({ userId, ...options }) => api('/parking/sessions' + query(options)),
  createReservation: (body) => mutation('/parking/reservations', body),
  listReservations: () => api('/parking/reservations'),
  getReservation: (id) => api(`/parking/reservations/${segment(id)}`),
  cancelReservation: (id) => mutation(`/parking/reservations/${segment(id)}/cancel`),
  validateReservationQr: (token) => mutation('/parking/reservations/qr/validate', { token }),
};
