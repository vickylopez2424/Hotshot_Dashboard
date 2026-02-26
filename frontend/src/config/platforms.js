/**
 * Platform Registry
 *
 * Add a new platform by appending an entry here and creating
 * the matching connector in src/integrations/<platform-id>/
 *
 * Fields:
 *   id        — unique key, matches integration folder name
 *   label     — display name in nav/UI
 *   icon      — emoji or icon string
 *   enabled   — toggle on/off without deleting
 *   mapLayer  — true if this platform contributes a map layer
 *   apiBase   — backend endpoint prefix (proxied through FastAPI)
 */
export const PLATFORMS = [
  {
    id: 'firms',
    label: 'Active Fires',
    icon: '🛰️',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/firms',
    description: 'NASA FIRMS real-time satellite fire detections',
  },
  {
    id: 'elmfire',
    label: 'ELMFIRE',
    icon: '📈',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/elmfire',
    description: 'Physics-based wildfire spread prediction model',
  },
  {
    id: 'cameras',
    label: 'Cameras',
    icon: '📷',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/cameras',
    description: 'ALERTWildfire live camera feeds',
  },
  {
    id: 'wims',
    label: 'WIMS/RAWS',
    icon: '🌡️',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/wims',
    description: 'WIMS fire weather stations (RAWS network)',
  },
  {
    id: 'rx_weather',
    label: 'Rx Weather',
    icon: '🌬️',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/rx_weather',
    description: 'Prescribed burn weather station data',
  },
  {
    id: 'wildcad',
    label: 'WildCAD',
    icon: '🚒',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/wildcad',
    description: 'Active fire incidents + dispatch data (NIFC IRWIN)',
  },
  {
    id: 'nws',
    label: 'Fire Weather',
    icon: '⛈️',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/nws',
    description: 'NWS red flag warnings and fire weather watches',
  },
  {
    id: 'airnow',
    label: 'Air Quality',
    icon: '💨',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/airnow',
    description: 'EPA AirNow PM2.5 monitoring — wildfire smoke',
  },
  {
    id: 'watchduty',
    label: 'Watch Duty',
    icon: '🔔',
    enabled: true,
    mapLayer: false,
    apiBase: '/api/watchduty',
    description: 'Watch Duty community wildfire alerts and links',
  },
  {
    id: 'landfire',
    label: 'LANDFIRE',
    icon: '🌿',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/landfire',
    description: 'USDA/USDI vegetation and fire behavior fuel models (30m)',
  },
  {
    id: 'plant_id',
    label: 'Plant ID',
    icon: '🌱',
    enabled: true,
    mapLayer: false,
    apiBase: '/api/plant-id',
    description: 'AI plant identification with fire behavior lookup',
  },
  {
    id: 'vegetation',
    label: 'Vegetation',
    icon: '🛰️',
    enabled: true,
    mapLayer: true,
    apiBase: '/api/vegetation',
    description: 'NASA MODIS NDVI vegetation stress analysis',
  },
  // ─── Add new platforms below ───────────────────────
];

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id);
export const getEnabledPlatforms = () => PLATFORMS.filter(p => p.enabled);
export const getMapLayerPlatforms = () => PLATFORMS.filter(p => p.enabled && p.mapLayer);
