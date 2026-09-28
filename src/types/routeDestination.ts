import type { GeoPoint } from './common';
import type { ParkingZone } from './parking';
import type { EvChargingStation } from './evStation';

export type RouteDestination =
  | { type: 'parking'; id: string; name: string; nameAr: string; location: GeoPoint; zone: ParkingZone }
  | { type: 'ev_station'; id: string; name: string; location: GeoPoint; station: EvChargingStation };
export const parkingDestination = (zone: ParkingZone): RouteDestination => ({
  type: 'parking', id: zone.id, name: zone.name, nameAr: zone.nameAr, location: zone.location, zone,
});
export const evDestination = (station: EvChargingStation): RouteDestination => ({
  type: 'ev_station', id: station.id, name: station.name,
  location: { latitude: station.latitude, longitude: station.longitude }, station,
});
