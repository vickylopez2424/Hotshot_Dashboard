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
  // ─── Add new platforms below ───────────────────────
  // {
  //   id: 'my_platform',
  //   label: 'My Platform',
  //   icon: '🗺️',
  //   enabled: false,
  //   mapLayer: true,
  //   apiBase: '/api/my_platform',
  //   description: 'Description of what this platform provides',
  // },
];

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id);
export const getEnabledPlatforms = () => PLATFORMS.filter(p => p.enabled);
export const getMapLayerPlatforms = () => PLATFORMS.filter(p => p.enabled && p.mapLayer);
