/**
 * NWSLayer — NWS fire weather alert zones (polygons)
 * Red Flag Warnings = red fill, Fire Weather Watches = orange
 */
import React, { useEffect, useState } from 'react';
import { GeoJSON, Tooltip } from 'react-leaflet';
import axios from 'axios';

export default function NWSLayer() {
  const [geojson, setGeojson] = useState(null);

  useEffect(() => {
    axios.get('/api/nws/alerts/map')
      .then(res => setGeojson(res.data))
      .catch(() => {});
  }, []);

  if (!geojson || !geojson.features?.length) return null;

  return (
    <GeoJSON
      key={JSON.stringify(geojson.features.length)}
      data={geojson}
      style={(feature) => {
        const color = feature.properties?.color || '#ff6600';
        return {
          color,
          fillColor:   color,
          fillOpacity: 0.2,
          weight:      2,
          dashArray:   '5,4',
        };
      }}
      onEachFeature={(feature, layer) => {
        const p = feature.properties || {};
        layer.bindTooltip(
          `<strong>${p.event}</strong><br />${p.area_desc || ''}<br /><em>${p.headline || ''}</em>`,
          { sticky: true }
        );
      }}
    />
  );
}
