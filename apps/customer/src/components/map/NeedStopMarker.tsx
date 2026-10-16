import { View } from 'react-native';
import { CircleDot } from 'lucide-react-native';
import { AppText } from '@parkflow/client/components/ui';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { radius } from '@parkflow/design/radius';
import { shadow } from '@parkflow/design/shadows';
import { spacing } from '@parkflow/design/spacing';

interface Props {
  name: string;
  category: string;
}

export function NeedStopMarker({ name, category }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 5,
          borderRadius: radius.md,
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.surface,
          maxWidth: 180,
        },
        shadow.sm,
      ]}
    >
      <CircleDot size={14} color={colors.onBrand} strokeWidth={2.4} />
      <View style={{ minWidth: 0, flex: 1 }}>
        <AppText variant="caption" color="textOnColor" weight="bold" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption" color="textOnColor" numberOfLines={1}>{category}</AppText>
      </View>
    </View>
  );
}
