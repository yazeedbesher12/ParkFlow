import { useRouter } from 'expo-router';
import { AppHeader, Screen } from '@/components/ui';
import { HealthProfileForm } from '@/components/domain/HealthProfileForm';
import { useLocale } from '@/hooks/useLocale';
import { useBlockHardwareBack } from '@/hooks/useBlockHardwareBack';
import { usePreferencesStore } from '@/store/preferencesStore';

export default function HealthOnboardingScreen() {
  useBlockHardwareBack();
  const { t } = useLocale();
  const router = useRouter();
  return <Screen><AppHeader title={t('health.title')} leading="none" />
    <HealthProfileForm onSaved={user => {
      if (user.fullName) {
        usePreferencesStore.getState().completeOnboarding();
        router.replace('/(tabs)/map');
      } else router.replace('/(onboarding)/name');
    }} />
  </Screen>;
}
