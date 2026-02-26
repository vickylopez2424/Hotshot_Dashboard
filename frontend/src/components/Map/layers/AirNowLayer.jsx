/**
 * AirNowLayer — EPA AQI monitoring stations
 * Colored circles by AQI category (green → maroon)
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import axios from 'axios';

export default function AirNowLayer() {
  const [observations, setObservations] = useState([]);

  useEffect(() => {
    axios.get('/api/airnow/observations')
      .then(res => setObservations(res.data.observations || []))
      .catch(() => {});
  }, []);

  return (
    <>
      {observations
        .filter(o => o.latitude && o.longitude && o.aqi >= 0)
        .map((obs, i) => (
          <CircleMarker
            key={i}
            center={[obs.latitude, obs.longitude]}
            radius={obs.aqi >= 150 ? 10 : obs.aqi >= 100 ? 8 : 6}
            pathOptions={{
              color:       obs.color,
              fillColor:   obs.color,
              fillOpacity: 0.8,
              weight:      1,
            }}
          >
            <Tooltip sticky>
              <strong>{obs.reporting_area}</strong>, {obs.state}<br />
              AQI: <strong>{obs.aqi}</strong> — {obs.category}<br />
              {obs.parameter} · {obs.date_observed}
            </Tooltip>
          </CircleMarker>
        ))
      }
    </>
  );
}
