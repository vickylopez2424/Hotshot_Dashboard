/**
 * Engine tests. Plain node, no bundler, no jest:
 *
 *   node frontend/src/engine/__tests__/run.js
 *
 * Environment:
 *   HOTSHOT_API        backend for the ELMFIRE job (default http://127.0.0.1:8000)
 *   HOTSHOT_PACK_API   backend for the pack download (default HOTSHOT_API)
 *   SKIP_E2E=1         unit tests only
 *
 * Sections: UTM, Rothermel against BehavePlus (firelab/behave testBehave.cpp),
 * synthetic-pack spread against the analytic ellipse, and an end-to-end run
 * on a real pack with the server ELMFIRE result side by side.
 */
import { utmForward, utmInverse, parsePackBody, decodePack, projectToGrid, gridToLonLat, packContains } from '../pack.js';
import { fuelBed, spreadRate, windAdjustmentFactor, lengthToBreadth, rothermel, FUEL_MODELS } from '../rothermel.js';
import { simulate, ringsFromArrival, snapIgnition, hourlyWeather, emcSimard, predictOnDevice } from '../spread.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}
const pct = (a, b) => ((a - b) / b * 100);

// ── UTM ────────────────────────────────────────────────────────────────────
console.log('\n== UTM (reference values from pyproj, EPSG:32610 / 32611) ==');
const UTM_REF = [   // lon, lat, zone, easting, northing
  [-120.7985, 38.7296, 10, 691365.5228265992, 4289071.495089356],
  [-121.5, 37.0, 10, 633468.3436436806, 4095923.937228805],
  [-120.0, 40.5, 10, 754219.9599434844, 4487579.255488161],
  [-122.9, 39.9, 10, 508548.4093830107, 4416663.078042446],
  [-117.3, 34.4, 11, 472426.13672631356, 3806549.4157396383],
];
let utmMax = 0, invMax = 0;
for (const [lon, lat, zone, E, Nn] of UTM_REF) {
  const f = utmForward(lon, lat, zone, true);
  const err = Math.hypot(f.x - E, f.y - Nn);
  utmMax = Math.max(utmMax, err);
  const inv = utmInverse(E, Nn, zone, true);
  const dLon = (inv.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180), dLat = (inv.lat - lat) * 110574;
  invMax = Math.max(invMax, Math.hypot(dLon, dLat));
}
check('UTM forward within 2 m', utmMax < 2, `max error ${utmMax.toFixed(3)} m`);
check('UTM inverse within 2 m', invMax < 2, `max error ${invMax.toFixed(3)} m`);

