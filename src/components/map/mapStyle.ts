/**
 * Google Maps style JSON. The goal is a quiet base map: muted land, softened
 * roads and no points of interest competing with our parking pins.
 */
type MapStyleElement = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

export const mapStyleLight: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#EEF2F0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7C76' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FDF3D9' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E4EDE8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFE3F5' }] },
];

export const mapStyleDark: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0F1F1A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FA39C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#071411' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#18302A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22423A' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#122520' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F2A3D' }] },
];
