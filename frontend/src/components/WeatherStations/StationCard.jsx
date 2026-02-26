/**
 * StationCard
 * Individual RAWS station data card for the right panel.
 */
import React from 'react';
import './StationCard.css';

const DANGER_LABELS = {
  extreme:  { label: 'EXTREME', bg: '#ff0000' },
  high:     { label: 'HIGH',    bg: '#ff6600' },
  moderate: { label: 'MODERATE',bg: '#ffcc00' },
  low:      { label: 'LOW',     bg: '#00cc44' },
  unknown:  { label: 'N/A',     bg: '#888888' },
};

function Reading({ icon, label, value, unit }) {
  return (
    <div className="reading">
      <span className="reading-icon">{icon}</span>
      <span className="reading-label">{label}</span>
      <span className="reading-value">
        {value != null ? `${value}${unit}` : '—'}
      </span>
    </div>
  );
}

function StationCard({ station }) {
  const danger = DANGER_LABELS[station.danger_level] || DANGER_LABELS.unknown;

  return (
    <div className="station-card" style={{ borderLeftColor: danger.bg }}>
      <div className="station-card-header">
        <div>
          <div className="station-card-name">{station.name}</div>
          <div className="station-card-meta">
            {station.station_id} · {station.state}
            {station.elevation_ft ? ` · ${station.elevation_ft} ft` : ''}
          </div>
        </div>
        <div
          className="danger-badge"
          style={{ background: danger.bg, color: station.danger_level === 'moderate' ? '#333' : '#fff' }}
        >
          {danger.label}
        </div>
      </div>

      <div className="station-readings-grid">
        <Reading icon="🌡" label="Temp"    value={station.temp_f}      unit="°F" />
        <Reading icon="💧" label="RH"      value={station.rh}          unit="%" />
        <Reading icon="💨" label="Wind"    value={station.wind_speed != null ? `${station.wind_speed} mph ${station.wind_dir_card}` : null} unit="" />
        <Reading icon="🌿" label="FM"      value={station.fuel_moisture} unit="%" />
        <Reading icon="🌧" label="Precip"  value={station.precip_in}   unit='"' />
        <Reading icon="🌡" label="Dew Pt"  value={station.dew_point_f} unit="°F" />
      </div>

      {station.obs_time && (
        <div className="station-obs-time">
          Updated: {new Date(station.obs_time).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default StationCard;
