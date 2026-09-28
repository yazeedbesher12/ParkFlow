import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { MapSurface } from '@/components/map/MapSurface';
import type { MapCheckpoint, MapRoute, MapSurfaceHandle } from '@/components/map/types';
import { MapTopBar } from '@/components/map/MapTopBar';
import { MapControlRail } from '@/components/map/MapControlRail';
import { NearbyParkingPanel } from '@/components/map/NearbyParkingPanel';
import type { NearbyZone } from '@/components/map/CompactZoneCard';
import { CompactRoutePanel } from '@/components/map/CompactRoutePanel';
import { TestLocationControl } from '@/components/map/TestLocationControl';
import { VehicleSelectorSheet } from '@/components/domain/VehicleSelectorSheet';
import { ZoneSheet } from '@/components/domain/ZoneSheet';
import { ActiveSessionBanner } from '@/components/domain/ActiveSessionBanner';
import { ZoneCodeSheet } from '@/components/domain/ZoneCodeSheet';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useSelectedVehicle } from '@/hooks/useVehicles';
import { useActiveSessions, useZones } from '@/hooks/useParking';
import { useCheckpoints, useRoute } from '@/hooks/useCommunity';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useUserLocation } from '@/hooks/useUserLocation';
import { DEFAULT_REGION } from '@/services';
import type { GeoPoint, GeoRegion, ParkingZone, RamallahParkingLocation } from '@/types';
import { distanceMeters } from '@/utils/geo';
import { haptics } from '@/utils/haptics';
import {
  ramallahParkingLocations,
  ramallahParkingZoneIds,
  ramallahParkingZones,
} from '@/data/ramallahParking';

/** Clears the custom floating tab bar, including the native bottom safe area. */
const TAB_BAR_CLEARANCE = 72;
/** The control rail starts just below the compact vehicle row. */
const CONTROL_RAIL_TOP = 64;

const FASTEST_PARKING_ROUTE = {
  mode: 'fastest',
  snapDestination: true,
  maxAlternatives: 2,
} as const;

