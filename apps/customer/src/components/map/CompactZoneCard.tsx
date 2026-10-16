import { Accessibility, CircleParking } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, StatusBadge } from '@parkflow/client/components/ui';
import { availabilityTone } from './ZoneMarker';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { radius } from '@parkflow/design/radius';
import { spacing } from '@parkflow/design/spacing';
import type { ParkingZone } from '@parkflow/contracts';
import { formatRate } from '@parkflow/client/utils/money';
import { walkingMinutes } from '@parkflow/client/utils/geo';
import { scoreParkingOption } from '@parkflow/client/utils/parkingScore';

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
  const availabilityLabel = t(`zone.${zone.availability}` as const);

  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
      dimTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${availabilityLabel}, ${sourceLabel}, ${provenanceLabel}, ${formatRate(zone.tariff.hourlyRate)}`}
      style={{
        flexDirection: row,
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
      }}
    >
      <View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brandSofter,
          }}
        >
          <CircleParking size={18} color={colors.brand} strokeWidth={2} />
        </View>
        {zone.accessibleSpots ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              end: -4,
              width: 16,
              height: 16,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.info,
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          >
            <Accessibility size={9} color={colors.textOnColor} strokeWidth={3} />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <AppText variant="titleLg" numberOfLines={1}>
          {name}
        </AppText>
        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="caption" color="textSecondary" numeric numberOfLines={1}>
            {t('map.walkMinutes', { minutes: walkingMinutes(distanceMeters) })}
          </AppText>
          <AppText variant="caption" color="textTertiary">
            ·
          </AppText>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: availabilityColor }} />
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {availabilityLabel}
            </AppText>
          </View>
          <StatusBadge label={provenanceLabel} tone={freshness === 'fresh' ? 'success' : freshness === 'aging' ? 'warning' : freshness === 'unknown' ? 'neutral' : 'danger'} size="sm" showDot={false} />
          <AppText variant="caption" color="textTertiary" numeric numberOfLines={1}>
            {t('map.score', { score: Math.round(score) })}
          </AppText>
        </View>
      </View>

      <View
        style={{
          alignSelf: 'center',
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: colors.brandSofter,
        }}
      >
        <AppText variant="label" color="brand" numeric numberOfLines={1}>
          {`${formatRate(zone.tariff.hourlyRate)} ${t('common.perHour')}`}
        </AppText>
      </View>
    </PressableScale>
  );
}