// ── Rothermel ──────────────────────────────────────────────────────────────
console.log('\n== Rothermel vs BehavePlus (firelab/behave src/testBehave/testBehave.cpp) ==');
const M = { h1: 6, h10: 7, h100: 8, herb: 60, woody: 90 };
const gs4 = fuelBed(124, M);
const tol = 5e-3;   // fraction
const near = (a, b, t = tol) => Math.abs(a - b) <= t * Math.abs(b);
check('GS4 characteristic SAV 1631.128734', near(gs4.sigma, 1631.128734, 1e-5), gs4.sigma.toFixed(6));
check('GS4 dead moisture 6.005463 %', near(gs4.deadMoisture, 6.005463, 1e-4), gs4.deadMoisture.toFixed(6));
check('GS4 live moisture 85.874007 %', near(gs4.liveMoisture, 85.874007, 1e-3), gs4.liveMoisture.toFixed(6));
check('GS4 live extinction 137.968551 %', near(gs4.mxLive, 137.968551, 1e-3), gs4.mxLive.toFixed(6));
const wafSheltered = windAdjustmentFactor({ depth: 2.1, canopyCover: 50, canopyHeightFt: 30, crownRatio: 0.5 });
const tan30 = Math.tan(30 * Math.PI / 180);
const ROS_REF = [   // name, bed, waf, ws20 mph, windFrom, slopeFraction, aspect, expected ch/h
  ['GS4 5 mph 20 ft upslope wind, 30 % slope', gs4, wafSheltered, 5, 0, 0.30, 0, 8.876216],
  ['GS4 5 mph 20 ft, wind from 45, aspect 95, 30 deg slope', gs4, wafSheltered, 5, 45, tan30, 95, 19.677584],
  ['GS4 5 mph 20 ft, wind from 45, aspect 215, 30 % slope', gs4, wafSheltered, 5, 45, 0.30, 215, 4.113265],
  ['GS4 5 mph 20 ft, wind from 45, aspect 5, 30 % slope', gs4, wafSheltered, 5, 45, 0.30, 5, 8.503960],
  ['FM4 5 mph 20 ft, wind from 90, aspect 0, 30 deg slope, 40 % cover', fuelBed(4, M),
    windAdjustmentFactor({ depth: 6, canopyCover: 40, canopyHeightFt: 30, crownRatio: 0.5 }), 5, 90, tan30, 0, 46.631688],
];
const table = [];
for (const [name, bed, waf, ws, wd, sl, asp, exp] of ROS_REF) {
  const r = spreadRate(bed, ws * 88 * waf, wd, sl, asp);
  const chh = r.ros / 1.1;
  table.push({ case: name, ros_ch_h: +chh.toFixed(3), ref_ch_h: exp, diff_pct: +pct(chh, exp).toFixed(3), source: 'BehavePlus (firelab/behave tests)' });
  check(name, near(chh, exp), `${chh.toFixed(4)} vs ${exp} (${pct(chh, exp).toFixed(3)} %)`);
}
{
  const r = spreadRate(gs4, 5 * 88 * wafSheltered, 0, 0.30, 0);
  check('GS4 fireline intensity 598.339 BTU/ft/s', near(r.firelineIntensity, 598.339039), r.firelineIntensity.toFixed(3));
  check('GS4 backing rate 2.916 ch/h', near(r.ros * (1 - r.eccentricity) / (1 + r.eccentricity) / 1.1, 2.91614659),
        (r.ros * (1 - r.eccentricity) / (1 + r.eccentricity) / 1.1).toFixed(4));
  const flat = spreadRate(gs4, 5 * 88, 0, 0, 0);
  check('LB 5 mph midflame, flat: 1.590064', near(flat.lb, 1.590064, 1e-3), flat.lb.toFixed(6));
  check('LB 0 mph flat: 1.0', lengthToBreadth(0) === 1, lengthToBreadth(0).toFixed(6));
  const s1 = spreadRate(gs4, 5 * 88 * wafSheltered, 45, tan30, 95);
  check('LB 5 mph 20 ft, wind 45, aspect 95, 30 deg: 1.375624', near(s1.lb, 1.375624, 1e-3), s1.lb.toFixed(6));
  const s2 = spreadRate(gs4, 15 * 88 * wafSheltered, 45, tan30, 95);
  check('LB 15 mph 20 ft, same: 1.519936', near(s2.lb, 1.519936, 1e-3), s2.lb.toFixed(6));
  check('non-burnable 91 gives no bed', fuelBed(91, M) === null);
  check('all 40 S&B models + 13 Anderson + 5 NB present', FUEL_MODELS.size === 58, String(FUEL_MODELS.size));
}
console.log('\nRequested scenario: 1-h 6 %, 10-h 7 %, 100-h 8 %, live 60/90, midflame 5 mi/h, flat (no independent published value found; computed by the BehavePlus-matched code above):');
for (const code of [1, 102, 145, 183]) {
  const o = rothermel({ code, m1: 6, m10: 7, m100: 8, herb: 60, woody: 90, midflameMph: 5 });
  console.log(`  ${o.bed.name.padEnd(4)} ROS ${o.rosChPerHr.toFixed(1).padStart(6)} ch/h = ${o.ros.toFixed(1).padStart(6)} ft/min, flame ${o.flameLength.toFixed(1)} ft, LB ${o.lb.toFixed(2)}, IR ${o.bed.reactionIntensity.toFixed(0)} BTU/ft2/min`);
  table.push({ case: `${o.bed.name} 6/7/8/60/90, 5 mi/h midflame, flat`, ros_ch_h: +o.rosChPerHr.toFixed(2), ref_ch_h: null, diff_pct: null, source: 'no reference found' });
}
console.log('\nROS table (ch/h):');
console.table(table);

