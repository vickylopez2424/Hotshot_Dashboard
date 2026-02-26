/**
 * WimsLayer
 * Renders RAWS fire weather stations on the map.
 * Markers are color-coded by fire danger level:
 *   Green  = Low    (RH >= 25%, wind < 15 mph)
 *   Yellow = Moderate
 *   Orange = High
 *   Red    = Extreme (RH < 10% AND wind >= 25 mph)
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import axios from 'axios';

// Must match DANGER_COLORS in backend connector
const DANGER_COLORS = {
  extreme:  '#ff0000',
  high:     '#ff6600',
  moderate: '#ffcc00',
  low:      '#00cc44',
  unknown:  '#888888',
};

function WimsLayer({ state }) {
  const [stations, setStations] = useState([]);

  useEffect(() => {
    const params = state ? { state } : {};
    axios.get('/api/wims/stations', { params })
      .then(res => setStations(res.data.stations || []))
      .catch(() => setStations([]));
  }, [state]);

  return (
    <>
      {stations.map((station) => (
        <CircleMarker
          key={station.station_id}
          center={[station.latitude, station.longitude]}
          radius={6}
          pathOptions={{
            color:       station.danger_color || DANGER_COLORS.unknown,
            fillColor:   station.danger_color || DANGER_COLORS.unknown,
            fillOpacity: 0.85,
            weight:      1,
          }}
        >
          {/* Quick-view tooltip on hover */}
          <Tooltip direction="top" offset={[0, -4]}>
            <strong>{station.name}</strong><br />
            {station.temp_f != null   ? `🌡 ${station.temp_f}°F  ` : ''}
            {station.rh != null       ? `💧 ${station.rh}% RH  ` : ''}
            {station.wind_speed != null ? `💨 ${station.wind_speed} mph` : ''}
          </Tooltip>

          {/* Full detail popup on click */}
          <Popup>
            <div style={{ minWidth: 200 }}>
              <strong style={{ fontSize: '0.95em' }}>{station.name}</strong>
              <div style={{ color: station.danger_color, fontWeight: 700, margin: '4px 0', textTransform: 'uppercase', fontSize: '0.75em' }}>
                ⚠ {station.danger_level} danger
              </div>
              <table style={{ fontSize: '0.8em', borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr><td>🌡 Temp</td><td>{station.temp_f != null ? `${station.temp_f}°F` : 'N/A'}</td></tr>
                  <tr><td>💧 RH</td><td>{station.rh != null ? `${station.rh}%` : 'N/A'}</td></tr>
                  <tr><td>💨 Wind</td><td>{station.wind_speed != null ? `${station.wind_speed} mph ${station.wind_dir_card}` : 'N/A'}</td></tr>
                  <tr><td>🌿 Fuel Moisture</td><td>{station.fuel_moisture != null ? `${station.fuel_moisture}%` : 'N/A'}</td></tr>
                  <tr><td>🌧 Precip</td><td>{station.precip_in != null ? `${station.precip_in}"` : 'N/A'}</td></tr>
                  <tr><td>📍 Elev</td><td>{station.elevation_ft ? `${station.elevation_ft} ft` : 'N/A'}</td></tr>
                  <tr><td>🆔 ID</td><td>{station.station_id}</td></tr>
                  <tr><td>🕐 Updated</td><td style={{ fontSize: '0.75em' }}>{station.obs_time ? new Date(station.obs_time).toLocaleTimeString() : 'N/A'}</td></tr>
                </tbody>
              </table>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export default WimsLayer;
