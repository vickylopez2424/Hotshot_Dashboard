import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AirNowPanel.css';

const AQI_SCALE = [
  { label: 'Good',                range: '0–50',   color: '#00e400', desc: 'Air quality satisfactory, little risk.' },
  { label: 'Moderate',            range: '51–100',  color: '#ffff00', desc: 'Acceptable; some risk for unusually sensitive people.' },
  { label: 'Unhealthy (Sensitive)', range: '101–150', color: '#ff7e00', desc: 'Sensitive groups may experience health effects.' },
  { label: 'Unhealthy',           range: '151–200', color: '#ff0000', desc: 'Everyone may begin to experience health effects.' },
  { label: 'Very Unhealthy',      range: '201–300', color: '#8f3f97', desc: 'Health alert — everyone may experience serious effects.' },
  { label: 'Hazardous',           range: '301+',    color: '#7e0023', desc: 'Emergency conditions; entire population at risk.' },
];

export default function AirNowPanel() {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState(true);
  const [filter, setFilter] = useState(0);
  const [sort,   setSort]   = useState('aqi_desc');

  function load() {
    setLoading(true);
    axios.get('/api/airnow/status')
      .then(res => {
        if (res.data.state !== 'ready') { setApiKey(false); setLoading(false); return; }
        return axios.get('/api/airnow/observations');
      })
      .then(res => {
        if (res) setObservations(res.data.observations || []);
      })
      .catch(() => setObservations([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = observations.filter(o => o.aqi >= filter);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'aqi_desc') return b.aqi - a.aqi;
    if (sort === 'aqi_asc')  return a.aqi - b.aqi;
    return a.reporting_area.localeCompare(b.reporting_area);
  });

  const worst = observations.reduce((best, o) => (!best || o.aqi > best.aqi ? o : best), null);

  return (
    <div className="airnow-panel">
      <div className="airnow-header">
        <div className="airnow-title">
          <span className="panel-icon">💨</span>
          <div>
            <h2>Air Quality (AQI)</h2>
            <p>EPA AirNow — PM2.5 · Wildfire Smoke</p>
          </div>
        </div>
        <button className="btn-refresh" onClick={load}>↻</button>
      </div>

      {!apiKey ? (
        <div className="airnow-no-key">
          <p>No API key configured.</p>
          <p>Get a free key at <a href="https://docs.airnowapi.org/account/request/" target="_blank" rel="noreferrer">docs.airnowapi.org</a> and set <code>AIRNOW_API_KEY</code> in <code>backend/.env</code>.</p>
        </div>
      ) : (
        <>
          {!loading && worst && (
            <div className="airnow-worst" style={{ borderColor: worst.color }}>
              <div className="worst-label">Highest AQI</div>
              <div className="worst-value" style={{ color: worst.color }}>{worst.aqi}</div>
              <div className="worst-area">{worst.reporting_area}, {worst.state}</div>
              <div className="worst-cat">{worst.category}</div>
            </div>
          )}

          <div className="airnow-controls">
            <div className="control-group">
              <label>Min AQI</label>
              <select value={filter} onChange={e => setFilter(Number(e.target.value))}>
                <option value={0}>All stations</option>
                <option value={51}>Moderate+</option>
                <option value={101}>Unhealthy (Sensitive)+</option>
                <option value={151}>Unhealthy+</option>
              </select>
            </div>
            <div className="control-group">
              <label>Sort</label>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="aqi_desc">Highest AQI first</option>
                <option value="aqi_asc">Lowest AQI first</option>
                <option value="name">By area name</option>
              </select>
            </div>
          </div>

          {loading && <div className="airnow-loading">Fetching observations…</div>}

          <div className="airnow-count">
            {filtered.length} station{filtered.length !== 1 ? 's' : ''}
          </div>

          <div className="airnow-list">
            {sorted.map((obs, i) => (
              <div className="obs-card" key={i}>
                <div className="obs-aqi-badge" style={{ background: obs.color }}>
                  {obs.aqi}
                </div>
                <div className="obs-info">
                  <div className="obs-area">{obs.reporting_area}, {obs.state}</div>
                  <div className="obs-cat" style={{ color: obs.color }}>{obs.category}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="airnow-scale">
            <h3>AQI Scale</h3>
            {AQI_SCALE.map(s => (
              <div className="scale-row" key={s.label}>
                <span className="scale-dot" style={{ background: s.color }} />
                <span className="scale-label">{s.label}</span>
                <span className="scale-range">{s.range}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
