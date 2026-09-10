import type { Services } from './types';
import { mockAuthService } from './authService';
import { mockVehicleService } from './vehicleService';
import { mockParkingService } from './parkingService';
import { mockWalletService } from './walletService';
import { mockPaymentService } from './paymentService';
import { mockViolationService } from './violationService';
import { mockNotificationService } from './notificationService';
import { mockProfileService } from './profileService';
import { mockRoadService } from './roadService';
import { osrmRoutingService } from './routingService';
import { mockTrustService } from './trustService';

/**
 * Single composition point. Swapping the mock backend for HTTP means changing
 * the implementations here — no screen or hook needs to know.
 */
export const services: Services = {
  auth: mockAuthService,
  vehicles: mockVehicleService,
  parking: mockParkingService,
  wallet: mockWalletService,
  payments: mockPaymentService,
  violations: mockViolationService,
  notifications: mockNotificationService,
  profile: mockProfileService,
  roads: mockRoadService,
  // Real routing: the public OSRM server, with a straight-line fallback offline.
  routing: osrmRoutingService,
  trust: mockTrustService,
};

export * from './types';
export { DEFAULT_REGION, ZONES, FACILITIES } from './mock/catalog';
export { LANDMARKS } from './mock/landmarks';
export { SAMPLE_ROAD_POSTS } from './mock/roads';
export { resetDb } from './mock/db';
