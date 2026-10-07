import { AppText, Card } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/http/apiClient';
export function ZoneForecast({ zoneId, arrivalAt }: { zoneId: string; arrivalAt?: string }) {
  const { t } = useLocale();
  const { data, isPending } = useQuery({
    // Query notifications rerender this component. A moving timestamp in the
    // key would turn every result or error into another request.
    queryKey: ['forecast', zoneId, arrivalAt ?? 'now'],
    queryFn: () => {
      const requestedArrival = arrivalAt ?? new Date().toISOString();
      return api<any>(`/parking/zones/${zoneId}/forecast?arrivalAt=${encodeURIComponent(requestedArrival)}`);
    },
  });
  if (isPending || !data) return null;
  return <Card><AppText variant="title">{t('forecast.title')}</AppText><AppText>{t('forecast.probability', { value: Math.round(data.probability * 100) })}</AppText><AppText>{data.fallback ? t('forecast.fallback') : t('forecast.confidence', { value: Math.round(data.confidence * 100) })}</AppText></Card>;
}
