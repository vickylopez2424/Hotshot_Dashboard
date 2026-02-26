/**
 * CameraPanel
 * Right panel showing ALERTWildfire live camera feeds.
 */
import React, { useEffect, useState } from 'react';
import CameraFeed from './CameraFeed';
import axios from 'axios';

function CameraPanel() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/cameras/list')
      .then(res => setCameras(res.data.cameras || []))
      .catch(() => setCameras([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="panel-header">📷 Live Cameras</div>
      <div className="panel-body">
        {loading && <p className="placeholder">Loading camera feeds...</p>}
        {!loading && cameras.length === 0 && (
          <p className="placeholder">
            No cameras loaded yet.<br />
            Backend integration in progress.
          </p>
        )}
        {cameras.map(cam => (
          <CameraFeed key={cam.camera_id} camera={cam} />
        ))}
      </div>
    </div>
  );
}

export default CameraPanel;
