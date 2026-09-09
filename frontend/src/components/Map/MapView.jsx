import React, { useEffect } from 'react';
import { MapContainer, TileLayer, LayersControl, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ActiveFireLayer from './layers/ActiveFireLayer';
import ElmfireLayer from './layers/ElmfireLayer';
import WimsLayer from './layers/WimsLayer';
import CameraMarkerLayer from './layers/CameraMarkerLayer';
import WildcadLayer from './layers/WildcadLayer';
import NWSLayer from './layers/NWSLayer';
import AirNowLayer from './layers/AirNowLayer';
import LandfireLayer from './layers/LandfireLayer';
import VegetationLayer from './layers/VegetationLayer';
import { usePlatform } from '../../context/PlatformContext';

// Forwards map clicks to panels that registered a point-query handler
function MapClickHandler() {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (window._landfireQueryPoint)  window._landfireQueryPoint(lat, lng);
      if (window._vegetationQueryPoint) window._vegetationQueryPoint(lat, lng);
    },
  });
  return null;
}

// Default center: Northern California (ELMFIRE sample run area)
const DEFAULT_CENTER = [38.9, -120.5];
const DEFAULT_ZOOM = 8;

function MapView({ elmfireTime, selectedIncident, landfireLayer, landfireOpacity, vegetationLayer, vegetationOpacity, incidentMinAcres }) {
  const { isLayerActive } = usePlatform();

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%', background: '#dfe2e0' }}
    >
      <LayersControl position="topright">
        {/* Satellite imagery is the default; terrain maps remain available. */}
        <LayersControl.BaseLayer name="Topographic">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="ESRI World Topographic"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        {/* USGS Topo: the same quads Avenza Maps serves in the field */}
        <LayersControl.BaseLayer name="USGS Topo">
          <TileLayer
            url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"
            attribution="USGS The National Map: USGS Topo"
            maxZoom={16}
          />
        </LayersControl.BaseLayer>

        {/* USGS Imagery with topo labels and contours */}
        <LayersControl.BaseLayer name="USGS Imagery + Topo">
          <TileLayer
            url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"
            attribution="USGS The National Map: USGS Imagery Topo"
            maxZoom={16}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer checked name="Satellite (ESRI)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="ESRI World Imagery"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Dark (ESRI)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="ESRI Dark Gray"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Platform overlay layers, each controlled by sidebar toggles */}
      {isLayerActive('firms')   && <ActiveFireLayer />}
      {isLayerActive('elmfire') && (
        <ElmfireLayer currentTimeMinutes={elmfireTime} />
      )}
      {isLayerActive('wims')    && <WimsLayer />}
      {isLayerActive('cameras') && <CameraMarkerLayer />}
      {isLayerActive('wildcad') && <WildcadLayer minAcres={incidentMinAcres} />}
      {isLayerActive('nws')        && <NWSLayer />}
      {isLayerActive('airnow')     && <AirNowLayer />}
      {isLayerActive('landfire')   && (
        <LandfireLayer layerName={landfireLayer} opacity={landfireOpacity} />
      )}
      {isLayerActive('vegetation') && (
        <VegetationLayer layerName={vegetationLayer} opacity={vegetationOpacity} />
      )}

      <MapClickHandler />
      {/* Add new platform layers here as platforms are integrated */}
    </MapContainer>
  );
}

export default MapView;
