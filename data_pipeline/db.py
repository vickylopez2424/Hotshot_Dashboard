"""
SQLite storage for the Hotshot Dashboard data pipeline.

Phase 1 deliberately uses a local SQLite file — zero setup, zero cost, no
account, runs on your Mac. The schema maps cleanly to Postgres / Supabase when
you move to the cloud (every column type has a Postgres equivalent).

One file, three tables:
  snapshot_runs           — one row per poll, for monitoring ("did it run?")
  incident_snapshots      — one row per active fire, per poll (the trajectory data)
  fire_weather_snapshots  — one row per active NWS fire weather alert, per poll
"""
import os
import sqlite3
from datetime import datetime, timezone

_HERE    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_HERE, "data")
DB_PATH  = os.path.join(DATA_DIR, "hotshot_history.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshot_runs (
    run_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at              TEXT NOT NULL,            -- UTC ISO-8601
    incidents_captured  INTEGER,
    alerts_captured     INTEGER,
    status              TEXT NOT NULL,            -- running | ok | error
    error               TEXT
);

CREATE TABLE IF NOT EXISTS incident_snapshots (
    snapshot_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id               INTEGER REFERENCES snapshot_runs(run_id),
    captured_at          TEXT NOT NULL,           -- UTC ISO-8601
    incident_id          TEXT,
    name                 TEXT,
    state                TEXT,
    county               TEXT,
    dispatch_center      TEXT,
    jurisdictional_unit  TEXT,
    landowner_category   TEXT,
    acres                REAL,
    percent_contained    REAL,
    personnel            INTEGER,
    cause                TEXT,
    cause_general        TEXT,
    discovery_epoch      INTEGER,
    containment_datetime TEXT,
    control_datetime     TEXT,
    size_class           TEXT,
    is_contained         INTEGER,
    latitude             REAL,
    longitude            REAL,
    raw_json             TEXT                     -- full IRWIN record, for replay
);

CREATE TABLE IF NOT EXISTS fire_weather_snapshots (
    snapshot_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       INTEGER REFERENCES snapshot_runs(run_id),
    captured_at  TEXT NOT NULL,
    alert_id     TEXT,
    event        TEXT,                            -- Red Flag Warning, etc.
    severity     TEXT,
    urgency      TEXT,
    certainty    TEXT,
    area_desc    TEXT,
    headline     TEXT,
    effective    TEXT,
    expires      TEXT,
    raw_json     TEXT
);

CREATE INDEX IF NOT EXISTS idx_inc_incident_time ON incident_snapshots(incident_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_inc_captured      ON incident_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_alert_captured    ON fire_weather_snapshots(captured_at);
"""


def utc_now() -> str:
    """Current time as a UTC ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    """Open the history DB, creating the file and schema on first use."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn
