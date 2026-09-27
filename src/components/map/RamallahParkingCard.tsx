import { Navigation, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { RamallahParkingLocation } from '@/types';
import { parkingLocationColor } from './ParkingLocationMarker';

interface RamallahParkingCardProps {
  location: RamallahParkingLocation;
  loading?: boolean;
  onNavigate: () => void;
}

export function RamallahParkingCard({ location, loading, onNavigate }: RamallahParkingCardProps) {
  const { colors } = useTheme();
  const { locale, row, t } = useLocale();
  const name = locale === 'ar' ? location.nameAr : location.name;
  const color = parkingLocationColor(location, colors);
  const ownershipLabel = t(`ramallahParking.ownership.${location.ownership}` as const);
  const kind = t(`ramallahParking.kind.${location.kind}` as const);
  const isFree = location.price.hourlyRateNis === 0;
  const priceStatus = t(`ramallahParking.priceStatus.${location.price.status}` as const);
  const isDemoPrice = location.price.status === 'demo_estimate';

  return (
    <View
      testID="ramallah-parking-card"
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
      <View style={{ flexDirection: row, alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <AppText variant="title" numberOfLines={2}>
            {name}
          </AppText>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                backgroundColor: color,
              }}
            >
              <AppText variant="caption" style={{ color: colors.textOnColor }}>
                {ownershipLabel}
              </AppText>
            </View>
            <AppText variant="caption" color="textTertiary" style={{ textTransform: 'capitalize' }}>
              {kind}
            </AppText>
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                backgroundColor: isDemoPrice ? colors.warningSoft : colors.infoSoft,
              }}
            >
              <AppText variant="caption" color={isDemoPrice ? 'warningText' : 'infoText'}>
                {priceStatus}
              </AppText>
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="h3" color="brand" numeric>
            {isFree ? t('ramallahParking.free') : `${location.price.hourlyRateNis} ₪`}
          </AppText>
          {!isFree ? (
            <AppText variant="caption" color="textTertiary">
              {t('common.perHour')}
            </AppText>
          ) : null}
        </View>
      </View>

      {location.accessRestriction ? (
        <View
          style={{
            flexDirection: row,
            alignItems: 'flex-start',
            gap: spacing.sm,
            padding: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.warningSoft,
          }}
        >
          <TriangleAlert size={16} color={colors.warningText} strokeWidth={2.3} />
          <AppText variant="caption" color="warningText" style={{ flex: 1 }}>
            {location.accessRestriction}
          </AppText>
        </View>
      ) : null}

      <AppButton
        label={t('zone.navigate')}
        size="sm"
        loading={loading}
        onPress={onNavigate}
        icon={<Navigation size={16} color={colors.onBrand} strokeWidth={2.3} />}
      />
    </View>
  );
}
