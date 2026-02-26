/**
 * CameraPanel
 * Right panel — ALERTWildfire live camera feeds.
 * 1,600+ cameras across ALERTCalifornia, ALERTWest, HPWREN, ALERTWildfire.
 */
import React, { useEffect, useState, useCallback } from 'react';
import CameraFeed from './CameraFeed';
import axios from 'axios';
import './CameraPanel.css';

const US_STATES = [
  'ALL','CA','OR','WA','NV','ID','MT','CO','HI','AZ','UT','NM',
];

const NETWORKS = [
  { value: '',               label: 'All Networks' },
  { value: 'ALERTCalifornia',label: 'ALERTCalifornia' },
  { value: 'ALERTWest',      label: 'ALERTWest' },
  { value: 'HPWREN',         label: 'HPWREN' },
  { value: 'ALERTWildfire',  label: 'ALERTWildfire' },
];

const PAGE_SIZE = 30;

function CameraPanel() {
  const [cameras, setCameras]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [state, setState]           = useState('CA');
  const [network, setNetwork]       = useState('');
  const [search, setSearch]         = useState('');
  const [offset, setOffset]         = useState(0);
  const [hasMore, setHasMore]       = useState(false);
  // Filter toggles
  const [ptzOnly, setPtzOnly]       = useState(false);
  const [irOnly, setIrOnly]         = useState(false);

  const fetchCameras = useCallback((reset = false) => {
    const currentOffset = reset ? 0 : offset;
    setLoading(true);
    setError(null);

    const params = {
      limit:  PAGE_SIZE,
      offset: currentOffset,
    };
    if (state   !== 'ALL') params.state   = state;
    if (network)           params.network = network;
    if (search)            params.search  = search;

    axios.get('/api/cameras/list', { params })
      .then(res => {
        const data = res.data;
        let cams = data.cameras || [];

        // Apply client-side filters for PTZ / IR
        if (ptzOnly) cams = cams.filter(c => c.is_ptz);
        if (irOnly)  cams = cams.filter(c => c.is_infrared);

        if (reset) {
          setCameras(cams);
          setOffset(PAGE_SIZE);
        } else {
          setCameras(prev => [...prev, ...cams]);
          setOffset(o => o + PAGE_SIZE);
        }
        setTotal(data.total || 0);
        setHasMore(data.has_more || false);
      })
      .catch(err => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [state, network, search, offset, ptzOnly, irOnly]);

  // Reset + refetch when filters change
  useEffect(() => {
    setOffset(0);
    fetchCameras(true);
  }, [state, network, ptzOnly, irOnly]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      fetchCameras(true);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="camera-panel">
      <div className="panel-header">📷 ALERTWildfire Cameras</div>

      {/* Filter controls */}
      <div className="camera-controls">
        <select
          className="cam-select"
          value={state}
          onChange={e => setState(e.target.value)}
        >
          {US_STATES.map(s => (
            <option key={s} value={s}>{s === 'ALL' ? 'All States' : s}</option>
          ))}
        </select>

        <select
          className="cam-select network-select"
          value={network}
          onChange={e => setNetwork(e.target.value)}
        >
          {NETWORKS.map(n => (
            <option key={n.value} value={n.value}>{n.label}</option>
          ))}
        </select>

        <button
          className="cam-refresh"
          onClick={() => fetchCameras(true)}
          disabled={loading}
          title="Refresh"
        >
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      {/* Search + capability filters */}
      <div className="camera-search-row">
        <input
          className="cam-search"
          type="text"
          placeholder="Search cameras..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className={`cap-toggle ${ptzOnly ? 'on' : ''}`}>
          <input type="checkbox" checked={ptzOnly} onChange={e => setPtzOnly(e.target.checked)} />
          PTZ
        </label>
        <label className={`cap-toggle ${irOnly ? 'on' : ''}`}>
          <input type="checkbox" checked={irOnly} onChange={e => setIrOnly(e.target.checked)} />
          IR
        </label>
      </div>

      {/* Count banner */}
      {!loading && total > 0 && (
        <div className="camera-count-bar">
          Showing {cameras.length} of {total.toLocaleString()} cameras
        </div>
      )}

      {/* Camera list */}
      <div className="camera-list">
        {!loading && error && (
          <div className="cam-error">{error}</div>
        )}

        {!loading && !error && cameras.length === 0 && (
          <p className="placeholder">No cameras found for this filter.</p>
        )}

        {cameras.map(cam => (
          <CameraFeed key={cam.camera_id} camera={cam} />
        ))}

        {/* Load more */}
        {hasMore && !loading && (
          <button
            className="load-more-btn"
            onClick={() => fetchCameras(false)}
          >
            Load more cameras…
          </button>
        )}

        {loading && cameras.length > 0 && (
          <p className="placeholder" style={{ padding: '10px 0' }}>Loading…</p>
        )}
      </div>
    </div>
  );
}

export default CameraPanel;
