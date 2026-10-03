import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { CircleParking, Footprints, NotebookPen, Search, X } from 'lucide-react-native';
import { AppText, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import { formatRate } from '@/utils/money';
import { formatDistance, walkingMinutes } from '@/utils/geo';
import type { ParkingRecommendation } from '@/utils/parkingRecommendation';
import type { TripNeedCategory } from '@/utils/tripNeeds';

interface Props {
  recommendations: ParkingRecommendation[];
  destinationName: string;
  tripNeedsExpanded: boolean;
  tripNeedsAppliedText: string;
  tripNeedCategories: TripNeedCategory[];
  tripNeedsLoading: boolean;
  tripNeedsError: boolean;
  onTripNeedsExpandedChange: (expanded: boolean) => void;
  onApplyTripNeeds: (value: string) => void;
  onClearTripNeeds: () => void;
  onSelect: (item: ParkingRecommendation) => void;
}

type NeedMatch = NonNullable<ParkingRecommendation['needMatches']>[number];

export function DestinationParkingPanel({
  recommendations,
  destinationName,
  tripNeedsExpanded,
  tripNeedsAppliedText,
  tripNeedCategories,
  tripNeedsLoading,
  tripNeedsError,
  onTripNeedsExpandedChange,
  onApplyTripNeeds,
  onClearTripNeeds,
  onSelect,
}: Props) {
  const { colors } = useTheme();
  const { t, locale, row, textAlign } = useLocale();
  const [draft, setDraft] = useState(tripNeedsAppliedText);

  useEffect(() => {
    setDraft(tripNeedsAppliedText);
  }, [tripNeedsAppliedText]);

  const applyNeeds = () => {
    const value = draft.trim();
    if (!value) {
      onClearTripNeeds();
      return;
    }
    onApplyTripNeeds(value);
  };

  const placeName = (match: NeedMatch) =>
    locale === 'ar'
      ? match.place?.nameAr ?? match.place?.name ?? match.place?.nameEn
      : match.place?.nameEn ?? match.place?.name ?? match.place?.nameAr;

  const resolvedMatches = (item: ParkingRecommendation) =>
    item.needMatches
      ?.filter((match) => match.place && match.distanceMeters !== undefined)
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)) ?? [];

  const joinParts = (parts: string[]) => {
    if (parts.length <= 1) return parts[0] ?? '';
    const last = parts[parts.length - 1];
    const rest = parts.slice(0, -1).join(locale === 'ar' ? '\u060c ' : ', ');
    return locale === 'ar' ? `${rest}\u060c \u0648${last}` : `${rest}, and ${last}`;
  };

  const topReason = recommendations[0] ? resolvedMatches(recommendations[0]).slice(0, 3) : [];
  const reasonPlaces = joinParts(topReason.map((match) => t('tripNeeds.placeDistance', {
    distance: formatDistance(match.distanceMeters ?? 0),
    name: placeName(match) ?? '',
  })));
  const reason = recommendations[0] && reasonPlaces
    ? t('tripNeeds.recommendationReason', {
      destinationMinutes: walkingMinutes(recommendations[0].distanceMeters),
      places: reasonPlaces,
    })
    : undefined;

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
      <View style={{ gap: spacing.xs }}>
        <PressableScale
          onPress={() => onTripNeedsExpandedChange(!tripNeedsExpanded)}
          accessibilityRole="button"
          accessibilityLabel={t('tripNeeds.add')}
          style={{
            alignSelf: row === 'row-reverse' ? 'flex-end' : 'flex-start',
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 7,
            borderRadius: radius.md,
            backgroundColor: tripNeedsExpanded || tripNeedsAppliedText ? colors.brandSoft : colors.surfaceAlt,
          }}
        >
          <NotebookPen size={15} color={colors.brand} strokeWidth={2.2} />
          <AppText variant="caption" color="brand" weight="bold">{t('tripNeeds.add')}</AppText>
        </PressableScale>
        {tripNeedsExpanded ? (
          <View
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: spacing.xs,
              padding: spacing.xs,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={applyNeeds}
              returnKeyType="search"
              placeholder={t('tripNeeds.placeholder')}
              placeholderTextColor={colors.textTertiary}
              multiline={false}
              style={{
                flex: 1,
                minHeight: 36,
                color: colors.text,
                textAlign,
                paddingHorizontal: spacing.xs,
                paddingVertical: 0,
              }}
            />
            {tripNeedsAppliedText ? (
              <PressableScale
                onPress={() => {
                  setDraft('');
                  onClearTripNeeds();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.remove')}
                hitSlop={8}
                style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color={colors.textSecondary} strokeWidth={2.2} />
              </PressableScale>
            ) : null}
            <PressableScale
              onPress={applyNeeds}
              accessibilityRole="button"
              accessibilityLabel={t('tripNeeds.apply')}
              hitSlop={8}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.brand,
              }}
            >
              <Search size={16} color={colors.onBrand} strokeWidth={2.3} />
            </PressableScale>
          </View>
        ) : null}
        {tripNeedsLoading ? (
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
            <ActivityIndicator size="small" color={colors.brand} />
            <AppText variant="caption" color="textSecondary">{t('tripNeeds.searching')}</AppText>
          </View>
        ) : tripNeedsError ? (
          <AppText variant="caption" color="danger">{t('tripNeeds.failed')}</AppText>
        ) : tripNeedsAppliedText && tripNeedCategories.length === 0 ? (
          <AppText variant="caption" color="warningText">{t('tripNeeds.noMatches')}</AppText>
        ) : reason ? (
          <AppText variant="caption" color="textSecondary">{reason}</AppText>
        ) : null}
      </View>
      {recommendations.length === 0 ? (
        <AppText variant="caption" color="textSecondary">{t('map.noRecommendedParking')}</AppText>
      ) : (
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: spacing.sm }} nestedScrollEnabled>
          {recommendations.map((item, index) => {
            const zone = item.zone;
            const name = locale === 'ar' ? zone.nameAr : zone.name;
            const status = item.restricted
              ? t('zone.restrictedAccess')
              : item.open
                ? t('zone.openNow')
                : t('zone.closedNow');
            const matches = resolvedMatches(item);
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
                  {matches.length > 0 ? (
                    <View style={{ gap: 2, marginTop: 4 }}>
                      {matches.map((match) => (
                        <View key={`${zone.id}-${match.category.id}-${match.place?.id}`} style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
                          <AppText variant="caption" color="brand" numberOfLines={1}>
                            {locale === 'ar' ? match.category.labelAr : match.category.labelEn}
                          </AppText>
                          <AppText variant="caption" color="textTertiary" numberOfLines={1} style={{ flex: 1 }}>
                            {t('tripNeeds.placeDistance', {
                              distance: formatDistance(match.distanceMeters ?? 0),
                              name: placeName(match) ?? '',
                            })}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ) : null}
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
