import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { RoadReportLocationPanel } from '@/components/map/RoadReportLocationPanel';
import { RoadReportCreationSheet, type ReportCreationStep } from '@/components/map/RoadReportCreationSheet';
import { RoadReportDetailsSheet } from '@/components/map/RoadReportDetailsSheet';
import { MapLayersSheet } from '@/components/map/MapLayersSheet';
import { EvStationDetailsSheet } from '@/components/map/EvStationDetailsSheet';
import { EvFiltersSheet } from '@/components/map/EvFiltersSheet';
import { EvMapStatus } from '@/components/map/EvMapStatus';
import { CarServiceDetailsSheet } from '@/components/map/CarServiceDetailsSheet';
import { CarServiceMapStatus } from '@/components/map/CarServiceMapStatus';
import { DestinationSearchBox } from '@/components/map/DestinationSearchBox';
import { DestinationParkingPanel } from '@/components/map/DestinationParkingPanel';
import { useEvStations } from '@/hooks/useEvStations';
import { useCarServices } from '@/hooks/useCarServices';
import { carServiceDestination, evDestination, parkingDestination, type CarServiceBusiness, type EvChargingStation, type RouteDestination } from '@/types';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useSelectedVehicle } from '@/hooks/useVehicles';
import { useActiveSessions, useZones } from '@/hooks/useParking';
import { useCheckpoints, useRoute } from '@/hooks/useCommunity';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useCreateRoadReport, useRoadReports } from '@/hooks/useRoadReports';
import { DEFAULT_REGION } from '@/services';
import type { CreateRoadReportInput, GeoPoint, GeoRegion, ParkingZone, RamallahParkingLocation, RoadReport, RoadReportType, RouteResult } from '@/types';
import { distanceMeters } from '@/utils/geo';
import { assessRouteAlternatives } from '@/utils/routeImpact';
import { haptics } from '@/utils/haptics';
import { isValidGeoPoint, normalizeGeoPoint, normalizeGeoPoints } from '@/utils/coordinates';
import { searchPlaces, type PlaceSuggestion } from '@/services/placeSearchService';
import { rankParkingForDestination } from '@/utils/parkingRecommendation';
import { useMapLayersStore } from '@/store/mapLayersStore';
import { useReservationRouteStore } from '@/store/reservationRouteStore';
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
  const routeStartInFlightRef = useRef(false);
  const [mapFocused, setMapFocused] = useState(false);
  const [region, setRegion] = useState<GeoRegion>(DEFAULT_REGION);
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [routeTarget, setRouteTarget] = useState<RouteDestination>();
  const routeZone = routeTarget?.type === 'parking' ? routeTarget.zone : undefined;
  const [evFiltersOpen, setEvFiltersOpen] = useState(false);
  const [routeOriginOverride, setRouteOriginOverride] = useState<GeoPoint>();
  const [testLocationMode, setTestLocationMode] = useState(
    () => useReservationRouteStore.getState().originMode === 'test',
  );
  const [testLocation, setTestLocation] = useState<GeoPoint | undefined>(() => {
    const state = useReservationRouteStore.getState();
    return state.originMode === 'test' ? normalizeGeoPoint(state.origin) : undefined;
  });
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [routeDetailsExpanded, setRouteDetailsExpanded] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('current');
  const [alternativeDismissed, setAlternativeDismissed] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string>();
  const [reportStep, setReportStep] = useState<ReportCreationStep>();
  const [reportLocationPicking, setReportLocationPicking] = useState(false);
  const [reportDraft, setReportDraft] = useState<Partial<CreateRoadReportInput>>({});
  const [selectedReport, setSelectedReport] = useState<RoadReport>();
  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<PlaceSuggestion>();

  useFocusEffect(
    useCallback(() => {
      setMapFocused(true);
      return () => setMapFocused(false);
    }, []),
  );

  const primaryMapCategory = useMapLayersStore((state) => state.primaryCategory);
  const carServiceCategory = useMapLayersStore((state) => state.carServiceCategory);
  const pendingReservationRouteZoneId = useReservationRouteStore((state) => state.pendingZoneId);
  const storedRouteOrigin = useReservationRouteStore((state) => state.origin);
  const storedRouteOriginMode = useReservationRouteStore((state) => state.originMode);
  const evActive = primaryMapCategory === 'ev_charging';
  const ev = useEvStations(evActive, region);
  const carServicesActive = primaryMapCategory === 'car_services';
  const carServices = useCarServices(carServicesActive, region, carServiceCategory);
  useEffect(() => { if (!evActive) setEvFiltersOpen(false); }, [evActive]);
  const roadReportsEnabled = useMapLayersStore((state) => state.roadReportsEnabled);
  const businessOffersEnabled = useMapLayersStore((state) => state.businessOffersEnabled);
  const enabledLayerCount = 1 + Number(roadReportsEnabled) + Number(businessOffersEnabled);

  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [], isPending: zonesPending } = useZones();
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: checkpoints = [] } = useCheckpoints();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  // Location is deliberately opt-in: Ramallah remains the opening view until locate is pressed.
  const { location, status: locationStatus, request: requestLocation } = useUserLocation(false);
  const reportBounds = useMemo(() => ({
    north: round4(Math.min(90, region.latitude + region.latitudeDelta / 2)),
    south: round4(Math.max(-90, region.latitude - region.latitudeDelta / 2)),
    east: round4(Math.min(180, region.longitude + region.longitudeDelta / 2)),
    west: round4(Math.max(-180, region.longitude - region.longitudeDelta / 2)),
  }), [region]);
  const { data: roadReports = [] } = useRoadReports(reportBounds);
  const createReport = useCreateRoadReport();
  const selectedZone = useMemo(
    () =>
      zones.find((zone) => zone.id === selectedZoneId) ??
      ramallahParkingZones.find((zone) => zone.id === selectedZoneId),
    [selectedZoneId, zones],
  );

  useEffect(() => {
    setSelectedZoneId(undefined);
  }, [primaryMapCategory]);

  useEffect(() => {
    if (!roadReportsEnabled) setSelectedReport(undefined);
  }, [roadReportsEnabled]);

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
  const destinationRecommendations = useMemo(
    () => selectedDestination
      ? rankParkingForDestination(selectedDestination.location, [...zones, ...ramallahParkingZones])
      : [],
    [selectedDestination, zones],
  );

  useEffect(() => {
    const query = destinationQuery.trim();
    if (query.length < 2 || selectedDestination?.name === destinationQuery) {
      setPlaceSuggestions([]);
      setPlaceSearchLoading(false);
      setPlaceSearchError(false);
      return;
    }
    let cancelled = false;
    setPlaceSearchLoading(true);
    setPlaceSearchError(false);
    const timeout = setTimeout(() => {
      searchPlaces(query, { center: { latitude: region.latitude, longitude: region.longitude } })
        .then((results) => {
          if (!cancelled) setPlaceSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) {
            setPlaceSuggestions([]);
            setPlaceSearchError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setPlaceSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [destinationQuery, region.latitude, region.longitude, selectedDestination?.name]);

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
      alerts.filter((checkpoint) => !roadReports.some((report) => report.type === 'checkpoint' && distanceMeters(report, checkpoint.location) < 80)).map((checkpoint) => ({
        id: checkpoint.id,
        name: locale === 'ar' ? checkpoint.nameAr : checkpoint.nameEn,
        location: checkpoint.location,
        status: checkpoint.status,
        assumed: checkpoint.assumed,
      })),
    [alerts, locale, roadReports],
  );

  const routeOrigin = useMemo<GeoPoint | undefined>(
    () => {
      const normalizedTestLocation = normalizeGeoPoint(testLocation);
      if (normalizedTestLocation) return normalizedTestLocation;
      const normalizedLocation = normalizeGeoPoint(location);
      if (normalizedLocation) {
        return {
          latitude: round4(normalizedLocation.latitude),
          longitude: round4(normalizedLocation.longitude),
        };
      }
      return normalizeGeoPoint(routeOriginOverride) ?? normalizeGeoPoint(storedRouteOrigin);
    },
    [testLocation, location, routeOriginOverride, storedRouteOrigin],
  );
  const routeDestination = useMemo(
    () => normalizeGeoPoint(routeTarget?.location),
    [routeTarget],
  );
  const { data: route, isFetching: routeLoading, isError: routeError } = useRoute(
    routeDestination ? routeOrigin : undefined,
    routeDestination,
    routeTarget ? FASTEST_PARKING_ROUTE : undefined,
  );
  useEffect(() => {
    setSelectedRouteId('current');
    setAlternativeDismissed(false);
  }, [routeTarget?.type, routeTarget?.id, routeOrigin?.latitude, routeOrigin?.longitude]);
  useEffect(() => {
    if (routeError) setLocationMessage(t('ramallahParking.routeUnavailable'));
  }, [routeError, t]);
  useEffect(() => {
    if (selectedRouteId !== 'current' && route && !route.alternatives.some((alternative) => alternative.id === selectedRouteId)) {
      setSelectedRouteId('current');
      setAlternativeDismissed(false);
    }
  }, [route, selectedRouteId]);
  const routeAssessment = useMemo(
    () => route?.source === 'osrm'
      ? assessRouteAlternatives(route, roadReports, routeOrigin)
      : undefined,
    [roadReports, route, routeOrigin],
  );
  const selectedAlternative = useMemo(
    () => route?.alternatives.find((alternative) => alternative.id === selectedRouteId),
    [route, selectedRouteId],
  );
  const displayedRoute = useMemo<RouteResult | undefined>(() => {
    if (!route || !selectedAlternative) return route;
    return {
      ...route,
      coordinates: selectedAlternative.coordinates,
      distanceMeters: selectedAlternative.distanceMeters,
      durationSeconds: selectedAlternative.durationSeconds,
      penaltySeconds: 0,
      closuresOnRoute: [],
      trafficSegments: undefined,
      trafficSummary: undefined,
    };
  }, [route, selectedAlternative]);
  const activeRouteAssessment = selectedRouteId === 'current'
    ? routeAssessment?.current
    : routeAssessment?.alternatives.find((alternative) => alternative.id === selectedRouteId);
  const mapRoute = useMemo<MapRoute | undefined>(
    () => {
      if (!routeDestination || displayedRoute?.source !== 'osrm') return undefined;
      const coordinates = normalizeGeoPoints(displayedRoute.coordinates);
      if (coordinates.length < 2) return undefined;
      const alternativeLines = selectedRouteId === 'current'
        ? displayedRoute.alternatives.map((item) => item.coordinates)
        : [
            route!.coordinates,
            ...route!.alternatives
              .filter((item) => item.id !== selectedRouteId)
              .map((item) => item.coordinates),
          ];
      return {
        coordinates,
        trafficState: displayedRoute.trafficSummary?.state,
        trafficSegments: displayedRoute.trafficSegments
          ?.map((segment) => ({
            ...segment,
            coordinates: normalizeGeoPoints(segment.coordinates),
          }))
          .filter((segment) => segment.coordinates.length >= 2),
        alternatives: alternativeLines
          .map(normalizeGeoPoints)
          .filter((line) => line.length >= 2),
      };
    },
    [displayedRoute, route, routeDestination, selectedRouteId],
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
    useReservationRouteStore.getState().setOrigin(point, 'gps');
    const next: GeoRegion = { ...point, latitudeDelta: 0.014, longitudeDelta: 0.014 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [testLocationMode, testLocation, location, requestLocation, t]);

  const openZone = useCallback((zone: ParkingZone) => {
    haptics.select();
    setEntryMenuOpen(false);
    setNearbyExpanded(false);
    setRouteTarget(undefined);
    setSelectedDestination(undefined);
    setRouteDetailsExpanded(false);
    setSelectedZoneId(zone.id);
    setSelectedReport(undefined);
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
      setRouteTarget(undefined);
      setRouteDetailsExpanded(false);
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const reserveParking = useCallback(
    (zone: ParkingZone) => {
      useReservationRouteStore.getState().setOrigin(
        routeOrigin,
        testLocation ? 'test' : 'gps',
      );
      setSelectedZoneId(undefined);
      router.push({ pathname: '/parking/layout/[zoneId]', params: { zoneId: zone.id } });
    },
    [routeOrigin, router, testLocation],
  );

  const viewParkingMap = useCallback(
    (zone: ParkingZone) => {
      useReservationRouteStore.getState().setOrigin(
        routeOrigin,
        testLocation ? 'test' : 'gps',
      );
      setSelectedZoneId(undefined);
      router.push({ pathname: '/parking/layout/[zoneId]', params: { zoneId: zone.id } });
    },
    [routeOrigin, router, testLocation],
  );

  const startRoute = useCallback(
    async (destination: RouteDestination) => {
      if (routeStartInFlightRef.current) return false;
      routeStartInFlightRef.current = true;
      try {
        setLocationMessage(undefined);
        const normalizedDestination = normalizeGeoPoint(destination.location);
        if (!normalizedDestination) {
          setLocationMessage(t('ramallahParking.routeUnavailable'));
          return false;
        }
        let origin = testLocation;
        if (!origin && testLocationMode) {
          setLocationMessage(t('ramallahParking.testLocationPrompt'));
          return false;
        }
        origin ??= location ?? storedRouteOrigin ?? (await requestLocation());
        if (!origin) {
          setLocationMessage(t('map.locationDeniedBody'));
          return false;
        }
        const normalizedOrigin = normalizeGeoPoint(origin);
        if (!normalizedOrigin) {
          setLocationMessage(t('map.locationDeniedBody'));
          return false;
        }
        haptics.select();
        const originMode = testLocation || storedRouteOriginMode === 'test' ? 'test' : 'gps';
        useReservationRouteStore.getState().setOrigin(normalizedOrigin, originMode);
        setRouteOriginOverride(normalizedOrigin);
        setSelectedZoneId(undefined);
        setNearbyExpanded(false);
        setRouteDetailsExpanded(false);
        setSelectedRouteId('current');
        setAlternativeDismissed(false);
        setRouteTarget({ ...destination, location: normalizedDestination });
        useReservationRouteStore.getState().consume();
        ev.select(undefined);
        return true;
      } finally {
        routeStartInFlightRef.current = false;
      }
    },
    [location, requestLocation, storedRouteOrigin, storedRouteOriginMode, t, testLocation, testLocationMode, ev.select],
  );

  const changeDestinationQuery = useCallback((value: string) => {
    setDestinationQuery(value);
    setSuggestionsOpen(true);
    if (!value.trim()) {
      setSelectedDestination(undefined);
      setPlaceSuggestions([]);
      setPlaceSearchError(false);
    }
  }, []);

  const selectDestination = useCallback((suggestion: PlaceSuggestion) => {
    haptics.select();
    setSelectedDestination(suggestion);
    setDestinationQuery(locale === 'ar' ? suggestion.nameAr ?? suggestion.name : suggestion.nameEn ?? suggestion.name);
    setSuggestionsOpen(false);
    setPlaceSuggestions([]);
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setRouteTarget(undefined);
    setRouteDetailsExpanded(false);
    setNearbyExpanded(false);
    const next: GeoRegion = {
      ...suggestion.location,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [locale]);

  useEffect(() => {
    if (!mapFocused || !pendingReservationRouteZoneId) return;
    const zone = zones.find((item) => item.id === pendingReservationRouteZoneId)
      ?? ramallahParkingZones.find((item) => item.id === pendingReservationRouteZoneId);
    if (!zone) {
      if (!zonesPending) {
        setLocationMessage(t('ramallahParking.routeUnavailable'));
        useReservationRouteStore.getState().consume();
      }
      return;
    }
    void startRoute(parkingDestination(zone));
  }, [mapFocused, pendingReservationRouteZoneId, startRoute, t, zones, zonesPending]);

  const openParkingLocation = useCallback((parkingLocation: RamallahParkingLocation) => {
    const zone =
      zones.find((item) => item.id === parkingLocation.id) ??
      ramallahParkingZones.find((item) => item.id === parkingLocation.id);
    if (zone) openZone(zone);
  }, [openZone, zones]);

  const selectCarService = useCallback((service: CarServiceBusiness) => {
    haptics.select();
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setEntryMenuOpen(false);
    setReportStep(undefined);
    setReportLocationPicking(false);
    carServices.select(service);
  }, [carServices.select]);

  const carServiceAccessibilityLabel = useCallback((service: CarServiceBusiness) => {
    const name = locale === 'ar' ? service.nameAr : service.nameEn;
    return `${name}, ${t(`carServices.category.${carServiceCategory}`)}`;
  }, [carServiceCategory, locale, t]);

  const closeRoute = useCallback(() => {
    setRouteTarget(undefined);
    setRouteDetailsExpanded(false);
    setSelectedRouteId('current');
    setAlternativeDismissed(false);
  }, []);

  const openRouteReport = useCallback((report: RoadReport) => {
    setSelectedZoneId(undefined);
    setReportStep(undefined);
    setReportLocationPicking(false);
    setSelectedReport(report);
    const next: GeoRegion = {
      latitude: report.latitude,
      longitude: report.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }, []);

  const toggleTestLocation = useCallback(() => {
    setLocationMessage(undefined);
    setTestLocationMode((enabled) => {
      if (enabled) {
        setTestLocation(undefined);
        setRouteOriginOverride(undefined);
        useReservationRouteStore.getState().setOrigin(undefined);
      } else {
        setEntryMenuOpen(false);
      }
      return !enabled;
    });
  }, []);

  const handleMapPress = useCallback(
    (coordinate: GeoPoint) => {
      if (reportLocationPicking) {
        setReportDraft((current) => ({ ...current, ...coordinate }));
        return;
      }
      if (!testLocationMode) return;
      if (!isValidGeoPoint(coordinate)) return;
      setTestLocation(coordinate);
      useReservationRouteStore.getState().setOrigin(coordinate, 'test');
      setLocationMessage(undefined);
    },
    [reportLocationPicking, testLocationMode],
  );

  const beginReportLocation = useCallback((type: RoadReportType) => {
    const initial = testLocation ?? location ?? { latitude: region.latitude, longitude: region.longitude };
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setEntryMenuOpen(false);
    setReportDraft({ type, ...initial });
    setReportStep(undefined);
    setReportLocationPicking(true);
  }, [location, region.latitude, region.longitude, testLocation]);

  const cancelReport = useCallback(() => {
    setReportStep(undefined);
    setReportLocationPicking(false);
    setReportDraft({});
    createReport.reset();
  }, [createReport]);

  const submitReport = useCallback(() => {
    if (!reportDraft.type || reportDraft.latitude === undefined || reportDraft.longitude === undefined) return;
    createReport.mutate(reportDraft as CreateRoadReportInput, {
      onSuccess: (result) => {
        const report = result.report;
        setReportStep(undefined);
        setReportLocationPicking(false);
        setReportDraft({});
        setSelectedReport(undefined);
        setSelectedReport(report);
        if (result.duplicate) {
          const next: GeoRegion = {
            latitude: report.latitude,
            longitude: report.longitude,
            latitudeDelta: Math.min(region.latitudeDelta, 0.012),
            longitudeDelta: Math.min(region.longitudeDelta, 0.012),
          };
          setRegion(next);
          mapRef.current?.animateToRegion(next, 450);
          setLocationMessage(t(result.confirmationAdded
            ? 'roadReports.duplicateConfirmed'
            : 'roadReports.duplicateActive'));
        } else {
          setLocationMessage(t('roadReports.created'));
        }
        createReport.reset();
      },
    });
  }, [createReport, region.latitudeDelta, region.longitudeDelta, reportDraft, t]);

  const openInMaps = useCallback((destination: RouteDestination) => {
    const { latitude, longitude } = destination.location;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(destination.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  const selectEvStation = useCallback((station: EvChargingStation) => {
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setReportStep(undefined);
    setReportLocationPicking(false);
    setEntryMenuOpen(false);
    ev.select(station);
  }, [ev.select]);

  // Never stack the EV modal with the existing map sheets.
  useEffect(() => {
    if (selectedZoneId || selectedReport || reportStep || reportLocationPicking || layersSheetOpen || vehicleSheetOpen || codeSheetOpen || evFiltersOpen) {
      ev.select(undefined);
      carServices.select(undefined);
    }
  }, [selectedZoneId, selectedReport, reportStep, reportLocationPicking, layersSheetOpen, vehicleSheetOpen, codeSheetOpen, evFiltersOpen, ev.select, carServices.select]);

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      <MapSurface
        ref={mapRef}
        region={region}
        evStations={evActive ? ev.stations : []}
        selectedEvStationId={evActive ? ev.selectedStationId : undefined}
        onSelectEvStation={selectEvStation}
        carServices={carServicesActive ? carServices.services : []}
        activeCarServiceCategory={carServicesActive ? carServiceCategory : undefined}
        selectedCarServiceId={carServicesActive ? carServices.selectedServiceId : undefined}
        onSelectCarService={selectCarService}
        carServiceAccessibilityLabel={carServiceAccessibilityLabel}
        zones={primaryMapCategory === 'parking' ? mapZones.map((item) => item.zone) : []}
        selectedZoneId={primaryMapCategory === 'parking' ? selectedZoneId ?? routeZone?.id : undefined}
        parkingLocations={primaryMapCategory === 'parking' ? ramallahParkingLocations : []}
        selectedParkingLocationId={primaryMapCategory === 'parking' ? selectedZoneId ?? routeZone?.id : undefined}
        onSelectParkingLocation={openParkingLocation}
        onSelectZone={openZone}
        onPressMap={handleMapPress}
        onPressBackground={() => {
          ev.select(undefined);
          carServices.select(undefined);
          setSelectedZoneId(undefined);
          setSelectedReport(undefined);
          setEntryMenuOpen(false);
        }}
        userLocation={testLocationMode ? undefined : location}
        testLocation={testLocation}
        onRegionChangeComplete={setRegion}
        checkpoints={mapCheckpoints}
        onSelectCheckpoint={() => router.push('/roads')}
        roadReports={roadReportsEnabled ? roadReports : []}
        selectedRoadReportId={roadReportsEnabled ? selectedReport?.id : undefined}
        onSelectRoadReport={(report) => {
          setSelectedZoneId(undefined);
          if (routeTarget?.type !== 'ev_station' && routeTarget?.type !== 'car_service') setRouteTarget(undefined);
          setReportStep(undefined);
          setReportLocationPicking(false);
          setSelectedReport(report);
        }}
        reportDraft={reportLocationPicking && reportDraft.type && reportDraft.latitude !== undefined && reportDraft.longitude !== undefined ? { type: reportDraft.type, location: { latitude: reportDraft.latitude, longitude: reportDraft.longitude } } : undefined}
        route={mapRoute}
        landmark={selectedDestination ? { name: selectedDestination.name, location: selectedDestination.location } : undefined}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />

      <View
        pointerEvents="box-none"
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: screenPadding,
          gap: spacing.sm,
        }}
      >
        <MapTopBar
          vehicle={selected}
          unreadCount={unreadCount}
          onOpenVehicles={() => setVehicleSheetOpen(true)}
          onOpenNotifications={() => router.push('/notifications')}
          onOpenReport={!reportLocationPicking && !reportStep ? () => {
            setSelectedZoneId(undefined);
            setSelectedReport(undefined);
            setEntryMenuOpen(false);
            setReportDraft({});
            createReport.reset();
            setReportStep('type');
          } : undefined}
        />
        {!reportLocationPicking && !reportStep && !selectedReport ? (
          <DestinationSearchBox
            value={destinationQuery}
            suggestions={placeSuggestions}
            loading={placeSearchLoading}
            error={placeSearchError}
            showSuggestions={suggestionsOpen && !routeTarget}
            onChange={changeDestinationQuery}
            onSelect={selectDestination}
          />
        ) : null}
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
          enabledLayerCount={enabledLayerCount}
          onOpenLayers={() => {
            setEntryMenuOpen(false);
            setSelectedZoneId(undefined);
            setSelectedReport(undefined);
            setLayersSheetOpen(true);
          }}
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
        {!reportLocationPicking && !reportStep && !selectedReport && bannerSession ? (
          <ActiveSessionBanner
            session={bannerSession}
            vehicle={bannerVehicle}
            extraCount={activeSessions.length - 1}
            onPress={() => router.push(`/parking/active/${bannerSession.id}`)}
          />
        ) : null}

        {!reportLocationPicking && !reportStep && !selectedReport && __DEV__ && process.env.EXPO_PUBLIC_SHOW_TEST_LOCATION === 'true' ? (
          <View style={{ alignItems: 'flex-end' }}>
            <TestLocationControl
              enabled={testLocationMode}
              hasLocation={Boolean(testLocation)}
              onToggle={toggleTestLocation}
            />
          </View>
        ) : null}

        {reportLocationPicking ? (
          <RoadReportLocationPanel onCancel={cancelReport} onContinue={() => { setReportLocationPicking(false); setReportStep('details'); }} />
        ) : !reportStep && !selectedReport && routeTarget ? (
          <CompactRoutePanel
            destination={routeTarget}
            route={displayedRoute}
            loading={routeLoading}
            detailsExpanded={routeDetailsExpanded}
            onDetailsExpandedChange={setRouteDetailsExpanded}
            onClose={closeRoute}
            onOpenMaps={() => openInMaps(routeTarget)}
            onStartParking={routeZone ? () => startParking(routeZone) : undefined}
            onOpenDestination={routeTarget.type === 'ev_station' ? () => {
              useMapLayersStore.getState().setPrimaryCategory('ev_charging');
              selectEvStation(routeTarget.station);
            } : routeTarget.type === 'car_service' ? () => {
              useMapLayersStore.getState().setPrimaryCategory('car_services');
              carServices.select(routeTarget.service);
            } : undefined}
            startDisabled={routeZone?.parkingAllowed === false}
            impacts={activeRouteAssessment?.impacts}
            suggestedAlternative={routeAssessment?.recommended}
            originalDurationSeconds={route?.durationSeconds}
            usingAlternative={selectedRouteId !== 'current'}
            alternativeDismissed={alternativeDismissed}
            onSelectImpact={(impact) => openRouteReport(impact.report)}
            onKeepCurrent={() => setAlternativeDismissed(true)}
            onUseAlternative={() => {
              if (routeAssessment?.recommended) {
                setSelectedRouteId(routeAssessment.recommended.id);
                setAlternativeDismissed(false);
              }
            }}
            onUseOriginal={() => {
              setSelectedRouteId('current');
              setAlternativeDismissed(true);
            }}
            showNoAlternative={Boolean(route?.source === 'osrm' && activeRouteAssessment?.impacts.length && !routeAssessment?.recommended && selectedRouteId === 'current')}
          />
        ) : !reportStep && !selectedReport && selectedDestination && primaryMapCategory === 'parking' ? (
          <DestinationParkingPanel
            destinationName={selectedDestination.name}
            recommendations={destinationRecommendations}
            onSelect={(item) => void startRoute(parkingDestination(item.zone))}
          />
        ) : !reportStep && !selectedReport && primaryMapCategory === 'parking' ? (
          <NearbyParkingPanel
            zones={nearbyZones}
            expanded={nearbyExpanded}
            onExpandedChange={setNearbyExpanded}
            onSelectZone={focusZone}
          />
        ) : null}
        {evActive && !reportStep && !reportLocationPicking && !selectedReport && !ev.selectedStationId ? (
          <EvMapStatus loading={ev.loading} error={ev.error} count={ev.stations.length} truncated={ev.truncated} filters={ev.filters}
            retry={ev.retry} onFilters={() => setEvFiltersOpen(true)} compact={Boolean(routeTarget)} />
        ) : null}
        {carServicesActive && !reportStep && !reportLocationPicking && !selectedReport && !carServices.selectedServiceId ? (
          <CarServiceMapStatus
            loading={carServices.loading}
            error={carServices.error}
            errorMessage={carServices.errorMessage}
            count={carServices.services.length}
            services={carServices.services}
            truncated={carServices.truncated}
            category={carServiceCategory}
            retry={carServices.retry}
            compact={Boolean(routeTarget)}
          />
        ) : null}
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
        onNavigate={(zone) => void startRoute(parkingDestination(zone))}
        onStartParking={startParking}
        onReserve={reserveParking}
        onViewParkingMap={viewParkingMap}
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

      <RoadReportCreationSheet
        visible={Boolean(reportStep)}
        step={reportStep ?? 'type'}
        draft={reportDraft}
        onChange={(next) => setReportDraft((current) => ({ ...current, ...next }))}
        onChooseType={beginReportLocation}
        onStepChange={setReportStep}
        onClose={cancelReport}
        onSubmit={submitReport}
        loading={createReport.isPending}
        error={createReport.error ? t('roadReports.createFailed') : undefined}
      />

      <RoadReportDetailsSheet
        key={selectedReport?.id ?? 'closed-road-report'}
        report={selectedReport}
        visible={Boolean(selectedReport)}
        onClose={() => setSelectedReport(undefined)}
        onUpdated={setSelectedReport}
      />

      <MapLayersSheet visible={layersSheetOpen} onClose={() => setLayersSheetOpen(false)} />
      <EvStationDetailsSheet key={ev.selectedStationId ?? 'closed-ev'} station={evActive ? ev.selectedStation : undefined}
        onClose={() => ev.select(undefined)} onRoute={(station) => void startRoute(evDestination(station))} />
      <CarServiceDetailsSheet key={carServices.selectedServiceId ?? 'closed-car-service'} service={carServicesActive ? carServices.selectedService : undefined}
        onClose={() => carServices.select(undefined)} onRoute={(service) => void startRoute(carServiceDestination(service))} />
      <EvFiltersSheet visible={evActive && evFiltersOpen} onClose={() => setEvFiltersOpen(false)} />
    </View>
  );
}
