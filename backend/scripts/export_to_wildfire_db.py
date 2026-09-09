#!/usr/bin/env python3
"""
Export every simulation and benchmark from the app's science store into The
Wildfire Database (DuckDB), tables fact_spread_run / fact_spread_result /
fact_spread_benchmark defined in sql/019_spread_runs.sql over there.

Idempotent: rows are keyed by the app's job id and benchmark id, so re-running
only adds what is new. Nothing is ever deleted on either side.

    cd backend && .venv/bin/python scripts/export_to_wildfire_db.py \
        --wildfire-db ~/thewildfiredatabase/db/wildfire.duckdb
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
JOBS_DB = HERE.parent / "data" / "predict_jobs.db"


def _lonlat(v):
    if not v:
        return None, None
    try:
        p = json.loads(v) if isinstance(v, str) else v
        return float(p[1]), float(p[0])  # stored as [lon, lat]
    except Exception:
        return None, None


def _acres(geom, lat0, lon0):
    """Area of a GeoJSON polygon in acres, equal-area projection centred on the ignition."""
    try:
        from shapely.geometry import shape
        from shapely.ops import transform
        from pyproj import Transformer
        tr = Transformer.from_crs("EPSG:4326", f"+proj=laea +lat_0={lat0} +lon_0={lon0} +units=m", always_xy=True)
        return transform(tr.transform, shape(geom)).area / 4046.856
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wildfire-db", required=True)
    ap.add_argument("--jobs-db", default=str(JOBS_DB))
    args = ap.parse_args()
    try:
        import duckdb
    except ImportError:
        sys.exit("duckdb is not installed in this venv: .venv/bin/pip install duckdb")

    src = sqlite3.connect(args.jobs_db)
    src.row_factory = sqlite3.Row
    dst = duckdb.connect(args.wildfire_db)
    have_runs = {r[0] for r in dst.execute("SELECT run_id FROM fact_spread_run").fetchall()}
    have_bench = {r[0] for r in dst.execute("SELECT benchmark_id FROM fact_spread_benchmark").fetchall()}

    n_runs = n_res = n_bench = 0
    for j in src.execute("SELECT * FROM jobs WHERE status IN ('done','failed') AND result IS NOT NULL OR status='failed'"):
        if j["id"] in have_runs:
            continue
        result = json.loads(j["result"]) if j["result"] else None
        summary = json.loads(j["summary"]) if j["summary"] else None
        weather = json.loads(j["weather"]) if j["weather"] else None
        ulat, ulon = _lonlat(j["ignition_used"])
        dst.execute("""INSERT INTO fact_spread_run VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", [
            j["id"], "hotshot_app", j["origin"] or "app", j["engine"], j["engine_version"], j["code_sha"],
            j["created"], j["client_created"], j["device_id"], j["lat"], j["lon"], ulat, ulon, j["ignition_snap_m"],
            j["ignition_time"], j["hours"], j["domain_km"], j["cell_m"], j["landfire_version"], j["weather_source"],
            json.dumps(weather.get("periods")) if weather and weather.get("periods") else None,
            j["incident_id"], j["incident_name"], j["benchmark_fire"], j["status"], j["error"],
            json.dumps(summary) if summary else None, json.dumps(result) if result else None])
        n_runs += 1
        seen = set()
        for f in (result or {}).get("features", []):
            pr = f.get("properties", {})
            minutes = pr.get("time_minutes")
            if minutes is None or minutes in seen:
                continue
            acres = pr.get("acres")
            if acres is None:
                acres = _acres(f.get("geometry"), j["lat"], j["lon"])   # server rings carry no acres; measure them
            if acres is None:
                continue
            seen.add(minutes)
            dst.execute("INSERT INTO fact_spread_result VALUES (?,?,?,?)", [f"{j['id']}:{minutes}", j["id"], minutes, round(acres, 2)])
            n_res += 1

    for b in src.execute("SELECT * FROM benchmarks"):
        if b["id"] in have_bench:
            continue
        dst.execute("INSERT INTO fact_spread_benchmark VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
            b["id"], b["job_id"], b["fire_key"], b["fire_name"], b["engine"], b["horizon_hours"], b["observed_at"],
            b["observed_acres"], b["observed_source"], b["predicted_acres"], b["area_ratio"], b["sorensen"], b["jaccard"],
            b["notes"], b["created"]])
        n_bench += 1
    dst.close()
    print(f"exported {n_runs} runs, {n_res} hourly results, {n_bench} benchmarks -> {args.wildfire_db}")


if __name__ == "__main__":
    main()
