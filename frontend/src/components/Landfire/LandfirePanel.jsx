import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './LandfirePanel.css';

const LAYERS = [
  { id: 'fbfm40', wms: 'US_220FBFM40', label: 'Fuel Model (FBFM40)',     desc: 'Scott-Burgan 40 fire behavior fuel models — standard for fire spread prediction.' },
  { id: 'fbfm13', wms: 'US_220FBFM13', label: 'Fuel Model (FBFM13)',     desc: 'Anderson 13 classic fuel models.' },
  { id: 'evt',    wms: 'US_220EVT',    label: 'Vegetation Type',          desc: '700+ existing plant community types.' },
  { id: 'evc',    wms: 'US_220EVC',    label: 'Vegetation Cover',         desc: 'Percent ground covered by vegetation.' },
  { id: 'cc',     wms: 'US_220CC',     label: 'Canopy Cover',             desc: 'Forest canopy closure — relevant for crown fire.' },
  { id: 'ch',     wms: 'US_220CH',     label: 'Canopy Height',            desc: 'Forest canopy height — ladder fuel risk.' },
];

const RISK_COLOR = { none: '#555', low: '#238636', moderate: '#9a6700', high: '#e05c2a', extreme: '#cc0000' };

export default function LandfirePanel({ onLayerChange, onOpacityChange }) {
  const [activeLayer, setActiveLayer] = useState(LAYERS[0]);
  const [opacity,     setOpacity]     = useState(0.7);
  const [query,       setQuery]       = useState(null);  // point query result
  const [queryLoading, setQueryLoading] = useState(false);
  const [fuelModels,  setFuelModels]  = useState({});

  useEffect(() => {
    axios.get('/api/landfire/fuel-models').then(res => setFuelModels(res.data.fuel_models || {})).catch(() => {});
  }, []);

  function selectLayer(layer) {
    setActiveLayer(layer);
    onLayerChange && onLayerChange(layer.wms);
  }

  function handleOpacity(v) {
    setOpacity(v);
    onOpacityChange && onOpacityChange(v);
  }

  async function queryPoint(lat, lon) {
    setQueryLoading(true);
    try {
      const res = await axios.get('/api/landfire/query', { params: { lat, lon } });
      setQuery(res.data);
    } catch {
      setQuery({ error: 'Query failed' });
    } finally {
      setQueryLoading(false);
    }
  }

  // Expose queryPoint to parent so map clicks can trigger it
  useEffect(() => {
    window._landfireQueryPoint = queryPoint;
    return () => { delete window._landfireQueryPoint; };
  }, []);

  const fuelResult = query?.results?.fbfm40;
  const fuelCode   = fuelResult?.value;
  const fuelInfo   = fuelCode ? fuelModels[fuelCode] : null;

  return (
    <div className="landfire-panel">
      <div className="lf-header">
        <span className="panel-icon">🌿</span>
        <div>
          <h2>LANDFIRE</h2>
          <p>Fuel & vegetation — USDA/USDI</p>
        </div>
      </div>

      {/* Layer selector */}
      <div className="lf-section">
        <h3>Map Layer</h3>
        <div className="lf-layer-list">
          {LAYERS.map(layer => (
            <button
              key={layer.id}
              className={`lf-layer-btn ${activeLayer.id === layer.id ? 'active' : ''}`}
              onClick={() => selectLayer(layer)}
            >
              <span className="lf-layer-name">{layer.label}</span>
              <span className="lf-layer-desc">{layer.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Opacity slider */}
      <div className="lf-section">
        <h3>Opacity — {Math.round(opacity * 100)}%</h3>
        <input
          type="range"
          min="0.1" max="1" step="0.05"
          value={opacity}
          onChange={e => handleOpacity(Number(e.target.value))}
          className="lf-slider"
        />
      </div>

      {/* Click-to-query instructions */}
      <div className="lf-query-hint">
        <span>🖱️</span>
        <p>Click anywhere on the map while this panel is active to query fuel model data at that point.</p>
      </div>

      {/* Point query result */}
      {queryLoading && <div className="lf-loading">Querying LANDFIRE…</div>}
      {query && !queryLoading && (
        <div className="lf-query-result">
          <h3>Point Query — {query.lat?.toFixed(4)}, {query.lon?.toFixed(4)}</h3>
          {fuelCode && (
            <div className="lf-fuel-card">
              <div className="fuel-code">{fuelCode}</div>
              {fuelInfo ? (
                <>
                  <div className="fuel-name">{fuelInfo.name}</div>
                  <div
                    className="fuel-risk"
                    style={{ color: RISK_COLOR[fuelInfo.risk] }}
                  >
                    {fuelInfo.risk?.toUpperCase()} risk · {fuelInfo.type}
                  </div>
                </>
              ) : (
                <div className="fuel-name">Code {fuelCode}</div>
              )}
            </div>
          )}
          {query.error && <div className="lf-error">{query.error}</div>}
        </div>
      )}

      <div className="lf-attribution">
        Data: <a href="https://www.landfire.gov" target="_blank" rel="noreferrer">LANDFIRE</a> US 220 — USDA/USDI, updated 2022.
      </div>
    </div>
  );
}
