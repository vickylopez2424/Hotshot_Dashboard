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
 *   category  — layer group shown in the Sidebar (see LAYER_CATEGORIES)
 *   apiBase   — backend endpoint prefix (proxied through FastAPI)
 */
export const PLATFORMS = [
  {
    id: 'firms',
    label: 'Active Fires',
    icon: '🛰️',
    enabled: true,
    mapLayer: true,
    category: 'Fire',
    apiBase: '/api/firms',
    description: 'NASA FIRMS real-time satellite fire detections',
  },
  {
    id: 'elmfire',
    label: 'ELMFIRE',
    icon: '📈',
    enabled: true,
    mapLayer: true,
    category: 'Fire',
    apiBase: '/api/elmfire',
    description: 'Physics-based wildfire spread prediction model',
  },
  {
    id: 'cameras',
    label: 'Cameras',
    icon: '📷',
    enabled: true,
    mapLayer: true,
    category: 'Fire',
    apiBase: '/api/cameras',
    description: 'ALERTWildfire live camera feeds',
  },
  {
    id: 'wims',
    label: 'WIMS/RAWS',
    icon: '🌡️',
    enabled: true,
    mapLayer: true,
    category: 'Weather',
    apiBase: '/api/wims',
    description: 'WIMS fire weather stations (RAWS network)',
  },
  {
    id: 'rx_weather',
    label: 'Rx Weather',
    icon: '🌬️',
    enabled: true,
    mapLayer: true,
    category: 'Weather',
    apiBase: '/api/rx_weather',
    description: 'Prescribed burn weather station data',
  },
  {
    id: 'wildcad',
    label: 'WildCAD',
    icon: '🚒',
    enabled: true,
    mapLayer: true,
    category: 'Fire',
    apiBase: '/api/wildcad',
    description: 'Active fire incidents + dispatch data (NIFC IRWIN)',
  },
  {
    id: 'nws',
    label: 'Fire Weather',
    icon: '⛈️',
    enabled: true,
    mapLayer: true,
    category: 'Weather',
    apiBase: '/api/nws',
    description: 'NWS red flag warnings and fire weather watches',
  },
  {
    id: 'airnow',
    label: 'Air Quality',
    icon: '💨',
    enabled: true,
    mapLayer: true,
    category: 'Air Quality',
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
    category: 'Vegetation',
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
    category: 'Vegetation',
    apiBase: '/api/vegetation',
    description: 'NASA MODIS NDVI vegetation stress analysis',
  },
  // ─── Add new platforms below ───────────────────────
];

// Display order of layer groups in the Sidebar
export const LAYER_CATEGORIES = ['Fire', 'Weather', 'Vegetation', 'Air Quality'];

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id);
export const getEnabledPlatforms = () => PLATFORMS.filter(p => p.enabled);
export const getMapLayerPlatforms = () => PLATFORMS.filter(p => p.enabled && p.mapLayer);

/**
 * Map-layer platforms grouped by category.
 * Returns { [category]: Platform[] } for use in the Sidebar accordion.
 */
export const getMapLayerPlatformsByCategory = () => {
  const groups = {};
  for (const p of getMapLayerPlatforms()) {
    const cat = p.category || 'Other';
    (groups[cat] = groups[cat] || []).push(p);
  }
  return groups;
};
