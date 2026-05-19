"""
Hotshot Dashboard — MCP Server (Phase 1, read-only, stdio transport)

Exposes the dashboard's live wildfire data as Model Context Protocol tools so an
AI assistant (Claude Desktop, a tablet field agent, etc.) can query fire
conditions and reason about them — e.g. recommend staging resources ahead of a
Red Flag Warning.

Run locally:        python server.py
Connect to Claude:  see README.md for the claude_desktop_config.json snippet
"""
import logging

from mcp.server.fastmcp import FastMCP

import adapters
import ics209

logging.basicConfig(level=logging.INFO)

mcp = FastMCP("hotshot-dashboard")


# ── Incidents ────────────────────────────────────────────────────────────────

@mcp.tool()
def list_active_incidents(state: str = "", limit: int = 50) -> dict:
    """List active wildfire incidents from NIFC IRWIN (the federal fire data hub).

    Use this to answer "what fires are burning right now". Works with no API key.

    Args:
        state: Optional two-letter state code to filter, e.g. "CA". Empty = nationwide.
        limit: Maximum number of incidents to return (default 50).

    Returns each incident with name, location, acreage, containment, personnel,
    cause, and fire size class.
    """
    return adapters.get_incidents(state=state, limit=limit)


@mcp.tool()
def get_incident_trends(state: str = "") -> dict:
    """Get year-to-date wildfire trends from IRWIN: incident counts by month and
    cause, total acreage burned, and containment counts.

    Use this for season-context questions like "how bad is this fire year".

    Args:
        state: Optional two-letter state code, e.g. "CA". Empty = nationwide.
    """
    return adapters.get_incident_trends(state=state)


# ── Weather & conditions ─────────────────────────────────────────────────────

@mcp.tool()
def get_fire_weather_alerts(state: str = "") -> dict:
    """Get active NWS fire weather alerts: Red Flag Warnings, Fire Weather
    Watches, and Fire Weather Statements. Works with no API key.

    Use this to spot dangerous fire weather worth pre-positioning resources for.

    Args:
        state: Optional two-letter state code, e.g. "CA". Empty = nationwide.
               State filtering is best-effort (matched against the alert area text).
    """
    return adapters.get_fire_weather_alerts(state=state)


@mcp.tool()
def get_raws_weather_stations(state: str = "") -> dict:
    """Get RAWS fire-weather stations with current readings (temperature, humidity,
    wind) and a computed fire danger level per station.

    Requires SYNOPTIC_API_KEY in backend/.env (free at synopticdata.com).

    Args:
        state: Optional two-letter state code, e.g. "CA".
    """
    return adapters.get_raws_stations(state=state)


# ── Detections & smoke ───────────────────────────────────────────────────────

@mcp.tool()
def get_satellite_fire_detections(state: str = "", days: int = 1) -> dict:
    """Get NASA FIRMS satellite fire detections (VIIRS thermal hotspots).

    Use this to find fire activity that may not yet be a reported incident.
    Requires FIRMS_API_KEY in backend/.env (free at firms.modaps.eosdis.nasa.gov).

    Args:
        state: Optional two-letter state code, e.g. "CA". Empty = continental US.
        days:  Days of detection history, 1-3 (default 1).
    """
    return adapters.get_active_fires(state=state, days=days)


@mcp.tool()
def get_air_quality(state: str = "", min_aqi: int = 0) -> dict:
    """Get AirNow air quality observations (PM2.5 AQI) — useful for tracking
    wildfire smoke impact on communities and crews.

    Requires AIRNOW_API_KEY in backend/.env (free at airnowapi.org).

    Args:
        state:   Optional two-letter state code, e.g. "CA".
        min_aqi: Only return stations at or above this AQI (default 0 = all).
    """
    return adapters.get_air_quality(state=state, min_aqi=min_aqi)


# ── Composite ────────────────────────────────────────────────────────────────

@mcp.tool()
def situational_summary(state: str) -> dict:
    """Get a ONE-CALL composite picture of fire conditions for a state: active
    incidents, fire weather alerts, satellite detections, RAWS danger levels, and
    air quality — assembled and trimmed into a single situational brief.

    This is the tool to use for broad questions like "what's the fire situation
    in California?" or "should we be pre-positioning resources anywhere?".

    Args:
        state: Two-letter state code, e.g. "CA". Required.
    """
    state = state.upper()
    incidents = adapters.get_incidents(state=state, limit=500)
    alerts    = adapters.get_fire_weather_alerts(state=state)
    fires     = adapters.get_active_fires(state=state, days=1)
    raws      = adapters.get_raws_stations(state=state)
    air       = adapters.get_air_quality(state=state)

    inc_list = incidents.get("incidents", []) or []
    inc_list_sorted = sorted(
        inc_list,
        key=lambda i: (i.get("daily_acres") or 0),
        reverse=True,
    )
    largest = [
        {
            "name":              i.get("name"),
            "county":            i.get("county"),
            "acres":             i.get("daily_acres"),
            "percent_contained": i.get("percent_contained"),
            "size_class":        i.get("size_class"),
        }
        for i in inc_list_sorted[:5]
    ]

    raws_stations = raws.get("stations", []) or []
    danger = {"extreme": 0, "high": 0, "moderate": 0, "low": 0, "unknown": 0}
    for s in raws_stations:
        lvl = s.get("danger_level", "unknown")
        danger[lvl] = danger.get(lvl, 0) + 1

    air_obs = air.get("observations", []) or []
    worst_aqi = max((o.get("aqi", 0) for o in air_obs), default=None)

    return {
        "state": state,
        "incidents": {
            "active_count":  len(inc_list),
            "total_acres":   round(sum((i.get("daily_acres") or 0) for i in inc_list), 1),
            "largest_fires": largest,
        },
        "fire_weather_alerts": {
            "count":   alerts.get("count", 0),
            "by_type": alerts.get("by_type", {}),
        },
        "satellite_detections": {
            "count": fires.get("count", 0),
            "note":  fires.get("error", "VIIRS hotspots, last 24h"),
        },
        "raws_fire_danger": {
            "station_count": len(raws_stations),
            "by_level":      danger,
            "note":          raws.get("error"),
        },
        "air_quality": {
            "station_count": len(air_obs),
            "worst_aqi":     worst_aqi,
            "note":          air.get("error"),
        },
        "data_note": (
            "Satellite, RAWS, and air quality require free API keys in "
            "backend/.env; if a section shows a key error, that feed is not yet "
            "configured. Incidents and fire weather alerts work with no key."
        ),
    }


# ── Reporting ────────────────────────────────────────────────────────────────

@mcp.tool()
def draft_ics209(incident: str, state: str = "") -> dict:
    """Assemble a draft ICS-209 (Incident Status Summary) for a wildfire.

    Pulls the incident live from IRWIN, adds acreage-growth history from the
    snapshot database and current fire weather, and returns a structured packet:
    `data_blocks` are filled from authoritative records; `narrative_blocks_to_draft`
    are flagged with per-block guidance for you to write.

    After calling this, produce a clean, formatted ICS-209 situation report:
    use the data blocks verbatim, write the narrative blocks as professional
    prose from the guidance, and mark anything genuinely unknown as
    "[IC to confirm]". Never fabricate operational detail. Label it a DRAFT.

    Args:
        incident: Incident name (partial match OK) or IRWIN incident ID.
        state:    Optional two-letter state code to narrow the search, e.g. "CA".
    """
    return ics209.build_draft(incident, state)


if __name__ == "__main__":
    # stdio transport — Claude Desktop launches this as a subprocess.
    mcp.run()