// ── synthetic pack ─────────────────────────────────────────────────────────
console.log('\n== Spread on a synthetic pack (uniform GR2, flat) vs analytic ellipse ==');
function syntheticPack(n, code) {
  const meta = { format: 'hotshot-pack/1', epsg: 32610, x0: 681360, y0: 4279050, cell_m: 30, ncols: n, nrows: n,
                 layers: ['dem', 'slp', 'asp', 'fbfm40', 'cc', 'ch', 'cbh', 'cbd'],
                 landfire_version: 'synthetic', built_at: new Date().toISOString(), center: { lat: 38.73, lon: -120.8 }, km: n * 0.03, bytes_raw: 0 };
  const layers = {};
  for (const L of meta.layers) layers[L] = new Int16Array(n * n);
  layers.fbfm40.fill(code); layers.dem.fill(500);
  return { key: 'synthetic', meta, layers, ncols: n, nrows: n, cell: 30, x0: meta.x0, y0: meta.y0,
           x1: meta.x0 + n * 30, y1: meta.y0 + n * 30, epsg: 32610, zone: 10, north: true };
}
{
  const n = 533, hours = 6;
  const pack = syntheticPack(n, 102);
  const weather = { periods: Array.from({ length: 13 }, (_, h) => ({ time: `h${h}`, wind_mph: 10, wind_dir: 'SW', temp_f: 85, rh_pct: 20 })) };
  const wx = hourlyWeather(weather, hours);
  const t0 = Date.now();
  const run = simulate(pack, weather, { row: (n / 2) | 0, col: (n / 2) | 0 }, hours);
  const secs = (Date.now() - t0) / 1000;
  const rings = ringsFromArrival(pack, run.arrival, hours);
  // analytic: ellipse area at time T with head ROS R, LB: a = (R + Rback) T / 2, b = a / LB
  const bed = fuelBed(102, { h1: wx[0].m1, h10: wx[0].m10, h100: wx[0].m100, herb: 30, woody: 60 });
  const waf = windAdjustmentFactor({ depth: FUEL_MODELS.get(102).depth });
  const head = spreadRate(bed, 10 * 88 * waf, 225, 0, 0);
  const e = head.eccentricity, T = hours * 60;
  const back = head.ros * (1 - e) / (1 + e);
  const a = (head.ros + back) * T / 2, b = a / head.lb;    // ft
  const ellipseAcres = Math.PI * a * b / 43560;
  const acres = run.hourly[hours - 1].acres;
  console.log(`  GR2 at m1 ${wx[0].m1} %: head ROS ${head.ros.toFixed(1)} ft/min (${(head.ros / 1.1).toFixed(1)} ch/h), direction ${head.direction.toFixed(0)}, LB ${head.lb.toFixed(2)}, WAF ${waf.toFixed(3)}`);
  console.log(`  grid ${n}x${n}, ${hours} h, ${secs.toFixed(2)} s, ${run.stepsRun} cells settled, ${rings.features.length} rings, ${JSON.stringify(rings).length} bytes GeoJSON`);
  console.log(`  acres at ${hours} h: engine ${acres.toFixed(0)}, analytic ellipse ${ellipseAcres.toFixed(0)}, ratio ${(acres / ellipseAcres).toFixed(3)}`);
  check('synthetic run under 5 s', secs < 5, `${secs.toFixed(2)} s`);
  check('synthetic 6 h area within 15 % of ellipse', Math.abs(acres / ellipseAcres - 1) < 0.15, `ratio ${(acres / ellipseAcres).toFixed(3)}`);
  check('one ring per hour', rings.features.length === hours);
  const f = rings.features[hours - 1];
  check('last ring is a Polygon with a closed exterior', f.geometry.type === 'Polygon'
        && JSON.stringify(f.geometry.coordinates[0][0]) === JSON.stringify(f.geometry.coordinates[0].at(-1)));
  // 12 h on 800x800 size check
  const big = syntheticPack(800, 102);
  const t1 = Date.now();
  const run12 = simulate(big, weather, { row: 400, col: 400 }, 12);
  const r12 = ringsFromArrival(big, run12.arrival, 12);
  const bytes = JSON.stringify(r12).length;
  console.log(`  800x800 12 h: ${((Date.now() - t1) / 1000).toFixed(2)} s, ${run12.hourly[11].acres.toFixed(0)} acres, GeoJSON ${(bytes / 1024).toFixed(0)} KB`);
  check('800x800 12 h GeoJSON under 300 KB', bytes < 300 * 1024, `${(bytes / 1024).toFixed(0)} KB`);
}

// ── end to end ─────────────────────────────────────────────────────────────
const API = process.env.HOTSHOT_API || 'http://127.0.0.1:8000';
const PACK_API = process.env.HOTSHOT_PACK_API || API;
const LAT = Number(process.env.E2E_LAT || 38.7296), LON = Number(process.env.E2E_LON || -120.7985);
const PACK_LAT = 38.7296, PACK_LON = -120.7985;   // the pack is always built here; E2E_LAT/LON must fall inside it

function polyAreaM2(ring, pack) {
  let a = 0;
  const pts = ring.map(([lon, lat]) => { const p = projectToGrid(pack, lon, lat); return [p.x, p.y]; });
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(a / 2);
}
function geojsonAcres(feature, pack) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let m2 = 0;
  for (const p of polys) { m2 += polyAreaM2(p[0], pack); for (let i = 1; i < p.length; i++) m2 -= polyAreaM2(p[i], pack); }
  return m2 / 4046.856;
}

