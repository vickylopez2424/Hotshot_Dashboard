/**
 * Mission packs on the phone.
 *
 * A pack is the LANDFIRE landscape for a square area, built by
 * backend/integrations/predict/pack.py and served gzip'd from
 * GET /api/predict/pack?lat=&lon=&km=. This module fetches, decodes, stores
 * (IndexedDB "hotshot", store "packs") and looks up packs, keeps a 48 h
 * weather forecast alongside each pack, keeps the last incidents and alerts
 * GeoJSON, and converts between lon/lat and grid row/col with a hand written
 * WGS84 UTM (no proj library).
 *
 * Pack object shape (in memory):
 *   { key, meta, layers: {dem, slp, asp, fbfm40, cc, ch, cbh, cbd: Int16Array},
 *     ncols, nrows, cell, x0, y0, x1, y1, epsg, zone, north, bytesGzip }
 *   row 0 is the north edge, col 0 the west edge.
 */

export const DB_NAME = 'hotshot';
export const PACK_STORE = 'packs';
export const MISC_STORE = 'misc';
const DB_VERSION = 1;

export function packKey(lat, lon, km) {
  return `${lat},${lon},${km}`;
}

export function hasDecompression() {
  return typeof DecompressionStream !== 'undefined';
}

// ── decode ─────────────────────────────────────────────────────────────────

/** gunzip an ArrayBuffer/Uint8Array with the platform DecompressionStream. */
export async function gunzip(bytes) {
  if (!hasDecompression()) {
    throw new Error('This browser has no DecompressionStream; packs cannot be decoded offline. '
                    + 'Safari 16.4+, Chrome 80+, Firefox 113+ are required.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Parse a decompressed pack body (see pack.py FORMAT). */
export function parsePackBody(buffer, bytesGzip = 0) {
  const view = new DataView(buffer);
  const H = view.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, H)));
  if (meta.format !== 'hotshot-pack/1') throw new Error(`unknown pack format ${meta.format}`);
  const n = meta.ncols * meta.nrows;
  let off = 4 + H;
  const layers = {};
  for (const name of meta.layers) {
    layers[name] = new Int16Array(buffer, off, n);   // header is padded to 4 bytes so this is aligned
    off += n * 2;
  }
  if (off !== buffer.byteLength) throw new Error(`pack is ${buffer.byteLength} bytes, expected ${off}`);
  return finishPack(meta, layers, bytesGzip);
}

function finishPack(meta, layers, bytesGzip) {
  const zone = meta.epsg % 100;
  const north = meta.epsg >= 32601 && meta.epsg <= 32660;
  return {
    key: packKey(meta.center.lat, meta.center.lon, meta.km),
    meta, layers, bytesGzip,
    ncols: meta.ncols, nrows: meta.nrows, cell: meta.cell_m,
    x0: meta.x0, y0: meta.y0,
    x1: meta.x0 + meta.ncols * meta.cell_m, y1: meta.y0 + meta.nrows * meta.cell_m,
    epsg: meta.epsg, zone, north,
  };
}

export async function decodePack(gzBytes) {
  const buf = await gunzip(gzBytes);
  return parsePackBody(buf, gzBytes.byteLength);
}

// ── fetch ──────────────────────────────────────────────────────────────────

/**
 * Download a pack from the backend. `apiBase` is '' in the CRA dev proxy and
 * the full origin in the Capacitor app. Returns the decoded pack. Pass
 * {save: true} (default) to store it in IndexedDB.
 */
export async function fetchPack(lat, lon, km = 30, { apiBase = '', headers = {}, save = true, onProgress } = {}) {
  const url = `${apiBase}/api/predict/pack?lat=${lat}&lon=${lon}&km=${km}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`pack download failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  let gz;
  if (res.body && onProgress) {
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.byteLength;
      onProgress(got, total);
    }
    gz = new Uint8Array(got); let o = 0;
    for (const c of chunks) { gz.set(c, o); o += c.byteLength; }
  } else {
    gz = new Uint8Array(await res.arrayBuffer());
  }
  const pack = await decodePack(gz);
  if (save) await savePack(pack, gz);
  return pack;
}

