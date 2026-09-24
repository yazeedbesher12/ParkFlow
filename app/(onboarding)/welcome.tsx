import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MapPin, Wallet, BellRing } from 'lucide-react-native';

import { AppButton, AppText, Reveal } from '@/components/ui';
import { LogoMark } from '@/components/brand/Logo';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, row } = useLocale();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const features = [
    { Icon: MapPin, label: t('onboarding.feature1') },
    { Icon: Wallet, label: t('onboarding.feature2') },
    { Icon: BellRing, label: t('onboarding.feature3') },
  ];

  const goToEmail = () => router.push('/(onboarding)/email');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <LinearGradient
        colors={[colors.brandSoft, colors.background, colors.background]}
        locations={[0, 0.55, 1]}
        style={{ flex: 1 }}
      >
        {/* Soft light bloom behind the mark — one gradient, used once. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: height * 0.06,
            alignSelf: 'center',
            width: 380,
            height: 380,
            borderRadius: 190,
            backgroundColor: colors.brand,
            opacity: 0.04,
          }}
        />

        <View
          style={{
            flex: 1,
            paddingTop: insets.top + spacing.giant,
            paddingBottom: insets.bottom + spacing.xxl,
            paddingHorizontal: screenPadding,
          }}
        >
          <Reveal delay={80} style={{ alignItems: 'center' }}>
            <LogoMark size={92} tone="dark" />
          </Reveal>

          <Reveal delay={180} style={{ marginTop: spacing.xxxl, gap: spacing.md }}>
            <AppText variant="display" align="center" color="text">
              {t('brand.name')}
            </AppText>
            <AppText
              variant="h2"
              align="center"
              style={{ color: colors.brand, letterSpacing: -0.2 }}
            >
              {t('brand.tagline')}
            </AppText>
            <AppText
              variant="bodyLg"
              align="center"
              color="textSecondary"
              style={{ maxWidth: 320, alignSelf: 'center' }}
            >
              {t('brand.subtitle')}
            </AppText>
          </Reveal>

          <View style={{ flex: 1 }} />

          <Reveal delay={300} style={{ gap: spacing.md, marginBottom: spacing.xxxl }}>
            {features.map(({ Icon, label }, index) => (
              <View
                key={label}
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <Icon size={18} color={colors.brand} strokeWidth={2.2} />
                </View>
                <AppText variant="title" color="text" style={{ flex: 1 }}>
                  {label}
                </AppText>
                <AppText variant="caption" color="textSecondary" numeric>
                  {String(index + 1).padStart(2, '0')}
                </AppText>
              </View>
            ))}
          </Reveal>

          <Reveal delay={420} style={{ gap: spacing.md }}>
            <AppButton
              label={t('onboarding.getStarted')}
              onPress={goToEmail}
              variant="primary"
              testID="welcome-get-started"
            />
            <AppButton
              label={t('onboarding.login')}
              onPress={goToEmail}
              variant="ghost"
              style={{ height: 48 }}
            />

          </Reveal>
        </View>
      </LinearGradient>
    </View>
  );
}
