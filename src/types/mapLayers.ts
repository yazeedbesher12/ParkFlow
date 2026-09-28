export const PRIMARY_MAP_CATEGORIES = [
  'parking',
  'ev_charging',
  'car_services',
  'roadside_help',
] as const;

export type PrimaryMapCategory = typeof PRIMARY_MAP_CATEGORIES[number];

/** Extension switches for categories whose data sources and markers arrive later. */
export const MAP_LAYER_AVAILABILITY: Record<PrimaryMapCategory, boolean> = {
  parking: true,
  ev_charging: true,
  car_services: false,
  roadside_help: false,
};

export const BUSINESS_OFFERS_AVAILABLE = false;

export const isAvailablePrimaryCategory = (value: unknown): value is PrimaryMapCategory =>
  typeof value === 'string'
  && PRIMARY_MAP_CATEGORIES.includes(value as PrimaryMapCategory)
  && MAP_LAYER_AVAILABILITY[value as PrimaryMapCategory];
