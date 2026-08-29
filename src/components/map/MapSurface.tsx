import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { ZoneMarker } from './ZoneMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from './types';
import { useTheme } from '@/theme/ThemeProvider';
import type { GeoRegion } from '@/types';

/**
 * Default (web) implementation — react-native-maps has no browser build.
 *
 * It projects the same zone coordinates onto a stylised surface, so the browser
 * preview shows real relative positions and every interaction (tap a pin,
 * recenter, select) behaves exactly as it does on device.
 *
 * Metro picks `MapSurface.native.tsx` on iOS/Android, which renders the real
 * map. This file is also what TypeScript resolves, so both share one contract.
 */
export const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapSurface(
  { region, zones, selectedZoneId, onSelectZone, onPressBackground, userLocation, style },
  ref,
) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewRegion, setViewRegion] = useState<GeoRegion>(region);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next) => setViewRegion(next),
  }));

  // Follow the region the screen asks for (first GPS fix, search result).
  useEffect(() => setViewRegion(region), [region]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  /** Equirectangular projection — accurate enough across a few city blocks. */
  const project = (latitude: number, longitude: number) => {
    const left = viewRegion.longitude - viewRegion.longitudeDelta / 2;
    const top = viewRegion.latitude + viewRegion.latitudeDelta / 2;
    return {
      x: ((longitude - left) / viewRegion.longitudeDelta) * size.width,
      y: ((top - latitude) / viewRegion.latitudeDelta) * size.height,
    };
  };

  const ready = size.width > 0 && size.height > 0;

  return (
    <View style={[{ backgroundColor: colors.mapLand, overflow: 'hidden' }, style]} onLayout={onLayout}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPressBackground}
        accessibilityLabel="Map"
      >
        {ready ? (
          <Svg width={size.width} height={size.height}>
            <Rect x={0} y={0} width={size.width} height={size.height} fill={colors.mapLand} />

            {/* Abstract street grid — decoration only, never read as data. */}
            {Array.from({ length: 9 }).map((_, index) => {
              const y = (size.height / 8) * index;
              return (
                <Line
                  key={`h${index}`}
                  x1={0}
                  y1={y}
                  x2={size.width}
                  y2={y}
                  stroke={colors.surface}
                  strokeWidth={index % 3 === 0 ? 9 : 4}
                  opacity={index % 3 === 0 ? 0.95 : 0.6}
                />
              );
            })}
            {Array.from({ length: 7 }).map((_, index) => {
              const x = (size.width / 6) * index;
              return (
                <Line
                  key={`v${index}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={size.height}
                  stroke={colors.surface}
                  strokeWidth={index % 2 === 0 ? 8 : 4}
                  opacity={index % 2 === 0 ? 0.95 : 0.55}
                />
              );
            })}

            {userLocation ? (
              <>
                <Circle
                  cx={project(userLocation.latitude, userLocation.longitude).x}
                  cy={project(userLocation.latitude, userLocation.longitude).y}
                  r={26}
                  fill={colors.info}
                  opacity={0.16}
                />
                <Circle
                  cx={project(userLocation.latitude, userLocation.longitude).x}
                  cy={project(userLocation.latitude, userLocation.longitude).y}
                  r={7}
                  fill={colors.info}
                  stroke={colors.surface}
                  strokeWidth={3}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
      </Pressable>

      {ready
        ? zones.map((zone) => {
            const { x, y } = project(zone.location.latitude, zone.location.longitude);
            // Skip pins that fall outside the visible surface.
            if (x < -60 || y < -60 || x > size.width + 60 || y > size.height + 60) return null;

            return (
              <Pressable
                key={zone.id}
                onPress={() => onSelectZone(zone)}
                accessibilityRole="button"
                accessibilityLabel={`${zone.name}, ${zone.availability}`}
                style={{
                  position: 'absolute',
                  left: x - 44,
                  top: y - 52,
                  width: 88,
                  alignItems: 'center',
                }}
              >
                <ZoneMarker zone={zone} selected={zone.id === selectedZoneId} />
              </Pressable>
            );
          })
        : null}
    </View>
  );
});
