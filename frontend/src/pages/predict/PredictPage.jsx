/**
 * PredictPage: the first screen. One question, five taps.
 *
 *   1. Open: full-screen map, nearby incidents.
 *   2. Tap the map where the fire is, or tap an incident.
 *   3. Pick 6 / 12 / 24 hours. Weather fills in from NWS.
 *   4. Run. Contours draw on the map with a time slider.
 *   5. Three numbers under the map. Done.
 *
 * Everything else (the analyst dashboard) is one tap away under the menu.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import {
  Flame, Wind, Droplets, Thermometer, Crosshair, Layers, LocateFixed,
  ChevronRight, Compass, Ruler, X, LayoutDashboard, AlertTriangle, Clock,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './PredictPage.css';

const HORIZONS = [6, 12, 24];
const DEFAULT_CENTER = [37.9, -120.6];
const DEFAULT_ZOOM = 7;

const BASEMAPS = {
  topo:  { label: 'Topo',      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 },
  usgs:  { label: 'USGS',      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', maxZoom: 16 },
  sat:   { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 },
};

const TIME_COLORS = ['#ffe08a', '#ffb347', '#ff8a3d', '#ff5f2e', '#e63b1f', '#b41c14', '#7a0c0c'];
const colorFor = (i, n) => TIME_COLORS[Math.min(Math.floor((n <= 1 ? 0 : i / (n - 1)) * (TIME_COLORS.length - 1)), TIME_COLORS.length - 1)];

const ignitionIcon = L.divIcon({
  className: 'ignition-icon',
  html: '<div class="ignition-dot"><div class="ignition-ring"></div></div>',
  iconSize: [28, 28], iconAnchor: [14, 14],
});

function incidentIcon(acres) {
  const size = acres >= 1000 ? 34 : acres >= 100 ? 28 : 22;
  return L.divIcon({
    className: 'incident-icon',
    html: `<div class="incident-flame" style="width:${size}px;height:${size}px;font-size:${size * 0.62}px">🔥</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

const COMPASS = { N:0, NNE:22.5, NE:45, ENE:67.5, E:90, ESE:112.5, SE:135, SSE:157.5, S:180, SSW:202.5, SW:225, WSW:247.5, W:270, WNW:292.5, NW:315, NNW:337.5 };
const windToDeg = (from) => ((COMPASS[(from || '').toUpperCase()] ?? 0) + 180) % 360;   // arrow points where the wind blows

function windIcon(period) {
  const calm = !period.wind_dir || period.wind_mph < 1;
  const deg = windToDeg(period.wind_dir);
  const len = Math.min(26 + period.wind_mph * 2.2, 70);
  const arrow = calm ? '' : `<div class="wind-arrow" style="transform:rotate(${deg}deg);--len:${len}px"><span></span></div>`;
  const label = calm ? 'calm' : `${period.wind_mph} mph ${period.wind_dir}`;
  return L.divIcon({
    className: 'wind-icon',
    html: `<div class="wind-wrap">${arrow}<div class="wind-label${calm ? ' calm' : ''}">${label}</div></div>`,
    iconSize: [0, 0], iconAnchor: [0, 0],
  });
}

const hourLabel = (iso) => {
  const h = new Date(iso).getHours();
  return h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`;
};

/* Hourly wind (bars) and humidity (line) for the horizon */
function WeatherStrip({ periods, activeIndex, onPick }) {
  if (!periods?.length) return null;
  const W = 340, H = 64, pad = 4, n = periods.length, bw = (W - pad * 2) / n;
  const maxW = Math.max(15, ...periods.map(p => p.wind_mph));
  const rh = periods.map(p => p.rh_pct ?? 0);
  const rhPath = rh.map((v, i) => `${i === 0 ? 'M' : 'L'}${pad + bw * i + bw / 2},${H - 14 - (v / 100) * (H - 22)}`).join(' ');
  return (
    <div className="strip">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {periods.map((p, i) => {
          const h = (p.wind_mph / maxW) * (H - 22);
          const hot = p.rh_pct != null && p.rh_pct < 20 && p.wind_mph >= 15;
          return (
            <g key={i} onClick={() => onPick?.(i)} style={{ cursor: 'pointer' }}>
              <rect x={pad + bw * i + 1} y={H - 14 - h} width={bw - 2} height={h} rx="2"
                fill={hot ? '#ff5f2e' : i === activeIndex ? '#ffffff' : 'rgba(124,196,255,.55)'} />
              {(i % Math.ceil(n / 6) === 0) && <text x={pad + bw * i + bw / 2} y={H - 3} textAnchor="middle" fontSize="9" fill="#9aa7b8">{hourLabel(p.time)}</text>}
            </g>
          );
        })}
        <path d={rhPath} fill="none" stroke="#ffcf5a" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <div className="strip-legend"><span><i className="sw wind" /> wind mph</span><span><i className="sw rh" /> humidity %</span><span><i className="sw hot" /> critical</span></div>
    </div>
  );
}

