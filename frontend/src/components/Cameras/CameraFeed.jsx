/**
 * CameraFeed
 * Individual camera card with expandable live MJPEG stream.
 *
 * Stream strategy:
 *   1. Collapsed: shows camera name/metadata card
 *   2. Expanded:  attempts MJPEG stream via <img> tag
 *      - On error: falls back to alertwildfire.org snapshot proxy
 *      - Always shows "Open on ALERTWildfire" link
 */
import React, { useState, useRef } from 'react';
import './CameraFeed.css';

const NETWORK_COLORS = {
  alertcalifornia: '#9c27b0',
  alertwest:       '#00bcd4',
  hpwren:          '#2196f3',
  alertwildfire:   '#e91e63',
};

function networkColor(network = '') {
  const key = (network || '').toLowerCase().replace(/[^a-z]/g, '');
  return NETWORK_COLORS[key] || '#9c27b0';
}

function CameraFeed({ camera, defaultExpanded = false }) {
  const [expanded, setExpanded]   = useState(defaultExpanded);
  const [streamError, setStreamError] = useState(false);
  const [loading, setLoading]     = useState(false);
  const imgRef = useRef(null);

  const color = networkColor(camera.network);

  function handleExpand() {
    setExpanded(e => {
      if (!e) {
        setStreamError(false);
        setLoading(true);
      }
      return !e;
    });
  }

  function handleStreamLoad() {
    setLoading(false);
  }

  function handleStreamError() {
    setLoading(false);
    setStreamError(true);
  }

  return (
    <div className={`camera-card ${expanded ? 'expanded' : ''}`}
         style={{ borderLeftColor: color }}>

      {/* Header row — always visible */}
      <div className="camera-header" onClick={handleExpand}>
        <div className="camera-header-left">
          <span className="camera-live-dot" style={{ background: color }} />
          <div>
            <div className="camera-name">{camera.name}</div>
            <div className="camera-sub">
              {camera.network}
              {camera.state ? ` · ${camera.state}` : ''}
              {camera.is_ptz ? ' · PTZ' : ''}
              {camera.is_infrared ? ' · IR' : ''}
            </div>
          </div>
        </div>
        <span className="expand-chevron">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="camera-body">
          {/* Live stream */}
          <div className="stream-container">
            {loading && !streamError && (
              <div className="stream-loading">Connecting to stream...</div>
            )}

            {!streamError ? (
              <img
                ref={imgRef}
                className="stream-img"
                src={camera.stream_url}
                alt={camera.name}
                onLoad={handleStreamLoad}
                onError={handleStreamError}
                style={{ display: loading ? 'none' : 'block' }}
              />
            ) : (
              <div className="stream-error">
                <div className="stream-error-icon">📷</div>
                <div>Stream unavailable</div>
                <div className="stream-error-sub">
                  Camera may be offline or require the ALERTWildfire viewer.
                </div>
              </div>
            )}
          </div>

          {/* Camera metadata */}
          <div className="camera-meta-row">
            {camera.region    && <span>📍 {camera.region}</span>}
            {camera.elevation_ft && <span>⛰ {camera.elevation_ft} ft</span>}
          </div>

          {/* Action links */}
          <div className="camera-actions">
            <a
              href={camera.viewer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="camera-link primary"
              style={{ borderColor: color, color }}
            >
              Open on ALERTWildfire →
            </a>
            {!streamError && camera.stream_url && (
              <a
                href={camera.stream_url}
                target="_blank"
                rel="noopener noreferrer"
                className="camera-link"
              >
                Direct stream ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraFeed;