export async function fetchPackEstimate(km = 30, { apiBase = '', headers = {} } = {}) {
  const res = await fetch(`${apiBase}/api/predict/pack/estimate?km=${km}`, { headers });
  if (!res.ok) throw new Error(`estimate failed: HTTP ${res.status}`);
  return res.json();
}

// ── IndexedDB ──────────────────────────────────────────────────────────────

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PACK_STORE)) db.createObjectStore(PACK_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(MISC_STORE)) db.createObjectStore(MISC_STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/** Store a pack. The gzip bytes are kept (2 to 5 MB) and decoded on load. */
export async function savePack(pack, gzBytes) {
  const existing = await tx(PACK_STORE, 'readonly', (s) => s.get(pack.key)).catch(() => null);
  const rec = {
    key: pack.key,
    meta: pack.meta,
    gz: gzBytes instanceof Uint8Array ? gzBytes.buffer.slice(gzBytes.byteOffset, gzBytes.byteOffset + gzBytes.byteLength) : gzBytes,
    bytes: gzBytes.byteLength,
    savedAt: new Date().toISOString(),
    weather: existing ? existing.weather : null,
    weatherSavedAt: existing ? existing.weatherSavedAt : null,
  };
  await tx(PACK_STORE, 'readwrite', (s) => s.put(rec));
  return rec.key;
}

/** Packs on the device: key, center, km, size, age in hours, weather age. */
export async function listPacks() {
  const recs = await tx(PACK_STORE, 'readonly', (s) => s.getAll());
  const now = Date.now();
  return recs.map((r) => ({
    key: r.key,
    center: r.meta.center,
    km: r.meta.km,
    cells: r.meta.ncols,
    bytes: r.bytes,
    savedAt: r.savedAt,
    ageHours: (now - Date.parse(r.savedAt)) / 3.6e6,
    landfireVersion: r.meta.landfire_version,
    hasWeather: !!r.weather,
    weatherSavedAt: r.weatherSavedAt,
    weatherAgeHours: r.weatherSavedAt ? (now - Date.parse(r.weatherSavedAt)) / 3.6e6 : null,
    bounds: metaBounds(r.meta),
  }));
}

export async function deletePack(key) {
  await tx(PACK_STORE, 'readwrite', (s) => s.delete(key));
}

/** Load and decode one pack by key. */
export async function getPack(key) {
  const rec = await tx(PACK_STORE, 'readonly', (s) => s.get(key));
  if (!rec) return null;
  const pack = await decodePack(new Uint8Array(rec.gz));
  pack.weather = rec.weather || null;
  pack.savedAt = rec.savedAt;
  return pack;
}

/** The stored pack whose bounds contain the point, smallest first. Decoded. */
export async function getPackCovering(lon, lat) {
  const recs = await tx(PACK_STORE, 'readonly', (s) => s.getAll());
  const hits = recs.filter((r) => metaContains(r.meta, lon, lat)).sort((a, b) => a.meta.km - b.meta.km);
  return hits.length ? getPack(hits[0].key) : null;
}

/** Store a forecast ({periods: [...48 h]}) with the pack of the same key. */
export async function savePackWeather(key, weather) {
  const rec = await tx(PACK_STORE, 'readonly', (s) => s.get(key));
  if (!rec) throw new Error(`no pack ${key}`);
  rec.weather = weather;
  rec.weatherSavedAt = new Date().toISOString();
  await tx(PACK_STORE, 'readwrite', (s) => s.put(rec));
}

export async function getPackWeather(key) {
  const rec = await tx(PACK_STORE, 'readonly', (s) => s.get(key));
  return rec ? { weather: rec.weather, savedAt: rec.weatherSavedAt } : null;
}

/** Last incidents / alerts GeoJSON (any JSON). name is 'incidents' or 'alerts'. */
export async function saveSnapshot(name, data) {
  await tx(MISC_STORE, 'readwrite', (s) => s.put({ key: name, data, savedAt: new Date().toISOString() }));
}

export async function getSnapshot(name) {
  return tx(MISC_STORE, 'readonly', (s) => s.get(name));
}

// ── grid <-> lon/lat ───────────────────────────────────────────────────────

function metaBounds(meta) {
  const p = { x0: meta.x0, y0: meta.y0, x1: meta.x0 + meta.ncols * meta.cell_m,
              y1: meta.y0 + meta.nrows * meta.cell_m, epsg: meta.epsg,
              zone: meta.epsg % 100, north: meta.epsg <= 32660 };
  const sw = utmInverse(p.x0, p.y0, p.zone, p.north), ne = utmInverse(p.x1, p.y1, p.zone, p.north);
  return { west: sw.lon, south: sw.lat, east: ne.lon, north: ne.lat };
}

function metaContains(meta, lon, lat) {
  const zone = meta.epsg % 100, north = meta.epsg <= 32660;
  const { x, y } = utmForward(lon, lat, zone, north);
  return x >= meta.x0 && x < meta.x0 + meta.ncols * meta.cell_m
      && y >= meta.y0 && y < meta.y0 + meta.nrows * meta.cell_m;
}

export function packContains(pack, lon, lat) {
  const { x, y } = utmForward(lon, lat, pack.zone, pack.north);
  return x >= pack.x0 && x < pack.x1 && y >= pack.y0 && y < pack.y1;
}

/** WGS84 lon/lat -> {row, col} (may be outside the grid; check packContains). */
export function projectToGrid(pack, lon, lat) {
  const { x, y } = utmForward(lon, lat, pack.zone, pack.north);
  return { row: Math.floor((pack.y1 - y) / pack.cell), col: Math.floor((x - pack.x0) / pack.cell), x, y };
}

/** Cell CENTRE -> {lon, lat}. Pass fractional row/col for corners (row 0, col 0 is the NW corner). */
export function gridToLonLat(pack, row, col, centre = true) {
  const o = centre ? 0.5 : 0;
  const x = pack.x0 + (col + o) * pack.cell;
  const y = pack.y1 - (row + o) * pack.cell;
  return utmInverse(x, y, pack.zone, pack.north);
}

// ── UTM (WGS84), Snyder 1987 series, good to well under a metre in zone ────

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const D2R = Math.PI / 180;

export function utmZone(lon) {
  return Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
}

export function utmForward(lon, lat, zone, north = true) {
  const phi = lat * D2R;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const Aa = (lon * D2R - lam0) * cos;
  const M = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * phi)
    - (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * phi));
  const A2 = Aa * Aa, A3 = A2 * Aa, A4 = A3 * Aa, A5 = A4 * Aa, A6 = A5 * Aa;
  const x = K0 * N * (Aa + (1 - T + C) * A3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * A5 / 120) + 500000;
  let y = K0 * (M + N * tan * (A2 / 2 + (5 - T + 9 * C + 4 * C * C) * A4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * A6 / 720));
  if (!north) y += 10000000;
  return { x, y };
}

export function utmInverse(x, y, zone, north = true) {
  const lam0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const xx = x - 500000, yy = north ? y : y - 10000000;
  const M = yy / K0;
  const mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)
    + (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1), cos1 = Math.cos(phi1), tan1 = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = EP2 * cos1 * cos1;
  const R1 = A * (1 - E2) / Math.pow(1 - E2 * sin1 * sin1, 1.5);
  const D = xx / (N1 * K0);
  const D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;
  const phi = phi1 - (N1 * tan1 / R1) * (D2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D6 / 720);
  const lam = lam0 + (D - (1 + 2 * T1 + C1) * D3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D5 / 120) / cos1;
  return { lon: lam / D2R, lat: phi / D2R };
}
