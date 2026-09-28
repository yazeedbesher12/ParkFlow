import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage, STORAGE_KEYS } from '@/services/storage';
import {
  BUSINESS_OFFERS_AVAILABLE,
  isAvailablePrimaryCategory,
  type PrimaryMapCategory,
} from '@/types';

interface PersistedMapLayers {
  primaryCategory: PrimaryMapCategory;
  roadReportsEnabled: boolean;
  businessOffersEnabled: boolean;
}

interface MapLayersState extends PersistedMapLayers {
  setPrimaryCategory: (category: PrimaryMapCategory) => void;
  setRoadReportsEnabled: (enabled: boolean) => void;
  setBusinessOffersEnabled: (enabled: boolean) => void;
  resetLayers: () => void;
}

const defaults: PersistedMapLayers = {
  primaryCategory: 'parking',
  roadReportsEnabled: true,
  businessOffersEnabled: false,
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
      resetLayers: () => set(defaults),
    }),
    {
      name: STORAGE_KEYS.mapLayers,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ primaryCategory, roadReportsEnabled, businessOffersEnabled }) => ({
        primaryCategory,
        roadReportsEnabled,
        businessOffersEnabled,
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
        };
      },
    },
  ),
);
