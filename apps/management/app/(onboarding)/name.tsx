import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { usePhoneAuthStore } from '@parkflow/client/store/phoneAuthStore';
import { useEmailAuthStore } from '@parkflow/client/store/emailAuthStore';
import { authLanding } from '@parkflow/client/utils/authFlow';

export default function ManagementNameRoute() {
  const user = useAuthStore(state => state.user);
  useEffect(() => {
    if (!user) {
      useEmailAuthStore.getState().reset();
      usePhoneAuthStore.getState().begin('login');
    }
  }, [user]);
  return <Redirect href={user ? authLanding(user, 'management') : '/(onboarding)/email'} />;
}