/* Install hint: Android/Chrome expose an install event; iOS needs the Share sheet */
function InstallHint() {
  const [state, setState] = useState(() => {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return 'installed';
      if (localStorage.getItem('hotshot.installHint') === 'dismissed') return 'hidden';
    } catch { /* storage blocked */ }
    return 'pending';
  });
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const dismiss = () => { try { localStorage.setItem('hotshot.installHint', 'dismissed'); } catch {} setState('hidden'); };
  if (state !== 'pending') return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (!ios && !prompt) return null;
  return (
    <div className="install-hint">
      <img src="/icons/icon-192.png" alt="" />
      <div className="install-text">
        <b>Add Hotshot to your home screen</b>
        {ios
          ? <span>Tap <span className="share-glyph">⎋</span> Share, then <b>Add to Home Screen</b>. Runs full screen, keeps the last maps offline.</span>
          : <span>Installs like an app. Runs full screen, keeps the last maps offline.</span>}
      </div>
      {!ios && prompt && <button className="install-btn" onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); dismiss(); }}>Install</button>}
      <button className="icon-btn ghost" onClick={dismiss} title="Not now"><X size={16} /></button>
    </div>
  );
}

function fmtAcres(a) {
  if (a == null) return '';
  return a >= 10000 ? `${(a / 1000).toFixed(1)}k` : a.toLocaleString();
}

/* Map helpers ---------------------------------------------------------- */
function MapEvents({ onPick, disabled }) {
  useMapEvents({ click(e) { if (!disabled) onPick({ lat: e.latlng.lat, lon: e.latlng.lng }); } });
  return null;
}

/* Fly to the point, but keep it in the part of the map the bottom sheet does not cover */
function FlyTo({ target, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const z = zoom ?? Math.max(map.getZoom(), 11);
    const phone = window.innerWidth < 900;
    const sheetH = phone ? (document.querySelector('.sheet')?.offsetHeight || 0) : 0;
    const pt = map.project([target.lat, target.lon], z).add([0, sheetH / 2]);
    map.flyTo(map.unproject(pt, z), z, { duration: 0.8 });
  }, [target?.lat, target?.lon]);
  return null;
}

function Locate({ trigger }) {
  const map = useMap();
  useEffect(() => {
    if (!trigger) return;
    map.locate({ setView: true, maxZoom: 11 });
  }, [trigger]);
  return null;
}

/* Report the map zoom so the page can thin out markers when zoomed out */
function ZoomWatch({ onZoom }) {
  const map = useMapEvents({ zoomend() { onZoom(map.getZoom()); } });
  useEffect(() => { onZoom(map.getZoom()); }, []);
  return null;
}

function FitResult({ result }) {
  const map = useMap();
  useEffect(() => {
    if (!result?.features?.length) return;
    const b = L.geoJSON(result).getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.6), { paddingBottomRight: [0, 260] });
  }, [result]);
  return null;
}

