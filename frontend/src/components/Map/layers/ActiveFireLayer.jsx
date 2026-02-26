/**
 * ActiveFireLayer
 * Renders NASA FIRMS active fire detections as circle markers on the map.
 * Data is fetched from the backend /api/firms endpoint.
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import axios from 'axios';

const FIRE_COLOR = '#ff4500';

function ActiveFireLayer() {
  const [fires, setFires] = useState([]);

  useEffect(() => {
    axios.get('/api/firms/active')
      .then(res => setFires(res.data.fires || []))
      .catch(() => {
        // Backend not yet connected — use empty state
        setFires([]);
      });
  }, []);

  return (
    <>
      {fires.map((fire, i) => (
        <CircleMarker
          key={i}
          center={[fire.latitude, fire.longitude]}
          radius={6}
          pathOptions={{ color: FIRE_COLOR, fillColor: FIRE_COLOR, fillOpacity: 0.7 }}
        >
          <Popup>
            <strong>Active Fire Detection</strong><br />
            Lat: {fire.latitude}, Lon: {fire.longitude}<br />
            Brightness: {fire.brightness} K<br />
            Date: {fire.acq_date}<br />
            Source: {fire.satellite}
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export default ActiveFireLayer;
