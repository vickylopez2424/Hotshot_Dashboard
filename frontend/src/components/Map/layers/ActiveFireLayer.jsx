/**
 * ActiveFireLayer — NASA FIRMS satellite fire detections
 * Colors dots by confidence: high=red, nominal=orange, low=yellow
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import axios from 'axios';

export default function ActiveFireLayer() {
  const [fires, setFires] = useState([]);

  useEffect(() => {
    axios.get('/api/firms/active', { params: { days: 1 } })
      .then(res => setFires(res.data.fires || []))
      .catch(() => setFires([]));
  }, []);

  return (
    <>
      {fires.map((fire, i) => (
        <CircleMarker
          key={i}
          center={[fire.latitude, fire.longitude]}
          radius={fire.confidence_level === 'high' ? 7 : 5}
          pathOptions={{
            color:       fire.confidence_color || '#ff8c00',
            fillColor:   fire.confidence_color || '#ff8c00',
            fillOpacity: 0.75,
            weight:      1,
          }}
        >
          <Tooltip sticky>
            <strong>Fire Detection</strong><br />
            {fire.acq_date} {fire.acq_time}<br />
            Confidence: <strong>{fire.confidence_level}</strong><br />
            FRP: {fire.frp || '—'} MW<br />
            Source: {fire.source}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
