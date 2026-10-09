import type { Services } from './types';
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
};
export * from './types';
export { DEFAULT_REGION, LANDMARKS, RAMALLAH_CENTER } from '../data/mapDefaults';
