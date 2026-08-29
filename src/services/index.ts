import type { Services } from './types';
import { mockAuthService } from './authService';
import { mockVehicleService } from './vehicleService';
import { mockParkingService } from './parkingService';
import { mockWalletService } from './walletService';
import { mockPaymentService } from './paymentService';
import { mockViolationService } from './violationService';
import { mockNotificationService } from './notificationService';
import { mockProfileService } from './profileService';

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
};

export * from './types';
export { DEFAULT_REGION, ZONES, FACILITIES } from './mock/catalog';
export { resetDb } from './mock/db';
