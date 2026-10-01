import { ScrollView, View } from 'react-native';
import { CircleParking, Footprints } from 'lucide-react-native';
import { AppText, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import { formatRate } from '@/utils/money';
import { walkingMinutes } from '@/utils/geo';
import type { ParkingRecommendation } from '@/utils/parkingRecommendation';

interface Props {
  recommendations: ParkingRecommendation[];
  destinationName: string;
  onSelect: (item: ParkingRecommendation) => void;
}

export function DestinationParkingPanel({ recommendations, destinationName, onSelect }: Props) {
  const { colors } = useTheme();
  const { t, locale, row } = useLocale();

  return (
    <View
      style={[
        {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.xxl,
          backgroundColor: colors.surface,
        },
        shadow.md,
      ]}
    >
      <View>
        <AppText variant="label">{t('map.recommendedParking')}</AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>{destinationName}</AppText>
      </View>
      {recommendations.length === 0 ? (
        <AppText variant="caption" color="textSecondary">{t('map.noRecommendedParking')}</AppText>
      ) : (
        <ScrollView style={{ maxHeight: 238 }} contentContainerStyle={{ gap: spacing.sm }} nestedScrollEnabled>
          {recommendations.map((item, index) => {
            const zone = item.zone;
            const name = locale === 'ar' ? zone.nameAr : zone.name;
            const status = item.restricted
              ? t('zone.restrictedAccess')
              : item.open
                ? t('zone.openNow')
                : t('zone.closedNow');
            return (
              <PressableScale
                key={zone.id}
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={name}
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.sm,
                  borderRadius: radius.lg,
                  backgroundColor: index === 0 ? colors.brandSoft : colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surface,
                  }}
                >
                  <CircleParking size={17} color={colors.brand} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
                    <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{name}</AppText>
                    {index === 0 ? (
                      <AppText variant="caption" color="brand" weight="bold">{t('map.recommended')}</AppText>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flexDirection: row, alignItems: 'center', gap: 3 }}>
                      <Footprints size={11} color={colors.textTertiary} strokeWidth={2.2} />
                      <AppText variant="caption" color="textSecondary" numeric>
                        {t('map.walkMinutes', { minutes: walkingMinutes(item.distanceMeters) })}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {t(`zone.${zone.availability}` as const)}
                    </AppText>
                    <AppText variant="caption" color={item.open && !item.restricted ? 'successText' : 'warningText'} numberOfLines={1}>
                      {status}
                    </AppText>
                  </View>
                </View>
                <View style={{ alignItems: row === 'row-reverse' ? 'flex-start' : 'flex-end' }}>
                  <AppText variant="label" color="brand" numeric>{formatRate(zone.tariff.hourlyRate)}</AppText>
                  <AppText variant="caption" color="textTertiary">{t('common.perHour')}</AppText>
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
