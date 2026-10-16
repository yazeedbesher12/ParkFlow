import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, AppHeader, AppText, Card, EmptyState, ErrorState, Screen, SkeletonGroup } from '@parkflow/client/components/ui';
import { useOperatorSummary } from '@parkflow/client/hooks/useOperator';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';

export default function OperatorHome() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { data, isPending, isError, refetch } = useOperatorSummary();
  if (isPending) return <Screen><SkeletonGroup count={3} /></Screen>;
  if (isError) return <Screen><ErrorState title={t('operator.accessRequired')} error={new Error(t('operator.accessBody'))} onRetry={refetch} /></Screen>;
  const zones = data?.assignedZones ?? data?.zones ?? [];
  return <Screen><AppHeader title={t('operator.workspace')} /><View style={{ gap: spacing.md }}><AppButton label={locale === 'ar' ? 'إدارة مواقفي والموظفين' : 'Manage parking & staff'} onPress={() => router.push('/operator/manage')} /><AppButton label={t('operator.analyticsTitle')} variant="secondary" onPress={() => router.push('/operator/analytics')} />{zones.length === 0 ? <EmptyState title={t('operator.noZones')} body={t('operator.noZonesBody')} /> : zones.map((zone) => <Pressable key={zone.id} onPress={() => router.push(`/operator/zones/${zone.id}`)}><Card><AppText variant="title">{locale === 'ar' ? zone.nameAr : zone.name}</AppText><AppText>{locale === 'ar' ? zone.cityAr : zone.city}</AppText><AppText>{t('operator.activeReservations', { count: zone.activeReservationCount })}</AppText><AppText>{zone.feedHealth.stale ? `⚠ ${t('operator.feedStale')}` : t('operator.feedHealthy')}{zone.feedHealth.conflict ? ` · ${t('operator.conflictDetected')}` : ''}</AppText></Card></Pressable>)}</View></Screen>;
}
