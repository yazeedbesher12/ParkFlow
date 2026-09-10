import type { StyleProp, ViewStyle } from 'react-native';
import type { GeoPoint, GeoRegion, ParkingZone } from '@/types';

/**
 * Platform-agnostic map contract. The native implementation renders
 * react-native-maps; the web implementation renders Leaflet with satellite tiles
 * so the app is fully previewable in a browser. Screens only ever see this interface.
 */
export interface MapSurfaceProps {
  region: GeoRegion;
  zones: ParkingZone[];
  selectedZoneId?: string;
  onSelectZone: (zone: ParkingZone) => void;
  onPressBackground?: () => void;
  userLocation?: GeoPoint;
  /** Fired after the user finishes moving the map. */
  onRegionChangeComplete?: (region: GeoRegion) => void;
  style?: StyleProp<ViewStyle>;
}

export interface MapSurfaceHandle {
  animateToRegion: (region: GeoRegion, durationMs?: number) => void;
}
