import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Divider({
  style,
  inset = 0,
}: {
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginStart: inset },
        style,
      ]}
    />
  );
}
