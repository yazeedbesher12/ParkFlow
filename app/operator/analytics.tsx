import { View } from 'react-native';
import { AppHeader, AppText, Card, Screen, SkeletonGroup } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/http/apiClient';
export default function OperatorAnalytics() { const { t } = useLocale(); const { data, isPending } = useQuery({ queryKey: ['operator','analytics'], queryFn: () => api<any>('/operator/analytics') }); if (isPending) return <Screen><SkeletonGroup count={2}/></Screen>; return <Screen><AppHeader title={t('operator.analyticsTitle')} /><View style={{ gap: 12 }}>{(data?.zones ?? []).map((z:any) => <Card key={z.zoneId}><AppText variant="title">{z.name}</AppText><AppText>{t('operator.analyticsReservations', { checkedIn: z.reservationConversion.checkedIn, total: z.reservationConversion.total })}</AppText><AppText>{t('operator.analyticsSamples', { count: z.feedQuality.samples })}</AppText></Card>)}</View></Screen>; }
