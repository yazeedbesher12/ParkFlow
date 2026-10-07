import { CircleParking, Footprints } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, PressableScale, StatusBadge } from '@/components/ui';
import { availabilityTone } from './ZoneMarker';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { ParkingZone } from '@/types';
import { formatRate } from '@/utils/money';
import { walkingMinutes } from '@/utils/geo';
import { scoreParkingOption } from '@/utils/parkingScore';

export interface NearbyZone {
  zone: ParkingZone;
  distanceMeters: number;
}

export function CompactZoneCard({ item, onPress }: { item: NearbyZone; onPress: () => void }) {
  const { colors } = useTheme();
  const { t, locale, row } = useLocale();
  const { zone, distanceMeters } = item;
  const name = locale === 'ar' ? zone.nameAr : zone.name;
  const tone = availabilityTone(zone.availability);
  const availabilityColor = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.textTertiary,
    info: colors.info,
  }[tone];
  const provenance = zone.availabilityProvenance ?? zone.provenance;
  const freshness = provenance?.freshness ?? 'unknown';
  const source = provenance?.source ?? 'unknown';
  const provenanceLabel = t(`zone.freshness.${freshness}` as never);
  const sourceLabel = t(`zone.source.${source}` as never);
  const score = scoreParkingOption({
    walkMeters: distanceMeters,
    price: zone.tariff.hourlyRate,
    confidence: provenance?.confidence,
  });

  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t(`zone.${zone.availability}` as const)}, ${sourceLabel}, ${provenanceLabel}, ${formatRate(zone.tariff.hourlyRate)}`}
      style={{
        minHeight: 58,
        flexDirection: row,
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brandSoft,
        }}
      >
        <CircleParking size={18} color={colors.brand} strokeWidth={2.2} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <AppText variant="title" numberOfLines={1}>
          {name}
        </AppText>
        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: availabilityColor }} />
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {t(`zone.${zone.availability}` as const)}
            </AppText>
          </View>
          <StatusBadge label={provenanceLabel} tone={freshness === 'fresh' ? 'success' : freshness === 'aging' ? 'warning' : freshness === 'unknown' ? 'neutral' : 'danger'} size="sm" showDot={false} />
          <View style={{ flexDirection: row, alignItems: 'center', gap: 3 }}>
            <Footprints size={11} color={colors.textTertiary} strokeWidth={2.2} />
            <AppText variant="caption" color="textTertiary" numeric numberOfLines={1}>
              {t('map.walkMinutes', { minutes: walkingMinutes(distanceMeters) })}
            </AppText>
          </View>
          <AppText variant="caption" color="textTertiary" numeric numberOfLines={1}>
            {t('map.score', { score: Math.round(score) })}
          </AppText>
        </View>
      </View>

      <View style={{ alignItems: row === 'row-reverse' ? 'flex-start' : 'flex-end', gap: 2 }}>
        <AppText variant="title" color="brand" numeric numberOfLines={1}>
          {formatRate(zone.tariff.hourlyRate)}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {t('common.perHour')}
        </AppText>
      </View>
    </PressableScale>
  );
}
