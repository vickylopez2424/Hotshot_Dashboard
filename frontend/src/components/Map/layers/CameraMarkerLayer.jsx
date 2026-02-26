/**
 * CameraMarkerLayer
 * Renders ALERTWildfire camera locations on the map.
 * Clusters automatically at low zoom. Click a marker to open feed.
 *
 * Colors by network:
 *   Purple  = ALERTCalifornia
 *   Teal    = ALERTWest
 *   Blue    = HPWREN
 *   Magenta = ALERTWildfire (original)
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Tooltip, Popup } from 'react-leaflet';
import axios from 'axios';

const NETWORK_COLORS = {
  alertcalifornia: '#9c27b0',
  alertwest:       '#00bcd4',
  hpwren:          '#2196f3',
  alertwildfire:   '#e91e63',
};

function networkColor(network = '') {
  const key = network.toLowerCase().replace(/[^a-z]/g, '');
  return NETWORK_COLORS[key] || '#9c27b0';
}

function CameraMarkerLayer({ bbox, onCameraClick }) {
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    const params = { limit: 500 };
    if (bbox) params.bbox = bbox;
    axios.get('/api/cameras/map', { params })
      .then(res => setCameras(res.data.features || []))
      .catch(() => setCameras([]));
  }, [bbox]);

  return (
    <>
      {cameras.map((feature, i) => {
        const cam   = feature.properties;
        const color = networkColor(cam.network);
        const [lon, lat] = feature.geometry.coordinates;

        return (
          <CircleMarker
            key={cam.camera_id || i}
            center={[lat, lon]}
            radius={5}
            pathOptions={{
              color:       color,
              fillColor:   color,
              fillOpacity: 0.8,
              weight:      1,
            }}
            eventHandlers={{ click: () => onCameraClick?.(cam) }}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              <strong>{cam.name}</strong><br />
              {cam.network}
              {cam.is_ptz ? ' · PTZ' : ''}
              {cam.is_infrared ? ' · IR' : ''}
            </Tooltip>

            <Popup>
              <div style={{ minWidth: 200, fontSize: '0.82em' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  📷 {cam.name}
                </div>
                <div style={{ color: color, fontSize: '0.75em', marginBottom: 8 }}>
                  {cam.network}
                  {cam.is_ptz ? ' · Pan-Tilt-Zoom' : ''}
                  {cam.is_infrared ? ' · Infrared/Night Vision' : ''}
                </div>
                <div style={{ marginBottom: 8, lineHeight: 1.7, color: '#666', fontSize: '0.78em' }}>
                  {cam.region && <div>Region: {cam.region}</div>}
                  {cam.state  && <div>State: {cam.state}</div>}
                  {cam.elevation_ft && <div>Elevation: {cam.elevation_ft} ft</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <a
                    href={cam.viewer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#9c27b0', fontSize: '0.8em' }}
                  >
                    🔗 Open in ALERTWildfire →
                  </a>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default CameraMarkerLayer;
