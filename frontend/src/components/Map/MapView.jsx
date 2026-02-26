import React from 'react';
import { MapContainer, TileLayer, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ActiveFireLayer from './layers/ActiveFireLayer';
import ElmfireLayer from './layers/ElmfireLayer';
import WimsLayer from './layers/WimsLayer';
import CameraMarkerLayer from './layers/CameraMarkerLayer';
import WildcadLayer from './layers/WildcadLayer';
import { usePlatform } from '../../context/PlatformContext';

// Default center: Northern California (ELMFIRE sample run area)
const DEFAULT_CENTER = [38.9, -120.5];
const DEFAULT_ZOOM = 8;

function MapView({ elmfireTime, selectedIncident }) {
  const { isLayerActive } = usePlatform();

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%', background: '#0f0f1a' }}
    >
      <LayersControl position="topright">
        {/* Base layers */}
        <LayersControl.BaseLayer checked name="Dark (ESRI)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="ESRI Dark Gray"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite (ESRI)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="ESRI World Imagery"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Platform overlay layers — each controlled by sidebar toggles */}
      {isLayerActive('firms')   && <ActiveFireLayer />}
      {isLayerActive('elmfire') && (
        <ElmfireLayer currentTimeMinutes={elmfireTime} />
      )}
      {isLayerActive('wims')    && <WimsLayer />}
      {isLayerActive('cameras') && <CameraMarkerLayer />}
      {isLayerActive('wildcad') && <WildcadLayer />}

      {/* Add new platform layers here as platforms are integrated */}
    </MapContainer>
  );
}

export default MapView;
