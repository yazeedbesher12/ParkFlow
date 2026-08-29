import { View } from 'react-native';
import { Check, Languages, Moon, Sun, SunMoon } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Card,
  Divider,
  PressableScale,
  Screen,
  SectionHeader,
  SwitchRow,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { usePreferencesStore, type ThemeMode } from '@/store/preferencesStore';
import { LOCALES, localeNames, type Locale } from '@/i18n';
import type { NotificationPreferences } from '@/types';
import { haptics } from '@/utils/haptics';

const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

const PREF_KEYS: (keyof NotificationPreferences)[] = [
  'parkingReminders',
  'expiryWarnings',
  'lowBalance',
  'violations',
  'promotions',
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { t, locale, setLocale, row } = useLocale();

  const notifications = usePreferencesStore((s) => s.notifications);
  const setNotificationPreference = usePreferencesStore((s) => s.setNotificationPreference);

  const themeOptions: ThemeMode[] = ['light', 'dark', 'system'];

  return (
    <Screen>
      <AppHeader title={t('profile.settings')} />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Language -------------------------------------------------- */}
        <View>
          <SectionHeader
            title={t('profile.language')}
            trailing={<Languages size={20} color={colors.textTertiary} strokeWidth={2.1} />}
          />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {LOCALES.map((option: Locale, index) => {
              const active = option === locale;
              return (
                <View key={option}>
                  {index > 0 ? <Divider /> : null}
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setLocale(option);
                    }}
                    scaleTo={0.99}
                    dimTo={0.65}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={localeNames[option]}
                    style={{
                      flexDirection: row,
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <AppText variant="titleLg" style={{ flex: 1 }}>
                      {localeNames[option]}
                    </AppText>
                    {active ? <Check size={20} color={colors.brand} strokeWidth={2.8} /> : null}
                  </PressableScale>
                </View>
              );
            })}
          </Card>
        </View>

        {/* ---- Theme ------------------------------------------------------ */}
        <View>
          <SectionHeader title={t('profile.theme')} />
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            {themeOptions.map((option) => {
              const active = option === mode;
              const Icon = THEME_ICONS[option];
              return (
                <PressableScale
                  key={option}
                  onPress={() => {
                    haptics.select();
                    setMode(option);
                  }}
                  scaleTo={0.95}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`profile.theme.${option}` as const)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.lg,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.brandSoft : colors.surface,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.brand : colors.border,
                  }}
                >
                  <Icon
                    size={22}
                    color={active ? colors.brand : colors.textSecondary}
                    strokeWidth={2.1}
                  />
                  <AppText
                    variant="label"
                    align="center"
                    style={{ color: active ? colors.successText : colors.textSecondary }}
                  >
                    {t(`profile.theme.${option}` as const)}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* ---- Notifications ---------------------------------------------- */}
        <View>
          <SectionHeader title={t('profile.notifications')} />
          <Card padding="lg" style={{ gap: spacing.xs }}>
            {PREF_KEYS.map((key, index) => (
              <View key={key}>
                {index > 0 ? <Divider style={{ marginVertical: spacing.xs }} /> : null}
                <SwitchRow
                  label={t(`profile.prefs.${key}` as const)}
                  value={notifications[key]}
                  onValueChange={(value) => setNotificationPreference(key, value)}
                />
              </View>
            ))}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
