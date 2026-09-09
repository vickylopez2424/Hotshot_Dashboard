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
  Download, WifiOff, Trash2, RefreshCw, CheckCircle2, ExternalLink,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { fetchPack, fetchPackEstimate, listPacks, deletePack, getPackCovering, savePackWeather, saveSnapshot, getSnapshot, hasDecompression } from '../../engine/pack.js';
import { predictOnDevice } from '../../engine/spread.js';
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
    html: `<div class="incident-flame" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M13 3c1 5-3 5-2 9-2-1-3-3-3-3-4 5-3 11 3 12 7 1 10-7 5-12 0 3-2 4-2 4 1-4 0-7-1-10Z" fill="currentColor"/></svg></div>`,
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
                fill={hot ? '#ff5f2e' : i === activeIndex ? '#293f4b' : '#638398'} />
              {(i % Math.ceil(n / 6) === 0) && <text x={pad + bw * i + bw / 2} y={H - 3} textAnchor="middle" fontSize="9" fill="#596259">{hourLabel(p.time)}</text>}
            </g>
          );
        })}
        <path d={rhPath} fill="none" stroke="#9b6d23" strokeWidth="1.6" strokeLinejoin="round" />
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

/* Offline helpers ------------------------------------------------------ */
const PACK_SIZES = [20, 30, 40];
const COMPASS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const toRad = (d) => d * Math.PI / 180;

function haversineMi(lon1, lat1, lon2, lat2) {
  const R = 3958.8, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function bearingDeg(lon1, lat1, lon2, lat2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function ringCoords(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates[0] || [];
  if (geom.type === 'MultiPolygon') return geom.coordinates.flatMap(p => p[0] || []);
  return [];
}

/* Same numbers the server derives, computed from the forecast periods */
function summarizePeriods(periods) {
  if (!periods?.length) return {};
  const peak = periods.reduce((a, b) => (b.wind_mph > a.wind_mph ? b : a), periods[0]);
  const withRh = periods.filter(p => p.rh_pct != null);
  const driest = withRh.length ? withRh.reduce((a, b) => (b.rh_pct < a.rh_pct ? b : a), withRh[0]) : null;
  return {
    now_wind_mph: periods[0].wind_mph, now_wind_dir: periods[0].wind_dir, now_temp_f: periods[0].temp_f, now_rh_pct: periods[0].rh_pct,
    peak_wind_mph: peak.wind_mph, peak_wind_dir: peak.wind_dir, peak_wind_time: peak.time, min_rh_pct: driest ? driest.rh_pct : null,
  };
}

/* Three numbers for an on-device result, mirroring the server summary */
function summarizeDevice(result, lon, lat, wxSummary) {
  const feats = result?.features || [];
  if (!feats.length) return null;
  const last = feats[feats.length - 1];
  const coords = ringCoords(last.geometry);
  let cx = 0, cy = 0, far = 0;
  coords.forEach(([x, y]) => { cx += x; cy += y; far = Math.max(far, haversineMi(lon, lat, x, y)); });
  cx /= coords.length || 1; cy /= coords.length || 1;
  const b = bearingDeg(lon, lat, cx, cy);
  return {
    acres_at_horizon: Math.round(result.run?.acres_at_horizon ?? last.properties.acres ?? 0),
    horizon_minutes: last.properties.time_minutes, spread_bearing: Math.round(b),
    spread_dir: COMPASS8[Math.round(b / 45) % 8], max_run_miles: Math.round(far * 100) / 100,
    wind_mph: wxSummary?.now_wind_mph, wind_dir: wxSummary?.now_wind_dir, peak_wind_mph: wxSummary?.peak_wind_mph,
    min_rh_pct: wxSummary?.min_rh_pct, source: 'ondevice',
  };
}

/* Warm the service worker tile cache for a pack's area (z10 to z14) */
async function prefetchTiles(urlTemplate, bounds, onProgress) {
  const tiles = [];
  for (let z = 10; z <= 14; z++) {
    const n = 2 ** z;
    const tx = (lon) => Math.floor((lon + 180) / 360 * n);
    const ty = (lat) => Math.floor((1 - Math.log(Math.tan(toRad(lat)) + 1 / Math.cos(toRad(lat))) / Math.PI) / 2 * n);
    for (let x = tx(bounds.west); x <= tx(bounds.east); x++) for (let y = ty(bounds.north); y <= ty(bounds.south); y++) tiles.push({ z, x, y });
  }
  const list = tiles.slice(0, 1200);
  let done = 0;
  const worker = async () => {
    while (list.length) {
      const t = list.shift();
      const url = urlTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y).replace('{s}', 'a');
      try { await fetch(url, { mode: 'no-cors' }); } catch { /* offline or blocked, keep going */ }
      done += 1; onProgress?.(done, tiles.length);
    }
  };
  await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
  return tiles.length;
}

/* Every on-device run is posted to the server for the science record; queued until there is signal */
const QUEUE_KEY = 'record-queue';
function deviceId() {
  try {
    let id = localStorage.getItem('hotshot.deviceId');
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('hotshot.deviceId', id); }
    return id;
  } catch { return 'dev-unknown'; }
}
async function queueRecord(rec) {
  const q = (await getSnapshot(QUEUE_KEY).catch(() => null)) || [];
  q.push(rec);
  await saveSnapshot(QUEUE_KEY, q.slice(-50));
}
async function flushRecords() {
  const q = (await getSnapshot(QUEUE_KEY).catch(() => null)) || [];
  if (!q.length) return 0;
  const left = [];
  for (const rec of q) {
    try { await axios.post('/api/predict/record', rec, { timeout: 20000 }); }
    catch (e) { if (isNetworkError(e)) left.push(rec); /* a 4xx means the server rejected it; drop it */ }
  }
  await saveSnapshot(QUEUE_KEY, left);
  return q.length - left.length;
}

