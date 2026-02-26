/**
 * IncidentCard
 * Compact card showing a single fire incident's key stats.
 */
import React from 'react';
import './IncidentCard.css';

function IncidentCard({ incident, isSelected, onClick }) {
  const pct = incident.percent_contained ?? 0;
  const isContained = incident.is_contained;

  const statusColor = isContained
    ? '#4caf50'
    : pct >= 50 ? '#ff9800'
    : pct >= 1  ? '#ff6600'
    : '#e53935';

  function formatAcres(a) {
    if (!a) return '—';
    const n = parseFloat(a);
    return n >= 1000 ? `${(n/1000).toFixed(1)}k ac` : `${Math.round(n)} ac`;
  }

  function formatDiscovery(epoch) {
    if (!epoch) return '—';
    return new Date(epoch).toLocaleDateString();
  }

  return (
    <div
      className={`incident-card ${isSelected ? 'selected' : ''}`}
      style={{ borderLeftColor: statusColor }}
      onClick={() => onClick?.(incident)}
    >
      <div className="incident-card-top">
        <div className="incident-name">{incident.name}</div>
        <div className="incident-size">{formatAcres(incident.daily_acres)}</div>
      </div>

      <div className="incident-meta">
        <span>{incident.state}{incident.county ? ` · ${incident.county}` : ''}</span>
        <span className="incident-cause">
          {incident.cause_general || incident.cause || 'Unknown cause'}
        </span>
      </div>

      <div className="incident-stats">
        <div className="stat">
          <span className="stat-val">{isContained ? '✓' : `${pct}%`}</span>
          <span className="stat-label">contained</span>
        </div>
        <div className="stat">
          <span className="stat-val">{incident.personnel ?? '—'}</span>
          <span className="stat-label">personnel</span>
        </div>
        <div className="stat">
          <span className="stat-val">{formatDiscovery(incident.discovery_epoch)}</span>
          <span className="stat-label">discovered</span>
        </div>
      </div>

      {incident.dispatch_center && (
        <div className="incident-dispatch">
          📡 {incident.dispatch_center}
          {incident.jurisdictional_unit ? ` · ${incident.jurisdictional_unit}` : ''}
        </div>
      )}

      {/* Containment progress bar */}
      <div className="containment-bar">
        <div
          className="containment-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: statusColor }}
        />
      </div>
    </div>
  );
}

export default IncidentCard;
