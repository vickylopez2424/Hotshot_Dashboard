/**
 * On-device fire growth: minimum travel time (Dijkstra, 16 neighbours) on
 * the 30 m mission pack grid, Rothermel ellipse per cell per hour, then
 * hourly arrival-time rings as GeoJSON in the same shape the server engine
 * returns (see backend/integrations/predict/engines.py and
 * elmfire/geotiff_processor.py).
 *
 *   simulate(pack, weather, {row, col}, hours, onProgress) -> {arrival, ...}
 *   ringsFromArrival(pack, arrival, hours) -> FeatureCollection
 *   snapIgnition(pack, row, col) -> {row, col, movedM}
 *
 * Weather is the NWS shape used by the backend ({periods: [{time, wind_mph,
 * wind_dir, temp_f, rh_pct}]}). Dead fuel moisture per hour follows
 * elmfire_pipeline.weather_bands exactly: 1-h = Simard EMC(temp, RH),
 * 10-h = 1-h + 1, 100-h = 1-h + 3; live herbaceous 30 %, woody 60 %.
 */
import { fuelBed, spreadRate, windAdjustmentFactor, FUEL_MODELS } from './rothermel.js';
import { gridToLonLat, projectToGrid } from './pack.js';

export const LH_MOISTURE = 30;
export const LW_MOISTURE = 60;
export const BURNABLE_MIN = 101, BURNABLE_MAX = 204;
const SNAP_RADIUS_M = 1000;
const FT_PER_M = 3.280839895;
const M2_PER_ACRE = 4046.856;
const DEG = Math.PI / 180;

const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180,
                  SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

/** 'WSW' -> 247.5 (direction the wind blows FROM). Numeric strings pass through. */
export function windDirDeg(text, fallback = 0) {
  const t = String(text ?? '').trim().toUpperCase();
  if (t in COMPASS) return COMPASS[t];
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) % 360;
  if (typeof text === 'number' && Number.isFinite(text)) return ((text % 360) + 360) % 360;
  return fallback;
}

/** Simard (1968) equilibrium moisture content, percent. Same as the backend. */
export function emcSimard(tempF, rhPct) {
  const T = Number(tempF), H = Number(rhPct);
  let emc;
  if (H < 10) emc = 0.03229 + 0.281073 * H - 0.000578 * H * T;
  else if (H < 50) emc = 2.22749 + 0.160107 * H - 0.014784 * T;
  else emc = 21.0606 + 0.005565 * H * H - 0.00035 * H * T - 0.483199 * H;
  return Math.max(1, Math.min(35, emc));
}

/** hours+1 hourly rows {ws20Mph, wdDeg, m1, m10, m100, tempF, rhPct, time}. */
export function hourlyWeather(weather, hours) {
  const periods = [...((weather && weather.periods) || [])];
  if (!periods.length) throw new Error('weather has no periods');
  while (periods.length < hours + 1) periods.push(periods[periods.length - 1]);
  let lastDir = 0;
  return periods.slice(0, hours + 1).map((p) => {
    const temp = p.temp_f == null ? 70 : Number(p.temp_f);
    const rh = p.rh_pct == null ? 30 : Number(p.rh_pct);
    lastDir = windDirDeg(p.wind_dir, lastDir);
    const m1 = Math.round(emcSimard(temp, rh) * 10) / 10;
    return { time: p.time, ws20Mph: Number(p.wind_mph) || 0, wdDeg: lastDir,
             m1, m10: Math.min(35, m1 + 1), m100: Math.min(35, m1 + 3), tempF: temp, rhPct: rh };
  });
}

/** Same rule as elmfire_pipeline.snap_ignition: keep a cell whose 3x3 block is
 * burnable, else the nearest such cell within 1 km, else the nearest burnable. */
