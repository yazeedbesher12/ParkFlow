import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { ThemeProvider, useTheme } from '@parkflow/client/theme/ThemeProvider';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { usePreferencesStore } from '@parkflow/client/store/preferencesStore';
import { useAppConfigStore } from '@parkflow/client/store/appConfigStore';
import { authLanding } from '@parkflow/client/utils/authFlow';
import { isAppError } from '@parkflow/client/utils/errors';
import { ManagementShell } from '@/components/layout/ManagementShell';
import { useManagementSync } from '@/hooks/useManagementSync';

void SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 30000, retry: (count, error) => isAppError(error) && error.code !== 'network' ? false : count < 2, refetchOnWindowFocus: false },
  mutations: { retry: false },
} });

function ManagementNavigator() {
  const { colors } = useTheme();
  const user = useAuthStore(state => state.user);
  const destination = authLanding(user, 'management');
  const needsDetails = destination === '/(onboarding)/details';
  const permitted = Boolean(user) && !needsDetails && destination !== '/access-denied';

  // Keep the root navigator mounted. Protected screens are not registered for
  // unauthorized/incomplete accounts, including during session changes and HMR.
  return <ManagementShell><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={!user || needsDetails}><Stack.Screen name="(onboarding)" /></Stack.Protected>
    <Stack.Protected guard={permitted && user?.role === 'ADMIN'}><Stack.Screen name="admin" /></Stack.Protected>
    <Stack.Protected guard={permitted}><Stack.Screen name="operator" /></Stack.Protected>
    <Stack.Protected guard={Boolean(user) && destination === '/access-denied'}><Stack.Screen name="access-denied" /></Stack.Protected>
    <Stack.Screen name="+not-found" />
  </Stack></ManagementShell>;
}

function ManagementApp() {
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const hydrated = useAuthStore(state => state.hydrated);
  const preferencesHydrated = usePreferencesStore(state => state.hydrated);
  const hydrate = useAuthStore(state => state.hydrate);
  const ready = (fontsLoaded || Boolean(fontError)) && hydrated && preferencesHydrated;
  useManagementSync();
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!usePreferencesStore.getState().hydrated) usePreferencesStore.getState().setHydrated(); }, 2500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const refresh = () => { void useAppConfigStore.getState().refresh(); };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  return ready ? <ManagementNavigator /> : <View style={{ flex: 1, backgroundColor: colors.background }} />;
}

export default function ManagementRoot() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><QueryClientProvider client={queryClient}><ThemeProvider><ManagementApp /></ThemeProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;
}
