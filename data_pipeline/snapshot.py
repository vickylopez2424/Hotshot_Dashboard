"""
Incident snapshot poller — the start of the Hotshot Dashboard data moat.

Each run captures one slice of time: the nationwide wildfire picture from NIFC
IRWIN plus every active NWS fire weather alert, appended as timestamped rows to
the local history database.

Stacked over weeks, these slices become the *trajectory* dataset that ML
training needs — and it self-labels, because IRWIN eventually records each
fire's final size, so every trajectory comes with its own answer.

  Run once:    python snapshot.py
  Show stats:  python snapshot.py stats
  Scheduled:   launchd runs this every 3 hours (see README.md)
"""
import os
import sys
import json
import logging

# Reuse the backend integration code — same pattern as mcp_server/adapters.py.
_HERE    = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_HERE), "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)
from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND, ".env"))

from integrations.wildcad.irwin import fetch_current_incidents
from integrations.nws_fire.connector import _fetch_alerts

import db

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("snapshot")


def capture_incidents(conn, run_id: int, captured_at: str) -> int:
    """Snapshot every active IRWIN incident nationwide."""
    result    = fetch_current_incidents(limit=2000)
    incidents = result.get("incidents", [])
    if result.get("error"):
        log.warning("IRWIN returned an error: %s", result["error"])

    rows = [
        (
            run_id, captured_at,
            i.get("id"), i.get("name"), i.get("state"), i.get("county"),
            i.get("dispatch_center"), i.get("jurisdictional_unit"),
            i.get("landowner_category"), i.get("daily_acres"),
            i.get("percent_contained"), i.get("personnel"),
            i.get("cause"), i.get("cause_general"), i.get("discovery_epoch"),
            i.get("containment_datetime"), i.get("control_datetime"),
            i.get("size_class"), 1 if i.get("is_contained") else 0,
            i.get("latitude"), i.get("longitude"), json.dumps(i),
        )
        for i in incidents
    ]
    conn.executemany(
        """INSERT INTO incident_snapshots
           (run_id, captured_at, incident_id, name, state, county,
            dispatch_center, jurisdictional_unit, landowner_category, acres,
            percent_contained, personnel, cause, cause_general, discovery_epoch,
            containment_datetime, control_datetime, size_class, is_contained,
            latitude, longitude, raw_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def capture_alerts(conn, run_id: int, captured_at: str) -> int:
    """Snapshot every active NWS fire weather alert (no API key needed)."""
    alerts = _fetch_alerts()
    rows = [
        (
            run_id, captured_at,
            a.get("id"), a.get("event"), a.get("severity"), a.get("urgency"),
            a.get("certainty"), a.get("area_desc"), a.get("headline"),
            a.get("effective"), a.get("expires"),
            json.dumps({k: v for k, v in a.items() if k != "geometry"}),
        )
        for a in alerts
    ]
    conn.executemany(
        """INSERT INTO fire_weather_snapshots
           (run_id, captured_at, alert_id, event, severity, urgency, certainty,
            area_desc, headline, effective, expires, raw_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def run_snapshot() -> None:
    """Execute one poll: open the DB, capture everything, log the run."""
    captured_at = db.utc_now()
    conn = db.connect()
    cur = conn.execute(
        "INSERT INTO snapshot_runs (run_at, status) VALUES (?, 'running')",
        (captured_at,),
    )
    run_id = cur.lastrowid
    conn.commit()

    try:
        n_inc = capture_incidents(conn, run_id, captured_at)
        n_alt = capture_alerts(conn, run_id, captured_at)
        conn.execute(
            "UPDATE snapshot_runs SET incidents_captured=?, alerts_captured=?, status='ok' "
            "WHERE run_id=?",
            (n_inc, n_alt, run_id),
        )
        conn.commit()
        log.info("Snapshot run %s: %d incidents, %d fire-weather alerts -> %s",
                 run_id, n_inc, n_alt, db.DB_PATH)
    except Exception as e:  # noqa: BLE001 — record the failure, don't crash silently
        conn.execute("UPDATE snapshot_runs SET status='error', error=? WHERE run_id=?",
                     (str(e), run_id))
        conn.commit()
        log.error("Snapshot run %s failed: %s", run_id, e)
        raise
    finally:
        conn.close()


def print_stats() -> None:
    """Show what the history DB has collected so far."""
    conn = db.connect()
    runs = conn.execute(
        "SELECT COUNT(*), MIN(run_at), MAX(run_at) FROM snapshot_runs WHERE status='ok'"
    ).fetchone()
    inc = conn.execute(
        "SELECT COUNT(*), COUNT(DISTINCT incident_id) FROM incident_snapshots"
    ).fetchone()
    alt = conn.execute("SELECT COUNT(*) FROM fire_weather_snapshots").fetchone()
    failed = conn.execute("SELECT COUNT(*) FROM snapshot_runs WHERE status='error'").fetchone()[0]
    conn.close()

    print(f"Database: {db.DB_PATH}")
    print(f"Successful runs: {runs[0]}  (first: {runs[1]}  latest: {runs[2]})")
    if failed:
        print(f"Failed runs: {failed}")
    print(f"Incident snapshots: {inc[0]} rows across {inc[1]} distinct fires")
    print(f"Fire-weather alert snapshots: {alt[0]} rows")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        print_stats()
    else:
        run_snapshot()
