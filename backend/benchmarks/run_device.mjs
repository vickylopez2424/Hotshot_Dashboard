// Run the on-device Rothermel engine (frontend/src/engine) from Node on a
// mission pack built by backend/integrations/predict/pack.py.
//
//   node run_device.mjs <pack.gz> <weather.json> <lon> <lat> <hours> <out.json>
//
// Writes the engine's GeoJSON FeatureCollection (plus .run) to out.json and
// prints a one-line JSON summary. Same call the app makes:
//   predictOnDevice(pack, weather, [lon, lat], hours)
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const ENGINE = new URL('../../frontend/src/engine/', import.meta.url);
const { parsePackBody } = await import(new URL('pack.js', ENGINE));
const { predictOnDevice } = await import(new URL('spread.js', ENGINE));

const [packPath, weatherPath, lonS, latS, hoursS, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: node run_device.mjs <pack.gz> <weather.json> <lon> <lat> <hours> <out.json>');
  process.exit(2);
}
const gz = readFileSync(packPath);
const raw = gunzipSync(gz);
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const pack = parsePackBody(buf, gz.byteLength);
const weather = JSON.parse(readFileSync(weatherPath, 'utf8'));
const lon = Number(lonS), lat = Number(latS), hours = Number(hoursS);

const t0 = Date.now();
const out = predictOnDevice(pack, weather, [lon, lat], hours);
const seconds = (Date.now() - t0) / 1000;
out.run.engine_version = 'ondevice-rothermel 1.0';
out.run.domain_km = pack.meta.km;
out.run.bbox = [pack.x0, pack.y0, pack.x1, pack.y1];
out.run.model_s = seconds;
out.run.node = process.version;
writeFileSync(outPath, JSON.stringify(out));
console.log(JSON.stringify({ acres: out.run.acres_at_horizon, rings: out.features.length, seconds,
                             snap_m: out.run.ignition_snap_m, landfire_version: pack.meta.landfire_version,
                             cells: pack.ncols, hourly: out.run.hourly.map((h) => Math.round(h.acres)) }));
