import React, { useState, useRef } from 'react';
import axios from 'axios';
import './PlantIdPanel.css';

const RISK_COLOR  = { extreme: '#cc0000', high: '#e05c2a', moderate: '#9a6700', low: '#238636' };
const RISK_LABEL  = { extreme: 'EXTREME', high: 'HIGH', moderate: 'MODERATE', low: 'LOW' };

export default function PlantIdPanel() {
  const [preview,  setPreview]  = useState(null);
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setError('');
    setResults(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
    uploadFile(file);
  }

  async function uploadFile(file) {
    setLoading(true);
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await axios.post('/api/plant-id/identify', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Identification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function clearAll() {
    setPreview(null);
    setResults(null);
    setError('');
  }

  const top = results?.top_match;

  return (
    <div className="plantid-panel">
      <div className="pid-header">
        <span className="panel-icon">🌱</span>
        <div>
          <h2>Plant ID</h2>
          <p>Field photo → species + fire behavior</p>
        </div>
      </div>

      {!preview ? (
        <div
          className={`pid-dropzone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <span className="dz-icon">📷</span>
          <p className="dz-main">Drop a photo or tap to select</p>
          <p className="dz-sub">JPG, PNG, HEIC — max 20MB<br />Works best with clear photos of leaves, stems, or flowers</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="pid-preview-row">
          <img src={preview} alt="Uploaded" className="pid-preview-img" />
          <button className="btn-clear" onClick={clearAll}>✕ Clear</button>
        </div>
      )}

      {error && <div className="pid-error">{error}</div>}

      {loading && (
        <div className="pid-loading">
          <div className="pid-spinner" />
          Identifying species…
        </div>
      )}

      {results && !loading && (
        <div className="pid-results">
          {/* Top match fire alert */}
          {top?.fire && (
            <div
              className="fire-alert"
              style={{ borderColor: RISK_COLOR[top.fire.flammability] || '#888' }}
            >
              <div
                className="fire-risk-badge"
                style={{ background: RISK_COLOR[top.fire.flammability] || '#888' }}
              >
                {RISK_LABEL[top.fire.flammability] || 'UNKNOWN'} FIRE RISK
              </div>
              <div className="fire-fuel-model">
                Fuel Model: <strong>{top.fire.fuel_model}</strong>
              </div>
              {top.fire.season_risk && (
                <div className="fire-season">Peak risk: {top.fire.season_risk}</div>
              )}
              {top.fire.invasive && (
                <div className="fire-invasive">⚠️ Invasive species</div>
              )}
              {top.fire.notes && (
                <div className="fire-notes">{top.fire.notes}</div>
              )}
            </div>
          )}

          {/* Species matches */}
          <h3 className="pid-section-title">Species Matches</h3>
          {results.results.map((r, i) => (
            <div className={`species-card ${i === 0 ? 'top-match' : ''}`} key={i}>
              <div className="species-left">
                {r.photo_url && (
                  <img src={r.photo_url} alt={r.scientific} className="species-thumb" />
                )}
              </div>
              <div className="species-info">
                <div className="species-score">{r.score}%</div>
                <div className="species-name">{r.scientific}</div>
                {r.common && <div className="species-common">{r.common}</div>}
                {r.fire && (
                  <div
                    className="species-fire-badge"
                    style={{ color: RISK_COLOR[r.fire.flammability], borderColor: RISK_COLOR[r.fire.flammability] + '44' }}
                  >
                    {r.fire.flammability} · {r.fire.fuel_model}
                  </div>
                )}
                {!r.fire && (
                  <div className="species-no-fire">Not in fire database</div>
                )}
              </div>
              {r.inat_url && (
                <a href={r.inat_url} target="_blank" rel="noreferrer" className="species-link">↗</a>
              )}
            </div>
          ))}

          <p className="pid-attribution">
            ID by <a href="https://www.inaturalist.org" target="_blank" rel="noreferrer">iNaturalist</a> Computer Vision.
            Fire data: LANDFIRE, NFFL.
          </p>
        </div>
      )}

      {!results && !loading && !preview && (
        <div className="pid-examples">
          <h3>What to photograph</h3>
          <div className="example-grid">
            {['Leaves (top + bottom)', 'Stems and bark', 'Flowers or seeds', 'Overall plant habit'].map(item => (
              <div className="example-item" key={item}>
                <span>📍</span> {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