async function e2e() {
  console.log(`\n== End to end: real pack from ${PACK_API}, ELMFIRE from ${API} ==`);
  let pack;
  try {
    const t0 = Date.now();
    const res = await fetch(`${PACK_API}/api/predict/pack?lat=${PACK_LAT}&lon=${PACK_LON}&km=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = new Uint8Array(await res.arrayBuffer());
    pack = await decodePack(gz);
    console.log(`  pack ${pack.ncols}x${pack.nrows} ${pack.meta.landfire_version}, ${gz.byteLength} bytes gz, ${pack.meta.bytes_raw} raw, ${Date.now() - t0} ms fetch+decode`);
  } catch (e) {
    console.log(`  backend not reachable for packs (${e.message}); skipping end-to-end`);
    return;
  }
  check('pack covers the point', packContains(pack, LON, LAT));
  const g = projectToGrid(pack, LON, LAT);
  const gc = projectToGrid(pack, PACK_LON, PACK_LAT);
  check('center cell matches server header', gc.row === pack.meta.center_cell.row && gc.col === pack.meta.center_cell.col, `${gc.row},${gc.col}`);
  const ll = gridToLonLat(pack, g.row, g.col);
  check('grid round trip within 30 m', Math.hypot((ll.lon - LON) * 111320 * Math.cos(LAT * Math.PI / 180), (ll.lat - LAT) * 110574) < 30);

  const synth = { periods: Array.from({ length: 13 }, (_, h) => ({ time: `2026-09-09T${String(h).padStart(2, '0')}:00:00-07:00`, wind_mph: 10, wind_dir: 'SW', temp_f: 85, rh_pct: 20 })) };
  const t0 = Date.now();
  const out = predictOnDevice(pack, synth, [LON, LAT], 6);
  const secs = (Date.now() - t0) / 1000;
  const acres6 = out.run.acres_at_horizon;
  console.log(`  on-device 6 h, synthetic 10 mph SW / 20 % RH / 85 F: ${acres6} acres, ${out.features.length} rings, ${secs.toFixed(2)} s, ignition moved ${out.run.ignition_snap_m} m (fuel ${pack.layers.fbfm40[g.row * pack.ncols + g.col]} at tap), GeoJSON ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
  console.log('  hourly acres: ' + out.run.hourly.map((h) => Math.round(h.acres)).join(', '));
  check('on-device run produced rings', out.features.length === 6);
  check('on-device 6 h under 5 s', secs < 5, `${secs.toFixed(2)} s`);

  // Server engine with its own NWS weather, then the same NWS weather on device.
  let job;
  try {
    const r = await fetch(`${API}/api/predict`, { method: 'POST', headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ lat: LAT, lon: LON, hours: 12, engine: 'elmfire' }) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
    const { job_id } = await r.json();
    const started = Date.now();
    for (;;) {
      await new Promise((res) => setTimeout(res, 3000));
      job = await (await fetch(`${API}/api/predict/${job_id}`)).json();
      if (['done', 'failed', 'model_unavailable'].includes(job.status)) break;
      if (Date.now() - started > 600000) throw new Error('ELMFIRE job timed out');
    }
  } catch (e) {
    console.log(`  ELMFIRE job not run: ${e.message}`);
    return;
  }
  if (job.status !== 'done') { console.log(`  ELMFIRE job ${job.status}: ${job.error}`); return; }
  const f6 = job.result.features.find((f) => f.properties.time_minutes === 360);
  const elmAcres = f6 ? geojsonAcres(f6, pack) : NaN;
  const dev = predictOnDevice(pack, { periods: job.weather.periods }, [LON, LAT], 6);
  const w0 = job.weather.periods[0];
  console.log(`  NWS weather hour 0: ${w0.wind_mph} mph ${w0.wind_dir}, ${w0.temp_f} F, ${w0.rh_pct} % RH`);
  console.log(`  6 h acres, same NWS weather:  on-device ${dev.run.acres_at_horizon}   ELMFIRE ${elmAcres.toFixed(0)}   ratio ${(dev.run.acres_at_horizon / elmAcres).toFixed(2)}`);
  console.log(`  ELMFIRE ignition used ${JSON.stringify(job.result.run.ignition_used)} snap ${job.result.run.ignition_snap_m} m; on-device ${dev.run.ignition_used.map((v) => v.toFixed(5))} snap ${dev.run.ignition_snap_m} m`);
  check('ELMFIRE 6 h ring exists', !!f6);
}

const skip = process.env.SKIP_E2E === '1';
(skip ? Promise.resolve() : e2e()).then(() => {
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
});
