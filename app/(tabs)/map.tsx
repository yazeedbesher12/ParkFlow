import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Bell,
  ChevronDown,
  Hash,
  LocateFixed,
  MapPin,
  Navigation,
  QrCode,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react-native';

import {
  AppButton,
  AppText,
  Card,
  IconButton,
  PressableScale,
  Reveal,
  SearchField,
} from '@/components/ui';
import { MapSurface } from '@/components/map/MapSurface';
import type { MapCheckpoint, MapLandmark, MapRoute, MapSurfaceHandle } from '@/components/map/types';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { VehicleSelectorSheet } from '@/components/domain/VehicleSelectorSheet';
import { ZoneSheet } from '@/components/domain/ZoneSheet';
import { ActiveSessionBanner } from '@/components/domain/ActiveSessionBanner';
import { ZoneCodeSheet } from '@/components/domain/ZoneCodeSheet';
import { ZoneCard } from '@/components/domain/ZoneCard';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { useLocale } from '@/hooks/useLocale';
import { useSelectedVehicle } from '@/hooks/useVehicles';
import { useActiveSessions, useZones } from '@/hooks/useParking';
import { useCheckpoints, useRoute } from '@/hooks/useCommunity';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useCurrentUser } from '@/hooks/useSession';
import { useUserLocation } from '@/hooks/useUserLocation';
import { DEFAULT_REGION, LANDMARKS } from '@/services';
import type { GeoPoint, GeoRegion, ParkingZone, RouteClosure, RouteResult } from '@/types';
import { distanceMeters, formatDistance } from '@/utils/geo';
import { findLandmark } from '@/utils/landmarkSearch';
import { haptics } from '@/utils/haptics';

/** Bottom padding so the nearby list clears the floating tab bar. */
const TAB_BAR_CLEARANCE = 96;
/** Height the alert / landmark card adds under the search bar. */
const HEADER_CARD_HEIGHT = 76;
/**
 * Where routes start when location is off: Birzeit University, far enough out
 * that the route is worth showing. Always labelled as a demo start in the UI.
 */
const DEMO_ORIGIN: GeoPoint = { latitude: 31.96128, longitude: 35.18426 };

/** ~10 m precision — keeps GPS jitter from re-requesting the route. */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function greetingKey(): 'map.greetingMorning' | 'map.greetingAfternoon' | 'map.greetingEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'map.greetingMorning';
  if (hour < 17) return 'map.greetingAfternoon';
  return 'map.greetingEvening';
}

/** A region that frames every point, with a margin. */
function regionAround(points: GeoPoint[]): GeoRegion {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.6),
  };
}

