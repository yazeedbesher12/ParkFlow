import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZoneMarker } from './ZoneMarker';
import { CheckpointMarker } from './CheckpointMarker';
import { LandmarkMarker } from './LandmarkMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from './types';
import { useTheme } from '@/theme/ThemeProvider';
import type { GeoPoint, GeoRegion } from '@/types';

/**
 * Default (web) implementation — react-native-maps has no browser build.
 *
 * A Leaflet map with Esri satellite imagery (the same base the Wusool project
 * uses), plus road and place-name overlays so streets stay readable. No API key.
 * Zone pins are the shared `ZoneMarker` components drawn over the map and
 * re-projected on every move, so they look identical to the native pins.
 *
 * Metro picks `MapSurface.native.tsx` on iOS/Android. This file is also what
 * TypeScript resolves, so both share one contract.
 */

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const SATELLITE = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const ROADS = `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`;
const PLACES = `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;

function toBounds(region: GeoRegion): L.LatLngBoundsExpression {
  return [
    [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
    [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
  ];
}

function regionOf(map: L.Map): GeoRegion {
  const bounds = map.getBounds();
  const center = bounds.getCenter();
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: bounds.getNorth() - bounds.getSouth(),
    longitudeDelta: bounds.getEast() - bounds.getWest(),
  };
}

function sameRegion(a: GeoRegion, b?: GeoRegion): boolean {
  if (!b) return false;
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-7;
  return (
    close(a.latitude, b.latitude) &&
    close(a.longitude, b.longitude) &&
    close(a.latitudeDelta, b.latitudeDelta) &&
    close(a.longitudeDelta, b.longitudeDelta)
  );
}

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
  const { colors } = useTheme();
  const hostRef = useRef<View>(null);
  const mapRef = useRef<L.Map | null>(null);
  // The last region we reported upward. The screen feeds it straight back in
  // as `region`, and re-fitting to our own echo would nudge the map in a loop.
  const emitted = useRef<GeoRegion | undefined>(undefined);
  // Bumped on every pan/zoom frame so the pin overlay re-projects.
  const [, setFrame] = useState(0);

  // Listeners are bound once; read the latest callbacks through a ref.
  const handlers = useRef({ onPressBackground, onRegionChangeComplete });
  handlers.current = { onPressBackground, onRegionChangeComplete };

  useEffect(() => {
    // On web a View ref is the underlying DOM element.
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;

    // Zoom animation is off so the pin overlay moves in lockstep with the tiles.
    const map = L.map(host, { zoomControl: false, zoomAnimation: false, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    L.tileLayer(SATELLITE, { maxZoom: 19, attribution: 'Imagery © Esri' }).addTo(map);
    L.tileLayer(ROADS, { maxZoom: 19 }).addTo(map);
    L.tileLayer(PLACES, { maxZoom: 19 }).addTo(map);
    map.setView([region.latitude, region.longitude], 15);

    const redraw = () => setFrame((n) => n + 1);
    map.on('move zoom', redraw);
    map.on('moveend', () => {
      const next = regionOf(map);
      emitted.current = next;
      handlers.current.onRegionChangeComplete?.(next);
      redraw();
    });
    map.on('click', () => handlers.current.onPressBackground?.());
    mapRef.current = map;

    // The host may get its real size after mount; fit the region once it has one.
    let fitted = false;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      if (!fitted && host.clientWidth > 0 && host.clientHeight > 0) {
        fitted = true;
        map.fitBounds(toBounds(region));
      }
      redraw();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Mount once — later regions are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow regions the screen asks for (first GPS fix, search result).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sameRegion(region, emitted.current)) return;
    map.fitBounds(toBounds(region));
  }, [region]);

  // Routes are Leaflet polylines — they belong to the map, not the pin overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;
    const toLatLngs = (line: GeoPoint[]) =>
      line.map((point) => [point.latitude, point.longitude] as L.LatLngTuple);

    const layers = [
      ...route.alternatives.map((line) =>
        L.polyline(toLatLngs(line), {
          color: colors.textTertiary,
          weight: 4,
          opacity: 0.85,
          dashArray: '8 8',
        }),
      ),
      // A light casing under the route keeps it readable on satellite imagery.
      L.polyline(toLatLngs(route.coordinates), { color: colors.surface, weight: 9, opacity: 0.9 }),
      L.polyline(toLatLngs(route.coordinates), { color: colors.brand, weight: 5 }),
    ];
    layers.forEach((layer) => layer.addTo(map));
    return () => layers.forEach((layer) => layer.remove());
  }, [route, colors]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next, durationMs = 600) =>
      mapRef.current?.flyToBounds(toBounds(next), { duration: durationMs / 1000 }),
  }));

  const map = mapRef.current;
  const project = (latitude: number, longitude: number) =>
    map!.latLngToContainerPoint([latitude, longitude]);
  const size = map?.getSize();
  const userPoint = map && userLocation ? project(userLocation.latitude, userLocation.longitude) : null;

  return (
    <View style={[{ backgroundColor: colors.mapLand, overflow: 'hidden' }, style]}>
      <View ref={hostRef} style={[StyleSheet.absoluteFill, { zIndex: 0 }]} />

      {map && size ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>
          {userPoint ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: userPoint.x - 26,
                top: userPoint.y - 26,
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderRadius: 26,
                  backgroundColor: colors.info,
                  opacity: 0.18,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.info,
                  borderWidth: 3,
                  borderColor: colors.surface,
                }}
              />
            </View>
          ) : null}

          {checkpoints?.map((checkpoint) => {
            const { x, y } = project(checkpoint.location.latitude, checkpoint.location.longitude);
            if (x < -80 || y < -40 || x > size.x + 80 || y > size.y + 40) return null;

            return (
              <Pressable
                key={checkpoint.id}
                onPress={() => onSelectCheckpoint?.(checkpoint.id)}
                accessibilityRole="button"
                accessibilityLabel={`${checkpoint.name}, ${checkpoint.status}`}
                style={{ position: 'absolute', left: x - 75, top: y - 15, width: 150, alignItems: 'center' }}
              >
                <CheckpointMarker
                  status={checkpoint.status}
                  assumed={checkpoint.assumed}
                  label={checkpoint.name}
                />
              </Pressable>
            );
          })}

          {landmark
            ? (() => {
                const { x, y } = project(landmark.location.latitude, landmark.location.longitude);
                return (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: x - 95, top: y - 16, width: 190, alignItems: 'center' }}
                  >
                    <LandmarkMarker name={landmark.name} />
                  </View>
                );
              })()
            : null}

          {zones.map((zone) => {
            const { x, y } = project(zone.location.latitude, zone.location.longitude);
            // Skip pins that fall outside the visible surface.
            if (x < -60 || y < -60 || x > size.x + 60 || y > size.y + 60) return null;

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
          })}
        </View>
      ) : null}
    </View>
  );
});
