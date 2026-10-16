import { useEffect, useRef, useState } from 'react';
import { Modal, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, TriangleAlert } from 'lucide-react-native';

import { AppButton } from '@parkflow/client/components/ui/AppButton';
import { AppText } from '@parkflow/client/components/ui/AppText';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing, screenPadding } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useEmergencyConfig } from '@parkflow/client/hooks/useCrashDetection';
import { useCrashAlertStore, type CrashAlert } from '@parkflow/client/store/crashAlertStore';
import { recordCrashForUser } from '@parkflow/client/services/crashEvents';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { placeEmergencyCall } from '@parkflow/client/utils/emergencyCall';
import type { CrashEventOutcome } from '@parkflow/contracts';

const VIBRATION_PATTERN = [0, 600, 400];

function report(alert: CrashAlert, outcome: CrashEventOutcome) {
  if (useAuthStore.getState().session?.userId !== alert.userId) return;
  const { detection, location } = alert;
  void recordCrashForUser(alert.userId, {
      detectedAt: alert.detectedAt,
      latitude: location?.latitude,
      longitude: location?.longitude,
      speedKmh: Math.round(detection.speedKmh),
      peakG: Number(detection.peakG.toFixed(2)),
      rotationDeg: Math.round(detection.rotationDeg),
      outcome,
    })
    .catch(() => undefined);
}

/**
 * The only crash-detection UI the driver ever sees: after a detected crash it
 * counts down with vibration, and calls for help unless the driver says they
 * are fine. Calling the instant a crash is detected would dial on every
 * false alarm, so the driver always gets this one chance to cancel.
 */
export function CrashCountdown() {
  const { colors } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.session?.userId);
  const pendingAlert = useCrashAlertStore((s) => s.alert);
  const alert = pendingAlert?.userId === currentUserId ? pendingAlert : undefined;
  const clear = useCrashAlertStore((s) => s.clear);
  const { data: config } = useEmergencyConfig();
  const total = config?.countdownSeconds ?? 15;
  // Keep the tick state with its alert: a previous zero must never authorize
  // the first automatic-call effect of a newly raised alert.
  const [countdown, setCountdown] = useState(() => ({ alert, remaining: total }));
  const remaining = countdown.alert === alert ? countdown.remaining : total;
  const [calling, setCalling] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    if (!alert) return;
    settled.current = false;
    setCalling(false);
    setCountdown({ alert, remaining: total });
    Vibration.vibrate(VIBRATION_PATTERN, true);
    const timer = setInterval(() => setCountdown((current) => current.alert === alert
      ? { alert, remaining: Math.max(0, current.remaining - 1) }
      : current), 1000);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [alert, total]);

  const isCurrentAlert = () => Boolean(alert
    && useAuthStore.getState().session?.userId === alert.userId
    && useCrashAlertStore.getState().alert === alert);

  const callNow = async () => {
    if (!alert || settled.current || !isCurrentAlert()) return;
    settled.current = true;
    setCalling(true);
    Vibration.cancel();
    const attemptGeneration = useCrashAlertStore.getState().generation;
    let clearedGeneration: number | undefined;
    const canLaunch = () => isCurrentAlert()
      && useCrashAlertStore.getState().generation === attemptGeneration;
    const canFallback = () => {
      const state = useCrashAlertStore.getState();
      if (useAuthStore.getState().session?.userId !== alert.userId || state.ownerUserId !== alert.userId) return false;
      // Normal completion clears this alert immediately after native launch.
      // Only that exact clear may preserve the pending native failure fallback;
      // a later alert, cancel or account transition invalidates the generation.
      return canLaunch() || (clearedGeneration !== undefined
        && state.generation === clearedGeneration && !state.alert);
    };
    const number = config?.callNumber;
    const outcome = number ? await placeEmergencyCall(number, canLaunch, canFallback) : 'no_number';
    if (!canLaunch()) return;
    report(alert, outcome);
    clearedGeneration = attemptGeneration + 1;
    clear();
  };

  const cancel = () => {
    if (!alert || settled.current || !isCurrentAlert()) return;
    settled.current = true;
    report(alert, 'cancelled');
    clear();
  };

  useEffect(() => {
    if (alert && countdown.alert === alert && remaining === 0 && isCurrentAlert()) void callNow();
    // callNow reads the latest alert and config; only the countdown should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, alert, countdown.alert]);

  if (!alert) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.danger,
          paddingTop: insets.top + spacing.xxxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: screenPadding,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <TriangleAlert size={56} color={colors.onDeep} strokeWidth={2} />
          <AppText variant="h1" align="center" style={{ color: colors.onDeep }}>
            {t('crash.title')}
          </AppText>
          <AppText variant="bodyLg" align="center" style={{ color: colors.onDeep, opacity: 0.9 }}>
            {t('crash.body')}
          </AppText>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <AppText
            variant="displayXl"
            numeric
            align="center"
            accessibilityLiveRegion="assertive"
            style={{ color: colors.onDeep, fontSize: 96, lineHeight: 110 }}
          >
            {remaining}
          </AppText>
          <AppText variant="title" align="center" style={{ color: colors.onDeep }}>
            {calling ? t('crash.calling') : t('crash.callingIn', { seconds: remaining })}
          </AppText>
        </View>

        <View style={{ gap: spacing.md }}>
          <AppButton label={t('crash.imOk')} variant="inverse" onPress={cancel} disabled={calling} />
          <AppButton
            label={t('crash.callNow')}
            variant="ghostInverse"
            onPress={() => void callNow()}
            loading={calling}
            icon={<Phone size={18} color={colors.onDeep} strokeWidth={2.2} />}
          />
        </View>
      </View>
    </Modal>
  );
}
