/**
 * WildcadLayer
 * Renders active fire incidents from NIFC/IRWIN on the map.
 *
 * Watch Duty-style markers: a flame icon with the incident name + acreage
 * printed permanently beneath it. Flame size scales with acreage; contained
 * fires render gray.
 */
import React, { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import './fireMarkers.css';

function isContained(inc) {
  return inc.is_contained || (inc.percent_contained ?? 0) >= 100;
}

// Flame glyph size in px, scaled by fire size
function flameSize(acres) {
  const a = parseFloat(acres) || 0;
  if (a >= 50000) return 46;
  if (a >= 10000) return 40;
  if (a >= 1000)  return 32;
  if (a >= 100)   return 26;
  return 20;
}

function formatAcres(acres) {
  if (!acres) return 'Unknown';
  const a = parseFloat(acres);
  if (a >= 1000) return `${a.toLocaleString(undefined, { maximumFractionDigits: 1 })} ac`;
  return `${Math.round(a)} ac`;
}

function formatDate(epoch) {
  if (!epoch) return 'Unknown';
  return new Date(epoch).toLocaleString();
}

// Escape incident name before injecting into divIcon HTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function fireIcon(inc) {
  const size = flameSize(inc.daily_acres);
  const contained = isContained(inc);
  const labelH = 30;
  return L.divIcon({
    className: 'fire-div-icon',
    html: `
      <div class="fire-marker ${contained ? 'contained' : 'active'}">
        <div class="fire-flame" style="font-size:${size}px">🔥</div>
        <div class="fire-label">
          <span class="fire-name">${esc(inc.name || 'Fire')}</span>
          <span class="fire-acres">${formatAcres(inc.daily_acres)}</span>
        </div>
      </div>`,
    iconSize: [160, size + labelH],
    iconAnchor: [80, size],          // anchor at the base of the flame
    popupAnchor: [0, -size + 4],
  });
}

function WildcadLayer({ state, onIncidentClick }) {
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    const params = state ? { state } : {};
    axios.get('/api/wildcad/incidents/map', { params })
      .then(res => setIncidents(res.data.features || []))
      .catch(() => setIncidents([]));
  }, [state]);

  return (
    <>
      {incidents.map((feature, i) => {
        const inc = feature.properties;
        const color = isContained(inc) ? '#8a8a8a'
          : (inc.percent_contained ?? 0) >= 50 ? '#ff9800' : '#e53935';

        return (
          <Marker
            key={inc.id || i}
            position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
            icon={fireIcon(inc)}
            eventHandlers={{ click: () => onIncidentClick?.(inc) }}
          >
            <Popup>
              <div style={{ minWidth: 220, fontSize: '0.82em' }}>
                <div style={{ fontWeight: 700, fontSize: '1em', marginBottom: 4 }}>
                  🔥 {inc.name}
                </div>
                <div style={{ color, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', fontSize: '0.75em' }}>
                  {isContained(inc) ? '✓ Contained' : `${inc.percent_contained ?? 0}% Contained`}
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    <tr><td style={{ color: '#888', paddingRight: 8 }}>State</td><td>{inc.state} · {inc.county}</td></tr>
                    <tr><td style={{ color: '#888' }}>Size</td><td>{formatAcres(inc.daily_acres)}</td></tr>
                    <tr><td style={{ color: '#888' }}>Cause</td><td>{inc.cause_general || inc.cause || 'Unknown'}</td></tr>
                    <tr><td style={{ color: '#888' }}>Agency</td><td>{inc.landowner_category || 'Unknown'}</td></tr>
                    <tr><td style={{ color: '#888' }}>Dispatch</td><td>{inc.dispatch_center || '—'}</td></tr>
                    <tr><td style={{ color: '#888' }}>Personnel</td><td>{inc.personnel ?? '—'}</td></tr>
                    <tr><td style={{ color: '#888' }}>Discovered</td><td>{formatDate(inc.discovery_epoch)}</td></tr>
                    <tr><td style={{ color: '#888' }}>Size class</td><td>{inc.size_class}</td></tr>
                  </tbody>
                </table>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default WildcadLayer;
