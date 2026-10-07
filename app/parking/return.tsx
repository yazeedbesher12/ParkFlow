import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, AppText, Screen, TextField } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useReservationRouteStore } from '@/store/reservationRouteStore';
import { spacing } from '@/theme/spacing';
import { useFacilityNavigation } from '@/hooks/useParking';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { GeoPoint } from '@/types';

type ReminderResult = 'scheduled' | 'unavailable' | 'unchanged' | 'removed' | 'expired';
const reminderResultKeys = {
  scheduled: 'returnToCar.reminderResult.scheduled',
  unavailable: 'returnToCar.reminderResult.unavailable',
  unchanged: 'returnToCar.reminderResult.unchanged',
  removed: 'returnToCar.reminderResult.removed',
  expired: 'returnToCar.reminderResult.expired',
} as const;

export default function ReturnToCarScreen() {
  const router = useRouter(); const { t, locale } = useLocale();
  const saved = useReservationRouteStore((s) => s.returnToCar);
  const saveReturnToCar = useReservationRouteStore((s) => s.saveReturnToCar);
  const { data: navigation } = useFacilityNavigation(saved?.facilityId);
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [note, setNote] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [entranceLocation, setEntranceLocation] = useState<GeoPoint>();
  const [reminderResult, setReminderResult] = useState<ReminderResult>();
  const [reminderError, setReminderError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const operationInProgress = useRef(false);
  const { status: locationStatus, request: requestLocation } = useUserLocation(false);

  // Hydrate the form when opening an existing saved location. The values are
  // intentionally optional so users can save only the details they know.
  useEffect(() => {
    setEntrance(saved?.entrance ?? '');
    setFloor(saved?.floor ?? '');
    setNote(saved?.note ?? '');
    setReminderMinutes(saved?.reminderMinutes != null ? String(saved.reminderMinutes) : '');
    setEntranceLocation(saved?.savedLocation);
  }, [saved]);

  const markEdited = () => {
    setDetailsSaved(false);
    setReminderResult(undefined);
    setRemoveError(false);
  };

  const persistDetails = async () => {
    if (!saved || operationInProgress.current) return;
    // Accept both Arabic and Latin digits; reject partial numbers and long delays.
    const reminderText = reminderMinutes.trim().replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));
    const parsedReminder = reminderText ? Number(reminderText) : undefined;
    if (reminderText && (!/^\d+$/.test(reminderText) || !Number.isInteger(parsedReminder) || parsedReminder! < 1 || parsedReminder! > 1440)) {
      setReminderError(true);
      setDetailsSaved(false);
      return;
    }
    operationInProgress.current = true;
    setBusy(true);
    setReminderError(false);
    setRemoveError(false);
    let nextReminderMinutes = parsedReminder;
    let reminderNotificationId = saved.reminderNotificationId;
    let reminderDueAt = saved.reminderDueAt;
    let result: ReminderResult | undefined;
    try {
      if (parsedReminder === saved.reminderMinutes && reminderNotificationId) {
        // Editing a note must not restart an existing reminder's countdown.
        result = reminderDueAt && reminderDueAt <= Date.now() ? 'expired' : 'scheduled';
      } else if (parsedReminder == null) {
        if (reminderNotificationId) {
          if (Platform.OS !== 'web') {
            const Notifications = await import('expo-notifications');
            await Notifications.cancelScheduledNotificationAsync(reminderNotificationId);
          }
          result = 'removed';
        }
        reminderNotificationId = undefined;
        reminderDueAt = undefined;
      } else {
        if (Platform.OS === 'web') throw new Error('Native reminder unavailable');
        const Notifications = await import('expo-notifications');
        const permission = await Notifications.getPermissionsAsync();
        const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
        if (!granted) throw new Error('Notification permission unavailable');
        if (reminderNotificationId) await Notifications.cancelScheduledNotificationAsync(reminderNotificationId);
        reminderNotificationId = undefined;
        reminderDueAt = undefined;
        reminderNotificationId = await Notifications.scheduleNotificationAsync({
          content: { title: t('returnToCar.reminderTitle'), body: t('returnToCar.reminderBody'), data: { kind: 'return-to-car' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: parsedReminder * 60, repeats: false },
        });
        reminderDueAt = Date.now() + parsedReminder * 60_000;
        result = 'scheduled';
      }
    } catch {
      // Preserve a previous reminder if updating/cancelling it failed.
      if (reminderNotificationId) {
        nextReminderMinutes = saved.reminderMinutes;
        result = 'unchanged';
      } else {
        nextReminderMinutes = undefined;
        reminderDueAt = undefined;
        result = 'unavailable';
      }
    }
    saveReturnToCar({
      ...saved,
      entrance: entrance.trim() || undefined,
      floor: floor.trim() || undefined,
      note: note.trim() || undefined,
      reminderMinutes: nextReminderMinutes,
      reminderNotificationId,
      reminderDueAt,
      savedLocation: entranceLocation ?? saved.savedLocation,
    });
    setReminderResult(result);
    setDetailsSaved(true);
    operationInProgress.current = false;
    setBusy(false);
  };

  const clearReturn = async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true);
    setRemoveError(false);
    try {
      if (saved?.reminderNotificationId) {
        if (Platform.OS !== 'web') {
          try {
            const Notifications = await import('expo-notifications');
            await Notifications.cancelScheduledNotificationAsync(saved.reminderNotificationId);
          } catch {
            // Removing the saved location is still authoritative when the OS
            // cannot cancel an already delivered or missing notification.
          }
        }
      }
      useReservationRouteStore.getState().clearReturnToCar();
      router.back();
    } catch {
      setRemoveError(true);
    } finally {
      operationInProgress.current = false;
      setBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true);
    try {
      const point = await requestLocation();
      if (point) {
        setEntranceLocation(point);
        markEdited();
      }
    } finally {
      operationInProgress.current = false;
      setBusy(false);
    }
  };

  return <Screen layout="scroll"><View style={{ gap: spacing.lg }}>
    <AppText variant="h1">{t('returnToCar.title')}</AppText>
    {!saved ? <AppText color="textSecondary">{t('returnToCar.empty')}</AppText> : <>
      {navigation?.entrances?.length ? <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color="textSecondary">{t('returnToCar.chooseEntrance')}</AppText>
        <View style={{ gap: spacing.xs }}>
          {navigation.entrances.map((item, index) => {
            const label = locale === 'ar' ? (item.nameAr ?? item.name ?? `${t('returnToCar.entrance')} ${index + 1}`) : (item.name ?? item.nameAr ?? `${t('returnToCar.entrance')} ${index + 1}`);
            const isSelected = entrance === label;
            return <AppButton key={item.id ?? `${label}-${index}`} size="sm" fullWidth={false} disabled={busy} variant={isSelected ? 'primary' : 'secondary'} label={item.level != null ? `${label} · ${t('returnToCar.floor')} ${item.level}` : label} onPress={() => { markEdited(); setEntrance(label); setEntranceLocation(item.location ?? saved.savedLocation); if (item.level != null) setFloor(String(item.level)); }} />;
          })}
        </View>
      </View> : null}
      <AppButton label={t('returnToCar.useLocation')} variant="secondary" disabled={busy} loading={locationStatus === 'requesting'} onPress={() => void useCurrentLocation()} />
      {locationStatus === 'granted' ? <AppText variant="caption" color="textSecondary">{t('returnToCar.locationReady')}</AppText> : null}
      {locationStatus === 'denied' || locationStatus === 'unavailable' ? <AppText variant="caption" color="danger">{t('returnToCar.locationUnavailable')}</AppText> : null}
      <TextField
        label={t('returnToCar.entrance')}
        value={entrance}
        onChangeText={(value) => { markEdited(); setEntrance(value); }}
        editable={!busy}
        placeholder={t('returnToCar.noEntrance')}
        autoCapitalize="sentences"
      />
      <TextField
        label={t('returnToCar.floor')}
        value={floor}
        onChangeText={(value) => { markEdited(); setFloor(value); }}
        editable={!busy}
        placeholder={t('returnToCar.floor')}
        autoCapitalize="sentences"
      />
      <TextField
        label={t('returnToCar.note')}
        value={note}
        onChangeText={(value) => { markEdited(); setNote(value); }}
        editable={!busy}
        placeholder={t('returnToCar.notePlaceholder')}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        inputStyle={{ minHeight: 88, paddingVertical: spacing.md }}
      />
      <TextField
        label={t('returnToCar.reminder')}
        value={reminderMinutes}
        onChangeText={(value) => { markEdited(); setReminderError(false); setReminderMinutes(value); }}
        editable={!busy}
        maxLength={4}
        error={reminderError ? t('returnToCar.reminderInvalid') : undefined}
        hint={t('returnToCar.reminderHint')}
        placeholder={t('returnToCar.reminderPlaceholder')}
        keyboardType="number-pad"
      />
      <AppButton label={t('returnToCar.saveDetails')} variant="secondary" disabled={busy} onPress={() => void persistDetails()} />
      {detailsSaved ? <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">{t('returnToCar.saved')}</AppText> : null}
      {reminderResult ? <AppText variant="caption" color={reminderResult === 'unavailable' || reminderResult === 'unchanged' ? 'danger' : 'textSecondary'} accessibilityLiveRegion="polite">{t(reminderResultKeys[reminderResult])}</AppText> : null}
      <AppButton label={t('returnToCar.openMaps')} disabled={busy || !saved.savedLocation} onPress={() => { if (saved.savedLocation) void Linking.openURL(`https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${saved.savedLocation.latitude},${saved.savedLocation.longitude}`); }} />
      <AppButton label={t('common.done')} variant="secondary" disabled={busy} onPress={() => router.back()} />
      <AppButton label={t('returnToCar.remove')} variant="danger" disabled={busy} onPress={() => void clearReturn()} />
      {removeError ? <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">{t('returnToCar.removeFailed')}</AppText> : null}
    </>}
  </View></Screen>;
}
