import dataset from '../../../ramallah_tourism_places.json';
import type { TourismPlace, TourismPlaceApi, TourismPlaceCategory } from '@/types';

type RawTourismPlace = Omit<TourismPlace, 'latitude' | 'longitude' | 'createdAt' | 'updatedAt' | 'sourcesCheckedOn'> & {
  categories: TourismPlaceCategory[];
  latitude: number | null;
  longitude: number | null;
  sourcesCheckedOn: string;
};

const isValidCoordinatePair = (place: RawTourismPlace) =>
  typeof place.latitude === 'number' &&
  Number.isFinite(place.latitude) &&
  place.latitude >= -90 &&
  place.latitude <= 90 &&
  typeof place.longitude === 'number' &&
  Number.isFinite(place.longitude) &&
  place.longitude >= -180 &&
  place.longitude <= 180;

const places = (dataset.places as RawTourismPlace[])
  .filter((place) => place.mapReady && isValidCoordinatePair(place))
  .map((place): TourismPlace => ({
    ...place,
    latitude: place.latitude!,
    longitude: place.longitude!,
    sourcesCheckedOn: `${place.sourcesCheckedOn}T00:00:00.000Z`,
    createdAt: `${place.sourcesCheckedOn}T00:00:00.000Z`,
    updatedAt: `${place.sourcesCheckedOn}T00:00:00.000Z`,
  }));

export const httpTourismPlaceService: TourismPlaceApi = {
  list: async (bounds, filters) => {
    const filtered = places
      .filter((place) =>
        place.latitude <= bounds.north &&
        place.latitude >= bounds.south &&
        place.longitude <= bounds.east &&
        place.longitude >= bounds.west &&
        (!filters.category || place.categories.includes(filters.category))
      )
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id));
    return { places: filtered.slice(0, 200), truncated: filtered.length > 200 };
  },
};
