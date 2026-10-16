import { Linking, PermissionsAndroid, Platform } from 'react-native';
import type { CrashEventOutcome } from '@parkflow/contracts';

const CALL_ACTION = 'android.intent.action.CALL';

/**
 * Asks once for permission to place calls directly. Without it the app can
 * still open the dialer with the number filled in, but the driver has to tap.
 */
export async function ensureCallPermission(canProceed: () => boolean = () => true): Promise<boolean> {
  if (Platform.OS !== 'android' || !canProceed()) return false;
  const permission = PermissionsAndroid.PERMISSIONS.CALL_PHONE;
  const granted = await PermissionsAndroid.check(permission);
  if (!canProceed()) return false;
  if (granted) return true;
  const result = await PermissionsAndroid.request(permission);
  return canProceed() && result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Places the emergency call. The launch guard checks the active alert; a
 * countdown can separately authorize delayed fallback after its normal cleanup.
 * Manual calls retain the existing behavior when no guard is supplied.
 */
export async function placeEmergencyCall(
  number: string,
  canProceed: () => boolean = () => true,
  canFallback: () => boolean = canProceed,
): Promise<CrashEventOutcome> {
  const tel = 'tel:' + number.replace(/[^\d+]/g, '');
  try {
    if (!canProceed()) return 'cancelled';
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
      if (!canProceed()) return 'cancelled';
      if (granted) {
        const IntentLauncher = await import('expo-intent-launcher');
        if (!canProceed()) return 'cancelled';
        // The promise settles when the call screen closes, so do not wait on
        // it. Its delayed fallback must still belong to the initiating alert.
        void IntentLauncher.startActivityAsync(CALL_ACTION, { data: tel })
          .catch(async () => {
            if (!canFallback()) return;
            await Linking.openURL(tel);
            if (!canFallback()) return;
          })
          .catch(() => undefined);
        return 'called';
      }
    }
    if (!canProceed()) return 'cancelled';
    await Linking.openURL(tel);
    if (!canProceed()) return 'cancelled';
    return 'called';
  } catch {
    return canProceed() ? 'call_failed' : 'cancelled';
  }
}
