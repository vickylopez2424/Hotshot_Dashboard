/**
 * ElmfirePanel
 * Right panel for ELMFIRE wildfire spread prediction.
 * Controls the time slider that drives the animated map layer.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './ElmfirePanel.css';

const PLAY_INTERVAL_MS = 800;

function ElmfirePanel({ onTimeChange }) {
  const [status, setStatus]         = useState(null);
  const [runs, setRuns]             = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [maxTime, setMaxTime]       = useState(360);
  const [currentTime, setCurrentTime] = useState(360);
  const [playing, setPlaying]       = useState(false);
  const [stepSize, setStepSize]     = useState(60); // minutes per step
  const playRef = useRef(null);

  // Fetch status + runs on mount
  useEffect(() => {
    axios.get('/api/elmfire/status')
      .then(res => setStatus(res.data))
      .catch(() => setStatus({ state: 'disconnected' }));

    axios.get('/api/elmfire/runs')
      .then(res => {
        const r = res.data.runs || [];
        setRuns(r);
        if (r.length > 0) setSelectedRun(r[0].id);
      })
      .catch(() => setRuns([]));
  }, []);

  // Notify map layer when time changes
  useEffect(() => {
    onTimeChange?.(currentTime);
  }, [currentTime, onTimeChange]);

  // Autoplay
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + stepSize;
          if (next > maxTime) {
            setPlaying(false);
            return maxTime;
          }
          return next;
        });
      }, PLAY_INTERVAL_MS);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, maxTime, stepSize]);

  const handleRunChange = (runId) => {
    setSelectedRun(runId);
    setCurrentTime(maxTime);
    setPlaying(false);
  };

  const handlePlay = () => {
    if (currentTime >= maxTime) setCurrentTime(0);
    setPlaying(true);
  };

  const handleDataLoaded = useCallback(({ maxTimeMinutes }) => {
    setMaxTime(maxTimeMinutes);
    setCurrentTime(maxTimeMinutes);
  }, []);

  const progressPct = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

  const hoursElapsed = Math.floor(currentTime / 60);
  const minsElapsed  = currentTime % 60;
  const timeLabel    = `${hoursElapsed}h ${String(minsElapsed).padStart(2, '0')}m`;

  return (
    <div className="elmfire-panel">
      <div className="panel-header">📈 ELMFIRE Predictions</div>

      {/* Status */}
      <div className="elmfire-status-row">
        <span className="status-label">Engine</span>
        <span className={`status-pill ${status?.state === 'ready' ? 'ready' : 'offline'}`}>
          {status?.state === 'ready'     ? 'Ready'
           : status?.state === 'no_output_dir' ? 'No Output Dir'
           : status?.state === 'disconnected'  ? 'Disconnected'
           : status?.state ?? 'Loading...'}
        </span>
        {status?.binary_available && (
          <span className="status-pill ready" style={{ marginLeft: 4 }}>
            Binary ✓
          </span>
        )}
      </div>

      {status?.state === 'no_output_dir' && (
        <div className="elmfire-notice">
          Set <code>ELMFIRE_OUTPUT_DIR</code> in <code>backend/.env</code> to
          your ELMFIRE output directory.<br />
          <a href="https://elmfire.io" target="_blank" rel="noopener noreferrer">
            elmfire.io →
          </a>
        </div>
      )}

      {/* Run selector */}
      {runs.length > 0 && (
        <div className="run-selector">
          <label className="run-selector-label">Run</label>
          <select
            className="run-select"
            value={selectedRun || ''}
            onChange={e => handleRunChange(e.target.value)}
          >
            {runs.map(run => (
              <option key={run.id} value={run.id}>
                {run.name}
                {!run.has_data ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {runs.length === 0 && status?.state === 'ready' && (
        <p className="placeholder">
          No runs found in output directory.<br />
          Place ELMFIRE output folders in:<br />
          <code>{status?.output_dir || 'ELMFIRE_OUTPUT_DIR'}</code>
        </p>
      )}

      {/* Time slider */}
      <div className="time-slider-section">
        <div className="time-header">
          <span className="time-icon">⏱</span>
          <span className="time-display">{timeLabel} since ignition</span>
          <span className="time-pct">{Math.round(progressPct)}%</span>
        </div>

        <input
          type="range"
          className="time-slider"
          min={0}
          max={maxTime}
          step={stepSize}
          value={currentTime}
          onChange={e => {
            setPlaying(false);
            setCurrentTime(Number(e.target.value));
          }}
        />

        <div className="time-axis">
          <span>0h</span>
          <span>{Math.round(maxTime / 60 / 2)}h</span>
          <span>{Math.round(maxTime / 60)}h</span>
        </div>

        {/* Playback controls */}
        <div className="playback-controls">
          <button
            className="ctrl-btn"
            onClick={() => { setPlaying(false); setCurrentTime(0); }}
            title="Reset"
          >⏮</button>
          <button
            className="ctrl-btn"
            onClick={() => setCurrentTime(t => Math.max(0, t - stepSize))}
            title="Step back"
          >◀</button>

          {playing
            ? <button className="ctrl-btn play active" onClick={() => setPlaying(false)}>⏸</button>
            : <button className="ctrl-btn play" onClick={handlePlay}>▶</button>
          }

          <button
            className="ctrl-btn"
            onClick={() => setCurrentTime(t => Math.min(maxTime, t + stepSize))}
            title="Step forward"
          >▶</button>
          <button
            className="ctrl-btn"
            onClick={() => { setPlaying(false); setCurrentTime(maxTime); }}
            title="Jump to end"
          >⏭</button>

          {/* Step size selector */}
          <select
            className="step-select"
            value={stepSize}
            onChange={e => setStepSize(Number(e.target.value))}
            title="Playback step size"
          >
            <option value={30}>30m</option>
            <option value={60}>1h</option>
            <option value={120}>2h</option>
          </select>
        </div>
      </div>

      {/* Color legend */}
      <div className="elmfire-legend">
        <div className="legend-title">Fire arrival time</div>
        <div className="legend-bar">
          <div className="legend-gradient" />
          <div className="legend-labels">
            <span>Ignition</span>
            <span>{Math.round(maxTime / 60)}h</span>
          </div>
        </div>
        <div className="legend-items">
          {[
            { color: '#b30000', label: 'Early (0–2h)' },
            { color: '#f46d43', label: 'Mid' },
            { color: '#fee08b', label: 'Late' },
          ].map(item => (
            <div key={item.label} className="legend-item">
              <div className="legend-swatch" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Run list */}
      {runs.length > 0 && (
        <div className="run-list">
          <div className="run-list-header">Prediction Runs</div>
          {runs.map(run => (
            <div
              key={run.id}
              className={`run-item ${selectedRun === run.id ? 'active' : ''}`}
              onClick={() => handleRunChange(run.id)}
            >
              <div className="run-name">{run.name}</div>
              <div className="run-meta">
                {run.started_at ? new Date(run.started_at).toLocaleString() : ''}
                {!run.has_data && <span className="run-warn"> — no data</span>}
              </div>
              {run.layers?.length > 0 && (
                <div className="run-layers">
                  {run.layers.map(l => <span key={l} className="layer-tag">{l.replace(/_/g, ' ')}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ElmfirePanel;
