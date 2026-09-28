import { ChevronDown, ChevronUp, Navigation, ShieldCheck, TriangleAlert, X } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { AppButton, AppText, IconButton, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { ParkingZone, RouteClosure, RouteResult } from '@/types';
import { formatDistance } from '@/utils/geo';

function RouteDetails({ route }: { route: RouteResult }) {
  const { colors } = useTheme();
  const { t, locale, row } = useLocale();
  const nameOf = (closure: RouteClosure) => (locale === 'ar' ? closure.nameAr : closure.nameEn);
  const statusOf = (closure: RouteClosure) => t(`roads.status.${closure.status}` as const);
  const avoided = [
    ...new Map(
      route.rejected.flatMap((item) =>
        item.blockedBy ? [[item.blockedBy.checkpointId, item.blockedBy] as const] : [],
      ),
    ).values(),
  ].filter((closure) =>
    !route.closuresOnRoute.some((onRoute) => onRoute.checkpointId === closure.checkpointId),
  );
  const lines: { key: string; safe: boolean; text: string }[] = [];
  if (route.source === 'straight-line') lines.push({ key: 'approximate', safe: false, text: t('route.approximate') });
  route.closuresOnRoute.forEach((closure) =>
    lines.push({ key: `on-${closure.checkpointId}`, safe: false, text: t('route.passes', { name: nameOf(closure), status: statusOf(closure) }) }),
  );
  avoided.forEach((closure) =>
    lines.push({ key: `avoid-${closure.checkpointId}`, safe: true, text: t('route.avoids', { name: nameOf(closure), status: statusOf(closure) }) }),
  );
  if (lines.length === 0) lines.push({ key: 'clear', safe: true, text: t('route.clear') });

  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.sm }}>
      {lines.map((line) => (
        <View key={line.key} style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          {line.safe ? (
            <ShieldCheck size={15} color={colors.success} strokeWidth={2.2} />
          ) : (
            <TriangleAlert size={15} color={colors.warning} strokeWidth={2.2} />
          )}
          <AppText variant="caption" color={line.safe ? 'successText' : 'warningText'} style={{ flex: 1 }}>
            {line.text}
          </AppText>
        </View>
      ))}
    </View>
  );
}

interface CompactRoutePanelProps {
  zone: ParkingZone;
  route?: RouteResult;
  loading: boolean;
  detailsExpanded: boolean;
  onDetailsExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  onOpenMaps: () => void;
  onStartParking: () => void;
  startDisabled?: boolean;
}

export function CompactRoutePanel({
  zone,
  route,
  loading,
  detailsExpanded,
  onDetailsExpandedChange,
  onClose,
  onOpenMaps,
  onStartParking,
  startDisabled = false,
}: CompactRoutePanelProps) {
  const { colors } = useTheme();
  const { t, locale, row } = useLocale();
  const name = locale === 'ar' ? zone.nameAr : zone.name;
  const Chevron = detailsExpanded ? ChevronDown : ChevronUp;

  return (
    <View
      testID="compact-route-panel"
      style={[
        { gap: spacing.sm, padding: spacing.md, borderRadius: radius.xxl, backgroundColor: colors.surface },
        shadow.md,
      ]}
    >
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="caption" color="textTertiary">{t('route.destination')}</AppText>
          <AppText variant="title" numberOfLines={1}>{name}</AppText>
        </View>
        {route ? (
          <AppText variant="title" color="brand" numeric>
            {t('route.summary', { minutes: Math.max(1, Math.round(route.durationSeconds / 60)), distance: formatDistance(route.distanceMeters) })}
          </AppText>
        ) : loading ? (
          <AppText variant="caption" color="textSecondary">{t('route.loading')}</AppText>
        ) : null}
        <IconButton
          icon={<X size={16} color={colors.textSecondary} strokeWidth={2.3} />}
          onPress={onClose}
          accessibilityLabel={t('route.close')}
          tone="ghost"
          size={32}
        />
      </View>

      {route ? (
        <>
          <PressableScale
            onPress={() => onDetailsExpandedChange(!detailsExpanded)}
            accessibilityRole="button"
            accessibilityLabel={detailsExpanded ? t('route.hideDetails') : t('route.details')}
            accessibilityState={{ expanded: detailsExpanded }}
            style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' }}
          >
            <AppText variant="caption" color="textSecondary">
              {detailsExpanded ? t('route.hideDetails') : t('route.details')}
            </AppText>
            <Chevron size={14} color={colors.textSecondary} strokeWidth={2.3} />
          </PressableScale>
          {detailsExpanded ? (
            <ScrollView style={{ maxHeight: 108 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <RouteDetails route={route} />
            </ScrollView>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton
          label={t('route.openMaps')}
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
          onPress={onOpenMaps}
          icon={<Navigation size={15} color={colors.text} strokeWidth={2.2} />}
        />
        <AppButton
          label={t('zone.startParking')}
          size="sm"
          style={{ flex: 1 }}
          onPress={onStartParking}
          disabled={startDisabled || zone.availability === 'full'}
        />
      </View>
    </View>
  );
}