/** ~10 m precision keeps GPS jitter from producing new route queries. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export default function MapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useLocale();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const [region, setRegion] = useState<GeoRegion>(DEFAULT_REGION);
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [routeZone, setRouteZone] = useState<ParkingZone>();
  const [routeOriginOverride, setRouteOriginOverride] = useState<GeoPoint>();
  const [testLocationMode, setTestLocationMode] = useState(false);
  const [testLocation, setTestLocation] = useState<GeoPoint>();
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [routeDetailsExpanded, setRouteDetailsExpanded] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string>();

  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [] } = useZones();
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: checkpoints = [] } = useCheckpoints();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  // Location is deliberately opt-in: Ramallah remains the opening view until locate is pressed.
  const { location, status: locationStatus, request: requestLocation } = useUserLocation(false);
  const selectedZone = useMemo(
    () =>
      zones.find((zone) => zone.id === selectedZoneId) ??
      ramallahParkingZones.find((zone) => zone.id === selectedZoneId),
    [selectedZoneId, zones],
  );

  const bannerSession = useMemo(
    () => activeSessions.find((session) => session.vehicleId === selected?.id) ?? activeSessions[0],
    [activeSessions, selected?.id],
  );
  const bannerVehicle = vehicles.find((vehicle) => vehicle.id === bannerSession?.vehicleId);
  const activeVehicleIds = activeSessions.map((session) => session.vehicleId);

  const nearbyOrigin = useMemo<GeoPoint>(
    () =>
      testLocation ??
      location ?? { latitude: region.latitude, longitude: region.longitude },
    [testLocation, location, region.latitude, region.longitude],
  );
  const nearbyZones = useMemo<NearbyZone[]>(
    () =>
      zones
        .map((zone) => ({ zone, distanceMeters: distanceMeters(nearbyOrigin, zone.location) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    [zones, nearbyOrigin],
  );
  const mapZones = useMemo(
    () => nearbyZones.filter(({ zone }) => !ramallahParkingZoneIds.has(zone.id)),
    [nearbyZones],
  );

  const alerts = useMemo(
    () =>
      checkpoints
        .filter((checkpoint) => !checkpoint.assumed && checkpoint.status !== 'open')
        .sort(
          (a, b) =>
            Number(b.status === 'closed') - Number(a.status === 'closed') ||
            (a.minutesSinceReport ?? 0) - (b.minutesSinceReport ?? 0),
        ),
    [checkpoints],
  );

  const mapCheckpoints = useMemo<MapCheckpoint[]>(
    () =>
      alerts.map((checkpoint) => ({
        id: checkpoint.id,
        name: locale === 'ar' ? checkpoint.nameAr : checkpoint.nameEn,
        location: checkpoint.location,
        status: checkpoint.status,
        assumed: checkpoint.assumed,
      })),
    [alerts, locale],
  );

  const routeOrigin = useMemo<GeoPoint | undefined>(
    () => {
      if (testLocation) return testLocation;
      if (location) {
        return { latitude: round4(location.latitude), longitude: round4(location.longitude) };
      }
      return routeOriginOverride;
    },
    [testLocation, location, routeOriginOverride],
  );
  const routeDestination = routeZone?.location;
  const { data: route, isFetching: routeLoading } = useRoute(
    routeDestination ? routeOrigin : undefined,
    routeDestination,
    routeZone ? FASTEST_PARKING_ROUTE : undefined,
  );
  const mapRoute = useMemo<MapRoute | undefined>(
    () =>
      routeDestination && route?.source === 'osrm'
        ? {
            coordinates: route.coordinates,
            alternatives: route.rejected.slice(0, 2).map((item) => item.coordinates),
          }
        : undefined,
    [route, routeDestination],
  );

  useEffect(() => {
    if (!mapRoute) return;
    mapRef.current?.fitToCoordinates(
      mapRoute.coordinates,
      { top: 156, right: 36, bottom: 196, left: 36 },
      500,
    );
  }, [mapRoute]);

  useEffect(() => {
    if (!locationMessage) return;
    const timeout = setTimeout(() => setLocationMessage(undefined), 3600);
    return () => clearTimeout(timeout);
  }, [locationMessage]);

  const recenter = useCallback(async () => {
    setEntryMenuOpen(false);
    setLocationMessage(undefined);
    haptics.light();
    if (testLocationMode) {
      if (!testLocation) {
        setLocationMessage(t('ramallahParking.testLocationPrompt'));
        return;
      }
      const next: GeoRegion = { ...testLocation, latitudeDelta: 0.014, longitudeDelta: 0.014 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 450);
      return;
    }
    const point = location ?? (await requestLocation());
    if (!point) {
      setLocationMessage(t('map.locationDeniedBody'));
      return;
    }
    const next: GeoRegion = { ...point, latitudeDelta: 0.014, longitudeDelta: 0.014 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [testLocationMode, testLocation, location, requestLocation, t]);

  const openZone = useCallback((zone: ParkingZone) => {
    haptics.select();
    setEntryMenuOpen(false);
    setNearbyExpanded(false);
    setRouteZone(undefined);
    setRouteDetailsExpanded(false);
    setSelectedZoneId(zone.id);
  }, []);

  const focusZone = useCallback(
    (item: NearbyZone) => {
      const next: GeoRegion = { ...item.zone.location, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 400);
      openZone(item.zone);
    },
    [openZone],
  );

  const startParking = useCallback(
    (zone: ParkingZone) => {
      setSelectedZoneId(undefined);
      setRouteZone(undefined);
      setRouteDetailsExpanded(false);
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const showRoute = useCallback(
    async (zone: ParkingZone) => {
      setLocationMessage(undefined);
      let origin = testLocation;
      if (!origin && testLocationMode) {
        setLocationMessage(t('ramallahParking.testLocationPrompt'));
        return;
      }
      origin ??= location ?? (await requestLocation());
      if (!origin) {
        setLocationMessage(t('map.locationDeniedBody'));
        return;
      }
      haptics.select();
      setRouteOriginOverride(origin);
      setSelectedZoneId(undefined);
      setNearbyExpanded(false);
      setRouteDetailsExpanded(false);
      setRouteZone(zone);
    },
    [location, requestLocation, t, testLocation, testLocationMode],
  );

  const openParkingLocation = useCallback((parkingLocation: RamallahParkingLocation) => {
    const zone =
      zones.find((item) => item.id === parkingLocation.id) ??
      ramallahParkingZones.find((item) => item.id === parkingLocation.id);
    if (zone) openZone(zone);
  }, [openZone, zones]);

  const closeRoute = useCallback(() => {
    setRouteZone(undefined);
    setRouteDetailsExpanded(false);
  }, []);

  const toggleTestLocation = useCallback(() => {
    setLocationMessage(undefined);
    setTestLocationMode((enabled) => {
      if (enabled) {
        setTestLocation(undefined);
        setRouteOriginOverride(undefined);
      } else {
        setEntryMenuOpen(false);
      }
      return !enabled;
    });
  }, []);

  const handleMapPress = useCallback(
    (coordinate: GeoPoint) => {
      if (!testLocationMode) return;
      setTestLocation(coordinate);
      setLocationMessage(undefined);
    },
    [testLocationMode],
  );

  const openInMaps = useCallback((zone: ParkingZone) => {
    const { latitude, longitude } = zone.location;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(zone.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      <MapSurface
        ref={mapRef}
        region={region}
        zones={mapZones.map((item) => item.zone)}
        selectedZoneId={selectedZoneId ?? routeZone?.id}
        parkingLocations={ramallahParkingLocations}
        selectedParkingLocationId={selectedZoneId ?? routeZone?.id}
        onSelectParkingLocation={openParkingLocation}
        onSelectZone={openZone}
        onPressMap={handleMapPress}
        onPressBackground={() => {
          setSelectedZoneId(undefined);
          setEntryMenuOpen(false);
        }}
        userLocation={testLocationMode ? undefined : location}
        testLocation={testLocation}
        onRegionChangeComplete={setRegion}
        checkpoints={mapCheckpoints}
        onSelectCheckpoint={() => router.push('/roads')}
        route={mapRoute}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />

      <View
        pointerEvents="box-none"
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: screenPadding,
        }}
      >
        <MapTopBar
          vehicle={selected}
          unreadCount={unreadCount}
          onOpenVehicles={() => setVehicleSheetOpen(true)}
          onOpenNotifications={() => router.push('/notifications')}
        />
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + CONTROL_RAIL_TOP,
          [locale === 'ar' ? 'left' : 'right']: screenPadding,
        }}
      >
        <MapControlRail
          locationStatus={locationStatus}
          locationMessage={locationMessage}
          roadAlertCount={alerts.length}
          entryOpen={entryMenuOpen}
          onLocate={() => void recenter()}
          onToggleEntry={() => setEntryMenuOpen((open) => !open)}
          onScanQr={() => {
            setEntryMenuOpen(false);
            router.push('/scan');
          }}
          onEnterCode={() => {
            setEntryMenuOpen(false);
            setCodeSheetOpen(true);
          }}
          onOpenRoads={() => router.push('/roads')}
        />
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: TAB_BAR_CLEARANCE + insets.bottom,
          left: 0,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        {bannerSession ? (
          <ActiveSessionBanner
            session={bannerSession}
            vehicle={bannerVehicle}
            extraCount={activeSessions.length - 1}
            onPress={() => router.push(`/parking/active/${bannerSession.id}`)}
          />
        ) : null}

        {__DEV__ ? (
          <View style={{ alignItems: 'flex-end' }}>
            <TestLocationControl
              enabled={testLocationMode}
              hasLocation={Boolean(testLocation)}
              onToggle={toggleTestLocation}
            />
          </View>
        ) : null}

        {routeZone ? (
          <CompactRoutePanel
            zone={routeZone}
            route={route}
            loading={routeLoading}
            detailsExpanded={routeDetailsExpanded}
            onDetailsExpandedChange={setRouteDetailsExpanded}
            onClose={closeRoute}
            onOpenMaps={() => openInMaps(routeZone)}
            onStartParking={() => startParking(routeZone)}
            startDisabled={routeZone.parkingAllowed === false}
          />
        ) : (
          <NearbyParkingPanel
            zones={nearbyZones}
            expanded={nearbyExpanded}
            onExpandedChange={setNearbyExpanded}
            onSelectZone={focusZone}
          />
        )}
      </View>

      <VehicleSelectorSheet
        visible={vehicleSheetOpen}
        onClose={() => setVehicleSheetOpen(false)}
        vehicles={vehicles}
        selectedId={selected?.id}
        activeVehicleIds={activeVehicleIds}
        onSelect={(vehicle) => {
          select(vehicle.id);
          setVehicleSheetOpen(false);
        }}
        onAddVehicle={() => {
          setVehicleSheetOpen(false);
          router.push('/vehicles/add');
        }}
      />

      <ZoneSheet
        zone={selectedZone}
        visible={Boolean(selectedZone)}
        onClose={() => setSelectedZoneId(undefined)}
        distanceMeters={
          selectedZone && (testLocation ?? location)
            ? distanceMeters((testLocation ?? location)!, selectedZone.location)
            : undefined
        }
        onNavigate={(zone) => void showRoute(zone)}
        onStartParking={startParking}
        startDisabled={selectedZone?.parkingAllowed === false}
      />

      <ZoneCodeSheet
        visible={codeSheetOpen}
        onClose={() => setCodeSheetOpen(false)}
        onResolved={(zone) => {
          setCodeSheetOpen(false);
          openZone(zone);
        }}
        onScanQr={() => {
          setCodeSheetOpen(false);
          router.push('/scan');
        }}
      />
    </View>
  );
}
