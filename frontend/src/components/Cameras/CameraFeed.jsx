/**
 * CameraFeed
 * Renders a single camera feed card with an embedded stream or thumbnail.
 */
import React, { useState } from 'react';
import './CameraFeed.css';

function CameraFeed({ camera }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`camera-card ${expanded ? 'expanded' : ''}`}>
      <div className="camera-header" onClick={() => setExpanded(!expanded)}>
        <span className="camera-name">{camera.name}</span>
        <span className="camera-network">{camera.network}</span>
        <span className="expand-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="camera-feed-body">
          {camera.embed_url ? (
            <iframe
              src={camera.embed_url}
              title={camera.name}
              width="100%"
              height="200"
              frameBorder="0"
              allowFullScreen
            />
          ) : (
            <div className="feed-placeholder">
              Stream URL not configured
            </div>
          )}
          <div className="camera-meta">
            📍 {camera.location || 'Unknown location'}<br />
            🔗 <a href={camera.stream_url} target="_blank" rel="noopener noreferrer">
              Open full feed
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraFeed;
