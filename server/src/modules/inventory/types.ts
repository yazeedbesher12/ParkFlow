export type InventoryWindow = { startTime: Date; endTime: Date };

export type InventorySpot = { id: string; code: string; state: 'available' | 'held' };

export type InventoryAvailability = {
  zoneId: string;
  window: InventoryWindow;
  spots: InventorySpot[];
};

export type InventoryHold = {
  id: string;
  zoneId: string;
  spotId: string;
  startTime: Date;
  endTime: Date;
  expiresAt: Date;
  holdKey: string;
};

export interface InventoryProvider {
  getAvailability(zoneId: string, window: InventoryWindow): Promise<InventoryAvailability>;
  hold(zoneId: string, spotId: string, window: InventoryWindow, holdKey: string): Promise<InventoryHold>;
  release(holdId: string): Promise<void>;
}
