"""
Prediction job store. SQLite, one table, no server to run.
"""
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "predict_jobs.db"
_lock = threading.Lock()


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


SCIENCE_COLUMNS = {
    # every simulation is a scientific record; these make it reproducible
    "origin": "TEXT",            # app | benchmark | replay
    "engine_version": "TEXT",    # elmfire 1.1 / ondevice-rothermel 1.0
    "code_sha": "TEXT",          # git sha of this repo at run time
    "landfire_version": "TEXT",
    "weather_source": "TEXT",    # NWS hourly forecast | Open-Meteo archive | stored pack forecast
    "ignition_time": "TEXT",     # ISO; for benchmarks the historical ignition
    "ignition_used": "TEXT",     # "[lon, lat]" after snapping
    "ignition_snap_m": "REAL",
    "domain_km": "REAL",
    "cell_m": "REAL",
    "device_id": "TEXT",         # for on-device runs recorded later
    "client_created": "TEXT",    # when the device actually ran it
    "benchmark_fire": "TEXT",    # fire key when origin = benchmark
}


def init():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, created TEXT, updated TEXT, status TEXT,
            lat REAL, lon REAL, hours INTEGER, engine TEXT,
            incident_id TEXT, incident_name TEXT, user_id TEXT,
            weather TEXT, result TEXT, summary TEXT, error TEXT, step TEXT)""")
        have = {r[1] for r in c.execute("PRAGMA table_info(jobs)").fetchall()}
        for col, typ in SCIENCE_COLUMNS.items():
            if col not in have:
                c.execute(f"ALTER TABLE jobs ADD COLUMN {col} {typ}")
        c.execute("""CREATE TABLE IF NOT EXISTS benchmarks (
            id TEXT PRIMARY KEY, created TEXT, fire_key TEXT, fire_name TEXT, engine TEXT,
            job_id TEXT, horizon_hours REAL, observed_at TEXT,
            observed_acres REAL, predicted_acres REAL, area_ratio REAL,
            sorensen REAL, jaccard REAL, observed_source TEXT, notes TEXT, extra TEXT)""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_jobs_origin ON jobs(origin, created)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_bench_fire ON benchmarks(fire_key, engine)")


def record(*, lat, lon, hours, engine, result, summary, weather=None, status="done", origin="app",
           user_id=None, incident_id=None, incident_name=None, error=None, **science) -> str:
    """Store a finished simulation that ran somewhere else (a phone, a benchmark script)."""
    jid = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    cols = ["id", "created", "updated", "status", "step", "lat", "lon", "hours", "engine", "origin",
            "incident_id", "incident_name", "user_id", "weather", "result", "summary", "error"]
    vals = [jid, now, now, status, "Recorded", lat, lon, hours, engine, origin,
            incident_id, incident_name, user_id, json.dumps(weather) if weather is not None else None,
            json.dumps(result) if result is not None else None, json.dumps(summary) if summary is not None else None, error]
    for k, v in science.items():
        if k in SCIENCE_COLUMNS and v is not None:
            cols.append(k); vals.append(json.dumps(v) if isinstance(v, (list, dict)) else v)
    with _lock, _conn() as c:
        c.execute(f"INSERT INTO jobs ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", vals)
    return jid


def add_benchmark(*, fire_key, fire_name, engine, job_id, horizon_hours, observed_at, observed_acres,
                  predicted_acres, sorensen=None, jaccard=None, observed_source=None, notes=None, extra=None) -> str:
    bid = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    ratio = (predicted_acres / observed_acres) if observed_acres else None
    with _lock, _conn() as c:
        c.execute("INSERT INTO benchmarks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (bid, now, fire_key, fire_name, engine, job_id, horizon_hours, observed_at, observed_acres,
                   predicted_acres, ratio, sorensen, jaccard, observed_source, notes, json.dumps(extra) if extra else None))
    return bid


def benchmarks(fire_key=None) -> list:
    with _conn() as c:
        q = "SELECT * FROM benchmarks" + (" WHERE fire_key=?" if fire_key else "") + " ORDER BY fire_key, engine, horizon_hours"
        rows = c.execute(q, (fire_key,) if fire_key else ()).fetchall()
    return [dict(r) for r in rows]


def create(lat, lon, hours, engine, incident_id=None, incident_name=None, user_id=None) -> str:
    jid = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    with _lock, _conn() as c:
        c.execute("INSERT INTO jobs (id, created, updated, status, lat, lon, hours, engine, incident_id, incident_name, user_id, step) "
                  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                  (jid, now, now, "queued", lat, lon, hours, engine, incident_id, incident_name, user_id, "Queued"))
    return jid


def update(jid, **fields):
    fields["updated"] = datetime.now(timezone.utc).isoformat()
    for k in ("weather", "result", "summary"):
        if k in fields and not isinstance(fields[k], str):
            fields[k] = json.dumps(fields[k])
    cols = ", ".join(f"{k}=?" for k in fields)
    with _lock, _conn() as c:
        c.execute(f"UPDATE jobs SET {cols} WHERE id=?", (*fields.values(), jid))


def get(jid) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
    if not row:
        return None
    d = dict(row)
    for k in ("weather", "result", "summary"):
        d[k] = json.loads(d[k]) if d.get(k) else None
    return d


def recent(user_id=None, limit=20) -> list:
    with _conn() as c:
        if user_id:
            rows = c.execute("SELECT id, created, status, lat, lon, hours, engine, incident_name, summary FROM jobs WHERE user_id=? ORDER BY created DESC LIMIT ?", (user_id, limit)).fetchall()
        else:
            rows = c.execute("SELECT id, created, status, lat, lon, hours, engine, incident_name, summary FROM jobs ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["summary"] = json.loads(d["summary"]) if d.get("summary") else None
        out.append(d)
    return out
