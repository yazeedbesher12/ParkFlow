import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { AppText, MoneyText, PressableScale, Reveal } from '@/components/ui';
import { PlateBadge } from './PlateBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { duration, easing } from '@/theme/motion';
import { useLocale } from '@/hooks/useLocale';
import type { ParkingSession, UserVehicleView } from '@/types';
import { useSessionBreakdown } from '@/hooks/useParking';
import { formatDuration } from '@/utils/time';

/** Slow breathing dot — the only always-on animation in the app. */
function LivePulse({ color }: { color: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration.pulse / 2, easing: easing.standard }),
        withTiming(0, { duration: duration.pulse / 2, easing: easing.standard }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.5 }],
    opacity: 0.5 * (1 - pulse.value),
  }));

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color },
          haloStyle,
        ]}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export interface ActiveSessionBannerProps {
  session: ParkingSession;
  vehicle?: UserVehicleView;
  onPress: () => void;
  /** Shown when more than one vehicle is parked at once. */
  extraCount?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The persistent "you are parked" strip. It is deliberately reachable from the
 * home screen without opening a menu — the timer is the thing a parked driver
 * wants most.
 */
export function ActiveSessionBanner({
  session,
  vehicle,
  onPress,
  extraCount = 0,
  style,
}: ActiveSessionBannerProps) {
  const { colors } = useTheme();
  const { t, row, isRTL, locale } = useLocale();
  const breakdown = useSessionBreakdown(session);

  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const isPrepaid = session.parkingMode === 'prepaid';
  const isOverstay = breakdown?.isOverstay ?? false;

  const primaryTime = isPrepaid
    ? formatDuration(breakdown?.remainingSeconds ?? 0)
    : formatDuration(breakdown?.elapsedSeconds ?? 0);

  const zoneName =
    locale === 'ar'
      ? session.pricingRulesSnapshot.zoneNameAr
      : session.pricingRulesSnapshot.zoneName;

  return (
    <Reveal style={style}>
      <PressableScale
        onPress={onPress}
        haptic="light"
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={`${t('parking.active')}, ${primaryTime}`}
        style={[
          {
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.xl,
            backgroundColor: isOverstay ? colors.danger : colors.deep,
          },
          shadow.lg,
        ]}
      >
        <LivePulse color={isOverstay ? colors.onDeep : colors.accent} />

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
            <AppText
              variant="overline"
              style={{ color: isOverstay ? colors.onDeep : colors.accent }}
            >
              {isOverstay ? t('parking.overstay') : t('parking.active')}
            </AppText>
            {extraCount > 0 ? (
              <AppText variant="caption" color="onDeepMuted" numeric>
                +{extraCount}
              </AppText>
            ) : null}
          </View>

          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="h3" color="onDeep" numeric>
              {primaryTime}
            </AppText>
            <AppText variant="bodySm" color="onDeepMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              · {zoneName}
            </AppText>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <MoneyText
            value={breakdown?.cost ?? session.currentCost}
            variant="titleLg"
            color="onDeep"
          />
          {vehicle ? <PlateBadge plateNumber={vehicle.plateNumber} size="sm" tone="onDeep" /> : null}
        </View>

        <Chevron size={20} color={colors.onDeepMuted} strokeWidth={2.4} />
      </PressableScale>
    </Reveal>
  );
}
