import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FirmsPanel.css';

const SOURCES = [
  { id: 'VIIRS_SNPP_NRT',   label: 'VIIRS S-NPP (375m)' },
  { id: 'VIIRS_NOAA20_NRT', label: 'VIIRS NOAA-20 (375m)' },
  { id: 'MODIS_NRT',        label: 'MODIS (1km)' },
];

export default function FirmsPanel() {
  const [source, setSource] = useState('VIIRS_SNPP_NRT');
  const [days,   setDays]   = useState(1);
  const [stats,  setStats]  = useState(null);
  const [apiKey, setApiKey] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/firms/status')
      .then(res => {
        setApiKey(res.data.state === 'ready');
      })
      .catch(() => setApiKey(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    axios.get('/api/firms/stats', { params: { source, days } })
      .then(res => setStats(res.data))
      .catch(() => setStats(null));
  }, [source, days, apiKey]);

  const confColors = { high: '#ff2200', nominal: '#ff8c00', low: '#ffd700' };

  return (
    <div className="firms-panel">
      <div className="panel-header">
        <span className="panel-icon">🛰️</span>
        <div>
          <h2>NASA FIRMS</h2>
          <p>Active fire detections</p>
        </div>
      </div>

      {!apiKey ? (
        <div className="firms-no-key">
          <p>No API key configured.</p>
          <p>Get a free key at <a href="https://firms.modaps.eosdis.nasa.gov/api/" target="_blank" rel="noreferrer">firms.modaps.eosdis.nasa.gov</a> and set <code>FIRMS_API_KEY</code> in <code>backend/.env</code>.</p>
        </div>
      ) : (
        <>
          <div className="firms-controls">
            <div className="control-group">
              <label>Sensor</label>
              <select value={source} onChange={e => setSource(e.target.value)}>
                {SOURCES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label>Range</label>
              <select value={days} onChange={e => setDays(Number(e.target.value))}>
                <option value={1}>Last 24 hrs</option>
                <option value={2}>Last 48 hrs</option>
                <option value={3}>Last 72 hrs</option>
              </select>
            </div>
          </div>

          {stats ? (
            <>
              <div className="firms-stat-card">
                <div className="stat-number">{stats.total.toLocaleString()}</div>
                <div className="stat-label">Fire Detections</div>
              </div>

              <div className="firms-confidence">
                <h3>By Confidence</h3>
                {Object.entries(stats.by_confidence || {}).map(([level, count]) => (
                  <div className="conf-row" key={level}>
                    <span className="conf-dot" style={{ background: confColors[level] }} />
                    <span className="conf-label">{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                    <span className="conf-count">{count.toLocaleString()}</span>
                    <div
                      className="conf-bar"
                      style={{
                        width: `${stats.total ? (count / stats.total) * 100 : 0}%`,
                        background: confColors[level],
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="firms-legend">
                <h3>Map Legend</h3>
                {[
                  { level: 'high',    color: '#ff2200', label: 'High confidence' },
                  { level: 'nominal', color: '#ff8c00', label: 'Nominal confidence' },
                  { level: 'low',     color: '#ffd700', label: 'Low confidence' },
                ].map(item => (
                  <div className="legend-row" key={item.level}>
                    <span className="legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : loading ? (
            <div className="firms-loading">Loading…</div>
          ) : null}
        </>
      )}
    </div>
  );
}