export function snapIgnition(pack, row, col) {
  const { nrows, ncols, cell } = pack;
  const fm = pack.layers.fbfm40;
  const burn = (r, c) => r >= 0 && c >= 0 && r < nrows && c < ncols && fm[r * ncols + c] >= BURNABLE_MIN && fm[r * ncols + c] <= BURNABLE_MAX;
  const inner = (r, c) => {
    if (r < 1 || c < 1 || r >= nrows - 1 || c >= ncols - 1) return false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!burn(r + dr, c + dc)) return false;
    return true;
  };
  if (inner(row, col)) return { row, col, movedM: 0, code: fm[row * ncols + col] };
  const R = Math.floor(SNAP_RADIUS_M / cell);
  for (const test of [inner, burn]) {
    let best = -1, br = row, bc = col;
    for (let r = Math.max(0, row - R); r < Math.min(nrows, row + R + 1); r++) {
      for (let c = Math.max(0, col - R); c < Math.min(ncols, col + R + 1); c++) {
        if (!test(r, c)) continue;
        const d2 = (r - row) * (r - row) + (c - col) * (c - col);
        if (best < 0 || d2 < best) { best = d2; br = r; bc = c; }
      }
    }
    if (best >= 0) return { row: br, col: bc, movedM: Math.sqrt(best) * cell, code: fm[br * ncols + bc] };
  }
  throw new Error(`No burnable fuel within ${SNAP_RADIUS_M} m of the ignition (LANDFIRE FBFM40 = ${fm[row * ncols + col]})`);
}

// 16 neighbours: 4 edge, 4 diagonal, 8 knight moves.
const OFFS = [];
for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1],
                        [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]) {
  // bearing of travel, degrees from north; row grows south
  const bearing = ((Math.atan2(dc, -dr) / DEG) + 360) % 360;
  const knight = Math.abs(dr) + Math.abs(dc) === 3;
  const mids = knight
    ? (Math.abs(dr) === 1 ? [[0, Math.sign(dc)], [dr, Math.sign(dc)]] : [[Math.sign(dr), 0], [Math.sign(dr), dc]])
    : [];
  OFFS.push({ dr, dc, dist: Math.hypot(dr, dc), bearing, mids });
}

/** Binary min-heap on (time, cell) with typed arrays; lazy deletion. */
class Heap {
  constructor(cap) { this.t = new Float32Array(cap); this.c = new Int32Array(cap); this.n = 0; }
  push(t, c) {
    if (this.n === this.t.length) {
      const nt = new Float32Array(this.n * 2), nc = new Int32Array(this.n * 2);
      nt.set(this.t); nc.set(this.c); this.t = nt; this.c = nc;
    }
    let i = this.n++;
    const T = this.t, C = this.c;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (T[p] <= t) break;
      T[i] = T[p]; C[i] = C[p]; i = p;
    }
    T[i] = t; C[i] = c;
  }
  pop() {
    const T = this.t, C = this.c;
    const rt = T[0], rc = C[0];
    const n = --this.n;
    if (n > 0) {
      const t = T[n], c = C[n];
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        if (l + 1 < n && T[l + 1] < T[l]) l++;
        if (T[l] >= t) break;
        T[i] = T[l]; C[i] = C[l]; i = l;
      }
      T[i] = t; C[i] = c;
    }
    this.popT = rt; return rc;
  }
}

/**
 * Minimum travel time fire growth.
 * @param {object} pack        decoded pack (pack.js)
 * @param {object} weather     {periods: [...]} NWS shape, hourly
 * @param {{row:number,col:number}} ignition  grid cell (use snapIgnition first)
 * @param {number} hours       horizon
 * @param {function} [onProgress]  (fraction 0..1, cellsSettled) called every ~20k cells
 * @param {object} [opt]       {liveHerb, liveWoody, windLimit, crownRatioDefault}
 * @returns {{arrival: Float32Array, stepsRun, cellsBurned, maxMinutes, hourly, ignition, elapsedMs}}
 */
