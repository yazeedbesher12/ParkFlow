import { Stack } from 'expo-router';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { authLanding } from '@parkflow/client/utils/authFlow';
export default function ManagementOnboarding() {
  const user = useAuthStore(state => state.user);
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
    <Stack.Protected guard={!user}>
      <Stack.Screen name="welcome" /><Stack.Screen name="phone" /><Stack.Screen name="email" />
      <Stack.Screen name="name" /><Stack.Screen name="otp" />
    </Stack.Protected>
    <Stack.Protected guard={Boolean(user) && authLanding(user, 'management') === '/(onboarding)/details'}>
      <Stack.Screen name="details" />
    </Stack.Protected>
  </Stack>;
}
