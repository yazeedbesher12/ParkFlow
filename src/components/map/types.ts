import type { StyleProp, ViewStyle } from 'react-native';
import type { CheckpointStatus, GeoPoint, GeoRegion, ParkingZone } from '@/types';

export interface MapCheckpoint {
  id: string;
  name: string;
  location: GeoPoint;
  status: CheckpointStatus;
  assumed: boolean;
}

export interface MapRoute {
  coordinates: GeoPoint[];
  /** Alternatives that were not taken — drawn dashed. */
  alternatives: GeoPoint[][];
}

export interface MapLandmark {
  name: string;
  location: GeoPoint;
}

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
  checkpoints?: MapCheckpoint[];
  onSelectCheckpoint?: (checkpointId: string) => void;
  route?: MapRoute;
  /** The place a landmark search resolved to. */
  landmark?: MapLandmark;
  style?: StyleProp<ViewStyle>;
}

export interface MapSurfaceHandle {
  animateToRegion: (region: GeoRegion, durationMs?: number) => void;
}
