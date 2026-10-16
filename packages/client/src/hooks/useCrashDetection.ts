import { useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { services } from '../services/index';
import { useAuthStore } from '../store/authStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useCrashAlertStore } from '../store/crashAlertStore';
import { CrashDetector } from '../utils/crashDetector';
import { nativeCrashDetection } from '../utils/crashDetectionNative';
import { uploadPendingCrashEvents } from '../services/crashEvents';
import { useLocale } from './useLocale';
import { clientApplication } from '../runtime/application';
import type { EmergencyConfig, GeoPoint } from '@parkflow/contracts';

const MOTION_INTERVAL_MS = 20;
const G = 9.80665;

export function useEmergencyConfig() {
  const userId = useAuthStore(s => s.session?.userId);
  return useQuery({
    queryKey: ['emergency', 'config', userId ?? 'anonymous'],
    queryFn: () => services.emergency.config(),
    enabled: clientApplication === 'customer' && Boolean(userId) && Platform.OS !== 'web',
    staleTime: 10 * 60_000,
  });
}

/** Customer-only detection: Android background service, in-app sensors elsewhere. */
export function useCrashDetection() {
  const userId = useAuthStore(s => s.session?.userId);
  const authHydrated = useAuthStore(s => s.hydrated);
  const enabledByUser = usePreferencesStore(s => s.crashDetection);
  const preferencesHydrated = usePreferencesStore(s => s.hydrated);
  const { data: config } = useEmergencyConfig();
  const customerNative = clientApplication === 'customer' && Platform.OS !== 'web';
  const active = customerNative && Boolean(userId) && preferencesHydrated && enabledByUser && config?.enabled === true;
  // An offline config does not disable an already configured service. Account
  // changes stop it directly in authStore before the next identity is published.
  const disabled = authHydrated && (!customerNative || !userId || !enabledByUser || config?.enabled === false);
  useBackgroundCrashService(userId, active, disabled, config);
  useInAppCrashDetection(userId, active && !nativeCrashDetection);
  useCrashEventUpload(customerNative ? userId : undefined);
}

function useBackgroundCrashService(userId: string | undefined, active: boolean, disabled: boolean, config?: EmergencyConfig) {
  const { t, isRTL } = useLocale();
  const permissionsAsked = usePreferencesStore(s => s.crashPermissionsAsked);
  const markPermissionsAsked = usePreferencesStore(s => s.markCrashPermissionsAsked);
  useEffect(() => {
    const native = nativeCrashDetection;
    if (!native) return;
    if (disabled) { native.stop(); return; }
    const callNumber = config?.callNumber;
    if (!active || !config || !callNumber || !userId) return;
    let cancelled = false;
    const current = () => !cancelled && useAuthStore.getState().session?.userId === userId;
    const start = () => {
      if (!current()) return;
      native.start({
        userId, callNumber, countdownSeconds: config.countdownSeconds, rtl: isRTL,
        'text.title': t('crash.title'), 'text.body': t('crash.body'),
        'text.callingIn': t('crash.callingIn', { seconds: '{seconds}' }),
        'text.imOk': t('crash.imOk'), 'text.callNow': t('crash.callNow'),
        'text.monitorTitle': t('crash.monitorTitle'), 'text.monitorBody': t('crash.monitorBody'),
        'text.monitorChannel': t('crash.setting'), 'text.alertChannel': t('crash.title'),
      });
    };
    const run = async () => {
      if (!permissionsAsked) {
        const wanted: string[] = [PermissionsAndroid.PERMISSIONS.CALL_PHONE];
        if (Number(Platform.Version) >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        await PermissionsAndroid.requestMultiple(wanted as Parameters<typeof PermissionsAndroid.requestMultiple>[0]).catch(() => undefined);
        if (!current()) return;
        markPermissionsAsked();
      }
      start();
    };
    void run();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !native.isRunning()) start();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [userId, active, disabled, config, isRTL, t, permissionsAsked, markPermissionsAsked]);
}

function useCrashEventUpload(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    const upload = () => { void uploadPendingCrashEvents(userId).catch(() => undefined); };
    upload();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') upload(); });
    return () => subscription.remove();
  }, [userId]);
}

/** Read GPS only with existing permission; read motion only while driving in-app. */
function useInAppCrashDetection(userId: string | undefined, active: boolean) {
  const lastLocation = useRef<GeoPoint | undefined>(undefined);
  useEffect(() => {
    lastLocation.current = undefined;
    if (!active || !userId) return;
    let cancelled = false;
    let foreground = AppState.currentState === 'active';
    const detector = new CrashDetector();
    let locationSub: Location.LocationSubscription | undefined;
    let motionSub: { remove: () => void } | undefined;
    let armedCheck: ReturnType<typeof setInterval> | undefined;
    let locationStarting = false;
    let motionStarting = false;
    const current = () => !cancelled && foreground && useAuthStore.getState().session?.userId === userId;
    const stopMotion = () => { motionSub?.remove(); motionSub = undefined; };
    const startMotion = async () => {
      if (motionSub || motionStarting || !current()) return;
      motionStarting = true;
      try {
        const { DeviceMotion } = await import('expo-sensors');
        if (!(await DeviceMotion.isAvailableAsync()) || !current()) return;
        DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
        motionSub = DeviceMotion.addListener(({ accelerationIncludingGravity: a }) => {
          if (!a || !current()) return;
          const detection = detector.push({ t: Date.now(), x: a.x / G, y: a.y / G, z: a.z / G });
          if (detection) useCrashAlertStore.getState().raise({
            userId, detection, detectedAt: new Date(detection.impactAt).toISOString(), location: lastLocation.current,
          });
        });
      } finally { motionStarting = false; }
    };
    const stop = () => {
      if (armedCheck) clearInterval(armedCheck);
      armedCheck = undefined;
      locationSub?.remove();
      locationSub = undefined;
      stopMotion();
      lastLocation.current = undefined;
    };
    const start = async () => {
      if (!current() || locationSub || locationStarting) return;
      locationStarting = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!current() || permission.status !== 'granted') return;
        const subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
          position => {
            if (!current()) return;
            const { latitude, longitude, speed } = position.coords;
            lastLocation.current = { latitude, longitude };
            detector.pushSpeed(Date.now(), Math.max(0, speed ?? 0) * 3.6);
          },
        );
        if (!current()) { subscription.remove(); return; }
        locationSub = subscription;
        armedCheck = setInterval(() => {
          if (current() && detector.isArmed(Date.now())) void startMotion().catch(() => undefined);
          else stopMotion();
        }, 2000);
      } finally { locationStarting = false; }
    };
    void start().catch(() => undefined);
    const appState = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (foreground) void start().catch(() => undefined);
      else stop();
    });
    return () => { cancelled = true; appState.remove(); stop(); };
  }, [active, userId]);
}
