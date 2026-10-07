import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui';
import { ConfiguredWelcome } from '@/components/brand/ConfiguredWelcome';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';
import { useAppConfigStore } from '@/store/appConfigStore';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { locale } = useLocale();
  const config = useAppConfigStore(state => state.config);
  const start = (path: '/(onboarding)/name' | '/(onboarding)/phone') => {
    usePhoneAuthStore.getState().begin(path === '/(onboarding)/name' ? 'register' : 'login');
    router.push(path);
  };
  return <LinearGradient colors={[colors.brandSoft, colors.background, colors.background]} locations={[0, 0.55, 1]} style={{ flex: 1 }}>
    <Screen style={{ backgroundColor: 'transparent' }} contentContainerStyle={{ paddingTop: spacing.giant, paddingBottom: spacing.xxxl }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <ConfiguredWelcome config={config} locale={locale} onAction={start} />
    </Screen>
  </LinearGradient>;
}
