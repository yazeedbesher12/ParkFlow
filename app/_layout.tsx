import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/store/authStore';
import { useBackendSync } from '@/hooks/useBackendSync';
import { usePreferencesStore } from '@/store/preferencesStore';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { authLanding } from '@/utils/authFlow';
import { isAppError } from '@/utils/errors';
import { WebAppShell } from '@/components/layout/WebAppShell';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        // Never retry a deliberate business rejection — only transient failures.
        isAppError(error) && error.code !== 'network' ? false : failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/**
 * Keeps the visible route in step with auth state.
 *
 * Server profile completion belongs to the account. Device preferences cannot
 * skip a new account's details, and the optional vehicle step stays in memory.
 */
function useAuthGate(ready: boolean) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const user = useAuthStore((s) => s.user);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const vehicleSetupUserId = usePhoneAuthStore((s) => s.vehicleSetupUserId);

  useEffect(() => {
    if (!ready || !authHydrated) return;

    const inOnboarding = segments[0] === '(onboarding)';
    const signedIn = Boolean(user?.id);
    const destination = authLanding(user);

    if (!signedIn && (!inOnboarding || segments[1] === 'details' || segments[1] === 'vehicle')) {
      router.replace('/(onboarding)/welcome');
    } else if (signedIn && destination === '/(onboarding)/details') {
      if (!inOnboarding || segments[1] !== 'details') router.replace(destination);
    } else if (signedIn && inOnboarding && vehicleSetupUserId !== user?.id) {
      router.replace(destination);
    }
  }, [ready, authHydrated, user, vehicleSetupUserId, segments, router]);
}

function RootNavigator() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="parking" />
      <Stack.Screen name="vehicles" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="violations" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="operator" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function AppShell() {
  useBackendSync();
  // Public appearance loads independently of authentication and never blocks boot.
  useEffect(() => {
    const refresh = () => { void useAppConfigStore.getState().refresh(); };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  // Safety net: if storage rehydration never reports back (corrupt store, web
  // privacy mode) we still boot rather than sitting on the splash forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!usePreferencesStore.getState().hydrated) {
        usePreferencesStore.getState().setHydrated();
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // A font download failure must not hold the app hostage — the fallback stack
  // still renders, so we treat an error as "done loading".
  const ready = (fontsLoaded || Boolean(fontError)) && authHydrated && prefsHydrated;

  useEffect(() => {
    if (ready && !splashHidden) {
      setSplashHidden(true);
      void SplashScreen.hideAsync();
    }
  }, [ready, splashHidden]);

  useAuthGate(ready);

  return (
    <WebAppShell>
      {ready ? <RootNavigator /> : <View style={{ flex: 1, backgroundColor: colors.deep }} />}
    </WebAppShell>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