export function simulate(pack, weather, ignition, hours, onProgress, opt = {}) {
  const t0 = Date.now();
  const { nrows, ncols, cell } = pack;
  const N = nrows * ncols;
  const fm = pack.layers.fbfm40, slp = pack.layers.slp, asp = pack.layers.asp;
  const cc = pack.layers.cc, ch = pack.layers.ch, cbh = pack.layers.cbh;
  const liveHerb = opt.liveHerb ?? LH_MOISTURE, liveWoody = opt.liveWoody ?? LW_MOISTURE;
  const horizon = hours * 60;
  const wx = hourlyWeather(weather, hours);
  const cellFt = cell * FT_PER_M;

  // Per-cell constants: burnable, tan(slope), wind adjustment factor.
  const burnable = new Uint8Array(N);
  const tanS = new Float32Array(N);
  const waf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const code = fm[i];
    if (code < BURNABLE_MIN || code > BURNABLE_MAX || !FUEL_MODELS.has(code)) continue;
    burnable[i] = 1;
    tanS[i] = Math.tan(Math.min(89, slp[i]) * DEG);
    // LANDFIRE: cc percent, ch and cbh in metres x 10. Crown ratio from (ch - cbh) / ch.
    const hM = ch ? ch[i] / 10 : 0, bM = cbh ? cbh[i] / 10 : 0;
    const cr = hM > 0 ? Math.max(0, Math.min(1, (hM - bM) / hM)) : (opt.crownRatioDefault ?? 0.5);
    waf[i] = windAdjustmentFactor({ depth: FUEL_MODELS.get(code).depth, canopyCover: cc ? cc[i] : 0,
                                    canopyHeightFt: hM * FT_PER_M, crownRatio: cr });
  }

  // Fuel beds per (hour, fuel code), built lazily.
  const beds = wx.map(() => new Map());
  const bedFor = (h, code) => {
    const m = beds[h];
    let b = m.get(code);
    if (b === undefined) {
      const w = wx[h];
      b = fuelBed(code, { h1: w.m1, h10: w.m10, h100: w.m100, herb: liveHerb, woody: liveWoody });
      m.set(code, b);
    }
    return b;
  };

  const arrival = new Float32Array(N).fill(-1);
  const settled = new Uint8Array(N);
  const heap = new Heap(1 << 16);
  const ig = ignition.row * ncols + ignition.col;
  if (!burnable[ig]) throw new Error('ignition cell is not burnable; call snapIgnition first');
  arrival[ig] = 0; heap.push(0, ig);

  let steps = 0, burned = 0, maxMinutes = 0;
  const reportEvery = 20000;
  while (heap.n > 0) {
    const i = heap.pop();
    const t = heap.popT;
    if (settled[i] || t > arrival[i]) continue;    // stale entry
    settled[i] = 1; burned++; steps++;
    if (t > maxMinutes) maxMinutes = t;
    if (onProgress && steps % reportEvery === 0) onProgress(Math.min(1, t / horizon), steps);

    const h = Math.min(wx.length - 1, Math.floor(t / 60));
    const bed = bedFor(h, fm[i]);
    if (!bed) continue;
    const w = wx[h];
    const head = spreadRate(bed, w.ws20Mph * 88 * waf[i], w.wdDeg, tanS[i], asp[i], { windLimit: opt.windLimit });
    if (head.ros <= 0) continue;
    const e = head.eccentricity, rFlat = head.ros * (1 - e);
    const r = (i / ncols) | 0, c = i - r * ncols;

    for (let k = 0; k < 16; k++) {
      const o = OFFS[k];
      const nr = r + o.dr, nc = c + o.dc;
      if (nr < 0 || nc < 0 || nr >= nrows || nc >= ncols) continue;
      const j = nr * ncols + nc;
      if (!burnable[j] || settled[j]) continue;
      if (o.mids.length && !(burnable[(r + o.mids[0][0]) * ncols + c + o.mids[0][1]]
                          && burnable[(r + o.mids[1][0]) * ncols + c + o.mids[1][1]])) continue;
      const rate = rFlat / (1 - e * Math.cos((o.bearing - head.direction) * DEG));   // ft/min
      if (rate <= 1e-6) continue;
      const ta = t + o.dist * cellFt / rate;
      if (ta > horizon) continue;
      if (arrival[j] < 0 || ta < arrival[j]) { arrival[j] = ta; heap.push(ta, j); }
    }
  }
  // Cells that were reached but never settled keep their tentative time (all <= horizon).
  const hourly = [];
  for (let hh = 1; hh <= hours; hh++) {
    let n = 0; const lim = hh * 60;
    for (let i = 0; i < N; i++) if (arrival[i] >= 0 && arrival[i] <= lim) n++;
    hourly.push({ minutes: lim, cells: n, acres: n * cell * cell / M2_PER_ACRE });
  }
  if (onProgress) onProgress(1, steps);
  return { arrival, stepsRun: steps, cellsBurned: burned, maxMinutes, hourly, ignition,
           elapsedMs: Date.now() - t0, weatherTable: wx };
}

// ── rings ──────────────────────────────────────────────────────────────────

function label4(mask, nrows, ncols) {
  const labels = new Int32Array(nrows * ncols);
  const stack = new Int32Array(nrows * ncols);
  let next = 0;
  for (let s = 0; s < labels.length; s++) {
    if (!mask[s] || labels[s]) continue;
    next++;
    let sp = 0; stack[sp++] = s; labels[s] = next;
    while (sp) {
      const i = stack[--sp];
      const r = (i / ncols) | 0, c = i - r * ncols;
      if (r > 0 && mask[i - ncols] && !labels[i - ncols]) { labels[i - ncols] = next; stack[sp++] = i - ncols; }
      if (r < nrows - 1 && mask[i + ncols] && !labels[i + ncols]) { labels[i + ncols] = next; stack[sp++] = i + ncols; }
      if (c > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = next; stack[sp++] = i - 1; }
      if (c < ncols - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = next; stack[sp++] = i + 1; }
    }
  }
  return { labels, count: next };
}