/* Page ------------------------------------------------------------------ */
export default function PredictPage() {
  const [basemap, setBasemap] = useState('topo');
  const [showBasemaps, setShowBasemaps] = useState(false);
  const [locateTick, setLocateTick] = useState(0);
  const [incidents, setIncidents] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showAlerts, setShowAlerts] = useState(true);
  const [pick, setPick] = useState(null);            // {lat, lon, name?, id?, acres?}
  const [hours, setHours] = useState(12);
  const [weather, setWeather] = useState(null);
  const [weatherErr, setWeatherErr] = useState(null);
  const [job, setJob] = useState(null);              // full job record
  const [phase, setPhase] = useState('idle');        // idle | ready | running | done | error
  const [timeMin, setTimeMin] = useState(null);
  const pollRef = useRef(null);

  // Incidents on the map
  useEffect(() => {
    axios.get('/api/wildcad/incidents/map', { params: { min_acres: 1 } })
      .then(r => setIncidents(r.data.features || []))
      .catch(() => setIncidents([]));
  }, []);

  // Fire weather alerts (red flag warnings, watches) as zone polygons
  useEffect(() => {
    axios.get('/api/nws/alerts/map').then(r => setAlerts(r.data)).catch(() => setAlerts(null));
  }, []);

  // Weather line when a point is picked or the horizon changes
  useEffect(() => {
    if (!pick) return;
    setWeather(null); setWeatherErr(null);
    axios.get('/api/predict/weather', { params: { lat: pick.lat, lon: pick.lon, hours } })
      .then(r => setWeather(r.data))
      .catch(e => setWeatherErr(e.response?.data?.detail || 'Weather unavailable'));
  }, [pick?.lat, pick?.lon, hours]);

  const onPick = useCallback((p) => {
    if (phase === 'running') return;
    setJob(null); setPhase('ready'); setTimeMin(null);
    setPick(p);
  }, [phase]);

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null); setPick(null); setWeather(null); setPhase('idle'); setTimeMin(null);
  };

  const run = async () => {
    if (!pick) return;
    setPhase('running'); setJob({ step: 'Queued' });
    try {
      const r = await axios.post('/api/predict', {
        lat: pick.lat, lon: pick.lon, hours,
        incident_id: pick.id || null, incident_name: pick.name || null,
      });
      const id = r.data.job_id;
      pollRef.current = setInterval(async () => {
        try {
          const j = (await axios.get(`/api/predict/${id}`)).data;
          setJob(j);
          if (['done', 'failed', 'model_unavailable'].includes(j.status)) {
            clearInterval(pollRef.current);
            setPhase(j.status === 'done' ? 'done' : 'error');
            if (j.status === 'done') setTimeMin(j.result.max_time_minutes);
          }
        } catch { /* keep polling */ }
      }, 1200);
    } catch (e) {
      setPhase('error'); setJob({ status: 'failed', error: e.response?.data?.detail || e.message });
    }
  };

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  const result = job?.result;
  const summary = job?.summary;
  const steps = result?.features?.length || 0;
  const visible = useMemo(() => {
    if (!result) return [];
    return result.features.filter(f => f.properties.time_minutes <= (timeMin ?? result.max_time_minutes));
  }, [result, timeMin]);
  const wx = weather?.summary;
  const periods = weather?.periods || [];
  const activeHour = phase === 'done' && result ? Math.max(0, Math.round((timeMin ?? result.max_time_minutes) / 60) - 1) : 0;
  const activePeriod = periods[Math.min(activeHour, periods.length - 1)];
  const isSample = summary?.source === 'sample' || result?.source === 'sample';
  const runInfo = result?.run;

  return (
    <div className="predict">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} minZoom={4} zoomControl={false} className="predict-map" attributionControl={false}>
        <ZoomWatch onZoom={setZoom} />
        <TileLayer key={basemap} url={BASEMAPS[basemap].url} maxZoom={BASEMAPS[basemap].maxZoom} />
        <MapEvents onPick={onPick} disabled={phase === 'running'} />
        <FlyTo target={pick} />
        <Locate trigger={locateTick} />
        <FitResult result={phase === 'done' ? result : null} />

        {showAlerts && alerts?.features?.length > 0 && (
          <GeoJSON key="alerts" data={alerts}
            style={f => ({ color: f.properties.color || '#cc0000', weight: 1.2, dashArray: '4 3', fillColor: f.properties.color || '#cc0000', fillOpacity: 0.16, opacity: 0.8 })}
            onEachFeature={(f, layer) => layer.bindTooltip(`<strong>${f.properties.event}</strong><br/>${(f.properties.headline || '').slice(0, 90)}`, { sticky: true })} />
        )}

        {incidents.filter(f => zoom >= 9 || (f.properties.daily_acres || 0) >= (zoom >= 7 ? 10 : 100)).map(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties;
          return (
            <Marker key={p.id} position={[lat, lon]} icon={incidentIcon(p.daily_acres || 0)}
              eventHandlers={{ click: () => onPick({ lat, lon, id: p.id, name: p.name, acres: p.daily_acres, state: p.state }) }} />
          );
        })}

        {visible.map((f, i) => (
          <GeoJSON key={`${f.properties.time_minutes}-${steps}`} data={f}
            style={{ color: colorFor(i, steps), weight: 1.5, fillColor: colorFor(i, steps), fillOpacity: i === visible.length - 1 ? 0.45 : 0.18, opacity: 0.95 }} />
        ))}

        {pick && <Marker position={[pick.lat, pick.lon]} icon={ignitionIcon} />}
        {pick && activePeriod && <Marker position={[pick.lat, pick.lon]} icon={windIcon(activePeriod)} interactive={false} zIndexOffset={500} />}
      </MapContainer>

      {/* Top bar */}
      <div className="predict-top">
        <div className="brand"><Flame size={18} /><span>Hotshot</span></div>
        <div className="top-actions">
          <button className="icon-btn" title="My location" onClick={() => setLocateTick(t => t + 1)}><LocateFixed size={20} /></button>
          <button className={`icon-btn ${showBasemaps ? 'on' : ''}`} title="Map style" onClick={() => setShowBasemaps(s => !s)}><Layers size={20} /></button>
          <Link className="icon-btn" title="Analyst dashboard" to="/dashboard"><LayoutDashboard size={20} /></Link>
        </div>
        {showBasemaps && (
          <div className="basemap-menu">
            {Object.entries(BASEMAPS).map(([k, b]) => (
              <button key={k} className={k === basemap ? 'on' : ''} onClick={() => { setBasemap(k); setShowBasemaps(false); }}>{b.label}</button>
            ))}
            <div className="menu-sep" />
            <button className={showAlerts ? 'on' : ''} onClick={() => setShowAlerts(v => !v)}>Fire weather alerts{alerts?.total_alerts ? ` (${alerts.total_alerts})` : ''}</button>
          </div>
        )}
      </div>

      <InstallHint />

      {/* Sample badge */}
      {phase === 'done' && isSample && (
        <div className="sample-badge"><AlertTriangle size={14} /> Sample shape. Spread model not connected yet.</div>
      )}

      {/* Bottom sheet */}
      <div className={`sheet phase-${phase}`}>
        {phase === 'idle' && (
          <>
            <div className="sheet-title">Where is the fire?</div>
            <div className="sheet-sub">Tap the map where it started, or tap a <span className="flame-inline">🔥</span> incident.</div>
            <div className="hint-row"><Crosshair size={16} /> Use the locate button to jump to where you are.</div>
          </>
        )}

        {(phase === 'ready' || phase === 'running' || phase === 'error') && pick && (
          <>
            <div className="sheet-head">
              <div>
                <div className="sheet-title">{pick.name ? pick.name : 'Ignition point'}</div>
                <div className="sheet-sub mono">
                  {pick.lat.toFixed(4)}, {pick.lon.toFixed(4)}{pick.acres != null ? ` · ${fmtAcres(pick.acres)} ac now` : ''}
                </div>
              </div>
              <button className="icon-btn ghost" onClick={reset} title="Start over"><X size={18} /></button>
            </div>

            <div className="label">How far ahead</div>
            <div className="chips">
              {HORIZONS.map(h => (
                <button key={h} className={`chip ${hours === h ? 'on' : ''}`} disabled={phase === 'running'} onClick={() => setHours(h)}>{h}h</button>
              ))}
            </div>

            <div className="label">Fire weather <span className="dim">{weather ? `· ${weather.source}` : ''}</span></div>
            <div className="wx-row">
              {weatherErr && <span className="wx-err">{weatherErr}</span>}
              {!weather && !weatherErr && <span className="dim">Loading forecast…</span>}
              {wx && (
                <>
                  <span><Wind size={16} /> {wx.now_wind_mph} mph {wx.now_wind_dir}</span>
                  <span><Droplets size={16} /> {wx.now_rh_pct}% RH</span>
                  <span><Thermometer size={16} /> {wx.now_temp_f}°F</span>
                  {wx.peak_wind_mph > wx.now_wind_mph && <span className="warn"><Wind size={16} /> peak {wx.peak_wind_mph} {wx.peak_wind_dir}</span>}
                </>
              )}
            </div>

            <WeatherStrip periods={periods} activeIndex={0} />

            {phase === 'error' && (
              <div className="error-box"><AlertTriangle size={16} /> {job?.error || 'The run failed.'}</div>
            )}

            <button className="run-btn" onClick={run} disabled={phase === 'running' || !weather}>
              {phase === 'running'
                ? <><span className="spinner" /> {job?.step || 'Running'}</>
                : <><Flame size={20} /> Predict {hours} hours <ChevronRight size={20} /></>}
            </button>
          </>
        )}

        {phase === 'done' && result && summary && (
          <>
            <div className="sheet-head">
              <div>
                <div className="sheet-title">{pick?.name || 'Prediction'} · {hours}h</div>
                <div className="sheet-sub">Cumulative burned area by hour</div>
              </div>
              <button className="icon-btn ghost" onClick={reset} title="New prediction"><X size={18} /></button>
            </div>

            <div className="stats">
              <div className="stat"><div className="v">{fmtAcres(summary.acres_at_horizon)}</div><div className="l"><Ruler size={12} /> acres at {hours}h</div></div>
              <div className="stat"><div className="v">{summary.spread_dir}</div><div className="l"><Compass size={12} /> spreading · {summary.max_run_miles} mi run</div></div>
              <div className="stat"><div className="v">{summary.wind_mph}<small> mph</small></div><div className="l"><Wind size={12} /> wind {summary.wind_dir}{summary.peak_wind_mph > summary.wind_mph ? ` · peak ${summary.peak_wind_mph}` : ''}</div></div>
            </div>

            <div className="slider-row">
              <Clock size={16} />
              <input type="range" min={result.features[0]?.properties.time_minutes || 60} max={result.max_time_minutes}
                step={result.features[1] ? result.features[1].properties.time_minutes - result.features[0].properties.time_minutes : 60}
                value={timeMin ?? result.max_time_minutes} onChange={e => setTimeMin(Number(e.target.value))} />
              <span className="mono time">{Math.round((timeMin ?? result.max_time_minutes) / 60)}h</span>
            </div>

            <div className="wx-row small">
              {activePeriod && <><span><Wind size={14} /> {activePeriod.wind_mph} mph {activePeriod.wind_dir}</span><span><Droplets size={14} /> {activePeriod.rh_pct}% RH</span><span><Thermometer size={14} /> {activePeriod.temp_f}°F</span><span className="dim">at {hourLabel(activePeriod.time)}</span></>}
            </div>
            <WeatherStrip periods={periods} activeIndex={activeHour} onPick={i => setTimeMin(Math.min((i + 1) * 60, result.max_time_minutes))} />

            {runInfo && (
              <div className="run-meta">
                <span>ELMFIRE</span><span>{runInfo.landfire_version?.split(' ')[0] || 'LANDFIRE'} fuels</span><span>{runInfo.cell_size_m} m cells</span><span>{runInfo.domain_km} km domain</span><span>{runInfo.model_s != null ? `${runInfo.model_s}s` : ''}</span>
                {runInfo.ignition_snap_m > 0 && <span className="warn">ignition moved {Math.round(runInfo.ignition_snap_m)} m to burnable fuel</span>}
              </div>
            )}
            <div className="fine">Decision support only. Not a substitute for WFDSS, the IAP, or on-scene judgment.</div>
          </>
        )}
      </div>
    </div>
  );
}
