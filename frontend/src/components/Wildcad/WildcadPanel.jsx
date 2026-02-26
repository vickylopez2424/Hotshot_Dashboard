/**
 * WildcadPanel
 * Right panel for WildCAD / IRWIN fire incidents and trends.
 * Tabs: Active Incidents | Trends | Dispatch
 */
import React, { useEffect, useState, useCallback } from 'react';
import IncidentCard from './IncidentCard';
import TrendsChart from './TrendsChart';
import axios from 'axios';
import './WildcadPanel.css';

const US_STATES = [
  'ALL','AK','AL','AR','AZ','CA','CO','CT','DE','FL','GA',
  'HI','IA','ID','IL','IN','KS','KY','LA','MA','MD',
  'ME','MI','MN','MO','MS','MT','NC','ND','NE','NH',
  'NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VA','VT','WA','WI','WV','WY',
];

const SORT_OPTIONS = [
  { value: 'acres',    label: 'Largest' },
  { value: 'recent',  label: 'Most Recent' },
  { value: 'name',    label: 'A–Z' },
  { value: 'contained', label: 'Active First' },
];

function WildcadPanel({ onIncidentSelect }) {
  const [tab, setTab]               = useState('incidents'); // incidents | trends | dispatch
  const [incidents, setIncidents]   = useState([]);
  const [trends, setTrends]         = useState(null);
  const [dispatch, setDispatch]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [state, setState]           = useState('ALL');
  const [sortBy, setSortBy]         = useState('acres');
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [centerCode, setCenterCode] = useState('');

  // ── Fetch incidents ──────────────────────────────────────────────────────
  const fetchIncidents = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = state !== 'ALL' ? { state } : {};
    axios.get('/api/wildcad/incidents', { params })
      .then(res => setIncidents(res.data.incidents || []))
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [state]);

  // ── Fetch trends ─────────────────────────────────────────────────────────
  const fetchTrends = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = state !== 'ALL' ? { state } : {};
    axios.get('/api/wildcad/trends', { params })
      .then(res => setTrends(res.data.trends))
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [state]);

  // ── Fetch dispatch (WildCAD scraper) ─────────────────────────────────────
  const fetchDispatch = useCallback(() => {
    if (!centerCode) return;
    setLoading(true);
    setError(null);
    axios.get(`/api/wildcad/dispatch/${centerCode}`)
      .then(res => setDispatch(res.data))
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [centerCode]);

  useEffect(() => {
    if (tab === 'incidents') fetchIncidents();
    if (tab === 'trends')    fetchTrends();
  }, [tab, state]);

  // ── Sort + filter ─────────────────────────────────────────────────────────
  const filtered = incidents
    .filter(inc =>
      !search ||
      inc.name.toLowerCase().includes(search.toLowerCase()) ||
      (inc.county || '').toLowerCase().includes(search.toLowerCase()) ||
      (inc.dispatch_center || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'acres')    return (parseFloat(b.daily_acres) || 0) - (parseFloat(a.daily_acres) || 0);
      if (sortBy === 'recent')   return (b.discovery_epoch || 0) - (a.discovery_epoch || 0);
      if (sortBy === 'name')     return a.name.localeCompare(b.name);
      if (sortBy === 'contained') return (a.is_contained ? 1 : 0) - (b.is_contained ? 1 : 0);
      return 0;
    });

  const handleSelect = (inc) => {
    setSelectedId(inc.id);
    onIncidentSelect?.(inc);
  };

  // ── Summary counts ────────────────────────────────────────────────────────
  const activeCount    = incidents.filter(i => !i.is_contained).length;
  const containedCount = incidents.filter(i => i.is_contained).length;
  const totalPersonnel = incidents.reduce((s, i) => s + (parseInt(i.personnel) || 0), 0);

  return (
    <div className="wildcad-panel">
      <div className="panel-header">🚒 WildCAD / IRWIN</div>

      {/* Tabs */}
      <div className="wildcad-tabs">
        {[
          { id: 'incidents', label: 'Incidents' },
          { id: 'trends',    label: 'Trends' },
          { id: 'dispatch',  label: 'Dispatch' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* State filter (shared across tabs) */}
      <div className="wildcad-controls">
        <select
          className="state-select"
          value={state}
          onChange={e => setState(e.target.value)}
        >
          {US_STATES.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All States' : s}</option>)}
        </select>

        {tab === 'incidents' && (
          <>
            <input
              className="search-input"
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        )}

        <button
          className="refresh-btn"
          onClick={tab === 'dispatch' ? fetchDispatch : tab === 'trends' ? fetchTrends : fetchIncidents}
          disabled={loading}
        >
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      {/* ── Incidents tab ────────────────────────────────────────────────── */}
      {tab === 'incidents' && (
        <>
          {incidents.length > 0 && (
            <div className="incident-summary">
              <span className="summary-chip active">{activeCount} active</span>
              <span className="summary-chip contained">{containedCount} contained</span>
              <span className="summary-chip personnel">{totalPersonnel.toLocaleString()} personnel</span>
            </div>
          )}

          <div className="wildcad-list">
            {loading && <p className="placeholder">Loading incidents...</p>}
            {!loading && error && <p className="wildcad-error">{error}</p>}
            {!loading && !error && filtered.length === 0 && (
              <p className="placeholder">No active fire incidents found.</p>
            )}
            {filtered.map(inc => (
              <IncidentCard
                key={inc.id || inc.name}
                incident={inc}
                isSelected={selectedId === inc.id}
                onClick={handleSelect}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Trends tab ───────────────────────────────────────────────────── */}
      {tab === 'trends' && (
        <div className="wildcad-list">
          {loading && <p className="placeholder">Loading trends...</p>}
          {!loading && error && <p className="wildcad-error">{error}</p>}
          {!loading && <TrendsChart trends={trends} />}
        </div>
      )}

      {/* ── Dispatch tab ─────────────────────────────────────────────────── */}
      {tab === 'dispatch' && (
        <div className="dispatch-tab">
          <div className="dispatch-input-row">
            <input
              className="search-input"
              type="text"
              placeholder="Center code, e.g. WCIDBDC"
              value={centerCode}
              onChange={e => setCenterCode(e.target.value.toUpperCase())}
            />
            <button className="refresh-btn" onClick={fetchDispatch} disabled={loading || !centerCode}>
              {loading ? '⏳' : 'Load'}
            </button>
          </div>

          <p className="dispatch-hint">
            Find your center code at{' '}
            <a href="http://www.wildcad.net/WildCADWeb.asp" target="_blank" rel="noopener noreferrer">
              wildcad.net
            </a>
          </p>

          {!dispatch && !loading && (
            <p className="placeholder">Enter a WildCAD center code above.</p>
          )}

          {dispatch?.error && (
            <p className="wildcad-error">{dispatch.error}</p>
          )}

          {dispatch && !dispatch.error && (
            <>
              <div className="dispatch-meta">
                {dispatch.count} incidents · {dispatch.center_id}
              </div>
              {dispatch.incidents?.length === 0 && (
                <p className="placeholder">No incidents found for this center.</p>
              )}
              {dispatch.incidents?.map((inc, i) => (
                <div key={i} className="dispatch-row">
                  <div className="dispatch-name">{inc.name}</div>
                  <div className="dispatch-detail">
                    {[inc.location, inc.cause, inc.size, inc.status]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {inc.resources && (
                    <div className="dispatch-resources">Resources: {inc.resources}</div>
                  )}
                  {inc.dispatch_date && (
                    <div className="dispatch-time">{inc.dispatch_date}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default WildcadPanel;