/** Boundary rings of a mask as lists of corner vertices [col,row], burned on the left. */
function traceRings(mask, nrows, ncols) {
  const W = ncols + 1;
  const from = [], to = [], lab = [];
  const { labels, count } = label4(mask, nrows, ncols);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const i = r * ncols + c;
      if (!mask[i]) continue;
      const L = labels[i];
      if (r === 0 || !mask[i - ncols]) { from.push(r * W + c + 1); to.push(r * W + c); lab.push(L); }
      if (r === nrows - 1 || !mask[i + ncols]) { from.push((r + 1) * W + c); to.push((r + 1) * W + c + 1); lab.push(L); }
      if (c === 0 || !mask[i - 1]) { from.push(r * W + c); to.push((r + 1) * W + c); lab.push(L); }
      if (c === ncols - 1 || !mask[i + 1]) { from.push((r + 1) * W + c + 1); to.push(r * W + c + 1); lab.push(L); }
    }
  }
  const E = from.length;
  const head = new Int32Array(W * (nrows + 1)).fill(-1), nxt = new Int32Array(E);
  for (let e = 0; e < E; e++) { nxt[e] = head[from[e]]; head[from[e]] = e; }
  const used = new Uint8Array(E);
  const dir = (e) => { const d = to[e] - from[e]; return d === 1 ? 0 : d === W ? 1 : d === -1 ? 2 : 3; }; // E,S,W,N
  const rings = [];
  for (let s = 0; s < E; s++) {
    if (used[s]) continue;
    const pts = [];
    let e = s;
    while (e >= 0 && !used[e]) {
      used[e] = 1;
      const v = from[e];
      pts.push([v % W, (v / W) | 0]);
      const v2 = to[e], din = dir(e);
      let pick = -1, pickTurn = 9;
      for (let f = head[v2]; f >= 0; f = nxt[f]) {
        if (used[f]) continue;
        // left turn first (keeps diagonal touching cells as separate rings, matching 4-connectivity)
        const turn = (dir(f) - din + 4) % 4;      // 3 = left, 0 = straight, 1 = right
        const rank = turn === 3 ? 0 : turn === 0 ? 1 : 2;
        if (rank < pickTurn) { pickTurn = rank; pick = f; }
      }
      e = pick;
    }
    if (pts.length >= 4) rings.push({ pts, label: lab[s] });
  }
  return { rings, count };
}

function signedArea(pts) {   // in grid units with y up (row down => negate)
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * (-q[1]) - q[0] * (-p[1]);
  }
  return a / 2;
}

function dpOpen(pts, tol, out) {
  const stack = [[0, pts.length - 1]];
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
}

/** Douglas-Peucker on a closed ring, split at the vertex farthest from vertex 0. */
function simplifyRing(pts, tol) {
  if (pts.length <= 5) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const out = [];
  dpOpen(pts.slice(0, far + 1), tol, out);
  out.pop();
  dpOpen(pts.slice(far).concat([pts[0]]), tol, out);
  out.pop();
  return out.length >= 3 ? out : pts;
}

