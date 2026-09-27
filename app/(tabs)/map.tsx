import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { MapSurface } from '@/components/map/MapSurface';
import type { MapCheckpoint, MapLandmark, MapRoute, MapSurfaceHandle } from '@/components/map/types';
import { MapTopBar } from '@/components/map/MapTopBar';
import { MapControlRail } from '@/components/map/MapControlRail';
import { NearbyParkingPanel } from '@/components/map/NearbyParkingPanel';
import type { NearbyZone } from '@/components/map/CompactZoneCard';
import { CompactRoutePanel } from '@/components/map/CompactRoutePanel';
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
import { DEFAULT_REGION, LANDMARKS, RAMALLAH_CENTER } from '@/services';
import type { GeoPoint, GeoRegion, ParkingZone } from '@/types';
import { distanceMeters } from '@/utils/geo';
import { findLandmark } from '@/utils/landmarkSearch';
import { haptics } from '@/utils/haptics';

/** Clears the custom floating tab bar, including the native bottom safe area. */
const TAB_BAR_CLEARANCE = 72;
/** The control rail starts just below the compact vehicle/search cluster. */
const CONTROL_RAIL_TOP = 116;

/** ~10 m precision keeps GPS jitter from producing new route queries. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function regionAround(points: GeoPoint[]): GeoRegion {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(0.01, (maxLatitude - minLatitude) * 1.6),
    longitudeDelta: Math.max(0.01, (maxLongitude - minLongitude) * 1.6),
  };
}

export default function MapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useLocale();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<GeoRegion>(DEFAULT_REGION);
  const [selectedZone, setSelectedZone] = useState<ParkingZone>();
  const [routeZone, setRouteZone] = useState<ParkingZone>();
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [routeDetailsExpanded, setRouteDetailsExpanded] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string>();

  const trimmedSearch = search.trim();
  const landmark = useMemo(
    () => (trimmedSearch.length >= 3 ? findLandmark(trimmedSearch, LANDMARKS)?.landmark : undefined),
    [trimmedSearch],
  );

  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [] } = useZones(landmark ? undefined : trimmedSearch || undefined);
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: checkpoints = [] } = useCheckpoints();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  // Location is deliberately opt-in: Ramallah remains the opening view until locate is pressed.
  const { location, status: locationStatus, request: requestLocation } = useUserLocation(false);

  const bannerSession = useMemo(
    () => activeSessions.find((session) => session.vehicleId === selected?.id) ?? activeSessions[0],
    [activeSessions, selected?.id],
  );
  const bannerVehicle = vehicles.find((vehicle) => vehicle.id === bannerSession?.vehicleId);
  const activeVehicleIds = activeSessions.map((session) => session.vehicleId);

  const nearbyOrigin = useMemo<GeoPoint>(
    () => landmark?.location ?? location ?? { latitude: region.latitude, longitude: region.longitude },
    [landmark, location, region.latitude, region.longitude],
  );
  const nearbyZones = useMemo<NearbyZone[]>(
    () =>
      zones
        .map((zone) => ({ zone, distanceMeters: distanceMeters(nearbyOrigin, zone.location) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    [zones, nearbyOrigin],
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

  const mapLandmark = useMemo<MapLandmark | undefined>(
    () =>
      landmark
        ? { name: locale === 'ar' ? landmark.nameAr : landmark.nameEn, location: landmark.location }
        : undefined,
    [landmark, locale],
  );

  const routeOrigin = useMemo<GeoPoint>(
    () =>
      location
        ? { latitude: round4(location.latitude), longitude: round4(location.longitude) }
        : RAMALLAH_CENTER,
    [location],
  );
  const { data: route, isFetching: routeLoading } = useRoute(
    routeZone ? routeOrigin : undefined,
    routeZone?.location,
  );
  const mapRoute = useMemo<MapRoute | undefined>(
    () =>
      routeZone && route
        ? { coordinates: route.coordinates, alternatives: route.rejected.map((item) => item.coordinates) }
        : undefined,
    [route, routeZone],
  );

  useEffect(() => {
    if (!mapRoute) return;
    const next = regionAround(mapRoute.coordinates);
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [mapRoute]);

  useEffect(() => {
    if (!landmark) return;
    const next: GeoRegion = { ...landmark.location, latitudeDelta: 0.012, longitudeDelta: 0.012 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }, [landmark]);

  useEffect(() => {
    if (!locationMessage) return;
    const timeout = setTimeout(() => setLocationMessage(undefined), 3600);
    return () => clearTimeout(timeout);
  }, [locationMessage]);

  const recenter = useCallback(async () => {
    setEntryMenuOpen(false);
    setLocationMessage(undefined);
    haptics.light();
    const point = location ?? (await requestLocation());
    if (!point) {
      setLocationMessage(t('map.locationDeniedBody'));
      return;
    }
    const next: GeoRegion = { ...point, latitudeDelta: 0.014, longitudeDelta: 0.014 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [location, requestLocation, t]);

  const openZone = useCallback((zone: ParkingZone) => {
    haptics.select();
    setEntryMenuOpen(false);
    setNearbyExpanded(false);
    setRouteZone(undefined);
    setRouteDetailsExpanded(false);
    setSelectedZone(zone);
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
      setSelectedZone(undefined);
      setRouteZone(undefined);
      setRouteDetailsExpanded(false);
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const showRoute = useCallback((zone: ParkingZone) => {
    haptics.select();
    setSelectedZone(undefined);
    setNearbyExpanded(false);
    setRouteDetailsExpanded(false);
    setRouteZone(zone);
  }, []);

  const closeRoute = useCallback(() => {
    setRouteZone(undefined);
    setRouteDetailsExpanded(false);
  }, []);

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
        zones={nearbyZones.map((item) => item.zone)}
        selectedZoneId={selectedZone?.id ?? routeZone?.id}
        onSelectZone={openZone}
        onPressBackground={() => {
          setSelectedZone(undefined);
          setEntryMenuOpen(false);
        }}
        userLocation={location}
        onRegionChangeComplete={setRegion}
        checkpoints={mapCheckpoints}
        onSelectCheckpoint={() => router.push('/roads')}
        route={mapRoute}
        landmark={mapLandmark}
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
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setEntryMenuOpen(false);
            setRouteZone(undefined);
            setRouteDetailsExpanded(false);
          }}
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
        onClose={() => setSelectedZone(undefined)}
        distanceMeters={
          selectedZone ? distanceMeters(nearbyOrigin, selectedZone.location) : undefined
        }
        onNavigate={showRoute}
        onStartParking={startParking}
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
