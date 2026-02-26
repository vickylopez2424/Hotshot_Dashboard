/**
 * ElmfirePanel
 * Right panel for ELMFIRE wildfire prediction controls and output info.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ElmfirePanel() {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    axios.get('/api/elmfire/status')
      .then(res => setStatus(res.data))
      .catch(() => setStatus({ state: 'disconnected' }));

    axios.get('/api/elmfire/runs')
      .then(res => setRuns(res.data.runs || []))
      .catch(() => setRuns([]));
  }, []);

  return (
    <div>
      <div className="panel-header">📈 ELMFIRE Predictions</div>
      <div className="panel-body">
        <div className="elmfire-status">
          <span className="status-label">Engine Status:</span>
          <span className={`status-badge ${status?.state === 'ready' ? 'ready' : 'offline'}`}>
            {status?.state || 'Disconnected'}
          </span>
        </div>

        {runs.length === 0 ? (
          <p className="placeholder">
            No prediction runs available.<br />
            Configure ELMFIRE backend to start generating forecasts.
          </p>
        ) : (
          <ul className="run-list">
            {runs.map(run => (
              <li key={run.id} className="run-item">
                <strong>{run.name}</strong><br />
                <span>{run.started_at}</span> — {run.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ElmfirePanel;
