#!/usr/bin/env python3
"""
Export BENCHMARK SCORES, and only those, from the app's science store into
The Wildfire Database (DuckDB), table fact_spread_benchmark defined in
sql/019_spread_benchmarks.sql over there.

The two projects stay separate. Every simulation the app runs stays in the
app's own store (backend/data/predict_jobs.db). The database receives one row
per scored benchmark: a run against a historical fire with a documented
outcome, plus the provenance needed to find the raw run here and reproduce it.
Ordinary app runs, sample-engine runs, weather tables and rings never cross.

Idempotent: rows are keyed by the app's benchmark id, so re-running only adds
what is new. Nothing is deleted on either side.

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

EXPORTABLE_ENGINES = {"elmfire", "ondevice"}   # 'sample' is UI test output and never leaves the app

SQL = """INSERT INTO fact_spread_benchmark (
    benchmark_id, data_source_id, app_run_id,
    fire_key, fire_name, irwin_id, ignition_lat, ignition_lon, ignition_datetime,
    engine, engine_version, code_git_sha, landfire_version, weather_source,
    ignition_snap_m, domain_km, cell_m, horizon_hours,
    observed_datetime, observed_acres, observed_source, predicted_acres,
    area_ratio, sorensen, jaccard, notes, scored_datetime
) VALUES (?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?)"""


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
    have = {r[0] for r in dst.execute("SELECT benchmark_id FROM fact_spread_benchmark").fetchall()}

    n = skipped = 0
    rows = src.execute("""SELECT b.*, j.origin, j.engine_version, j.code_sha, j.landfire_version,
                                 j.weather_source, j.ignition_snap_m, j.domain_km, j.cell_m,
                                 j.lat, j.lon, j.ignition_time, j.incident_id
                          FROM benchmarks b LEFT JOIN jobs j ON j.id = b.job_id""")
    for b in rows:
        if b["id"] in have:
            continue
        if b["engine"] not in EXPORTABLE_ENGINES or (b["origin"] or "benchmark") != "benchmark":
            skipped += 1
            continue
        if not b["observed_source"]:
            skipped += 1          # a score with no citation for the observed figure is not evidence
            continue
        dst.execute(SQL, [
            b["id"], "hotshot_app", b["job_id"],
            b["fire_key"], b["fire_name"], b["incident_id"], b["lat"], b["lon"], b["ignition_time"],
            b["engine"], b["engine_version"], b["code_sha"], b["landfire_version"], b["weather_source"],
            b["ignition_snap_m"], b["domain_km"], b["cell_m"], b["horizon_hours"],
            b["observed_at"], b["observed_acres"], b["observed_source"], b["predicted_acres"],
            b["area_ratio"], b["sorensen"], b["jaccard"], b["notes"], b["created"]])
        n += 1
    dst.close()
    print(f"exported {n} benchmark scores ({skipped} skipped: not a benchmark, sample engine, or no observed_source) -> {args.wildfire_db}")


if __name__ == "__main__":
    main()
