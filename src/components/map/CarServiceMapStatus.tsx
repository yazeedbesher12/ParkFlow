import { ActivityIndicator, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import type { CarServiceBusiness, CarServiceCategory } from '@/types';

export function CarServiceMapStatus({
  loading,
  error,
  errorMessage,
  count,
  services,
  truncated,
  category,
  retry,
  compact = false,
}: {
  loading: boolean;
  error?: 'load' | 'zoom';
  errorMessage?: string;
  count: number;
  services: CarServiceBusiness[];
  truncated: boolean;
  category: CarServiceCategory;
  retry: () => void;
  compact?: boolean;
}) {
  const { locale, t, row } = useLocale();
  const { colors } = useTheme();
  const preview = services.slice(0, 4);
  const remaining = Math.max(0, count - preview.length);
  return <View style={{ padding: 12, gap: 8, borderRadius: 20, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      <AppText variant="caption" style={{ flex: 1 }}>
        {loading ? t('carServices.loading') : t('carServices.count', { count, category: t(`carServices.category.${category}`) })}
      </AppText>
    </View>
    {!compact && !loading && !error && count > 0 ? (
      <View style={{ gap: 5 }}>
        <AppText variant="caption" color="textSecondary">{t('carServices.basis')}</AppText>
        {preview.map((service) => (
          <AppText key={service.id} variant="caption" numberOfLines={1}>
            {locale === 'ar' ? service.nameAr : service.nameEn}
          </AppText>
        ))}
        {remaining > 0 ? (
          <AppText variant="caption" color="textSecondary">{t('carServices.more', { count: remaining })}</AppText>
        ) : null}
      </View>
    ) : null}
    {!compact && !loading && (error || count === 0 || truncated) ? <>
      <AppText variant="caption" color="textSecondary">
        {t(error === 'zoom' ? 'carServices.zoom' : error === 'load' ? 'carServices.failed' : truncated ? 'carServices.truncated' : 'carServices.empty')}
      </AppText>
      {error === 'load' && errorMessage ? <AppText variant="caption" color="textSecondary">{errorMessage}</AppText> : null}
      {error !== 'zoom' ? <AppButton size="sm" fullWidth={false} variant="ghost" label={t('carServices.retry')} onPress={retry} /> : null}
    </> : null}
  </View>;
}
