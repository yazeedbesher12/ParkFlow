import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NotificationPreferences } from '@/types';
import type { Locale } from '@/i18n';
import { appStorage, STORAGE_KEYS } from '@/services/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface PreferencesState {
  locale: Locale;
  themeMode: ThemeMode;
  /** Which of the user's vehicles the map / start-parking flow is aimed at. */
  selectedVehicleId?: string;
  notifications: NotificationPreferences;
  /** True once the first-run flow (phone -> name -> vehicle) has finished. */
  onboardingComplete: boolean;
  /** True once persisted preferences have been read — describes this run only. */
  hydrated: boolean;

  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSelectedVehicleId: (id?: string) => void;
  setNotificationPreference: (key: keyof NotificationPreferences, value: boolean) => void;
  completeOnboarding: () => void;
  setHydrated: () => void;
  reset: () => void;
}

const defaultNotifications: NotificationPreferences = {
  parkingReminders: true,
  expiryWarnings: true,
  lowBalance: true,
  violations: true,
  promotions: false,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: 'en',
      themeMode: 'light',
      selectedVehicleId: undefined,
      notifications: defaultNotifications,
      onboardingComplete: false,
      hydrated: false,

      setLocale: (locale) => set({ locale }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setSelectedVehicleId: (selectedVehicleId) => set({ selectedVehicleId }),
      setNotificationPreference: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setHydrated: () => set({ hydrated: true }),
      reset: () =>
        set({
          selectedVehicleId: undefined,
          notifications: defaultNotifications,
          onboardingComplete: false,
        }),
    }),
    {
      name: STORAGE_KEYS.preferences,
      storage: createJSONStorage(() => ({
        getItem: (name) => appStorage.getItem(name),
        setItem: (name, value) => appStorage.setItem(name, value),
        removeItem: (name) => appStorage.removeItem(name),
      })),
      partialize: (state) => ({
        locale: state.locale,
        themeMode: state.themeMode,
        selectedVehicleId: state.selectedVehicleId,
        notifications: state.notifications,
        onboardingComplete: state.onboardingComplete,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
