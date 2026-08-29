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
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const features = [
    { Icon: MapPin, label: t('onboarding.feature1') },
    { Icon: Wallet, label: t('onboarding.feature2') },
    { Icon: BellRing, label: t('onboarding.feature3') },
  ];

  const goToPhone = () => router.push('/(onboarding)/phone');

  return (
    <View style={{ flex: 1, backgroundColor: colors.deep }}>
      <StatusBar style="light" />

      <LinearGradient
        colors={[colors.deepAlt, colors.deep, colors.brand]}
        locations={[0, 0.55, 1.6]}
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
            backgroundColor: colors.accent,
            opacity: 0.13,
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
            <LogoMark size={92} tone="light" />
          </Reveal>

          <Reveal delay={180} style={{ marginTop: spacing.xxxl, gap: spacing.md }}>
            <AppText variant="display" align="center" color="onDeep">
              {t('brand.name')}
            </AppText>
            <AppText
              variant="h2"
              align="center"
              style={{ color: colors.accent, letterSpacing: -0.2 }}
            >
              {t('brand.tagline')}
            </AppText>
            <AppText
              variant="bodyLg"
              align="center"
              color="onDeepMuted"
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
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Icon size={18} color={colors.accent} strokeWidth={2.2} />
                </View>
                <AppText variant="title" color="onDeep" style={{ flex: 1 }}>
                  {label}
                </AppText>
                <AppText variant="caption" color="onDeepMuted" numeric>
                  {String(index + 1).padStart(2, '0')}
                </AppText>
              </View>
            ))}
          </Reveal>

          <Reveal delay={420} style={{ gap: spacing.md }}>
            <AppButton
              label={t('onboarding.getStarted')}
              onPress={goToPhone}
              variant="inverse"
              testID="welcome-get-started"
            />
            <AppButton
              label={t('onboarding.login')}
              onPress={goToPhone}
              variant="ghostInverse"
              style={{ height: 48 }}
            />
          </Reveal>
        </View>
      </LinearGradient>
    </View>
  );
}
