import type { CarServiceCategory, GeoPoint } from '@/types';
import { normalizeArabic } from './arabic';

export type TripNeedCategoryId =
  | 'bakery'
  | 'restaurant'
  | 'cafe'
  | 'supermarket'
  | 'pharmacy'
  | 'fuel'
  | 'bank_atm'
  | CarServiceCategory;

export interface TripNeedCategory {
  id: TripNeedCategoryId;
  labelAr: string;
  labelEn: string;
  searchQueries: string[];
  aliases: string[];
  carServiceCategory?: CarServiceCategory;
}

export interface TripNeedPlace {
  id: string;
  categoryId: TripNeedCategoryId;
  labelAr: string;
  labelEn: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  location: GeoPoint;
  source: 'place' | 'car_service';
}

const ar = (value: string) => value;

export const TRIP_NEED_CATEGORIES: TripNeedCategory[] = [
  {
    id: 'bakery',
    labelAr: ar('\u0645\u062e\u0628\u0632'),
    labelEn: 'bakery',
    searchQueries: ['bakery', 'bread'],
    aliases: ['bakery', 'bakeries', 'bread', 'loaf', 'pastry', 'pastries', 'baked goods', 'khubz', ar('\u0645\u062e\u0628\u0632'), ar('\u0645\u062e\u0627\u0628\u0632'), ar('\u062e\u0628\u0632'), ar('\u0645\u0639\u062c\u0646\u0627\u062a'), ar('\u0645\u062e\u0628\u0648\u0632\u0627\u062a'), ar('\u0641\u0631\u0646')],
  },
  {
    id: 'restaurant',
    labelAr: ar('\u0645\u0637\u0639\u0645'),
    labelEn: 'restaurant',
    searchQueries: ['restaurant', 'food'],
    aliases: ['restaurant', 'restaurants', 'food', 'eat', 'meal', 'dining', ar('\u0645\u0637\u0639\u0645'), ar('\u0645\u0637\u0627\u0639\u0645'), ar('\u0627\u0643\u0644'), ar('\u0623\u0643\u0644'), ar('\u0637\u0639\u0627\u0645')],
  },
  {
    id: 'cafe',
    labelAr: ar('\u0642\u0647\u0648\u0629'),
    labelEn: 'cafe',
    searchQueries: ['cafe', 'coffee'],
    aliases: ['cafe', 'coffee', 'coffee shop', 'espresso', 'latte', 'cappuccino', ar('\u0642\u0647\u0648\u0629'), ar('\u0643\u0627\u0641\u064a\u0647'), ar('\u0645\u0642\u0647\u0649'), ar('\u0645\u0642\u0627\u0647\u064a'), ar('\u0643\u0627\u0628\u062a\u0634\u064a\u0646\u0648')],
  },
  {
    id: 'supermarket',
    labelAr: ar('\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062a'),
    labelEn: 'supermarket',
    searchQueries: ['supermarket', 'grocery'],
    aliases: [
      'supermarket', 'grocery', 'groceries', 'market', 'minimarket', 'chips', 'crisps', 'juice', 'water', 'milk',
      'eggs', 'egg', 'tissues', 'napkins', 'soap', 'shampoo', 'detergent', 'household', 'household items',
      'home supplies', 'snacks', 'soda', 'soft drink', 'cleaning supplies',
      ar('\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062a'), ar('\u0633\u0648\u0628\u0631'), ar('\u0628\u0642\u0627\u0644\u0629'), ar('\u062a\u0645\u0648\u064a\u0646\u0627\u062a'), ar('\u0645\u0627\u0631\u0643\u062a'),
      ar('\u0634\u0628\u0633'), ar('\u0634\u064a\u0628\u0633'), ar('\u0639\u0635\u064a\u0631'), ar('\u0645\u064a\u0627\u0647'), ar('\u0645\u064a'), ar('\u0645\u0627\u064a'), ar('\u062d\u0644\u064a\u0628'),
      ar('\u0628\u064a\u0636'), ar('\u0645\u0646\u0627\u062f\u064a\u0644'), ar('\u0645\u062d\u0627\u0631\u0645'), ar('\u0635\u0627\u0628\u0648\u0646'), ar('\u0634\u0627\u0645\u0628\u0648'),
      ar('\u0645\u0646\u0638\u0641\u0627\u062a'), ar('\u0623\u063a\u0631\u0627\u0636'), ar('\u0627\u063a\u0631\u0627\u0636'), ar('\u0623\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0644\u0644\u0628\u064a\u062a'),
      ar('\u0623\u063a\u0631\u0627\u0636 \u0628\u064a\u062a'), ar('\u0627\u063a\u0631\u0627\u0636 \u0628\u064a\u062a'), ar('\u0644\u0644\u0628\u064a\u062a'), ar('\u0628\u064a\u062a'), ar('\u0633\u0646\u0627\u0643\u0633'),
    ],
  },
  {
    id: 'pharmacy',
    labelAr: ar('\u0635\u064a\u062f\u0644\u064a\u0629'),
    labelEn: 'pharmacy',
    searchQueries: ['pharmacy'],
    aliases: ['pharmacy', 'pharmacies', 'drugstore', 'medicine', 'medication', 'painkiller', 'pain killer', 'ibuprofen', 'paracetamol', 'aspirin', ar('\u0635\u064a\u062f\u0644\u064a\u0629'), ar('\u0635\u064a\u062f\u0644\u064a\u0627\u062a'), ar('\u062f\u0648\u0627\u0621'), ar('\u062f\u0648\u0627'), ar('\u0645\u0633\u0643\u0646'), ar('\u0645\u0633\u0643\u0646\u0627\u062a'), ar('\u0628\u0646\u0627\u062f\u0648\u0644')],
  },
  {
    id: 'fuel',
    labelAr: ar('\u0645\u062d\u0637\u0629 \u0648\u0642\u0648\u062f'),
    labelEn: 'gas station',
    searchQueries: ['gas station', 'fuel'],
    aliases: ['gas', 'gas station', 'fuel', 'petrol', 'petrol station', 'diesel', ar('\u0628\u0646\u0632\u064a\u0646'), ar('\u0648\u0642\u0648\u062f'), ar('\u0633\u0648\u0644\u0627\u0631'), ar('\u062f\u064a\u0632\u0644'), ar('\u0645\u062d\u0637\u0629 \u0648\u0642\u0648\u062f'), ar('\u0645\u062d\u0631\u0648\u0642\u0627\u062a')],
  },
  {
    id: 'bank_atm',
    labelAr: ar('\u0628\u0646\u0643 \u0623\u0648 \u0635\u0631\u0627\u0641'),
    labelEn: 'bank or ATM',
    searchQueries: ['bank', 'atm'],
    aliases: ['bank', 'banks', 'atm', 'cash', 'cash machine', ar('\u0628\u0646\u0643'), ar('\u0628\u0646\u0648\u0643'), ar('\u0635\u0631\u0627\u0641'), ar('\u0635\u0631\u0627\u0641 \u0627\u0644\u064a'), ar('\u0635\u0631\u0627\u0641 \u0622\u0644\u064a')],
  },
  {
    id: 'car_wash',
    labelAr: ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0629'),
    labelEn: 'car wash',
    searchQueries: ['car wash'],
    carServiceCategory: 'car_wash',
    aliases: ['car wash', 'wash car', 'car cleaning', ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0629'), ar('\u063a\u0633\u064a\u0644 \u0633\u064a\u0627\u0631\u0627\u062a'), ar('\u0645\u063a\u0633\u0644\u0629')],
  },
  {
    id: 'maintenance',
    labelAr: ar('\u0635\u064a\u0627\u0646\u0629'),
    labelEn: 'maintenance',
    searchQueries: ['car repair', 'mechanic'],
    carServiceCategory: 'maintenance',
    aliases: ['maintenance', 'mechanic', 'garage', 'car repair', 'repair', 'battery', 'car battery', ar('\u0635\u064a\u0627\u0646\u0629'), ar('\u062a\u0635\u0644\u064a\u062d'), ar('\u0645\u064a\u0643\u0627\u0646\u064a\u0643'), ar('\u0643\u0631\u0627\u062c'), ar('\u0628\u0637\u0627\u0631\u064a\u0629'), ar('\u0628\u0637\u0627\u0631\u064a\u0629 \u0633\u064a\u0627\u0631\u0629')],
  },
  {
    id: 'tire_service',
    labelAr: ar('\u062e\u062f\u0645\u0629 \u0625\u0637\u0627\u0631\u0627\u062a'),
    labelEn: 'tire service',
    searchQueries: ['tire service', 'tyre service'],
    carServiceCategory: 'tire_service',
    aliases: ['tire', 'tires', 'tyre', 'tyres', 'tire service', ar('\u0625\u0637\u0627\u0631'), ar('\u0627\u0637\u0627\u0631'), ar('\u0625\u0637\u0627\u0631\u0627\u062a'), ar('\u062f\u0648\u0627\u0644\u064a\u0628'), ar('\u0643\u0641\u0631\u0627\u062a')],
  },
  {
    id: 'oil_change',
    labelAr: ar('\u062a\u063a\u064a\u064a\u0631 \u0632\u064a\u062a'),
    labelEn: 'oil change',
    searchQueries: ['oil change'],
    carServiceCategory: 'oil_change',
    aliases: ['oil', 'oil change', 'engine oil', ar('\u0632\u064a\u062a'), ar('\u062a\u063a\u064a\u064a\u0631 \u0632\u064a\u062a'), ar('\u063a\u064a\u0627\u0631 \u0632\u064a\u062a')],
  },
];

const CATEGORY_BY_ID = new Map(TRIP_NEED_CATEGORIES.map((category) => [category.id, category]));

export const getTripNeedCategory = (id: TripNeedCategoryId) => CATEGORY_BY_ID.get(id);

export function parseTripNeeds(input: string): TripNeedCategory[] {
  const normalized = normalizeArabic(input);
  if (normalized.length < 2) return [];
  const withoutArabicConjunction = normalized.replace(/(^|\s)\u0648(?=\S{2,})/g, '$1');
  const padded = ` ${normalized} ${withoutArabicConjunction} `;
  return TRIP_NEED_CATEGORIES.filter((category) =>
    category.aliases.some((alias) => {
      const needle = normalizeArabic(alias);
      return needle.length > 1 && padded.includes(` ${needle} `);
    }),
  );
}

export function formatNeedLabels(categories: TripNeedCategory[], locale: 'ar' | 'en') {
  return categories.map((category) => locale === 'ar' ? category.labelAr : category.labelEn);
}
