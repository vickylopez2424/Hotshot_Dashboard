"""
Re-run historical fires through both spread engines and score them.

  cd backend && DEMO_MODE=true .venv/bin/python -m benchmarks.run --fire camp2018 --engine both --hours 6,12,24
  ... --fire all            every fire in fires.yaml at its catalogued horizons
  ... --engine elmfire|device|both
  ... --hours 6,12,24       overrides the catalogue horizons

Per fire and engine and horizon:
  weather   Open-Meteo ERA5 archive from the ignition hour (benchmarks/weather.py)
  fuels     newest LANDFIRE version older than the fire (benchmarks/landfire.py)
  elmfire   elmfire_pipeline.run() on its 10/16/24 km domain (6/12/24 h)
  device    pack.build_pack() at 20/40/60 km, then run_device.mjs
  record    jobs.record(origin="benchmark", ...) with the science columns
  score     benchmarks/score.py, saved with jobs.add_benchmark()
  report    data/benchmarks/report.md and report.json (merged across invocations)

Horizons outside {6, 12, 24} run at the next size up and are scored from that
run's ring at the requested hour.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("ELMFIRE_TIMEOUT", "2400")
os.environ.setdefault("DEMO_MODE", "true")

import yaml

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

from integrations.predict import elmfire_pipeline as pipe          # noqa: E402
from integrations.predict import pack as packmod                    # noqa: E402
from integrations.predict import jobs                               # noqa: E402
from integrations.predict.engines import summarize_result           # noqa: E402
from integrations.predict.weather import summarize as wx_summary    # noqa: E402
from benchmarks import weather as bench_weather, landfire, perimeters, score  # noqa: E402

BENCH_DIR = BACKEND / "data" / "benchmarks"
DEVICE_KM = {6: 20, 12: 40, 24: 60}       # pack size per run length (pack.py allows 10 to 60)
ELMFIRE_ENGINE, DEVICE_ENGINE = "elmfire", "ondevice"
pipe.MODEL_TIMEOUT_S = int(os.environ["ELMFIRE_TIMEOUT"])


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=BACKEND, capture_output=True, text=True,
                              timeout=10).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def elmfire_version() -> str:
    try:
        r = subprocess.run(["docker", "run", "--rm", pipe.IMAGE, "bash", "-c", "echo $ELMFIRE_VER"],
                           capture_output=True, text=True, timeout=60)
        v = r.stdout.strip()
        return f"elmfire {v}" if v else "elmfire (version unknown)"
    except Exception:
        return "elmfire (version unknown)"


def load_catalog() -> dict:
    cat = yaml.safe_load((HERE / "fires.yaml").read_text())
    return {f["key"]: f for f in cat["fires"]}


def run_hours_for(horizon: float) -> int:
    for h in sorted(pipe.DOMAIN_KM):
        if horizon <= h:
            return h
    return max(pipe.DOMAIN_KM)


def run_device(fire: dict, run_hours: int, weather: dict, lf_version: str | None) -> dict:
    lat, lon = fire["ignition"]["lat"], fire["ignition"]["lon"]
    km = DEVICE_KM[run_hours]
    # pack.py caches by domain only, so keep benchmark packs (older fuels) in their own folder
    orig_dir = packmod.PACK_DIR
    packmod.PACK_DIR = BENCH_DIR / "packs" / (lf_version or "current")
    try:
        with landfire.fuel_versions(lf_version):
            gz, meta = packmod.build_pack(lat, lon, km)
    finally:
        packmod.PACK_DIR = orig_dir
    key = f"{meta['epsg']}_{meta['x0']:.0f}_{meta['y0']:.0f}_{meta['ncols']}"
    pack_path = BENCH_DIR / "packs" / (lf_version or "current") / f"{key}.pack.gz"
    wx_path = BENCH_DIR / f"weather_{fire['key']}_{run_hours}h.json"
    out_path = BENCH_DIR / "device_runs" / f"{fire['key']}_{run_hours}h.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wx_path.write_text(json.dumps(weather))
    cmd = ["node", str(HERE / "run_device.mjs"), str(pack_path), str(wx_path), str(lon), str(lat),
           str(run_hours), str(out_path)]
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if r.returncode != 0:
        raise RuntimeError(f"run_device.mjs failed: {r.stderr[-1500:]}")
    log(f"  device: {r.stdout.strip()[:300]}")
    result = json.loads(out_path.read_text())
    result["run"]["elapsed_s"] = round(time.time() - t0, 1)
    result["run"]["pack_meta"] = meta
    result["run"]["landfire_version"] = meta["landfire_version"]
    return result


def run_elmfire(fire: dict, run_hours: int, weather: dict, lf_version: str | None) -> dict:
    lat, lon = fire["ignition"]["lat"], fire["ignition"]["lon"]
    run_id = f"bench_{fire['key']}_{run_hours}h"
    try:
        return landfire.run_elmfire(lat, lon, run_hours, weather, lf_version, run_id=run_id,
                                    progress=lambda m: log(f"  elmfire: {m}"))
    except pipe.NoSpread as e:
        rec = landfire.recover_result(lat, lon, run_hours, weather, run_id, lf_version)
        if rec is None:
            raise
        log(f"  elmfire: pipeline said NoSpread but {rec['run']['recovered_from']} holds {rec['run']['burned_cells']} burned cells; recovered")
        return rec


def safe_summary(result: dict, lat: float, lon: float, weather: dict) -> dict:
    """engines.summarize_result assumes the last ring is a single Polygon and
    raises on a MultiPolygon (which the device engine emits when a spot patch
    separates). Not fixable here (engines.py is out of scope), so fall back to
    the same numbers measured with score.py."""
    try:
        return summarize_result(result, lat, lon, wx_summary(weather["periods"]))
    except Exception as e:
        geom, minutes = score.ring_at(result, (result.get("run") or {}).get("hours") or 24)
        ea = score.to_ea(geom) if geom is not None else None
        ws = wx_summary(weather["periods"])
        return {"acres_at_horizon": round(score.acres(ea)) if ea is not None else 0, "horizon_minutes": minutes,
                "max_run_miles": round(score.max_run_km(ea, (lon, lat)) / 1.609344, 2) if ea is not None else 0,
                "wind_mph": ws.get("now_wind_mph"), "wind_dir": ws.get("now_wind_dir"),
                "peak_wind_mph": ws.get("peak_wind_mph"), "min_rh_pct": ws.get("min_rh_pct"),
                "source": result.get("source", "unknown"),
                "summary_note": f"engines.summarize_result failed ({type(e).__name__}: {e}); measured with benchmarks.score"}


def record_and_score(fire: dict, engine: str, run_hours: int, result: dict, weather: dict, horizons: list,
                     perimeter: dict, lf_version: str | None, sha: str, engine_version: str) -> list[dict]:
    lat, lon = fire["ignition"]["lat"], fire["ignition"]["lon"]
    run = result.get("run") or {}
    summary = safe_summary(result, lat, lon, weather)
    job_id = jobs.record(
        lat=lat, lon=lon, hours=run_hours, engine=engine, result=result, summary=summary, weather=weather,
        origin="benchmark", incident_name=fire["name"], benchmark_fire=fire["key"],
        ignition_time=fire["ignition_time"], weather_source=weather["source"],
        engine_version=engine_version, landfire_version=run.get("landfire_version"),
        code_sha=sha, ignition_used=run.get("ignition_used"), ignition_snap_m=run.get("ignition_snap_m"),
        domain_km=run.get("domain_km"), cell_m=run.get("cell_size_m", 30))
    rows = []
    obs_by_h = {float(o["hours"]): o for o in fire.get("observed", [])}
    final_h = max(horizons)
    for h in horizons:
        if h > run_hours:
            continue
        obs = obs_by_h.get(float(h), {})
        sc = score.score_horizon(result, h, perimeter["geometry"], obs.get("acres"),
                                 is_final=False, ignition_lonlat=(lon, lat))
        sc.update({"fire": fire["key"], "fire_name": fire["name"], "engine": engine, "run_hours": run_hours,
                   "observed_at": obs.get("at"), "observed_source": obs.get("source"),
                   "observed_confidence": obs.get("confidence"),
                   "landfire_version": run.get("landfire_version"), "weather_source": weather["source"],
                   "model_s": run.get("model_s"), "elapsed_s": run.get("elapsed_s"), "job_id": job_id,
                   "domain_km": run.get("domain_km"), "ignition_snap_m": run.get("ignition_snap_m")})
        notes = []
        if sc.get("left_domain"):
            notes.append(f"prediction reached the {run.get('domain_km')} km domain edge; the modelled fire is clipped")
        if obs.get("acres") and sc.get("max_run_km") is not None:
            pass
        sc["notes"] = "; ".join(notes) or None
        bid = jobs.add_benchmark(
            fire_key=fire["key"], fire_name=fire["name"], engine=engine, job_id=job_id, horizon_hours=h,
            observed_at=obs.get("at"), observed_acres=obs.get("acres"), predicted_acres=sc["predicted_acres"],
            sorensen=sc.get("sorensen"), jaccard=sc.get("jaccard"), observed_source=obs.get("source"),
            notes=sc["notes"], extra={k: sc[k] for k in ("fraction_inside_final", "overlap_meaning", "max_run_km",
                                                            "left_domain", "landfire_version", "weather_source",
                                                            "run_hours", "ring_minutes", "domain_km",
                                                            "ignition_snap_m", "model_s", "observed_confidence")})
        sc["benchmark_id"] = bid
        rows.append(sc)
        log(f"  {engine} {h} h: predicted {sc['predicted_acres']:.0f} ac vs observed {obs.get('acres')} "
            f"(ratio {sc['area_ratio']}), sorensen {sc['sorensen']}, jaccard {sc['jaccard']}, "
            f"run {sc['max_run_km']} km{', LEFT DOMAIN' if sc['left_domain'] else ''}")
    return rows


def write_report(report: dict):
    BENCH_DIR.mkdir(parents=True, exist_ok=True)
    (BENCH_DIR / "report.json").write_text(json.dumps(report, indent=2, default=str))
    L = ["# Spread engine benchmark against historical fires", "",
         f"Generated {report['generated']}. Code {report['code_sha'][:12]}. "
         f"ELMFIRE: {report.get('elmfire_version')}. Device engine: ondevice-rothermel 1.0 (frontend/src/engine).", "",
         "Each fire is re-run from its real ignition point and time with Open-Meteo ERA5 archive weather and the "
         "newest LANDFIRE fuels older than the fire. Predicted acres are measured in EPSG:5070. At the final horizon "
         "Sorensen and Jaccard compare the prediction with the observed final perimeter (NIFC). At earlier horizons "
         "they are a containment measure against that same final perimeter (how much of the prediction lies inside "
         "where the fire eventually burned), not a perimeter match, and the area ratio against the timeline acres "
         "is the number to read.", ""]
    for key, fr in report["fires"].items():
        f = fr["fire"]
        L += [f"## {f['name']} ({key})", "",
              f"Ignition {f['ignition']['lat']}, {f['ignition']['lon']} at {f['ignition_time']}. "
              f"Final perimeter {fr['perimeter']['gis_acres']:.0f} ac ({fr['perimeter']['source']}, NIFC). "
              f"Fuels requested: {fr['landfire_requested']}.", "",
              "| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in sorted(fr["rows"], key=lambda r: (r["engine"], r["horizon_hours"])):
            note = r.get("notes") or ""
            if r.get("observed_confidence") == "low":
                note = (note + "; " if note else "") + "observed acres low confidence"
            L.append(f"| {r['engine']} | {r['horizon_hours']} | {r.get('observed_acres') or '?'} | "
                     f"{r['predicted_acres']:.0f} | {r.get('area_ratio') if r.get('area_ratio') is not None else '?'} | "
                     f"{r.get('sorensen')} | {r.get('jaccard')} | {r.get('fraction_inside_final')} | {r.get('max_run_km')} | "
                     f"{r.get('landfire_version')} | {r.get('weather_source')} | "
                     f"{r.get('model_s') if r.get('model_s') is not None else r.get('elapsed_s')} | {note} |")
        for eng, err in (fr.get("errors") or {}).items():
            L.append(f"\nFailed: {eng}: {err}")
        if fr.get("progression"):
            L += ["", f"### {f['name']} hourly progression, observed vs predicted", "",
                  "| hours | local time | observed ac | observed run km | " +
                  " | ".join(f"{e} ac | {e} run km" for e in fr["progression"]) + " | note (source) |",
                  "|---|---|---|---|" + "---|---|" * len(fr["progression"]) + "---|"]
            engines = list(fr["progression"])
            n = len(fr["progression"][engines[0]])
            for i in range(n):
                base = fr["progression"][engines[0]][i]
                cells = [f"{base['hours']}", base.get("at") or "", str(base.get("observed_acres") or ""),
                         str(base.get("observed_run_km") or "")]
                for e in engines:
                    r = fr["progression"][e][i]
                    cells += [str(r.get("predicted_acres") if r.get("predicted_acres") is not None else "-"),
                              str(r.get("predicted_run_km") if r.get("predicted_run_km") is not None else "-")]
                cells.append(f"{base.get('note')} ({base.get('source')})")
                L.append("| " + " | ".join(cells) + " |")
        wx = fr.get("weather_head") or []
        if wx:
            L += ["", "Weather at ignition (ERA5, UTC): " + "; ".join(
                f"{p['time'][11:16]} {p['wind_mph']} mph {p['wind_dir']}, {p['temp_f']} F, {p['rh_pct']} % RH" for p in wx[:6])]
        L.append("")
    L += ["## Caveats", ""]
    L += [f"- {c}" for c in report["caveats"]]
    (BENCH_DIR / "report.md").write_text("\n".join(L) + "\n")


CAVEATS = [
    "Fuels: LANDFIRE LF2016 Remap is the oldest version lfps.usgs.gov serves. It is used for every fire from 2017 to 2021 and represents conditions around 2016, so fuels are pre-fire but not year-exact; disturbances between 2016 and the fire are missing. Fires after 2022 use LF2022, which may already include the fire scar of earlier fires. The version actually served is recorded per run.",
    "Weather: Open-Meteo ERA5 / ERA5-Land reanalysis, roughly 9 to 31 km grid, hourly, 10 m wind, uniform over the whole domain. Terrain-channelled winds such as the Jarbo Gap jet in the Camp Fire (RAWS gusts over 50 mph) are smoothed to 20 to 25 mph, which by itself halves Rothermel spread rates.",
    "No suppression is modelled, and no structure fuels: the observed perimeters include what crews stopped and what burned through towns.",
    "No spotting: both engines are surface spread only in this configuration. The Camp Fire reached Paradise (12 km) in under 1.5 h mostly by long-range spotting, which no surface model reproduces.",
    "Device engine is surface fire only (Rothermel/Albini), 16-neighbour minimum travel time; ELMFIRE runs with its defaults and the app's fixed live moisture (30 % herbaceous, 60 % woody) and no time-lag on dead fuel moisture.",
    "Domains: ELMFIRE runs on the app's 10, 16 and 24 km domains; the device engine on 20, 40 and 60 km packs. When a prediction reaches the domain edge it is clipped and the row says so. Fires that ran farther than half the domain in the horizon could not be reproduced regardless of model skill.",
    "Observed acres at intermediate horizons come from IMT estimates, IR flights and press-reported agency updates at the nearest available time, not exactly at the horizon; the catalogue marks each row's confidence and source. Final perimeters are the largest NIFC feature per incident.",
    "Sorensen and Jaccard at intermediate horizons compare against the FINAL perimeter and are reported as containment only.",
    "Ignition points are approximate (hundreds of metres) and are snapped to the nearest burnable cell by the engines; the snap distance is recorded per run.",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fire", action="append", required=True, help="fire key from fires.yaml, or 'all'; repeatable")
    ap.add_argument("--engine", default="both", choices=["both", "elmfire", "device"])
    ap.add_argument("--hours", default=None, help="comma list of horizons, overrides the catalogue")
    args = ap.parse_args()

    jobs.init()
    catalog = load_catalog()
    keys = list(catalog) if "all" in args.fire else args.fire
    engines = [ELMFIRE_ENGINE, DEVICE_ENGINE] if args.engine == "both" else \
        [ELMFIRE_ENGINE if args.engine == "elmfire" else DEVICE_ENGINE]
    sha = git_sha()
    elm_ver = elmfire_version() if ELMFIRE_ENGINE in engines else None
    if ELMFIRE_ENGINE in engines:
        pipe.check_docker()

    report_path = BENCH_DIR / "report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {"fires": {}}
    report.update({"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "code_sha": sha,
                   "elmfire_version": elm_ver or report.get("elmfire_version"), "caveats": CAVEATS,
                   "landfire_served": landfire.probe_versions()})

    for key in keys:
        fire = catalog[key]
        horizons = [float(h) for h in args.hours.split(",")] if args.hours else [float(h) for h in fire["horizons"]]
        horizons = [int(h) if float(h).is_integer() else h for h in horizons]
        year = int(fire["ignition_time"][:4])
        lf_version = landfire.fuels_version_for_year(year)
        log(f"== {fire['name']} ({key}) horizons {horizons}, fuels requested {lf_version}")
        fr = report["fires"].setdefault(key, {"rows": [], "errors": {}, "progression": {}})
        fr["fire"] = fire
        fr["landfire_requested"] = lf_version
        per = perimeters.fetch(fire["perimeter"]["nifc_incident"], str(fire["perimeter"]["fire_year"]), key=key)
        fr["perimeter"] = {k: per[k] for k in ("gis_acres", "source", "agency", "n_features", "url", "path", "layer")}
        log(f"  final perimeter {per['gis_acres']:.0f} ac from {per['source']} ({per['n_features']} features)")
        max_run = run_hours_for(max(horizons))
        wp = fire.get("weather_point") or fire["ignition"]
        weather = bench_weather.historical(wp["lat"], wp["lon"], fire["ignition_time"], max_run)
        if fire.get("weather_point"):
            weather["source"] += f" sampled at {wp['lat']},{wp['lon']} ({wp.get('label') or 'catalogue weather_point'})"
        fr["weather_head"] = weather["periods"][:8]
        p0 = weather["periods"][0]
        log(f"  weather from {p0['time']}: {p0['wind_mph']} mph {p0['wind_dir']}, {p0['temp_f']} F, {p0['rh_pct']} % RH")

        run_lengths = sorted({run_hours_for(h) for h in horizons})
        for engine in engines:
            fr["rows"] = [r for r in fr["rows"] if r["engine"] != engine]
            for k in [k for k in fr["errors"] if k.startswith(engine + " ")]:
                fr["errors"].pop(k)
            results = {}
            for rh in run_lengths:
                hs = [h for h in horizons if run_hours_for(h) == rh]
                log(f"-- {engine} {rh} h run for horizons {hs}")
                try:
                    t0 = time.time()
                    result = run_elmfire(fire, rh, weather, lf_version) if engine == ELMFIRE_ENGINE \
                        else run_device(fire, rh, weather, lf_version)
                    log(f"  {engine} {rh} h done in {time.time() - t0:.0f} s, fuels {result['run'].get('landfire_version')}")
                    results[rh] = result
                    fr["rows"] += record_and_score(fire, engine, rh, result, weather, hs, per, lf_version, sha,
                                                   elm_ver if engine == ELMFIRE_ENGINE else "ondevice-rothermel 1.0")
                except Exception as e:
                    msg = f"{type(e).__name__}: {str(e)[:600]}"
                    log(f"  FAILED {engine} {rh} h: {msg}")
                    traceback.print_exc()
                    fr["errors"][f"{engine} {rh} h"] = msg
                    jobs.record(lat=fire["ignition"]["lat"], lon=fire["ignition"]["lon"], hours=rh, engine=engine,
                                result=None, summary=None, weather=weather, status="failed", origin="benchmark",
                                incident_name=fire["name"], error=msg, benchmark_fire=key,
                                ignition_time=fire["ignition_time"], weather_source=weather["source"],
                                code_sha=sha, landfire_version=lf_version)
            if fire.get("progression") and results:
                best = results[max(results)]
                fr["progression"][engine] = score.progression_table(
                    best, fire["progression"], (fire["ignition"]["lon"], fire["ignition"]["lat"]))
        write_report(report)
    write_report(report)
    log(f"report written to {BENCH_DIR / 'report.md'}")


if __name__ == "__main__":
    main()
