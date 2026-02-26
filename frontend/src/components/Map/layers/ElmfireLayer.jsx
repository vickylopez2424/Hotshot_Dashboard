/**
 * ElmfireLayer
 * Renders ELMFIRE wildfire spread prediction as a GeoJSON overlay.
 * Expects the backend to serve the fire perimeter forecast as GeoJSON.
 */
import React, { useEffect, useState } from 'react';
import { GeoJSON, Popup } from 'react-leaflet';
import axios from 'axios';

const ELMFIRE_STYLE = {
  color: '#ff9800',
  weight: 2,
  fillColor: '#ff5722',
  fillOpacity: 0.3,
};

function ElmfireLayer() {
  const [geojson, setGeojson] = useState(null);

  useEffect(() => {
    axios.get('/api/elmfire/prediction')
      .then(res => setGeojson(res.data))
      .catch(() => {
        // Backend not yet connected
        setGeojson(null);
      });
  }, []);

  if (!geojson) return null;

  return (
    <GeoJSON
      data={geojson}
      style={ELMFIRE_STYLE}
      onEachFeature={(feature, layer) => {
        if (feature.properties) {
          layer.bindPopup(
            `<strong>ELMFIRE Prediction</strong><br />
             Time: ${feature.properties.time || 'N/A'}<br />
             Scenario: ${feature.properties.scenario || 'N/A'}`
          );
        }
      }}
    />
  );
}

export default ElmfireLayer;
