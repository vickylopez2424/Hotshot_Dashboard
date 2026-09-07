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


def init():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, created TEXT, updated TEXT, status TEXT,
            lat REAL, lon REAL, hours INTEGER, engine TEXT,
            incident_id TEXT, incident_name TEXT, user_id TEXT,
            weather TEXT, result TEXT, summary TEXT, error TEXT, step TEXT)""")


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