/** What the route does about closures: avoids them, passes them, or finds none. */
function RouteNotes({ route }: { route: RouteResult }) {
  const { colors } = useTheme();
  const { t, row, locale } = useLocale();
  const nameOf = (c: RouteClosure) => (locale === 'ar' ? c.nameAr : c.nameEn);
  const statusOf = (c: RouteClosure) => t(`roads.status.${c.status}` as const);

  const avoided = [
    ...new Map(
      route.rejected.flatMap((r) => (r.blockedBy ? [[r.blockedBy.checkpointId, r.blockedBy] as const] : [])),
    ).values(),
  ].filter((c) => !route.closuresOnRoute.some((on) => on.checkpointId === c.checkpointId));

  const lines: { key: string; ok: boolean; text: string }[] = [];
  if (route.source === 'straight-line') {
    lines.push({ key: 'approx', ok: false, text: t('route.approximate') });
  }
  for (const closure of route.closuresOnRoute) {
    lines.push({
      key: `on-${closure.checkpointId}`,
      ok: false,
      text: t('route.passes', { name: nameOf(closure), status: statusOf(closure) }),
    });
  }
  for (const closure of avoided) {
    lines.push({
      key: `avoid-${closure.checkpointId}`,
      ok: true,
      text: t('route.avoids', { name: nameOf(closure), status: statusOf(closure) }),
    });
  }
  if (!route.closuresOnRoute.length && !avoided.length) {
    lines.push({ key: 'clear', ok: true, text: t('route.clear') });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      {lines.map((line) => (
        <View key={line.key} style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          {line.ok ? (
            <ShieldCheck size={16} color={colors.success} strokeWidth={2.2} />
          ) : (
            <TriangleAlert size={16} color={colors.warning} strokeWidth={2.2} />
          )}
          <AppText
            variant="bodySm"
            color={line.ok ? 'successText' : 'warningText'}
            style={{ flex: 1 }}
          >
            {line.text}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, locale } = useLocale();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<GeoRegion>(DEFAULT_REGION);
  const [selectedZone, setSelectedZone] = useState<ParkingZone | undefined>();
  const [routeZone, setRouteZone] = useState<ParkingZone | undefined>();
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);

  const trimmedSearch = search.trim();
  // "قرب دوار المنارة" is a place, not a zone name: resolve it and show the
  // parking around it instead of filtering zones by name.
  const landmark = useMemo(
    () => (trimmedSearch.length >= 3 ? findLandmark(trimmedSearch, LANDMARKS)?.landmark : undefined),
    [trimmedSearch],
  );

  const { user } = useCurrentUser();
  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [] } = useZones(landmark ? undefined : trimmedSearch || undefined);
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: checkpoints = [] } = useCheckpoints();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { location, status: locationStatus, request: requestLocation } = useUserLocation();

  // The session shown in the banner is the one for the currently selected
  // vehicle when it has one, otherwise the most recent — a driver switching
  // vehicles should see that vehicle's timer.
  const bannerSession = useMemo(() => {
    if (!activeSessions.length) return undefined;
    return activeSessions.find((s) => s.vehicleId === selected?.id) ?? activeSessions[0];
  }, [activeSessions, selected?.id]);

  const bannerVehicle = vehicles.find((v) => v.id === bannerSession?.vehicleId);
  const activeVehicleIds = activeSessions.map((s) => s.vehicleId);

  const sortedZones = useMemo(() => {
    const origin = landmark?.location ?? location;
    if (!origin) return zones;
    return [...zones].sort(
      (a, b) => distanceMeters(origin, a.location) - distanceMeters(origin, b.location),
    );
  }, [zones, location, landmark]);

  // ---- Road alerts --------------------------------------------------------
  const alerts = useMemo(
    () =>
      checkpoints
        .filter((c) => !c.assumed && c.status !== 'open')
        .sort(
          (a, b) =>
            Number(b.status === 'closed') - Number(a.status === 'closed') ||
            (a.minutesSinceReport ?? 0) - (b.minutesSinceReport ?? 0),
        ),
    [checkpoints],
  );
  const topAlert = alerts[0];

  const mapCheckpoints = useMemo<MapCheckpoint[]>(
    () =>
      checkpoints.map((c) => ({
        id: c.id,
        name: locale === 'ar' ? c.nameAr : c.nameEn,
        location: c.location,
        status: c.status,
        assumed: c.assumed,
      })),
    [checkpoints, locale],
  );

  const mapLandmark = useMemo<MapLandmark | undefined>(
    () =>
      landmark
        ? { name: locale === 'ar' ? landmark.nameAr : landmark.nameEn, location: landmark.location }
        : undefined,
    [landmark, locale],
  );

  // ---- Checkpoint-aware route --------------------------------------------
  const routeOrigin = useMemo<GeoPoint>(
    () =>
      location
        ? { latitude: round4(location.latitude), longitude: round4(location.longitude) }
        : DEMO_ORIGIN,
    [location],
  );
  const { data: route, isFetching: routeLoading } = useRoute(
    routeZone ? routeOrigin : undefined,
    routeZone?.location,
  );
  const mapRoute = useMemo<MapRoute | undefined>(
    () =>
      routeZone && route
        ? { coordinates: route.coordinates, alternatives: route.rejected.map((r) => r.coordinates) }
        : undefined,
    [route, routeZone],
  );

  // Frame the whole route once it arrives.
  useEffect(() => {
    if (!mapRoute) return;
    const next = regionAround(mapRoute.coordinates);
    setRegion(next);
    mapRef.current?.animateToRegion(next);
  }, [mapRoute]);

  // Fly to the landmark a search resolved to.
  useEffect(() => {
    if (!landmark) return;
    const next: GeoRegion = { ...landmark.location, latitudeDelta: 0.012, longitudeDelta: 0.012 };
    setRegion(next);
    mapRef.current?.animateToRegion(next);
  }, [landmark]);

  const recenter = useCallback(async () => {
    haptics.light();
    const point = location ?? (await requestLocation());
    const next: GeoRegion = point
      ? { ...point, latitudeDelta: 0.014, longitudeDelta: 0.014 }
      : DEFAULT_REGION;
    setRegion(next);
    mapRef.current?.animateToRegion(next);
  }, [location, requestLocation]);

  const openZone = useCallback((zone: ParkingZone) => {
    haptics.select();
    setSelectedZone(zone);
  }, []);

  const startParking = useCallback(
    (zone: ParkingZone) => {
      setSelectedZone(undefined);
      setRouteZone(undefined);
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const showRoute = useCallback((zone: ParkingZone) => {
    haptics.select();
    setSelectedZone(undefined);
    setRouteZone(zone);
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

  const zoneName = (zone: ParkingZone) => (locale === 'ar' ? zone.nameAr : zone.name);
  const hasHeaderCard = Boolean(landmark || topAlert);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      <MapSurface
        ref={mapRef}
        region={region}
        zones={sortedZones}
        selectedZoneId={selectedZone?.id}
        onSelectZone={openZone}
        onPressBackground={() => setSelectedZone(undefined)}
        userLocation={location}
        onRegionChangeComplete={setRegion}
        checkpoints={mapCheckpoints}
        onSelectCheckpoint={() => router.push('/roads')}
        route={mapRoute}
        landmark={mapLandmark}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* ---- Floating header ------------------------------------------- */}
      <View
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: screenPadding, gap: spacing.md }}
      >
        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
          <PressableScale
            onPress={() => {
              haptics.select();
              setVehicleSheetOpen(true);
            }}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={
              selected ? `${selected.displayName}, ${selected.plateNumber}` : t('vehicle.select')
            }
            accessibilityHint={t('parking.wrongVehicle')}
            style={[
              {
                flex: 1,
                flexDirection: row,
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm + 2,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
              },
              shadow.md,
            ]}
            testID="vehicle-selector"
          >
            <View style={{ flex: 1, gap: 3 }}>
              {user?.fullName ? (
                <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                  {t(greetingKey())}, {user.fullName.split(' ')[0]}
                </AppText>
              ) : null}
              <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {selected?.displayName ?? t('vehicle.addNew')}
                </AppText>
                {selected ? <PlateBadge plateNumber={selected.plateNumber} size="sm" /> : null}
              </View>
            </View>
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2.4} />
          </PressableScale>

          <View>
            <IconButton
              icon={<Bell size={20} color={colors.text} strokeWidth={2.2} />}
              onPress={() => router.push('/notifications')}
              accessibilityLabel={t('notifications.title')}
            />
            {unreadCount > 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.danger,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
              >
                <AppText variant="caption" numeric style={{ color: colors.textOnColor, fontSize: 10 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t('map.search')}
          style={shadow.md}
          testID="map-search"
        />

        {landmark && mapLandmark ? (
          <Card
            tone="plain"
            padding="md"
            style={[{ flexDirection: row, alignItems: 'center', gap: spacing.md }, shadow.sm]}
          >
            <MapPin size={20} color={colors.info} strokeWidth={2.2} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title" numberOfLines={1}>
                {t('map.nearLandmark', { name: mapLandmark.name })}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {t('map.nearLandmarkBody')}
              </AppText>
            </View>
            <IconButton
              icon={<X size={18} color={colors.textSecondary} strokeWidth={2.2} />}
              onPress={() => setSearch('')}
              accessibilityLabel={t('map.clearSearch')}
              size={36}
            />
          </Card>
        ) : topAlert ? (
          <Card
            tone="plain"
            padding="md"
            onPress={() => router.push('/roads')}
            accessibilityLabel={t('roads.title')}
            style={[{ flexDirection: row, alignItems: 'center', gap: spacing.md }, shadow.sm]}
          >
            <TriangleAlert
              size={20}
              color={topAlert.status === 'closed' ? colors.danger : colors.warning}
              strokeWidth={2.2}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title">{t('roads.banner', { count: alerts.length })}</AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {t('roads.bannerBody', {
                  name: locale === 'ar' ? topAlert.nameAr : topAlert.nameEn,
                  status: t(`roads.status.${topAlert.status}` as const),
                  minutes: topAlert.minutesSinceReport ?? 0,
                })}
              </AppText>
            </View>
          </Card>
        ) : null}

        {locationStatus === 'denied' ? (
          <Reveal>
            <Card tone="plain" padding="md" style={shadow.sm}>
              <AppText variant="title">{t('map.locationDenied')}</AppText>
              <AppText variant="bodySm" color="textSecondary">
                {t('map.locationDeniedBody')}
              </AppText>
            </Card>
          </Reveal>
        ) : null}
      </View>

      {/* ---- Map side controls ------------------------------------------ */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 150 + (hasHeaderCard ? HEADER_CARD_HEIGHT : 0),
          [locale === 'ar' ? 'left' : 'right']: screenPadding,
          gap: spacing.sm,
        }}
      >
        <IconButton
          icon={<LocateFixed size={20} color={colors.text} strokeWidth={2.2} />}
          onPress={recenter}
          accessibilityLabel={t('map.recenter')}
        />
        <IconButton
          icon={<QrCode size={20} color={colors.text} strokeWidth={2.2} />}
          onPress={() => {
            haptics.light();
            router.push('/scan');
          }}
          accessibilityLabel={t('map.scanQr')}
        />
        <IconButton
          icon={<Hash size={20} color={colors.text} strokeWidth={2.2} />}
          onPress={() => {
            haptics.light();
            setCodeSheetOpen(true);
          }}
          accessibilityLabel={t('map.enterCode')}
        />
      </View>

      {/* ---- Bottom stack: banner + nearby rail or route card ------------ */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: TAB_BAR_CLEARANCE + insets.bottom,
          gap: spacing.md,
        }}
      >
        {bannerSession ? (
          <ActiveSessionBanner
            session={bannerSession}
            vehicle={bannerVehicle}
            extraCount={activeSessions.length - 1}
            onPress={() => router.push(`/parking/active/${bannerSession.id}`)}
            style={{ paddingHorizontal: screenPadding }}
          />
        ) : null}

        {routeZone ? (
          <View style={{ paddingHorizontal: screenPadding }}>
            <Card padding="lg" style={[{ gap: spacing.md }, shadow.md]}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="titleLg" numberOfLines={1}>
                    {t('route.title', { name: zoneName(routeZone) })}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                    {location ? t('route.fromYou') : t('route.fromDemo')}
                  </AppText>
                </View>
                <IconButton
                  icon={<X size={18} color={colors.textSecondary} strokeWidth={2.2} />}
                  onPress={() => setRouteZone(undefined)}
                  accessibilityLabel={t('route.close')}
                  size={36}
                />
              </View>

              {route ? (
                <>
                  <AppText variant="h3" numeric>
                    {t('route.summary', {
                      minutes: Math.max(1, Math.round(route.durationSeconds / 60)),
                      distance: formatDistance(route.distanceMeters),
                    })}
                  </AppText>
                  <RouteNotes route={route} />
                </>
              ) : routeLoading ? (
                <AppText variant="bodySm" color="textSecondary">
                  {t('route.loading')}
                </AppText>
              ) : null}

              <View style={{ flexDirection: row, gap: spacing.sm }}>
                <AppButton
                  label={t('route.openMaps')}
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => openInMaps(routeZone)}
                  icon={<Navigation size={16} color={colors.text} strokeWidth={2.2} />}
                />
                <AppButton
                  label={t('zone.startParking')}
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => startParking(routeZone)}
                />
              </View>
            </Card>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                paddingHorizontal: screenPadding,
                flexDirection: row,
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <AppText variant="label" color="textSecondary">
                {t('map.nearby')}
              </AppText>
              <AppText variant="caption" color="textTertiary" numeric>
                {t('map.zonesFound', { count: sortedZones.length })}
              </AppText>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: screenPadding,
                gap: spacing.md,
                flexDirection: row,
              }}
            >
              {sortedZones.slice(0, 8).map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  distanceMeters={location ? distanceMeters(location, zone.location) : undefined}
                  onPress={() => {
                    openZone(zone);
                    const focused = { ...zone.location, latitudeDelta: 0.01, longitudeDelta: 0.01 };
                    setRegion(focused);
                    mapRef.current?.animateToRegion(focused);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ---- Sheets ------------------------------------------------------ */}
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
          location && selectedZone ? distanceMeters(location, selectedZone.location) : undefined
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
