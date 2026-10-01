import type { GeoPoint } from '@/types';
import { LANDMARKS, RAMALLAH_CENTER } from '@/data/mapDefaults';
import { distanceMeters } from '@/utils/geo';

export interface PlaceSuggestion {
  id: string;
  name: string;
  category?: string;
  address?: string;
  location: GeoPoint;
  source: 'nominatim' | 'landmark';
}

const RAMALLAH_VIEWBOX = '35.16,31.94,35.24,31.88';
const CATEGORY_HINTS: Record<string, string> = {
  rest: 'restaurant',
  restaurant: 'restaurant',
  food: 'restaurant',
  coffee: 'cafe',
  cafe: 'cafe',
  hospital: 'hospital',
  medical: 'hospital',
  mall: 'mall',
  shopping: 'mall',
  university: 'university',
};

const labelOf = (item: Record<string, unknown>) =>
  String(item.name || item.display_name || '').split(',')[0]?.trim() || 'Place';

const categoryOf = (item: Record<string, unknown>) =>
  String(item.type || item.class || '').replace(/_/g, ' ');

const normalizeQuery = (query: string) => query.trim().toLowerCase();

function landmarkSuggestions(query: string): PlaceSuggestion[] {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  return LANDMARKS
    .flatMap((landmark): PlaceSuggestion[] => {
      const names = [landmark.nameEn, landmark.nameAr, ...(landmark.aliases ?? [])];
      const matched = names.some((name) => normalizeQuery(name).includes(q));
      if (!matched) return [];
      return [{
        id: `landmark:${landmark.id}`,
        name: landmark.nameEn,
        category: landmark.kind,
        address: 'Ramallah',
        location: landmark.location,
        source: 'landmark',
      }];
    })
    .sort((a, b) => distanceMeters(a.location, RAMALLAH_CENTER) - distanceMeters(b.location, RAMALLAH_CENTER));
}

export async function searchPlaces(query: string, limit = 7): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const normalized = normalizeQuery(trimmed);
  const providerQuery = `${CATEGORY_HINTS[normalized] ?? trimmed} Ramallah Palestine`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', providerQuery);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'ps');
  url.searchParams.set('viewbox', RAMALLAH_VIEWBOX);
  url.searchParams.set('bounded', '0');

  const local = landmarkSuggestions(trimmed);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return local.slice(0, limit);
    const json = await response.json() as Record<string, unknown>[];
    const remote = json
      .map((item): PlaceSuggestion | undefined => {
        const latitude = Number(item.lat);
        const longitude = Number(item.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
        const address = item.address as Record<string, unknown> | undefined;
        const area = [address?.road, address?.suburb, address?.city || address?.town || 'Ramallah']
          .filter(Boolean)
          .map(String)
          .join(', ');
        return {
          id: `nominatim:${item.place_id}`,
          name: labelOf(item),
          category: categoryOf(item),
          address: area || String(item.display_name ?? ''),
          location: { latitude, longitude },
          source: 'nominatim',
        };
      })
      .filter((item): item is PlaceSuggestion => Boolean(item))
      .sort((a, b) => distanceMeters(a.location, RAMALLAH_CENTER) - distanceMeters(b.location, RAMALLAH_CENTER));

    const merged = [...local, ...remote];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = `${item.name.toLowerCase()}:${item.location.latitude.toFixed(4)},${item.location.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  } catch {
    return local.slice(0, limit);
  }
}
