import { View } from 'react-native';
import { Car, Truck, Bike, CarTaxiFront, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { AppText, Card, StatusBadge } from '@/components/ui';
import { PlateBadge } from './PlateBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import type { UserVehicleView, VehicleType } from '@/types';

const TYPE_ICONS: Record<VehicleType, typeof Car> = {
  private: Car,
  commercial: Truck,
  taxi: CarTaxiFront,
  motorcycle: Bike,
};

export interface VehicleCardProps {
  vehicle: UserVehicleView;
  onPress?: () => void;
  /** Shows the live "Parked now" state. */
  isParked?: boolean;
  /** Unpaid notices against this plate. */
  violationCount?: number;
}

export function VehicleCard({
  vehicle,
  onPress,
  isParked = false,
  violationCount = 0,
}: VehicleCardProps) {
  const { colors } = useTheme();
  const { t, row, isRTL } = useLocale();

  const Icon = TYPE_ICONS[vehicle.type];
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  return (
    <Card
      onPress={onPress}
      padding="lg"
      accessibilityLabel={`${vehicle.displayName}, ${vehicle.plateNumber}`}
      style={{ gap: spacing.md }}
    >
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brandSofter,
          }}
        >
          <Icon size={24} color={colors.brand} strokeWidth={2.1} />
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="titleLg" numberOfLines={1}>
            {vehicle.displayName}
          </AppText>
          <PlateBadge plateNumber={vehicle.plateNumber} size="sm" />
        </View>

        {onPress ? <Chevron size={20} color={colors.textTertiary} strokeWidth={2.2} /> : null}
      </View>

      {vehicle.isDefault || isParked || violationCount > 0 ? (
        <View style={{ flexDirection: row, gap: spacing.sm, flexWrap: 'wrap' }}>
          {vehicle.isDefault ? (
            <StatusBadge label={t('common.default')} tone="neutral" size="sm" showDot={false} />
          ) : null}
          {isParked ? <StatusBadge label={t('vehicle.parkedNow')} tone="success" size="sm" /> : null}
          {violationCount > 0 ? (
            <StatusBadge
              label={`${violationCount} ${t('violation.unpaid')}`}
              tone="danger"
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
