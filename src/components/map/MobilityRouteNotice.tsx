import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { spacing } from '@/theme/spacing';
import type { RouteResult } from '@/types';

export function MobilityRouteNotice({ mobility }: { mobility?: RouteResult['mobility'] }) {
  const { t } = useLocale();
  if (!mobility?.notices.length) return null;
  return <View accessibilityRole="alert" style={{ gap: spacing.xs }}>
    {mobility.notices.map(code => <AppText key={code} variant="caption" color="textSecondary">{t(`health.route.${code}`)}</AppText>)}
  </View>;
}
