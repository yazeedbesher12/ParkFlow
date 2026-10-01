import { ActivityIndicator, ScrollView, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { AppText, PressableScale, SearchField } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { PlaceSuggestion } from '@/services/placeSearchService';

interface Props {
  value: string;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  error?: boolean;
  showSuggestions: boolean;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
}

export function DestinationSearchBox({
  value,
  suggestions,
  loading,
  error,
  showSuggestions,
  onChange,
  onSelect,
}: Props) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const hasQuery = value.trim().length >= 2;

  return (
    <View style={{ gap: spacing.xs }}>
      <SearchField
        value={value}
        onChangeText={onChange}
        placeholder={t('map.search')}
        tone="surface"
        trailing={loading ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        style={shadow.sm}
      />
      {showSuggestions && hasQuery ? (
        <View
          style={[
            {
              maxHeight: 252,
              overflow: 'hidden',
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
            },
            shadow.md,
          ]}
        >
          {loading ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="textSecondary">{t('common.loading')}</AppText>
            </View>
          ) : error ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="danger">{t('map.searchFailed')}</AppText>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="textSecondary">{t('map.noDestinations')}</AppText>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {suggestions.map((item) => (
                <PressableScale
                  key={item.id}
                  onPress={() => onSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  style={{
                    flexDirection: row,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.brandSoft,
                    }}
                  >
                    <MapPin size={16} color={colors.brand} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="label" numberOfLines={1}>{item.name}</AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {[item.category, item.address].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
