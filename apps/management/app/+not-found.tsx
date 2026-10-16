import { useRouter } from 'expo-router';
import { AppButton, AppText, Screen } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { authLanding } from '@parkflow/client/utils/authFlow';
export default function ManagementNotFound() {
  const router = useRouter();
  const { locale } = useLocale();
  return <Screen><AppText variant="h1">{locale === 'ar' ? 'الصفحة غير موجودة' : 'Page not found'}</AppText><AppButton label={locale === 'ar' ? 'العودة إلى البوابة' : 'Return to portal'} onPress={() => router.replace(authLanding(useAuthStore.getState().user, 'management'))} /></Screen>;
}
