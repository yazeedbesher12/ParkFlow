import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { ZoneMarker } from './ZoneMarker';
import { CheckpointMarker } from './CheckpointMarker';
import { LandmarkMarker } from './LandmarkMarker';
import {
  ParkingLocationMarker,
  parkingLocationAccessibilityLabel,
} from './ParkingLocationMarker';
import { TestLocationMarker } from './TestLocationMarker';
import { RoadReportMarker } from './RoadReportMarker';
import { EvStationMarker } from './EvStationMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from './types';
import { useTheme } from '@/theme/ThemeProvider';
import { mapStyleDark, mapStyleLight } from './mapStyle';
import type { RouteTrafficState } from '@/types';

const TRAFFIC_COLORS: Record<RouteTrafficState, string> = {
  normal: '#16A34A',
  slow: '#F59E0B',
  traffic_jam: '#DC2626',
};

/**
 * Google Maps on Android; Apple Maps on iOS (custom JSON styling only applies to
 * the Google provider, which is why the style array is passed conditionally).
 */
export const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapSurface(
  {
    region,
    zones,
    selectedZoneId,
    onSelectZone,
    onPressBackground,
    onPressMap,
    userLocation,
    testLocation,
    parkingLocations,
    selectedParkingLocationId,
    onSelectParkingLocation,
    onRegionChangeComplete,
    checkpoints,
    onSelectCheckpoint,
    evStations, selectedEvStationId, onSelectEvStation,
    roadReports,
    selectedRoadReportId,
    onSelectRoadReport,
    reportDraft,
    route,
    landmark,
    style,
  },
  ref,
) {
  const { isDark, colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next, durationMs = 500) => {
      mapRef.current?.animateToRegion(next as Region, durationMs);
    },
    fitToCoordinates: (coordinates, edgePadding = { top: 80, right: 40, bottom: 160, left: 40 }) => {
      mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated: true });
    },
  }));

  const customMapStyle = useMemo(
    () => (Platform.OS === 'android' ? (isDark ? mapStyleDark : mapStyleLight) : undefined),
    [isDark],
  );

  return (
    <View style={style}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region as Region}
        customMapStyle={customMapStyle}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(event) => {
          onPressMap?.(event.nativeEvent.coordinate);
          onPressBackground?.();
        }}
        onRegionChangeComplete={(next) => onRegionChangeComplete?.(next)}
      >
        {route ? (
          <>
            {route.alternatives.map((line, index) => (
              <Polyline
                key={`alt-${index}`}
                coordinates={line}
                strokeColor={colors.textTertiary}
                strokeWidth={4}
                lineDashPattern={[8, 8]}
              />
            ))}
            {route.trafficSegments?.length ? (
              route.trafficSegments.map((segment, index) => (
                <Polyline
                  key={`traffic-${index}-${segment.state}`}
                  coordinates={segment.coordinates}
                  strokeColor={TRAFFIC_COLORS[segment.state]}
                  strokeWidth={5}
                />
              ))
            ) : (
              <Polyline
                coordinates={route.coordinates}
                strokeColor={route.trafficState ? TRAFFIC_COLORS[route.trafficState] : colors.brand}
                strokeWidth={5}
              />
            )}
          </>
        ) : null}

        {checkpoints?.map((checkpoint) => (
          <Marker
            key={checkpoint.id}
            coordinate={checkpoint.location}
            onPress={(event) => {
              event.stopPropagation();
              onSelectCheckpoint?.(checkpoint.id);
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={`${checkpoint.name}, ${checkpoint.status}`}
          >
            <CheckpointMarker status={checkpoint.status} assumed={checkpoint.assumed} label={checkpoint.name} />
          </Marker>
        ))}

        {evStations?.map((station) => (
          <Marker key={`${station.id}-${station.status}-${station.id === selectedEvStationId}`} coordinate={{ latitude: station.latitude, longitude: station.longitude }} anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={station.name} tracksViewChanges={false} zIndex={station.id === selectedEvStationId ? 60 : 30}
            onPress={(event) => { event.stopPropagation(); onSelectEvStation?.(station); }}>
            <EvStationMarker status={station.status} selected={station.id === selectedEvStationId} />
          </Marker>
        ))}
        {roadReports?.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            onPress={(event) => { event.stopPropagation(); onSelectRoadReport?.(report); }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={report.id === selectedRoadReportId ? 60 : 40}
            tracksViewChanges
            accessibilityLabel={report.type}
          >
            <RoadReportMarker type={report.type} selected={report.id === selectedRoadReportId} />
          </Marker>
        ))}

        {reportDraft ? <Marker coordinate={reportDraft.location} anchor={{ x: 0.5, y: 1 }} zIndex={80}><RoadReportMarker type={reportDraft.type} selected /></Marker> : null}

        {landmark ? (
          <Marker coordinate={landmark.location} anchor={{ x: 0.5, y: 0.5 }}>
            <LandmarkMarker name={landmark.name} />
          </Marker>
        ) : null}

        {testLocation ? (
          <Marker coordinate={testLocation} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="Test location">
            <TestLocationMarker />
          </Marker>
        ) : null}

        {parkingLocations?.map((location) => (
          <Marker
            key={location.id}
            coordinate={location.location}
            onPress={(event) => {
              event.stopPropagation();
              onSelectParkingLocation?.(location);
            }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={location.id === selectedParkingLocationId ? 30 : 20}
            tracksViewChanges
            accessibilityLabel={parkingLocationAccessibilityLabel(location)}
          >
            <ParkingLocationMarker
              location={location}
              selected={location.id === selectedParkingLocationId}
            />
          </Marker>
        ))}

        {zones.map((zone) => (
          <Marker
            key={zone.id}
            coordinate={zone.location}
            onPress={(event) => {
              // Stop the tap also registering as a background press.
              event.stopPropagation();
              onSelectZone(zone);
            }}
            anchor={{ x: 0.5, y: 1 }}
            // Left on so markers restyle when selected; a handful of pins is
            // well within budget. Revisit if zone density grows a lot.
            tracksViewChanges
            accessibilityLabel={`${zone.name}, ${zone.availability}`}
          >
            <ZoneMarker zone={zone} selected={zone.id === selectedZoneId} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
});
