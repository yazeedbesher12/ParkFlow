import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { ZoneMarker } from './ZoneMarker';
import { CheckpointMarker } from './CheckpointMarker';
import { LandmarkMarker } from './LandmarkMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from './types';
import { useTheme } from '@/theme/ThemeProvider';
import { mapStyleDark, mapStyleLight } from './mapStyle';

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
    userLocation,
    onRegionChangeComplete,
    checkpoints,
    onSelectCheckpoint,
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
        onPress={onPressBackground}
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
            <Polyline coordinates={route.coordinates} strokeColor={colors.brand} strokeWidth={5} />
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

        {landmark ? (
          <Marker coordinate={landmark.location} anchor={{ x: 0.5, y: 0.5 }}>
            <LandmarkMarker name={landmark.name} />
          </Marker>
        ) : null}

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
