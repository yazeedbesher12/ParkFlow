import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '@parkflow/contracts';
import { useAuthStore } from '../store/authStore';

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/**
 * GPS is treated as a nice-to-have, never a requirement: the map falls back to
 * central Ramallah and the user can still pick a zone by tapping it, scanning a
 * QR code or typing the zone code.
 */
export function useUserLocation(enabled = true) {
  const userId = useAuthStore((state) => state.user?.id);
  const scope = useRef({ userId, generation: 0, mounted: false });
  const [measurement, setMeasurement] = useState<{
    userId?: string;
    generation: number;
    status: LocationStatus;
    location?: GeoPoint;
  }>({ userId, generation: 0, status: 'idle' });

  useEffect(() => {
    scope.current.mounted = true;
    const observeAccount = (nextUserId?: string) => {
      if (scope.current.userId === nextUserId) return;
      scope.current.userId = nextUserId;
      const generation = ++scope.current.generation;
      setMeasurement({ userId: nextUserId, generation, status: 'idle' });
    };
    observeAccount(useAuthStore.getState().user?.id);
    // Observe every transition, including logout/login to the same account in one React batch.
    const unsubscribe = useAuthStore.subscribe((state) => observeAccount(state.user?.id));
    return () => {
      scope.current.mounted = false;
      ++scope.current.generation;
      unsubscribe();
    };
  }, []);

  const request = useCallback(async () => {
    const owner = { userId: scope.current.userId, generation: scope.current.generation };
    const current = () => scope.current.mounted
      && owner.generation === scope.current.generation
      && owner.userId === useAuthStore.getState().user?.id;
    const publish = (status: LocationStatus, location?: GeoPoint) => {
      if (!current()) return;
      setMeasurement((previous) => ({
        ...owner, status,
        location: location ?? (previous.userId === owner.userId && previous.generation === owner.generation ? previous.location : undefined),
      }));
    };
    if (!current()) return undefined;
    publish('requesting');
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (!current()) return undefined;
      if (permission !== 'granted') {
        publish('denied');
        return undefined;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!current()) return undefined;
      const point: GeoPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      publish('granted', point);
      return point;
    } catch {
      // Permission dialogs and GPS both fail in plenty of ordinary ways
      // (airplane mode, emulator without a fix). None should break the map.
      publish('unavailable');
      return undefined;
    }
  }, []);

  // Hide previous-account data synchronously, before the account observer's React update commits.
  const belongsToAccount = measurement.userId === userId && measurement.generation === scope.current.generation;
  const status = belongsToAccount ? measurement.status : 'idle';
  const location = belongsToAccount ? measurement.location : undefined;

  useEffect(() => {
    if (!enabled || status !== 'idle') return;
    void request();
  }, [enabled, status, request, userId]);

  return { location, status, request };
}