function fmtTime(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Hourly cumulative burned-area rings, server shape.
 * @param {object} pack
 * @param {Float32Array} arrival  minutes, -1 unburned
 * @param {number} hours
 * @param {object} [opt] {intervalMinutes: 60, toleranceCells: 0.75, minHoleCells: 3, decimals: 5, ignition: [lon,lat]}
 */
export function ringsFromArrival(pack, arrival, hours, opt = {}) {
  const { nrows, ncols, cell } = pack;
  const interval = opt.intervalMinutes ?? 60;
  const tol = opt.toleranceCells ?? 0.75;
  const minHole = opt.minHoleCells ?? 3;
  const dec = opt.decimals ?? 5;
  const N = nrows * ncols;
  const mask = new Uint8Array(N);
  const features = [];
  let maxT = 0;
  for (let i = 0; i < N; i++) if (arrival[i] > maxT) maxT = arrival[i];
  const round = (v) => Math.round(v * 10 ** dec) / 10 ** dec;
  const toLL = (p) => { const { lon, lat } = gridToLonLat(pack, p[1], p[0], false); return [round(lon), round(lat)]; };

  for (let t = interval; t <= hours * 60; t += interval) {
    let cells = 0;
    for (let i = 0; i < N; i++) { const b = arrival[i] >= 0 && arrival[i] <= t ? 1 : 0; mask[i] = b; cells += b; }
    if (!cells) continue;
    const { rings, count } = traceRings(mask, nrows, ncols);
    const outers = new Array(count + 1).fill(null), holes = new Array(count + 1).fill(null);
    for (const ring of rings) {
      const area = signedArea(ring.pts);
      if (area > 0) {
        if (!outers[ring.label] || area > outers[ring.label].area) outers[ring.label] = { area, pts: ring.pts };
      } else if (-area >= minHole) {
        (holes[ring.label] || (holes[ring.label] = [])).push(ring.pts);
      }
    }
    const polys = [];
    for (let L = 1; L <= count; L++) {
      if (!outers[L]) continue;
      const rings2 = [simplifyRing(outers[L].pts, tol)];
      for (const h of holes[L] || []) rings2.push(simplifyRing(h, tol));
      polys.push(rings2.map((r) => { const c = r.map(toLL); c.push(c[0]); return c; }));
    }
    if (!polys.length) continue;
    const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] }
                                        : { type: 'MultiPolygon', coordinates: polys };
    features.push({
      type: 'Feature',
      properties: { time_seconds: t * 60, time_minutes: t, time_label: fmtTime(t),
                    cells, acres: Math.round(cells * cell * cell / M2_PER_ACRE) },
      geometry,
    });
  }
  const ign = opt.ignition || null;
  return { type: 'FeatureCollection', features, max_time_minutes: Math.round(maxT),
           ignition_point: ign, source: 'ondevice-rothermel' };
}

/**
 * Everything the screen needs in one call: snap, run, rings, summary.
 * @param {object} pack
 * @param {object} weather
 * @param {[number, number]} lonLat  ignition [lon, lat]
 * @param {number} hours
 * @param {function} [onProgress]
 */
export function predictOnDevice(pack, weather, lonLat, hours, onProgress, opt = {}) {
  const [lon, lat] = lonLat;
  const g = projectToGrid(pack, lon, lat);
  const snap = snapIgnition(pack, g.row, g.col);
  const run = simulate(pack, weather, snap, hours, onProgress, opt);
  const used = gridToLonLat(pack, snap.row, snap.col);
  const rings = ringsFromArrival(pack, run.arrival, hours, { ignition: [lon, lat] });
  const last = run.hourly[run.hourly.length - 1];
  return {
    ...rings,
    run: {
      engine: 'ondevice-rothermel', hours, cell_size_m: pack.cell, domain_cells: pack.ncols,
      crs: `EPSG:${pack.epsg}`, landfire_version: pack.meta.landfire_version,
      ignition_used: [used.lon, used.lat], ignition_snap_m: Math.round(snap.movedM),
      acres_at_horizon: Math.round(last.acres), hourly: run.hourly, weather_table: run.weatherTable,
      elapsed_ms: run.elapsedMs, cells_burned: run.cellsBurned,
      live_moisture: { lh_pct: opt.liveHerb ?? LH_MOISTURE, lw_pct: opt.liveWoody ?? LW_MOISTURE },
      assumptions: ASSUMPTIONS,
    },
  };
}

export const ASSUMPTIONS = [
  'Surface fire only (Rothermel 1972 / Albini 1976 as in BehavePlus); no crown fire, spotting or suppression.',
  'Fire growth by minimum travel time on 16 neighbours; spread from a cell uses that cell\'s Rothermel ellipse for the hour of its own arrival.',
  'Wind speed: forecast wind treated as the 20 ft wind, reduced to midflame with the Albini-Baughman wind adjustment factor from fuel bed depth or LANDFIRE canopy (cover, height, base height).',
  'Wind direction: 16-point compass text to degrees (from). Weather uniform over the domain each hour.',
  'Dead fuel moisture: 1-h = Simard EMC from hourly temperature and RH; 10-h = 1-h + 1; 100-h = 1-h + 3; no time lag.',
  'Live fuel moisture: herbaceous 30 %, woody 60 % (seasonal defaults, not forecast).',
  'Length-to-breadth from Anderson (1983) with the effective wind speed, capped at 8.',
  'Knight-move neighbours require the two cells beside the path to be burnable; a one-cell (30 m) non-burnable line stops the fire.',
  'Rings are cell-edge outlines simplified with Douglas-Peucker (0.75 cell); holes under 3 cells are dropped.',
];
