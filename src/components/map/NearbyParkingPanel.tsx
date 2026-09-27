import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AppText, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import { CompactZoneCard, type NearbyZone } from './CompactZoneCard';

interface NearbyParkingPanelProps {
  zones: NearbyZone[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectZone: (item: NearbyZone) => void;
}

export function NearbyParkingPanel({ zones, expanded, onExpandedChange, onSelectZone }: NearbyParkingPanelProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const Chevron = expanded ? ChevronDown : ChevronUp;
  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((event) => {
        if (event.translationY < -24) runOnJS(onExpandedChange)(true);
        if (event.translationY > 24) runOnJS(onExpandedChange)(false);
      }),
    [onExpandedChange],
  );

  return (
    <View
      testID="nearby-parking-panel"
      style={[
        {
          overflow: 'hidden',
          padding: spacing.sm,
          borderRadius: radius.xxl,
          backgroundColor: colors.surface,
        },
        shadow.md,
      ]}
    >
      <GestureDetector gesture={swipe}>
        <PressableScale
          onPress={() => onExpandedChange(!expanded)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('map.collapseNearby') : t('map.expandNearby')}
          accessibilityState={{ expanded }}
          style={{
            minHeight: 34,
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="label">{t('map.nearby')}</AppText>
          </View>
          <AppText variant="caption" color="textTertiary" numeric>
            {zones.length}
          </AppText>
          <Chevron size={17} color={colors.textSecondary} strokeWidth={2.3} />
        </PressableScale>
      </GestureDetector>

      {zones.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 2 }}>
          <AppText variant="title">{t('map.noZones')}</AppText>
          <AppText variant="caption" color="textSecondary">
            {t('map.noZonesBody')}
          </AppText>
        </View>
      ) : expanded ? (
        <ScrollView
          style={{ maxHeight: 220 }}
          contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.xs }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {zones.map((item) => (
            <CompactZoneCard key={item.zone.id} item={item} onPress={() => onSelectZone(item)} />
          ))}
        </ScrollView>
      ) : (
        <CompactZoneCard item={zones[0]!} onPress={() => onSelectZone(zones[0]!)} />
      )}
    </View>
  );
}
