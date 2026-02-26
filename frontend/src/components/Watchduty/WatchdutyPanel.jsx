import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WatchdutyPanel.css';

const STATES = [
  { code: 'CA', label: 'California' },
  { code: 'OR', label: 'Oregon' },
  { code: 'WA', label: 'Washington' },
  { code: 'NV', label: 'Nevada' },
  { code: 'ID', label: 'Idaho' },
  { code: 'MT', label: 'Montana' },
  { code: 'CO', label: 'Colorado' },
  { code: 'AZ', label: 'Arizona' },
  { code: 'NM', label: 'New Mexico' },
  { code: 'UT', label: 'Utah' },
  { code: 'WY', label: 'Wyoming' },
  { code: 'TX', label: 'Texas' },
];

export default function WatchdutyPanel() {
  const [links, setLinks] = useState(null);

  useEffect(() => {
    axios.get('/api/watchduty/links').then(res => setLinks(res.data)).catch(() => {});
  }, []);

  const appUrl = links?.web_app || 'https://app.watchduty.org';

  return (
    <div className="watchduty-panel">
      <div className="wd-header">
        <span className="panel-icon">🔔</span>
        <div>
          <h2>Watch Duty</h2>
          <p>Community wildfire alerts</p>
        </div>
      </div>

      <div className="wd-launch">
        <a href={appUrl} target="_blank" rel="noreferrer" className="btn-launch">
          Open Watch Duty Map ↗
        </a>
      </div>

      <div className="wd-about">
        <p>
          Watch Duty provides real-time wildfire alerts with scanner audio,
          evacuation orders, and incident tracking from trained spotters across
          the western US.
        </p>
        <div className="wd-app-links">
          <a
            href={links?.ios_app || '#'}
            target="_blank"
            rel="noreferrer"
            className="app-link"
          >
            📱 iOS App
          </a>
          <a
            href={links?.android_app || '#'}
            target="_blank"
            rel="noreferrer"
            className="app-link"
          >
            🤖 Android App
          </a>
        </div>
      </div>

      <div className="wd-states">
        <h3>Quick Launch by State</h3>
        <div className="state-grid">
          {STATES.map(s => (
            <a
              key={s.code}
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="state-btn"
            >
              {s.code}
            </a>
          ))}
        </div>
      </div>

      <div className="wd-note">
        <span>ℹ️</span>
        <p>
          Watch Duty does not publish a public API. This panel provides quick
          links to their web viewer. For data integration, contact{' '}
          <a href="https://watchduty.org" target="_blank" rel="noreferrer">
            watchduty.org
          </a>{' '}
          directly.
        </p>
      </div>
    </div>
  );
}
