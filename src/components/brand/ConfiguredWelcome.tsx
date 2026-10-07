import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { LogoMark } from './Logo';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { translate, type Locale } from '@/i18n';
import type { AppConfig } from '@/types/appConfig';

function ConfigImage({ url, alt, logo = false }: { url: string; alt: string; logo?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (failed) return logo ? <LogoMark size={92} tone="dark" usePublishedBrand={false} /> : <AppText color="textSecondary" align="center">{alt}</AppText>;
  return <Image source={{ uri: url }} accessibilityLabel={alt} resizeMode="contain" onError={() => setFailed(true)} style={logo ? { width: 92, height: 92 } : { width: '100%', aspectRatio: 16 / 9, maxHeight: 240, borderRadius: radius.lg }} />;
}

/** The same bounded block renderer is used by the live welcome and local editor preview. */
export function ConfiguredWelcome({ config, locale, onAction }: { config: AppConfig; locale: Locale; onAction?: (path: '/(onboarding)/name' | '/(onboarding)/phone') => void }) {
  const { colors } = useTheme();
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  return <View style={{ gap: spacing.xl, width: '100%', maxWidth: 580, alignSelf: 'center' }}>
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      {config.logoUrl ? <ConfigImage url={config.logoUrl} alt={config.appName[locale]} logo /> : <LogoMark size={92} tone="dark" usePublishedBrand={false} />}
      <AppText variant="display" align="center" style={{ writingDirection: direction }}>{config.appName[locale]}</AppText>
      <AppText variant="h2" align="center" style={{ color: colors.brand, writingDirection: direction }}>{config.welcome.headline[locale]}</AppText>
      <AppText variant="bodyLg" align="center" color="textSecondary" style={{ writingDirection: direction }}>{config.welcome.body[locale]}</AppText>
    </View>
    {config.banner.enabled ? <View style={{ backgroundColor: colors.brandSoft, padding: spacing.lg, borderRadius: radius.lg }}><AppText align="center" style={{ color: colors.brand, writingDirection: direction }}>{config.banner.text[locale]}</AppText></View> : null}
    <View style={{ gap: spacing.md }}>
      {config.sections.filter(section => section.visible).map(section => {
        if (section.type === 'image') return <ConfigImage key={section.id} url={section.url} alt={section.alt[locale]} />;
        if (section.type === 'action') return <AppButton key={section.id} label={section.label[locale]} variant="secondary" onPress={onAction ? () => onAction(section.path) : undefined} />;
        return <View key={section.id} style={{ padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg }}><AppText variant={section.type === 'title' ? 'title' : 'body'} style={{ textAlign: locale === 'ar' ? 'right' : 'left', writingDirection: direction }}>{section.text[locale]}</AppText></View>;
      })}
    </View>
    <View style={{ gap: spacing.md }}>
      <AppButton label={translate(locale, 'onboarding.getStarted')} onPress={onAction ? () => onAction('/(onboarding)/name') : undefined} testID="welcome-get-started" />
      <AppButton label={translate(locale, 'onboarding.login')} variant="ghost" onPress={onAction ? () => onAction('/(onboarding)/phone') : undefined} />
    </View>
  </View>;
}
