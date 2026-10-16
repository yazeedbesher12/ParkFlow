import { View } from 'react-native';
import { AppText, PressableScale } from '@parkflow/client/components/ui';
import { CITIES } from '@parkflow/client/data/cities';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing } from '@parkflow/design/spacing';
import { radius } from '@parkflow/design/radius';

/** Wrapping city chips, so the chosen city is always on screen. `allowAny` adds an "Any city" chip with the value ''. */
export function CityPicker({ label, value, onChange, allowAny }: {
  label: string; value: string; onChange: (city: string) => void; allowAny?: boolean;
}) {
  const { locale, t, row } = useLocale();
  const { colors } = useTheme();
  const options = [
    ...(allowAny ? [{ value: '', label: t('ride.anyCity') }] : []),
    ...CITIES.map((city) => ({ value: city.name, label: locale === 'ar' ? city.nameAr : city.name })),
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="label" color="textSecondary">{label}</AppText>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.xs }}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <PressableScale
              key={option.value || 'any'}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: on ? colors.brand : colors.surfaceAlt }}
            >
              <AppText variant="caption" style={{ color: on ? colors.onBrand : colors.textSecondary }}>{option.label}</AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
