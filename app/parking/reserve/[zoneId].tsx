import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Clock3, Timer } from 'lucide-react-native';
import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  ErrorState,
  InlineNotice,
  Screen,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { useZone } from '@/hooks/useParking';
import { useCreateReservation, useReservationQuote } from '@/hooks/useReservations';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatMoney, formatRate } from '@/utils/money';
import { formatDate, formatDurationShort, formatTime } from '@/utils/time';
import { AppError, errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const HALF_HOUR = 30 * 60_000;
const nextHalfHour = () => Math.ceil((Date.now() + 60_000) / HALF_HOUR) * HALF_HOUR;

export default function ReserveParkingScreen() {
  const router = useRouter();
  const { zoneId, spotId, spotCode } = useLocalSearchParams<{ zoneId: string; spotId?: string; spotCode?: string }>();
  const { t, row, dateLocale, locale } = useLocale();
  const { colors } = useTheme();
  const { data: zone, isPending, isError, error, refetch } = useZone(zoneId);
  const createReservation = useCreateReservation();
  const [startMs, setStartMs] = useState(nextHalfHour);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [now, setNow] = useState(Date.now);
  const [priceChanged, setPriceChanged] = useState(false);
  const previousQuote = useRef<{ selection: string; confirmation: string } | null>(null);

  const start = new Date(startMs);
  const startTime = start.toISOString();
  const quoteQuery = useReservationQuote({ zoneId, startTime, durationMinutes }, zone?.version);
  const quote = quoteQuery.data;
  const maxDuration = Math.max(30, Math.min(480, Math.floor((quote?.maxStayMinutes ?? 480) / 30) * 30));
  const inPast = startMs < now;
  const quoteReady = Boolean(quote && !quoteQuery.isFetching && !quoteQuery.isError
    && now - quoteQuery.dataUpdatedAt < 45_000 && quote.zoneId === zoneId
    && quote.startTime === startTime && quote.durationMinutes === durationMinutes
    && (zone?.version == null || quote.zoneVersion === zone.version));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!quote) return;
    const selection = `${quote.zoneId}:${quote.startTime}:${quote.durationMinutes}`;
    const confirmation = JSON.stringify(quote.confirmation);
    if (previousQuote.current?.selection === selection && previousQuote.current.confirmation !== confirmation) setPriceChanged(true);
    else if (previousQuote.current?.selection !== selection) setPriceChanged(false);
    previousQuote.current = { selection, confirmation };
  }, [quote]);
  useEffect(() => {
    if (quote && zone?.version != null && quote.zoneVersion !== zone.version) void refetch();
  }, [quote?.zoneVersion, zone?.version, refetch]);
  const isLiveInventory = zone?.inventoryMode === 'live';
  const provenance = zone?.availabilityProvenance ?? zone?.provenance;
  const operatorBacked = isLiveInventory && !zone?.prototypeData && provenance?.source === 'operator' && provenance.freshness === 'fresh';
  const liveFeedVerified = isLiveInventory && provenance?.freshness === 'fresh'
    && (provenance.source === 'operator' || provenance.source === 'admin');

  const changeDay = (days: number) => {
    const next = new Date(startMs);
    next.setDate(next.getDate() + days);
    if (next.getTime() >= nextHalfHour() && next.getTime() <= Date.now() + 30 * 86_400_000) setStartMs(next.getTime());
  };
  const changeTime = (minutes: number) => {
    const next = startMs + minutes * 60_000;
    if (next >= nextHalfHour()) setStartMs(next);
  };

  const confirm = () => {
    if (!zone || !spotId || startMs < Date.now() || !quoteReady || !quote || Date.now() - quoteQuery.dataUpdatedAt >= 45_000) return;
    createReservation.mutate(
      { zoneId: zone.id, spotId, startTime, durationMinutes, quote: quote.confirmation },
      {
        onSuccess: (reservation) => {
          haptics.success();
          router.replace({ pathname: '/parking/reservation/[id]', params: { id: reservation.id, created: '1' } });
        },
        onError: (error) => {
          haptics.error();
          if (error instanceof AppError && error.details?.serverCode === 'QUOTE_CHANGED') {
            setPriceChanged(true);
            void quoteQuery.refetch();
            void refetch();
          }
        },
      },
    );
  };

  if (isError) return <Screen><AppHeader title={t('reservation.title')} leading="close" /><ErrorState error={error} onRetry={() => void refetch()} /></Screen>;

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('reservation.title')} subtitle={t('reservation.subtitle')} leading="close" />
      {isPending || !zone ? <View style={{ gap: spacing.lg }}><Skeleton height={120} /><Skeleton height={220} /><Skeleton height={140} /></View> : (
        <View style={{ gap: spacing.lg }}>
          <Card padding="lg" style={{ gap: spacing.sm }}>
            <AppText variant="h3">{locale === 'ar' ? zone.nameAr : zone.name}</AppText>
            <AppText variant="bodySm" color="textSecondary">{zone.code} · {locale === 'ar' ? zone.cityAr : zone.city}</AppText>
            <DetailRow label={t('reservation.hourlyRate')} value={quote ? `${formatRate(quote.hourlyRate)}${t('common.perHour')}` : '—'} />
            <DetailRow label={t('reservation.parkingSpace')} value={spotCode ?? '—'} />
            <StatusBadge
              label={isLiveInventory ? t('reservation.inventoryLive') : t('reservation.inventoryDemo')}
              tone={isLiveInventory ? 'success' : 'warning'}
              size="sm"
            />
            <AppText variant="caption" color={isLiveInventory ? 'successText' : 'textTertiary'}>
              {operatorBacked ? t('reservation.guaranteeOperator') : t('reservation.guaranteeNone')}
            </AppText>
          </Card>

          <Card padding="lg" style={{ gap: spacing.lg }}>
            <PickerRow icon={<CalendarDays size={18} color={colors.textSecondary} />} label={t('reservation.arrivalDate')} value={formatDate(start.toISOString(), dateLocale)} row={row}
              onMinus={() => changeDay(-1)} onPlus={() => changeDay(1)} minusDisabled={createReservation.isPending || startMs - 86_400_000 < nextHalfHour()} plusDisabled={createReservation.isPending} />
            <PickerRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('reservation.arrivalTime')} value={formatTime(start.toISOString(), dateLocale)} row={row}
              onMinus={() => changeTime(-30)} onPlus={() => changeTime(30)} minusDisabled={createReservation.isPending || startMs - HALF_HOUR < nextHalfHour()} plusDisabled={createReservation.isPending} />
            <PickerRow icon={<Timer size={18} color={colors.textSecondary} />} label={t('reservation.duration')} value={formatDurationShort(durationMinutes * 60)} row={row}
              onMinus={() => setDurationMinutes((value) => Math.max(30, value - 30))}
              onPlus={() => setDurationMinutes((value) => Math.min(maxDuration, value + 30))}
              minusDisabled={createReservation.isPending || durationMinutes <= 30} plusDisabled={createReservation.isPending || durationMinutes >= maxDuration} />
          </Card>

          <Card padding="lg" tone="outline" style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary">{t('reservation.estimatedTotal')}</AppText>
            <AppText variant="h1" numeric>{quote ? formatMoney(quote.totalMinor) : '—'}</AppText>
            {quote ? <AppText variant="caption" color="textSecondary">{quote.tariffName}</AppText> : null}
            {quoteQuery.isFetching ? <AppText variant="caption">{locale === 'ar' ? 'جارٍ تحديث السعر للفترة المختارة…' : 'Updating the price for your selected time…'}</AppText> : null}
            {quote && quote.minimumCharge > 0 ? <DetailRow label={locale === 'ar' ? 'الحد الأدنى' : 'Minimum charge'} value={formatMoney(quote.minimumCharge)} /> : null}
            {quote?.dailyCap != null ? <DetailRow label={locale === 'ar' ? 'السقف اليومي' : 'Daily cap'} value={formatMoney(quote.dailyCap)} /> : null}
            <AppText variant="caption" color="textTertiary">{t('reservation.noPayment')}</AppText>
          </Card>

          {priceChanged ? <InlineNotice tone="warning" title={locale === 'ar' ? 'تغيّرت تفاصيل الحجز' : 'Reservation details changed'} body={locale === 'ar' ? 'راجع السعر المحدّث والفترة المختارة ثم أكّد الحجز من جديد.' : 'Review the updated price and selected time before confirming again.'} /> : null}
          {quoteQuery.isError ? <ErrorState error={quoteQuery.error} onRetry={() => void quoteQuery.refetch()} /> : null}

          <InlineNotice
            tone={liveFeedVerified ? 'info' : 'warning'}
            title={!isLiveInventory ? t('reservation.demoTitle') : liveFeedVerified ? t('reservation.liveTitle') : t('reservation.liveUnverifiedTitle')}
            body={!isLiveInventory ? t('reservation.demoDisclaimer') : liveFeedVerified ? t('reservation.liveDisclaimer') : t('reservation.liveUnverifiedBody')}
          />
          {inPast ? <AppText variant="caption" color="danger">{t('reservation.pastError')}</AppText> : null}
          {createReservation.isError ? <AppText variant="caption" color="danger">{errorMessage(createReservation.error)}</AppText> : null}
          {!spotId ? <InlineNotice tone="danger" title={t('parkingLayout.selectedSpace')} body={t('parkingLayout.selectPrompt')} /> : null}
          <AppButton label={isLiveInventory ? t('reservation.confirmLive') : t('reservation.confirm')} onPress={confirm} loading={createReservation.isPending} disabled={inPast || !spotId || !quoteReady} />
        </View>
      )}
    </Screen>
  );
}

function PickerRow({ icon, label, value, row, onMinus, onPlus, minusDisabled, plusDisabled }: {
  icon: React.ReactNode; label: string; value: string; row: 'row' | 'row-reverse';
  onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean;
}) {
  return <View style={{ gap: spacing.sm }}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>{icon}<AppText variant="label" color="textSecondary">{label}</AppText></View>
    <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
      <AppButton label="−" size="sm" variant="secondary" fullWidth={false} onPress={onMinus} disabled={minusDisabled} style={{ width: 52 }} />
      <AppText variant="titleLg" numeric align="center" style={{ flex: 1 }}>{value}</AppText>
      <AppButton label="+" size="sm" variant="secondary" fullWidth={false} onPress={onPlus} disabled={plusDisabled} style={{ width: 52 }} />
    </View>
  </View>;
}
