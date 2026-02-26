import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './NWSPanel.css';

const SEVERITY_ORDER = ['Red Flag Warning', 'Extreme Fire Danger', 'Fire Weather Watch', 'Fire Weather Statement'];

export default function NWSPanel() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  function load() {
    setLoading(true);
    axios.get('/api/nws/alerts')
      .then(res => setAlerts(res.data.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Sort: warnings first, then watches, then statements
  const sorted = [...alerts].sort((a, b) => {
    return SEVERITY_ORDER.indexOf(a.event) - SEVERITY_ORDER.indexOf(b.event);
  });

  const byType = alerts.reduce((acc, a) => {
    acc[a.event] = (acc[a.event] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="nws-panel">
      <div className="nws-header">
        <div className="nws-title">
          <span className="panel-icon">⛈️</span>
          <div>
            <h2>NWS Fire Weather</h2>
            <p>Active federal alerts</p>
          </div>
        </div>
        <button className="btn-refresh" onClick={load}>↻</button>
      </div>

      {/* Summary chips */}
      {!loading && alerts.length > 0 && (
        <div className="nws-summary">
          {Object.entries(byType).map(([type, count]) => (
            <div
              className="summary-chip"
              key={type}
              style={{ borderColor: ALERT_COLOR[type] || '#ff6600', color: ALERT_COLOR[type] || '#ff6600' }}
            >
              {count} {type}
            </div>
          ))}
        </div>
      )}

      {loading && <div className="nws-loading">Loading alerts…</div>}

      {!loading && alerts.length === 0 && (
        <div className="nws-empty">
          <span>✓</span>
          <p>No active fire weather alerts.</p>
        </div>
      )}

      <div className="nws-list">
        {sorted.map((alert, i) => (
          <div className="alert-card" key={alert.id || i}>
            <div
              className="alert-color-bar"
              style={{ background: alert.color || '#ff6600' }}
            />
            <div className="alert-body">
              <div className="alert-top">
                <span
                  className="alert-badge"
                  style={{ background: alert.color + '22', color: alert.color, borderColor: alert.color + '44' }}
                >
                  {alert.event}
                </span>
              </div>
              <div className="alert-area">{alert.area_desc}</div>
              {alert.headline && (
                <div className="alert-headline">{alert.headline}</div>
              )}
              <div className="alert-meta">
                {alert.effective && (
                  <span>From: {new Date(alert.effective).toLocaleString()}</span>
                )}
                {alert.expires && (
                  <span>Until: {new Date(alert.expires).toLocaleString()}</span>
                )}
              </div>
              {alert.description && (
                <button
                  className="btn-expand"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  {expanded === i ? 'Hide details ▲' : 'Show details ▼'}
                </button>
              )}
              {expanded === i && (
                <div className="alert-description">
                  {alert.description}
                  {alert.instruction && (
                    <>
                      <strong>What to do:</strong><br />
                      {alert.instruction}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ALERT_COLOR = {
  'Red Flag Warning':       '#cc0000',
  'Fire Weather Watch':     '#ff6600',
  'Fire Weather Statement': '#ffaa00',
  'Extreme Fire Danger':    '#990000',
};
