import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bell, ChevronDown, LocateFixed, QrCode, Hash } from 'lucide-react-native';

import {
  AppText,
  Card,
  IconButton,
  PressableScale,
  Reveal,
  SearchField,
} from '@/components/ui';
import { MapSurface } from '@/components/map/MapSurface';
import type { MapSurfaceHandle } from '@/components/map/types';
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
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useCurrentUser } from '@/hooks/useSession';
import { useUserLocation } from '@/hooks/useUserLocation';
import { DEFAULT_REGION } from '@/services';
import type { GeoRegion, ParkingZone } from '@/types';
import { distanceMeters } from '@/utils/geo';
import { haptics } from '@/utils/haptics';

/** Bottom padding so the nearby list clears the floating tab bar. */
const TAB_BAR_CLEARANCE = 96;

function greetingKey(): 'map.greetingMorning' | 'map.greetingAfternoon' | 'map.greetingEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'map.greetingMorning';
  if (hour < 17) return 'map.greetingAfternoon';
  return 'map.greetingEvening';
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
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);

  const { user } = useCurrentUser();
  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [] } = useZones(search.trim() || undefined);
  const { data: activeSessions = [] } = useActiveSessions();
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
    if (!location) return zones;
    return [...zones].sort(
      (a, b) => distanceMeters(location, a.location) - distanceMeters(location, b.location),
    );
  }, [zones, location]);

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
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const navigateToZone = useCallback((zone: ParkingZone) => {
    const { latitude, longitude } = zone.location;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(zone.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    void Linking.openURL(url).catch(() => undefined);
  }, []);

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
          top: insets.top + 150,
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
            setCodeSheetOpen(true);
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

      {/* ---- Bottom stack: banner + nearby rail -------------------------- */}
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

        <View style={{ gap: spacing.sm }}>
          <View style={{ paddingHorizontal: screenPadding, flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
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
        onNavigate={navigateToZone}
        onStartParking={startParking}
      />

      <ZoneCodeSheet
        visible={codeSheetOpen}
        onClose={() => setCodeSheetOpen(false)}
        onResolved={(zone) => {
          setCodeSheetOpen(false);
          openZone(zone);
        }}
      />
    </View>
  );
}
