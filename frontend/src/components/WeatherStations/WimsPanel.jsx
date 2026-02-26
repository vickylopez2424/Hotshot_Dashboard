/**
 * WimsPanel
 * Right panel showing WIMS/RAWS fire weather station data.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './WimsPanel.css';

function WimsPanel() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'wims' | 'rx'

  useEffect(() => {
    axios.get('/api/wims/stations')
      .then(res => setStations(res.data.stations || []))
      .catch(() => setStations([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? stations
    : stations.filter(s => s.type === filter);

  return (
    <div>
      <div className="panel-header">🌡️ Weather Stations</div>
      <div className="panel-body">
        <div className="station-filter">
          {['all', 'wims', 'rx'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'wims' ? 'WIMS/RAWS' : 'Rx Weather'}
            </button>
          ))}
        </div>

        {loading && <p className="placeholder">Loading stations...</p>}

        {!loading && filtered.length === 0 && (
          <p className="placeholder">
            No stations loaded yet.<br />
            Backend WIMS integration in progress.
          </p>
        )}

        {filtered.map(station => (
          <div key={station.station_id} className="station-card">
            <div className="station-name">{station.name}</div>
            <div className="station-type">{station.type?.toUpperCase()}</div>
            <div className="station-readings">
              <span>🌡 {station.temp_f ?? '--'}°F</span>
              <span>💧 {station.rh ?? '--'}% RH</span>
              <span>💨 {station.wind_speed ?? '--'} mph</span>
              <span>🌿 FM: {station.fuel_moisture ?? '--'}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WimsPanel;
