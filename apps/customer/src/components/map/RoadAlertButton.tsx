import { TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, PressableScale } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { radius } from '@parkflow/design/radius';

export function RoadAlertButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useLocale();

  if (count === 0) return null;

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={t('roads.banner', { count })}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <TriangleAlert size={19} color={colors.warningText} strokeWidth={2.3} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          minWidth: 16,
          height: 16,
          paddingHorizontal: 3,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.warning,
          borderWidth: 1,
          borderColor: colors.surface,
        }}
      >
        <AppText variant="caption" numeric style={{ color: colors.textOnColor, fontSize: 9 }}>
          {count > 9 ? '9+' : count}
        </AppText>
      </View>
    </PressableScale>
  );
}
