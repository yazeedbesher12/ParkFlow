import { View } from 'react-native';
import { InlineNotice } from './InlineNotice';
import { useLocale } from '@/hooks/useLocale';
import { useUserId } from '@/hooks/useSession';
import { scopedKey } from '@/offline/storage';
import { useCacheStatus } from '@/offline/useCacheStatus';
import { spacing } from '@/theme/spacing';

/** Small, contextual banner shown only when a screen is using cached data. */
export function OfflineStaleNotice({ cacheKey }: { cacheKey: string }) {
  const userId = useUserId();
  const { t } = useLocale();
  const status = useCacheStatus(userId ? scopedKey(userId, cacheKey) : undefined);
  if (!status.stale) return null;
  return <View style={{ marginBottom: spacing.md }}><InlineNotice tone="warning" title={t('common.offline')} body={t('common.offlineStale')} /></View>;
}
