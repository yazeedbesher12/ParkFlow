import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage, STORAGE_KEYS } from '@/services/storage';
import {
  BUSINESS_OFFERS_AVAILABLE,
  isCarServiceCategory,
  isAvailablePrimaryCategory,
  type CarServiceCategory,
  type PrimaryMapCategory,
} from '@/types';

interface PersistedMapLayers {
  primaryCategory: PrimaryMapCategory;
  roadReportsEnabled: boolean;
  businessOffersEnabled: boolean;
  carServiceCategory: CarServiceCategory;
}

interface MapLayersState extends PersistedMapLayers {
  setPrimaryCategory: (category: PrimaryMapCategory) => void;
  setRoadReportsEnabled: (enabled: boolean) => void;
  setBusinessOffersEnabled: (enabled: boolean) => void;
  setCarServiceCategory: (category: CarServiceCategory) => void;
  resetLayers: () => void;
}

const defaults: PersistedMapLayers = {
  primaryCategory: 'parking',
  roadReportsEnabled: true,
  businessOffersEnabled: false,
  carServiceCategory: 'car_wash',
};

export const useMapLayersStore = create<MapLayersState>()(
  persist(
    (set) => ({
      ...defaults,
      setPrimaryCategory: (primaryCategory) => {
        if (isAvailablePrimaryCategory(primaryCategory)) set({ primaryCategory });
      },
      setRoadReportsEnabled: (roadReportsEnabled) => set({ roadReportsEnabled }),
      setBusinessOffersEnabled: (businessOffersEnabled) => {
        if (BUSINESS_OFFERS_AVAILABLE) set({ businessOffersEnabled });
      },
      setCarServiceCategory: (carServiceCategory) => set({ carServiceCategory }),
      resetLayers: () => set(defaults),
    }),
    {
      name: STORAGE_KEYS.mapLayers,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ primaryCategory, roadReportsEnabled, businessOffersEnabled, carServiceCategory }) => ({
        primaryCategory,
        roadReportsEnabled,
        businessOffersEnabled,
        carServiceCategory,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<PersistedMapLayers>;
        return {
          ...current,
          primaryCategory: isAvailablePrimaryCategory(stored.primaryCategory)
            ? stored.primaryCategory
            : defaults.primaryCategory,
          roadReportsEnabled: typeof stored.roadReportsEnabled === 'boolean'
            ? stored.roadReportsEnabled
            : defaults.roadReportsEnabled,
          businessOffersEnabled: BUSINESS_OFFERS_AVAILABLE && stored.businessOffersEnabled === true,
          carServiceCategory: isCarServiceCategory(stored.carServiceCategory)
            ? stored.carServiceCategory
            : defaults.carServiceCategory,
        };
      },
    },
  ),
);
