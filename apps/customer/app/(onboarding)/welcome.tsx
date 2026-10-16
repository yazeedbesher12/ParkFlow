import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Screen } from '@parkflow/client/components/ui';
import { ConfiguredWelcome } from '@parkflow/client/components/brand/ConfiguredWelcome';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { usePhoneAuthStore } from '@parkflow/client/store/phoneAuthStore';
import { useEmailAuthStore } from '@parkflow/client/store/emailAuthStore';
import { useAppConfigStore } from '@parkflow/client/store/appConfigStore';

export default function WelcomeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { locale } = useLocale();
  const config = useAppConfigStore(state => state.config);
  const start = (path: '/(onboarding)/name' | '/(onboarding)/email') => {
    useEmailAuthStore.getState().reset();
    usePhoneAuthStore.getState().begin(path === '/(onboarding)/name' ? 'register' : 'login');
    router.push(path);
  };
  return <Screen contentContainerStyle={{ paddingTop: spacing.giant, paddingBottom: spacing.xxxl }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <ConfiguredWelcome config={config} locale={locale} onAction={start} />
  </Screen>;
}
