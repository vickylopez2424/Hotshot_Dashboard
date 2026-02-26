/**
 * WimsPanel
 * Right panel — WIMS/RAWS fire weather stations with danger-level filtering.
 */
import React, { useEffect, useState, useCallback } from 'react';
import StationCard from './StationCard';
import axios from 'axios';
import './WimsPanel.css';

const US_STATES = [
  'AK','AL','AR','AZ','CA','CO','CT','DE','FL','GA',
  'HI','IA','ID','IL','IN','KS','KY','LA','MA','MD',
  'ME','MI','MN','MO','MS','MT','NC','ND','NE','NH',
  'NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VA','VT','WA','WI','WV','WY',
];

const DANGER_FILTERS = ['all', 'extreme', 'high', 'moderate', 'low'];

const DANGER_COLORS = {
  extreme: '#ff0000',
  high:    '#ff6600',
  moderate:'#ffcc00',
  low:     '#00cc44',
  all:     '#ff6b35',
};

function DangerSummaryBar({ stations }) {
  const counts = { extreme: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  stations.forEach(s => { counts[s.danger_level] = (counts[s.danger_level] || 0) + 1; });
  const total = stations.length || 1;

  return (
    <div className="danger-summary-bar">
      {['extreme', 'high', 'moderate', 'low'].map(level => (
        counts[level] > 0 && (
          <div
            key={level}
            className="danger-bar-segment"
            style={{ width: `${(counts[level] / total) * 100}%`, background: DANGER_COLORS[level] }}
            title={`${level}: ${counts[level]} stations`}
          />
        )
      ))}
    </div>
  );
}

function WimsPanel() {
  const [stations, setStations]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [selectedState, setSelectedState] = useState('CA');
  const [dangerFilter, setDangerFilter]   = useState('all');
  const [search, setSearch]         = useState('');

  const fetchStations = useCallback(() => {
    setLoading(true);
    setError(null);
    axios.get('/api/wims/stations', { params: { state: selectedState } })
      .then(res => setStations(res.data.stations || []))
      .catch(err => {
        const msg = err.response?.data?.error || err.message;
        setError(msg);
        setStations([]);
      })
      .finally(() => setLoading(false));
  }, [selectedState]);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const displayed = stations.filter(s => {
    if (dangerFilter !== 'all' && s.danger_level !== dangerFilter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.station_id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="wims-panel">
      <div className="panel-header">🌡️ WIMS / RAWS Stations</div>

      {/* Controls */}
      <div className="wims-controls">
        <select
          className="state-select"
          value={selectedState}
          onChange={e => setSelectedState(e.target.value)}
        >
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <input
          className="station-search"
          type="text"
          placeholder="Search stations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <button className="refresh-btn" onClick={fetchStations} disabled={loading}>
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      {/* Danger level filter */}
      <div className="danger-filters">
        {DANGER_FILTERS.map(level => (
          <button
            key={level}
            className={`danger-filter-btn ${dangerFilter === level ? 'active' : ''}`}
            style={dangerFilter === level ? { background: DANGER_COLORS[level], borderColor: DANGER_COLORS[level], color: level === 'moderate' ? '#333' : '#fff' } : {}}
            onClick={() => setDangerFilter(level)}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>

      {/* Station count + danger distribution bar */}
      {stations.length > 0 && (
        <div className="wims-stats">
          <span className="station-count">
            {displayed.length} of {stations.length} stations
          </span>
          <DangerSummaryBar stations={stations} />
        </div>
      )}

      {/* Content */}
      <div className="wims-station-list">
        {loading && <p className="placeholder">Loading stations...</p>}

        {!loading && error && (
          <div className="wims-error">
            <p>⚠ Could not load stations</p>
            <p className="error-detail">{error}</p>
            {error.includes('SYNOPTIC_API_KEY') && (
              <p className="error-detail">
                Get a free API token at{' '}
                <a href="https://synopticdata.com" target="_blank" rel="noopener noreferrer">
                  synopticdata.com
                </a>{' '}
                and add it to <code>backend/.env</code>
              </p>
            )}
          </div>
        )}

        {!loading && !error && displayed.length === 0 && stations.length > 0 && (
          <p className="placeholder">No stations match the current filter.</p>
        )}

        {!loading && !error && stations.length === 0 && !error && (
          <p className="placeholder">
            No stations returned.<br />
            Check your API key and try a different state.
          </p>
        )}

        {displayed.map(station => (
          <StationCard key={station.station_id} station={station} />
        ))}
      </div>
    </div>
  );
}

export default WimsPanel;
