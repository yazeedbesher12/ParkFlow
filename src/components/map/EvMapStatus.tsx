import { ActivityIndicator, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { AppButton, AppText } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useLocale } from '@/hooks/useLocale';
import type { EvStationFilters } from '@/types';
export function EvMapStatus({ loading, error, count, truncated, filters, retry, onFilters, compact = false }: {
  loading: boolean; error?: 'load' | 'zoom'; count: number; truncated: boolean; filters: EvStationFilters;
  retry: () => void; onFilters: () => void; compact?: boolean;
}) {
  const { t, row } = useLocale(); const { colors } = useTheme();
  const active = Number(Boolean(filters.connectorType)) + Number(Boolean(filters.minPowerKw)) + Number(Boolean(filters.status));
  return <View style={{ padding: 12, gap: 8, borderRadius: 20, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      <AppText variant="caption" style={{ flex: 1 }}>{loading ? t('ev.loading') : t('ev.count', { count })}</AppText>
      <AppButton size="sm" fullWidth={false} variant="secondary" label={`${t('ev.filters')}${active ? ` · ${active}` : ''}`} icon={<SlidersHorizontal size={16} color={colors.text} />} onPress={onFilters} />
    </View>
    {!compact && !loading && (error || count === 0 || truncated) ? <>
      <AppText variant="caption" color="textSecondary">{t(error === 'zoom' ? 'ev.zoom' : error === 'load' ? 'ev.failed' : truncated ? 'ev.truncated' : 'ev.empty')}</AppText>
      {error !== 'zoom' ? <AppButton size="sm" fullWidth={false} variant="ghost" label={t('ev.retry')} onPress={retry} /> : null}
    </> : null}
  </View>;
}
