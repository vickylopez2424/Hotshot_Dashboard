import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './VegetationPanel.css';

const LAYERS = [
  { id: 'ndvi',    wms: 'MOD13A2_006_NDVI',          label: 'NDVI',                     desc: 'Vegetation greenness. Low = stressed/dry = higher fire risk.' },
  { id: 'evi',     wms: 'MOD13A2_006_EVI',            label: 'EVI',                      desc: 'Enhanced Vegetation Index — better in dense canopy areas.' },
  { id: 'lst',     wms: 'MOD11A2_006_LST_Day_1km',    label: 'Land Surface Temp',        desc: 'Daytime surface temperature. Hot spots may indicate stressed or drying vegetation.' },
];

const NDVI_CLASSES = [
  { range: '-1.0 – 0.0', label: 'Water / bare soil',         risk: 'none',     color: '#4444cc' },
  { range: '0.0 – 0.15', label: 'Sparse / desert',           risk: 'low',      color: '#888833' },
  { range: '0.15 – 0.30',label: 'Stressed / dry vegetation', risk: 'high',     color: '#cc6600' },
  { range: '0.30 – 0.45',label: 'Moderate vegetation',       risk: 'moderate', color: '#99cc33' },
  { range: '0.45 – 0.65',label: 'Healthy vegetation',        risk: 'low',      color: '#33aa33' },
  { range: '0.65 – 1.0', label: 'Dense healthy forest',      risk: 'low',      color: '#006600' },
];

const RISK_COLOR = { none: '#555', low: '#238636', moderate: '#9a6700', high: '#cc6600' };

export default function VegetationPanel({ onLayerChange, onOpacityChange }) {
  const [activeLayer, setActiveLayer] = useState(LAYERS[0]);
  const [opacity,     setOpacity]     = useState(0.65);
  const [ndviQuery,   setNdviQuery]   = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);

  function selectLayer(layer) {
    setActiveLayer(layer);
    onLayerChange && onLayerChange(layer.wms);
  }

  function handleOpacity(v) {
    setOpacity(v);
    onOpacityChange && onOpacityChange(v);
  }

  async function queryNDVI(lat, lon) {
    setQueryLoading(true);
    try {
      const res = await axios.get('/api/vegetation/ndvi', { params: { lat, lon } });
      setNdviQuery(res.data);
    } catch {
      setNdviQuery({ error: 'NDVI query failed — MODIS data may be unavailable for this location.' });
    } finally {
      setQueryLoading(false);
    }
  }

  useEffect(() => {
    window._vegetationQueryPoint = queryNDVI;
    return () => { delete window._vegetationQueryPoint; };
  }, []);

  return (
    <div className="veg-panel">
      <div className="veg-header">
        <span className="panel-icon">🛰️</span>
        <div>
          <h2>Vegetation Analysis</h2>
          <p>NASA MODIS · NDVI · Stress detection</p>
        </div>
      </div>

      {/* Layer selector */}
      <div className="veg-section">
        <h3>Map Layer</h3>
        <div className="veg-layer-list">
          {LAYERS.map(layer => (
            <button
              key={layer.id}
              className={`veg-layer-btn ${activeLayer.id === layer.id ? 'active' : ''}`}
              onClick={() => selectLayer(layer)}
            >
              <span className="veg-layer-name">{layer.label}</span>
              <span className="veg-layer-desc">{layer.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="veg-section">
        <h3>Opacity — {Math.round(opacity * 100)}%</h3>
        <input
          type="range" min="0.1" max="1" step="0.05"
          value={opacity}
          onChange={e => handleOpacity(Number(e.target.value))}
          className="veg-slider"
        />
      </div>

      {/* NDVI scale */}
      {activeLayer.id === 'ndvi' && (
        <div className="veg-section">
          <h3>NDVI Scale + Fire Risk</h3>
          <div className="ndvi-scale">
            {NDVI_CLASSES.map(cls => (
              <div className="ndvi-row" key={cls.range}>
                <span className="ndvi-swatch" style={{ background: cls.color }} />
                <span className="ndvi-range">{cls.range}</span>
                <span className="ndvi-label">{cls.label}</span>
                <span className="ndvi-risk" style={{ color: RISK_COLOR[cls.risk] || '#555' }}>
                  {cls.risk}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Click query instructions */}
      <div className="veg-query-hint">
        <span>🖱️</span>
        <p>Click the map to query the current NDVI value and fire stress level at that point.</p>
      </div>

      {queryLoading && <div className="veg-loading">Querying MODIS…</div>}

      {ndviQuery && !queryLoading && (
        <div className="veg-query-result">
          <h3>NDVI Query — {ndviQuery.lat?.toFixed(4)}, {ndviQuery.lon?.toFixed(4)}</h3>
          {ndviQuery.error ? (
            <div className="veg-error">{ndviQuery.error}</div>
          ) : (
            <>
              <div className="ndvi-value-row">
                <span
                  className="ndvi-big-value"
                  style={{ color: ndviQuery.color || '#e6edf3' }}
                >
                  {ndviQuery.ndvi?.toFixed(3)}
                </span>
                <div>
                  <div className="ndvi-class-label">{ndviQuery.class}</div>
                  <div
                    className="ndvi-fire-risk"
                    style={{ color: RISK_COLOR[ndviQuery.fire_risk] || '#555' }}
                  >
                    {ndviQuery.fire_risk?.toUpperCase()} fire risk
                  </div>
                </div>
              </div>
              <div className="ndvi-date">As of {ndviQuery.date}</div>

              {/* Trend sparkline */}
              {ndviQuery.trend?.length > 1 && (
                <div className="ndvi-trend">
                  <div className="trend-label">16-day trend</div>
                  <div className="trend-bars">
                    {ndviQuery.trend.map((t, i) => {
                      const pct = Math.max(0, Math.min(100, ((t.ndvi + 0.2) / 1.2) * 100));
                      return (
                        <div className="trend-bar-wrap" key={i} title={`${t.date}: ${t.ndvi}`}>
                          <div className="trend-bar" style={{ height: `${pct}%`, background: t.ndvi < 0.3 ? '#cc6600' : '#3aa76d' }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="veg-attribution">
        Data: <a href="https://modis.ornl.gov" target="_blank" rel="noreferrer">NASA MODIS</a> via ORNL DAAC ·{' '}
        <a href="https://gibs.earthdata.nasa.gov" target="_blank" rel="noreferrer">NASA GIBS</a>
      </div>
    </div>
  );
}
