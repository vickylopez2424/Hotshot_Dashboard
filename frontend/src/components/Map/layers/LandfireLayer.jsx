/**
 * LandfireLayer — LANDFIRE vegetation & fuel type WMS overlay
 * Layer and opacity are controlled by the LandfirePanel.
 */
import React from 'react';
import { WMSTileLayer } from 'react-leaflet';

const WMS_URL = 'https://landfire.cr.usgs.gov/arcgis/services/Landfire/US_220/MapServer/WmsServer';

export default function LandfireLayer({ layerName = 'US_220FBFM40', opacity = 0.7 }) {
  return (
    <WMSTileLayer
      url={WMS_URL}
      layers={layerName}
      format="image/png"
      transparent={true}
      opacity={opacity}
      version="1.3.0"
      attribution="LANDFIRE — USDA/USDI"
    />
  );
}
