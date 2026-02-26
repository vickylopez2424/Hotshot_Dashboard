/**
 * VegetationLayer — NASA GIBS NDVI / EVI / Land Surface Temp WMS overlay
 * Layer and opacity controlled by VegetationPanel.
 */
import React from 'react';
import { WMSTileLayer } from 'react-leaflet';

const NASA_GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';

export default function VegetationLayer({ layerName = 'MOD13A2_006_NDVI', opacity = 0.65 }) {
  return (
    <WMSTileLayer
      url={NASA_GIBS_WMS}
      layers={layerName}
      format="image/png"
      transparent={true}
      opacity={opacity}
      version="1.3.0"
      attribution="NASA GIBS / MODIS"
    />
  );
}