function CenterWatch({ onMove }) {
  const map = useMapEvents({ moveend() { const c = map.getCenter(); onMove({ lat: c.lat, lon: c.lng }); } });
  return null;
}

const ageText = (h) => (h == null ? '' : h < 1 ? 'just now' : h < 48 ? `${Math.round(h)}h old` : `${Math.round(h / 24)}d old`);
const isNetworkError = (e) => !e?.response || e.code === 'ERR_NETWORK' || e.message === 'Network Error';

/* Page ------------------------------------------------------------------ */
export default function PredictPage() {
  const [basemap, setBasemap] = useState('sat');
  const [showBasemaps, setShowBasemaps] = useState(false);
  const topRef = useRef(null);

  // Layers menu: close on a click anywhere else, or Escape
  useEffect(() => {
    if (!showBasemaps) return undefined;
    const onDown = (e) => { if (topRef.current && !topRef.current.contains(e.target)) setShowBasemaps(false); };
    const onKey = (e) => { if (e.key === 'Escape') setShowBasemaps(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [showBasemaps]);
  const [locateTick, setLocateTick] = useState(0);
  const [incidents, setIncidents] = useState([]);
  const [incidentsUpdated, setIncidentsUpdated] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showAlerts, setShowAlerts] = useState(true);
  const [pick, setPick] = useState(null);            // {lat, lon, name?, id?, acres?}
  const [hours, setHours] = useState(12);
  const [weather, setWeather] = useState(null);
  const [weatherErr, setWeatherErr] = useState(null);
  const [job, setJob] = useState(null);              // full job record
  const [phase, setPhase] = useState('idle');        // idle | ready | running | done | error
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const sheetTouch = useRef(null);
  const [timeMin, setTimeMin] = useState(null);
  const pollRef = useRef(null);

  // Offline: connectivity, downloaded packs, which engine produced the result
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [packs, setPacks] = useState([]);
  const [packKm, setPackKm] = useState(30);
  const [packEstimate, setPackEstimate] = useState(null);
  const [packBusy, setPackBusy] = useState(null);        // {label, fraction}
  const [packMsg, setPackMsg] = useState(null);
  const [engineUsed, setEngineUsed] = useState('server'); // server | device
  const [coveringPack, setCoveringPack] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: DEFAULT_CENTER[0], lon: DEFAULT_CENTER[1] });
  const refreshPacks = useCallback(() => listPacks().then(setPacks).catch(() => setPacks([])), []);
  useEffect(() => {
    const up = () => { setOnline(true); flushRecords().catch(() => {}); }, down = () => setOnline(false);
    flushRecords().catch(() => {});
    window.addEventListener('online', up); window.addEventListener('offline', down);
    refreshPacks();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [refreshPacks]);
  useEffect(() => {
    if (!showBasemaps || !online) return;
    fetchPackEstimate(packKm).then(setPackEstimate).catch(() => setPackEstimate(null));
  }, [showBasemaps, packKm, online]);

  // Incidents on the map
  useEffect(() => {
    axios.get('/api/wildcad/incidents/map', { params: { min_acres: 1 } })
      .then(r => { setIncidents(r.data.features || []); setIncidentsUpdated(new Date()); saveSnapshot('incidents', { features: r.data.features || [], at: Date.now() }).catch(() => {}); })
      .catch(() => getSnapshot('incidents').then(snap => { if (snap?.features) { setIncidents(snap.features); setIncidentsUpdated(new Date(snap.at)); } }).catch(() => setIncidents([])));
  }, []);

  // Fire weather alerts (red flag warnings, watches) as zone polygons
  useEffect(() => {
    axios.get('/api/nws/alerts/map')
      .then(r => { setAlerts(r.data); saveSnapshot('alerts', r.data).catch(() => {}); })
      .catch(() => getSnapshot('alerts').then(a => setAlerts(a || null)).catch(() => setAlerts(null)));
  }, []);

  // Weather line when a point is picked or the horizon changes
  useEffect(() => {
    if (!pick) return;
    setWeather(null); setWeatherErr(null);
    let cancelled = false;
    getPackCovering(pick.lon, pick.lat).then(pk => { if (!cancelled) setCoveringPack(pk); }).catch(() => setCoveringPack(null));
    const fromPack = async (why) => {
      const pk = await getPackCovering(pick.lon, pick.lat);
      const periods = pk?.weather?.periods;
      if (!periods?.length) throw new Error(why);
      const ageH = pk.weather.saved_at ? (Date.now() - pk.weather.saved_at) / 36e5 : null;
      return { summary: summarizePeriods(periods.slice(0, hours)), periods: periods.slice(0, hours), source: `stored forecast, ${ageText(ageH)}`, stored: true, age_hours: ageH };
    };
    axios.get('/api/predict/weather', { params: { lat: pick.lat, lon: pick.lon, hours } })
      .then(r => { if (!cancelled) setWeather(r.data); })
      .catch(e => {
        const why = e.response?.data?.detail || (isNetworkError(e) ? 'No signal and no stored forecast for this point.' : 'Weather unavailable');
        fromPack(why).then(w => { if (!cancelled) setWeather(w); }).catch(() => { if (!cancelled) setWeatherErr(why); });
      });
    return () => { cancelled = true; };
  }, [pick?.lat, pick?.lon, hours]);

  const onPick = useCallback((p) => {
    if (phase === 'running') return;
    setSheetCollapsed(false);
    setJob(null); setPhase('ready'); setTimeMin(null);
    setPick(p);
  }, [phase]);

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null); setPick(null); setWeather(null); setPhase('idle'); setTimeMin(null);
  };

  const runOnDevice = async () => {
    setPhase('running'); setJob({ step: 'Loading offline pack' });
    try {
      const pk = coveringPack || await getPackCovering(pick.lon, pick.lat);
      if (!pk) throw new Error('No offline pack covers this point. Download this area from Layers while you have signal.');
      const wxObj = weather?.periods?.length ? weather : (pk.weather?.periods ? { periods: pk.weather.periods } : null);
      if (!wxObj) throw new Error('No forecast stored with this pack. Reconnect once to refresh it.');
      setJob({ step: 'Running on this device' });
      await new Promise(r => setTimeout(r, 30)); // let the spinner paint
      const result = predictOnDevice(pk, wxObj, [pick.lon, pick.lat], hours, () => {});
      const wxSum = weather?.summary || summarizePeriods(wxObj.periods);
      const summary = summarizeDevice(result, pick.lon, pick.lat, wxSum);
      if (!summary) throw new Error('The fire did not spread from this point on the stored fuels. Try tapping nearby brush, grass or timber.');
      setEngineUsed('device');
      setJob({ status: 'done', step: 'Done', result, summary, engine: 'device', pack: { key: pk.key, ageHours: pk.ageHours, weatherAgeHours: weather?.age_hours ?? null } });
      const rec = { lat: pick.lat, lon: pick.lon, hours, engine: 'ondevice', result, summary, weather: { source: wxObj.source || 'stored pack forecast', periods: wxObj.periods },
        incident_id: pick.id || null, incident_name: pick.name || null, device_id: deviceId(), client_created: new Date().toISOString(),
        pack_landfire_version: pk.meta?.landfire_version || null, engine_version: 'ondevice-rothermel 1.0' };
      queueRecord(rec).then(() => { if (navigator.onLine) flushRecords().catch(() => {}); }).catch(() => {});
      setPhase('done');
      setTimeMin(Math.max(0, ...result.features.map(f => f.properties.time_minutes)));
    } catch (e) {
      setPhase('error'); setJob({ status: 'failed', error: e.message });
    }
  };

  const run = async () => {
    if (!pick) return;
    if (!online) return runOnDevice();
    setEngineUsed('server');
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
            if (j.status === 'done') setTimeMin(Math.max(0, ...(j.result?.features || []).map(f => f.properties.time_minutes)));
          }
        } catch { /* keep polling */ }
      }, 1200);
    } catch (e) {
      if (isNetworkError(e)) return runOnDevice();
      setPhase('error'); setJob({ status: 'failed', error: e.response?.data?.detail || e.message });
    }
  };

  const downloadPack = async () => {
    const at = pick || mapCenter;
    if (!hasDecompression()) { setPackMsg('This browser cannot unpack offline data. Use Safari 16.4 or newer, or Chrome.'); return; }
    setPackMsg(null);
    try {
      setPackBusy({ label: 'Downloading fuels and terrain', fraction: 0 });
      const pk = await fetchPack(at.lat, at.lon, packKm, { save: true, onProgress: (got, total) => setPackBusy({ label: 'Downloading fuels and terrain', fraction: total ? got / total : 0 }) });
      setPackBusy({ label: 'Saving 48 h forecast', fraction: 1 });
      try {
        const w = (await axios.get('/api/predict/weather', { params: { lat: at.lat, lon: at.lon, hours: 48 } })).data;
        await savePackWeather(pk.key, { ...w, saved_at: Date.now() });
      } catch { /* pack still usable with a forecast fetched later */ }
      setPackBusy({ label: 'Caching map tiles', fraction: 0 });
      const saved = (await listPacks()).find(x => x.key === pk.key);
      if (saved?.bounds) await prefetchTiles(BASEMAPS[basemap].url, saved.bounds, (d, t) => setPackBusy({ label: 'Caching map tiles', fraction: d / t }));
      setPackMsg(`Saved ${packKm} km around ${at.lat.toFixed(3)}, ${at.lon.toFixed(3)}. Works with no signal for 48 h.`);
      refreshPacks();
      if (pick) getPackCovering(pick.lon, pick.lat).then(setCoveringPack).catch(() => {});
    } catch (e) {
      setPackMsg(`Download failed: ${e.message}`);
    } finally {
      setPackBusy(null);
    }
  };

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  const result = job?.result;
  const summary = job?.summary;
  const steps = result?.features?.length || 0;
  const lastContourMinute = Math.max(0, ...(result?.features || []).map(f => f.properties.time_minutes));
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
        <CenterWatch onMove={setMapCenter} />
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
      <div className="predict-top" ref={topRef}>
        <div className="brand"><span className="brand-symbol"><Flame size={21} strokeWidth={1.8} /></span><span className="brand-name">HOTSHOT<small>FIRE / FIELD MAP</small></span></div>
        <div className="top-actions">
          <a className="icon-btn" href="https://app.watchduty.org" target="_blank" rel="noopener noreferrer" title="Open Watch Duty situational awareness (new tab)" aria-label="Open Watch Duty situational awareness (new tab)"><ExternalLink size={18} /><span>Watch Duty</span></a>
          <button className="icon-btn" title="My location" onClick={() => setLocateTick(t => t + 1)}><LocateFixed size={18} /><span>Locate</span></button>
          <button className={`icon-btn ${showBasemaps ? 'on' : ''}`} title="Map style" onClick={() => setShowBasemaps(s => !s)}><Layers size={18} /><span>Layers</span></button>
          <Link className="icon-btn" title="Analyst dashboard" to="/dashboard"><LayoutDashboard size={18} /><span>Dashboard</span></Link>
        </div>
        {showBasemaps && (
          <div className="basemap-menu">
            {Object.entries(BASEMAPS).map(([k, b]) => (
              <button key={k} className={k === basemap ? 'on' : ''} onClick={() => { setBasemap(k); setShowBasemaps(false); }}>{b.label}</button>
            ))}
            <div className="menu-sep" />
            <button className={showAlerts ? 'on' : ''} onClick={() => setShowAlerts(v => !v)}>Fire weather alerts{alerts?.total_alerts ? ` (${alerts.total_alerts})` : ''}</button>
            <div className="menu-sep" />
            <div className="menu-title"><WifiOff size={13} /> Offline</div>
            <div className="menu-hint">Save fuels, terrain, forecast and tiles for an area so predictions run on this phone with no signal.</div>
            <div className="km-chips">
              {PACK_SIZES.map(k => <button key={k} className={packKm === k ? 'on' : ''} disabled={!!packBusy} onClick={() => setPackKm(k)}>{k} km</button>)}
            </div>
            <button className="pack-download" disabled={!online || !!packBusy} onClick={downloadPack}>
              <Download size={15} /> {packBusy ? `${packBusy.label} ${Math.round(packBusy.fraction * 100)}%` : `Download ${pick ? 'around the ignition point' : 'this area'}${packEstimate?.bytes_gzip_estimate ? ` · ${(packEstimate.bytes_gzip_estimate / 1048576).toFixed(0)} MB` : ''}`}
            </button>
            {!online && <div className="menu-hint warn">No signal. Downloads need a connection.</div>}
            {packMsg && <div className="menu-hint">{packMsg}</div>}
            {packs.length > 0 && (
              <div className="pack-list">
                {packs.map(pk => (
                  <div key={pk.key} className="pack-row">
                    <div>
                      <b>{pk.km} km</b> · {pk.center.lat.toFixed(2)}, {pk.center.lon.toFixed(2)}
                      <small>{(pk.bytes / 1048576).toFixed(1)} MB · {ageText(pk.ageHours)}{pk.hasWeather ? ` · forecast ${ageText(pk.weatherAgeHours)}` : ' · no forecast'}</small>
                    </div>
                    <button className="icon-btn ghost" title="Delete pack" onClick={() => deletePack(pk.key).then(refreshPacks)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="menu-sep" />
            <button onClick={() => setShowBasemaps(false)}>Close</button>
          </div>
        )}
      </div>

      <div className="map-status" aria-label="Incident feed status">
        <span className="status-mark" />
        <span>INCIDENTS</span>
        <strong>{incidents.length ? incidents.length.toLocaleString() : '...'}</strong>
        <span className="status-source">NIFC / IRWIN</span>
        {incidentsUpdated && <time dateTime={incidentsUpdated.toISOString()}>updated {incidentsUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
      </div>

      <InstallHint />

      {/* Sample badge */}
      {phase === 'done' && isSample && (
        <div className="sample-badge"><AlertTriangle size={14} /> Sample shape. Spread model not connected yet.</div>
      )}
      {!online && (
        <div className="offline-badge"><WifiOff size={14} /> No signal{coveringPack ? ' · offline pack covers this point' : packs.length ? ' · tap inside a downloaded area' : ' · no offline packs saved'}</div>
      )}
      {phase === 'done' && engineUsed === 'device' && (
        <div className="sample-badge device"><CheckCircle2 size={14} /> Offline estimate · on-device model{job?.pack?.weatherAgeHours != null ? ` · forecast ${ageText(job.pack.weatherAgeHours)}` : ''}</div>
      )}

      {/* Bottom sheet */}
      <div className={`sheet phase-${phase}${sheetCollapsed ? ' collapsed' : ''}`}>
        <button className="sheet-toggle" aria-expanded={!sheetCollapsed} aria-controls="prediction-details"
          onClick={() => setSheetCollapsed(v => !v)}
          onTouchStart={e => { sheetTouch.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            if (sheetTouch.current == null) return;
            const delta = e.changedTouches[0].clientY - sheetTouch.current;
            sheetTouch.current = null;
            if (Math.abs(delta) > 30) {
              e.preventDefault();
              setSheetCollapsed(delta > 0);
            }
          }}
          onTouchCancel={() => { sheetTouch.current = null; }}>
          <span className="sheet-grip" />
          {sheetCollapsed ? 'Show prediction controls' : 'Hide controls'}
        </button>
        <div id="prediction-details" hidden={sheetCollapsed}>
        {phase === 'idle' && (
          <>
            <div className="field-eyebrow">SPREAD SIMULATION</div>
            <div className="sheet-title">Choose an ignition point.</div>
            <div className="sheet-sub">Select an incident or place an ignition point on the map.</div>
            <div className="hint-row"><Crosshair size={16} /> Locate brings the map to your position.</div>
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

            <div className="label">Forecast duration</div>
            <div className="chips">
              {HORIZONS.map(h => (
                <button key={h} className={`chip ${hours === h ? 'on' : ''}`} disabled={phase === 'running'} onClick={() => setHours(h)}>{h}<span className="chip-unit"> hours</span></button>
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
                : <><Flame size={20} /> Run {hours}h simulation <ChevronRight size={20} /></>}
            </button>
          </>
        )}

        {phase === 'done' && result && steps === 0 && (
          <>
            <div className="sheet-head">
              <div className="sheet-title">No modeled fire outline</div>
              <button className="icon-btn ghost" onClick={reset} title="New prediction"><X size={18} /></button>
            </div>
            <div className="error-box" role="status"><AlertTriangle size={16} />
              The model finished, but returned no fire-outline polygons for this location and weather. This does not mean the area cannot burn. The run needs input and model-output review.
            </div>
            <button className="run-btn" onClick={reset}>Choose another location</button>
          </>
        )}

        {phase === 'done' && result && summary && steps > 0 && (
          <>
            <div className="sheet-head">
              <div>
                <div className="sheet-title">{pick?.name || 'Prediction'} · {hours}h</div>
                <div className="sheet-sub">Modeled footprint · cumulative by hour</div>
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
              <input type="range" min={result.features[0]?.properties.time_minutes || 60} max={lastContourMinute}
                step={result.features[1] ? result.features[1].properties.time_minutes - result.features[0].properties.time_minutes : 60}
                value={timeMin ?? lastContourMinute} onChange={e => setTimeMin(Number(e.target.value))} />
              <span className="mono time">{Math.round((timeMin ?? lastContourMinute) / 60)}h</span>
            </div>

            <div className="wx-row small">
              {activePeriod && <><span><Wind size={14} /> {activePeriod.wind_mph} mph {activePeriod.wind_dir}</span><span><Droplets size={14} /> {activePeriod.rh_pct}% RH</span><span><Thermometer size={14} /> {activePeriod.temp_f}°F</span><span className="dim">at {hourLabel(activePeriod.time)}</span></>}
            </div>
            <WeatherStrip periods={periods} activeIndex={activeHour} onPick={i => setTimeMin(Math.min((i + 1) * 60, lastContourMinute))} />

            {engineUsed === 'device' && runInfo && (
              <div className="run-meta">
                <span>ON-DEVICE</span><span>Rothermel surface fire</span><span>30 m cells</span><span>{runInfo.elapsed_ms != null ? `${Math.round(runInfo.elapsed_ms)} ms` : ''}</span>
                {runInfo.ignition_snap_m > 0 && <span className="warn">ignition moved {Math.round(runInfo.ignition_snap_m)} m to burnable fuel</span>}
                <span className="warn">no crown fire or spotting</span>
              </div>
            )}
            {engineUsed === 'device' && online && (
              <button className="rerun-btn" onClick={run}><RefreshCw size={15} /> Re-run on the server model (ELMFIRE)</button>
            )}
            {engineUsed !== 'device' && runInfo && (
              <div className="run-meta">
                <span>ELMFIRE</span><span>{runInfo.landfire_version?.split(' ')[0] || 'LANDFIRE'} fuels</span><span>{runInfo.cell_size_m} m cells</span><span>{runInfo.domain_km} km domain</span><span>{runInfo.model_s != null ? `${runInfo.model_s}s` : ''}</span>
                {runInfo.ignition_snap_m > 0 && <span className="warn">ignition moved {Math.round(runInfo.ignition_snap_m)} m to burnable fuel</span>}
              </div>
            )}
            <div className="fine">Decision support only. Not a substitute for WFDSS, the IAP, or on-scene judgment.</div>
          </>
        )}
        <div className="field-credit">Website by <a href="https://nbtechai.com" target="_blank" rel="noopener noreferrer">NB Tech AI Solutions</a></div>
        </div>
      </div>
    </div>
  );
}
