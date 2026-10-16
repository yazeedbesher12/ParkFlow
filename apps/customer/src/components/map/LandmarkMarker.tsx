import { View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { AppText } from '@parkflow/client/components/ui/AppText';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { radius } from '@parkflow/design/radius';
import { shadow } from '@parkflow/design/shadows';

/** The place a landmark search resolved to — "قرب دوار المنارة" pins Al-Manara. */
export function LandmarkMarker({ name }: { name: string }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: colors.info,
        },
        shadow.md,
      ]}
    >
      <MapPin size={14} color={colors.textOnColor} strokeWidth={2.4} />
      <AppText variant="caption" numberOfLines={1} style={{ color: colors.textOnColor, maxWidth: 160 }}>
        {name}
      </AppText>
    </View>
  );
}
