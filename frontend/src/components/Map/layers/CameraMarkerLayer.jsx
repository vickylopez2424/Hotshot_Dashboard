/**
 * CameraMarkerLayer
 * Renders ALERTWildfire camera locations as markers on the map.
 * Clicking a marker opens a popup with a link to the live feed.
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import axios from 'axios';

const CAMERA_COLOR = '#9c27b0';

function CameraMarkerLayer() {
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    axios.get('/api/cameras/list')
      .then(res => setCameras(res.data.cameras || []))
      .catch(() => setCameras([]));
  }, []);

  return (
    <>
      {cameras.map((cam) => (
        <CircleMarker
          key={cam.camera_id}
          center={[cam.latitude, cam.longitude]}
          radius={5}
          pathOptions={{ color: CAMERA_COLOR, fillColor: CAMERA_COLOR, fillOpacity: 0.8 }}
        >
          <Popup>
            <strong>{cam.name}</strong><br />
            Network: {cam.network}<br />
            {cam.stream_url && (
              <a href={cam.stream_url} target="_blank" rel="noopener noreferrer">
                View Live Feed
              </a>
            )}
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export default CameraMarkerLayer;
