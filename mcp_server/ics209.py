"""
ICS-209 (Incident Status Summary) draft assembly.

Pulls a live wildfire incident from IRWIN, enriches it with acreage-growth
history from the snapshot database and current fire weather, and returns a
structured packet the AI client turns into a finished ICS-209 situation report.

Division of labor — the whole point of MCP:
  * This module assembles DATA blocks (filled from authoritative records).
  * The AI client writes the NARRATIVE blocks (operational judgment).
Blocks that need facts no record holds are flagged for the IC to confirm —
the AI is instructed never to fabricate operational detail.
"""
import os
import sqlite3
from datetime import datetime, timezone

import adapters  # reuses the backend integration bridge

_HERE       = os.path.dirname(os.path.abspath(__file__))
_HISTORY_DB = os.path.join(os.path.dirname(_HERE), "data_pipeline", "data", "hotshot_history.db")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _iso_from_epoch_ms(epoch_ms):
    if not epoch_ms:
        return None
    try:
        return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return None


def _duration_days(epoch_ms):
    if not epoch_ms:
        return None
    try:
        start = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
        return round((datetime.now(timezone.utc) - start).total_seconds() / 86400, 1)
    except Exception:
        return None


def _find_incident(query: str, state: str = ""):
    """Locate a current incident by IRWIN ID or (partial) name."""
    result    = adapters.get_incidents(state=state, limit=2000)
    incidents = result.get("incidents", []) or []
    q = query.strip().lower()

    for i in incidents:                                  # exact ID match wins
        if (i.get("id") or "").lower() == q:
            return i, incidents

    matches = [i for i in incidents if q and q in (i.get("name") or "").lower()]
    if len(matches) == 1:
        return matches[0], incidents
    if len(matches) > 1:
        return {"_ambiguous": [
            {"name": m.get("name"), "state": m.get("state"),
             "county": m.get("county"), "id": m.get("id")}
            for m in matches
        ]}, incidents
    return None, incidents


def _growth_history(incident_id: str):
    """Pull this incident's acreage trajectory from the snapshot DB, if present."""
    if not incident_id or not os.path.exists(_HISTORY_DB):
        return None
    try:
        conn = sqlite3.connect(f"file:{_HISTORY_DB}?mode=ro", uri=True)
        rows = conn.execute(
            "SELECT captured_at, acres, percent_contained, personnel "
            "FROM incident_snapshots WHERE incident_id=? ORDER BY captured_at",
            (incident_id,),
        ).fetchall()
        conn.close()
    except Exception:
        return None
    if not rows:
        return None

    first, last = rows[0], rows[-1]
    return {
        "snapshots_on_record": len(rows),
        "first_seen":          first[0],
        "first_acres":         first[1],
        "latest_acres":        last[1],
        "acreage_change":      round((last[1] or 0) - (first[1] or 0), 1),
        "trajectory": [
            {"at": r[0], "acres": r[1], "percent_contained": r[2], "personnel": r[3]}
            for r in rows
        ],
    }


# ── Public ───────────────────────────────────────────────────────────────────

def build_draft(query: str, state: str = "") -> dict:
    """Assemble the ICS-209 draft packet for an incident."""
    incident, _ = _find_incident(query, state)

    if incident is None:
        return {"error": f"No active incident matching '{query}'"
                         + (f" in {state.upper()}" if state else "")
                         + ". Check list_active_incidents for valid names."}
    if isinstance(incident, dict) and incident.get("_ambiguous"):
        return {"error": f"Multiple incidents match '{query}' — specify which by ID or state.",
                "matches": incident["_ambiguous"]}

    now      = datetime.now(timezone.utc)
    growth   = _growth_history(incident.get("id"))
    inc_state = incident.get("state", "")
    alerts   = (adapters.get_fire_weather_alerts(state=inc_state)
                if inc_state else {"alerts": [], "count": 0})

    return {
        "report_type":  "ICS-209 Incident Status Summary (DRAFT)",
        "generated_at": now.isoformat(),

        # Blocks filled from authoritative records — use verbatim.
        "data_blocks": {
            "incident_name":        incident.get("name"),
            "incident_id":          incident.get("id"),
            "incident_kind":        "Wildfire",
            "incident_start":       _iso_from_epoch_ms(incident.get("discovery_epoch")),
            "report_period_end":    now.isoformat(),
            "duration_days":        _duration_days(incident.get("discovery_epoch")),
            "cause":                incident.get("cause") or "Undetermined",
            "cause_general":        incident.get("cause_general"),
            "location": {
                "state":               incident.get("state"),
                "county":              incident.get("county"),
                "latitude":            incident.get("latitude"),
                "longitude":           incident.get("longitude"),
                "jurisdictional_unit": incident.get("jurisdictional_unit"),
                "landowner_category":  incident.get("landowner_category"),
                "dispatch_center":     incident.get("dispatch_center"),
            },
            "size_acres":           incident.get("daily_acres"),
            "size_class":           incident.get("size_class"),
            "percent_contained":    incident.get("percent_contained"),
            "total_personnel":      incident.get("personnel"),
            "containment_datetime": incident.get("containment_datetime"),
            "control_datetime":     incident.get("control_datetime"),
        },

        # Acreage trajectory from the snapshot pipeline — the factual basis for
        # the "significant events" narrative.
        "growth_history": growth or {
            "note": "No prior snapshots on record for this incident yet — the "
                    "data pipeline builds acreage-growth history over time."
        },

        "fire_weather_context": {
            "active_alerts_in_state": alerts.get("count", 0),
            "alerts": [
                {"event": a.get("event"), "headline": a.get("headline"),
                 "expires": a.get("expires")}
                for a in (alerts.get("alerts") or [])[:6]
            ],
        },

        # Blocks the AI must WRITE as prose, with guidance per block.
        "narrative_blocks_to_draft": {
            "significant_events":
                "Summarize this report period: fire behavior observed, spread "
                "direction, containment progress, evacuations, structures "
                "threatened or lost, injuries. Base acreage statements on "
                "growth_history.",
            "current_situation":
                "Describe the fire's current state — active flank(s), terrain, "
                "fuels involved, and threats to values at risk.",
            "planned_actions":
                "State strategy and tactics for the next operational period "
                "(suppression objectives, line construction, structure protection).",
            "projected_activity":
                "Project fire activity for the next 12 / 24 / 48 / 72 hours. "
                "Factor in fire_weather_context — if a Red Flag Warning is "
                "active, call out the elevated spread risk explicitly.",
            "critical_resource_needs":
                "List specific resources needed and the operational period they "
                "are needed for (crews, engines, aircraft, overhead). This block "
                "drives resource ordering.",
            "remarks":
                "Any additional notes for the incoming IC or agency.",
        },

        "drafting_instructions": (
            "Produce a clean, formatted ICS-209 situation report. Fill the "
            "data_blocks verbatim. Write each narrative block as concise, "
            "professional prose using its guidance. Where a fact is genuinely "
            "unknown (injuries, structures, evacuations), write '[IC to "
            "confirm]' — never invent operational detail. Label the output "
            "clearly as a DRAFT for IC review."
        ),
    }
