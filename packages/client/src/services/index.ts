import type { Services } from '@parkflow/contracts/services';
import { httpEvStationService } from './http/evStationService';
import { httpCarServiceService } from './http/carServiceService';
import { httpTourismPlaceService } from './http/tourismPlaceService';
import { httpAuthService } from './http/authService';
import { httpVehicleService } from './http/vehicleService';
import { httpParkingService } from './http/parkingService';
import { httpWalletService } from './http/walletService';
import { httpPaymentService } from './http/paymentService';
import { httpViolationService } from './http/violationService';
import { httpNotificationService } from './http/notificationService';
import { httpProfileService } from './http/profileService';
import { httpRoadService } from './http/roadService';
import { httpRoadReportService } from './http/roadReportService';
import { httpRoutingService } from './http/routingService';
import { httpTrustService } from './http/trustService';
import { httpOperatorService } from './http/operatorService';
import { httpAdminService } from './http/adminService';
import { httpSharingService } from './http/sharingService';
import { httpGateService } from './http/gateService';
import { httpEmergencyService } from './http/emergencyService';

export const services: Services = {
  evStations: httpEvStationService,
  carServices: httpCarServiceService,
  tourismPlaces: httpTourismPlaceService,
  auth: httpAuthService,
  vehicles: httpVehicleService,
  parking: httpParkingService,
  wallet: httpWalletService,
  payments: httpPaymentService,
  violations: httpViolationService,
  notifications: httpNotificationService,
  profile: httpProfileService,
  roads: httpRoadService,
  roadReports: httpRoadReportService,
  routing: httpRoutingService,
  trust: httpTrustService,
  operator: httpOperatorService,
  admin: httpAdminService,
  sharing: httpSharingService,
  gates: httpGateService,
  emergency: httpEmergencyService,
};
export * from '@parkflow/contracts/services';
export { DEFAULT_REGION, LANDMARKS, RAMALLAH_CENTER } from '../data/mapDefaults';
