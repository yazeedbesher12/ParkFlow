import { useRouter } from 'expo-router';
import { AppHeader, Screen } from '@/components/ui';
import { HealthProfileForm } from '@/components/domain/HealthProfileForm';
import { useLocale } from '@/hooks/useLocale';

export default function HealthSettingsScreen() {
  const { t } = useLocale();
  const router = useRouter();
  return <Screen><AppHeader title={t('health.title')} />
    <HealthProfileForm editing onSaved={() => router.replace('/profile/settings')} />
  </Screen>;
}
