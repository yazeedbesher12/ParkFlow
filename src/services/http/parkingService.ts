import type { ParkingService } from '../types';
import type { ParkingSession } from '@/types';
import { api,mutation,query,segment } from './apiClient';
export const httpParkingService:ParkingService={
 listZones:q=>api('/parking/zones'+query({search:q?.search,lat:q?.near?.latitude,lng:q?.near?.longitude,radius:q?.radiusMeters})),
 getZone:id=>api(`/parking/zones/${segment(id)}`),getZoneByCode:code=>api(`/parking/zones/code/${segment(code)}`),getFacility:id=>api(`/parking/facilities/${segment(id)}`),
 startSession:({userId,idempotencyKey,...body})=>api('/parking/sessions',{method:'POST',body,key:idempotencyKey}),
 stopSession:id=>mutation(`/parking/sessions/${segment(id)}/stop`),extendSession:(id,additionalMinutes)=>mutation(`/parking/sessions/${segment(id)}/extend`,{additionalMinutes}),settleSession:id=>mutation(`/parking/sessions/${segment(id)}/settle`),
 getSession:id=>api(`/parking/sessions/${segment(id)}`),listActiveSessions:()=>api('/parking/sessions/active'),
 async getActiveSessionForVehicle(vehicleId){return (await api<ParkingSession[]>('/parking/sessions/active'+query({vehicleId})))[0];},
 listSessions:({userId,...q})=>api('/parking/sessions'+query(q)),
};
