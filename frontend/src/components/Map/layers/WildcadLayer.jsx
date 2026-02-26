/**
 * WildcadLayer
 * Renders active fire incidents from NIFC/IRWIN on the map.
 *
 * Marker size scales with acreage. Color indicates containment:
 *   Red    = active, uncontained
 *   Orange = partially contained
 *   Green  = contained / controlled
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Tooltip, Popup } from 'react-leaflet';
import axios from 'axios';

function incidentColor(inc) {
  if (inc.is_contained) return '#4caf50';
  const pct = inc.percent_contained ?? 0;
  if (pct >= 50) return '#ff9800';
  if (pct >= 1)  return '#ff6600';
  return '#e53935';
}

function markerRadius(acres) {
  if (!acres) return 5;
  const a = parseFloat(acres);
  if (a >= 100000) return 18;
  if (a >= 10000)  return 14;
  if (a >= 1000)   return 10;
  if (a >= 100)    return 7;
  return 5;
}

function formatAcres(acres) {
  if (!acres) return 'Unknown';
  const a = parseFloat(acres);
  if (a >= 1000) return `${(a / 1000).toFixed(1)}k ac`;
  return `${Math.round(a)} ac`;
}

function formatDate(epoch) {
  if (!epoch) return 'Unknown';
  return new Date(epoch).toLocaleString();
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
        const inc   = feature.properties;
        const color = incidentColor(inc);
        const radius = markerRadius(inc.daily_acres);

        return (
          <CircleMarker
            key={inc.id || i}
            center={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
            radius={radius}
            pathOptions={{
              color:       color,
              fillColor:   color,
              fillOpacity: 0.75,
              weight:      1.5,
            }}
            eventHandlers={{ click: () => onIncidentClick?.(inc) }}
          >
            <Tooltip direction="top" offset={[0, -radius]}>
              <strong>{inc.name}</strong><br />
              {formatAcres(inc.daily_acres)}
              {inc.percent_contained != null ? ` · ${inc.percent_contained}% contained` : ''}
            </Tooltip>

            <Popup>
              <div style={{ minWidth: 220, fontSize: '0.82em' }}>
                <div style={{ fontWeight: 700, fontSize: '1em', marginBottom: 4 }}>
                  🔥 {inc.name}
                </div>
                <div style={{ color: color, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', fontSize: '0.75em' }}>
                  {inc.is_contained ? '✓ Contained' : `${inc.percent_contained ?? 0}% Contained`}
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
          </CircleMarker>
        );
      })}
    </>
  );
}

export default WildcadLayer;
