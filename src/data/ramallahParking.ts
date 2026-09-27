import source from './ramallah_parking_locations.json';
import type { RamallahParkingDataset } from '@/types';

/**
 * Single typed gateway to the supplied development dataset. Components consume
 * these objects directly so names, coordinates and prices are never duplicated.
 */
export const ramallahParkingDataset = source as RamallahParkingDataset;
export const ramallahParkingLocations = ramallahParkingDataset.parkingLocations;
