"""
Adapter layer — bridges the MCP server to the existing Hotshot Dashboard
backend integrations.

Per MCP_Server_Plan.md, the MCP server imports backend/integrations/* directly
(no HTTP hop, no duplicated logic). This module isolates the import-path and
.env setup so server.py stays clean, and wraps each connector with a uniform
signature that always returns a dict and never raises.
"""
import os
import sys
import logging

logger = logging.getLogger("hotshot-mcp.adapters")

# ── Make the FastAPI backend importable ──────────────────────────────────────
# `import config` and `import integrations.*` must resolve to the same modules
# the dashboard backend uses, so put backend/ on the path.
_HERE    = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_HERE), "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Load backend/.env explicitly. When Claude Desktop launches this server the
# working directory is undefined, so config.py's bare load_dotenv() would miss it.
from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND, ".env"))

# Backend integration code — imported once, reused by every tool call.
from integrations.wildcad.irwin import fetch_current_incidents, fetch_ytd_incidents, compute_trends
from integrations.nws_fire.connector import _fetch_alerts
from integrations.firms.connector import _fetch_fires
from integrations.airnow.connector import _fetch_observations
from integrations.wims.connector import _connector as _wims

# ── Geographic lookups ───────────────────────────────────────────────────────
# Bounding boxes (lon_min, lat_min, lon_max, lat_max) for FIRMS state queries.
CONUS_BBOX = "-125,24,-66,49"
STATE_BBOX = {
    "CA": "-124.5,32.5,-114.1,42.1", "OR": "-124.6,41.9,-116.4,46.3",
    "WA": "-124.8,45.5,-116.9,49.1", "NV": "-120.1,35.0,-114.0,42.1",
    "AZ": "-114.9,31.3,-109.0,37.1", "ID": "-117.3,41.9,-111.0,49.1",
    "MT": "-116.1,44.3,-104.0,49.1", "CO": "-109.1,36.9,-102.0,41.1",
    "NM": "-109.1,31.3,-103.0,37.1", "UT": "-114.1,36.9,-109.0,42.1",
    "WY": "-111.1,40.9,-104.0,45.1", "TX": "-106.7,25.8,-93.5,36.6",
}
# Best-effort abbreviation -> full name, used to filter NWS alerts by area text.
STATE_NAMES = {
    "CA": "California", "OR": "Oregon", "WA": "Washington", "NV": "Nevada",
    "AZ": "Arizona", "ID": "Idaho", "MT": "Montana", "CO": "Colorado",
    "NM": "New Mexico", "UT": "Utah", "WY": "Wyoming", "TX": "Texas",
}


def _safe(label: str, fn):
    """Run a connector call, converting any exception into an error dict."""
    try:
        return fn()
    except Exception as e:                       # noqa: BLE001 — tools must not crash
        logger.warning("%s failed: %s", label, e)
        return {"error": f"{label} failed: {e}"}


# ── Connector wrappers ───────────────────────────────────────────────────────

def get_incidents(state: str = "", limit: int = 50) -> dict:
    """Active wildfire incidents from NIFC IRWIN (no API key needed)."""
    return _safe("IRWIN incidents", lambda: fetch_current_incidents(
        state=state or None, limit=limit))


def get_fire_weather_alerts(state: str = "") -> dict:
    """Active NWS fire weather alerts (Red Flag Warnings etc.) — no API key needed."""
    def _run():
        alerts = _fetch_alerts()
        if state:
            needle = STATE_NAMES.get(state.upper(), state).lower()
            alerts = [
                a for a in alerts
                if needle in (a.get("area_desc", "") + " " + a.get("headline", "")).lower()
            ]
        by_type: dict = {}
        for a in alerts:
            by_type[a["event"]] = by_type.get(a["event"], 0) + 1
        return {"alerts": alerts, "count": len(alerts), "by_type": by_type}
    return _safe("NWS alerts", _run)


def get_active_fires(state: str = "", days: int = 1) -> dict:
    """NASA FIRMS satellite fire detections. Requires FIRMS_API_KEY in backend/.env."""
    area = STATE_BBOX.get(state.upper(), CONUS_BBOX) if state else CONUS_BBOX
    def _run():
        fires = _fetch_fires(area=area, days=max(1, min(days, 3)))
        return {"fires": fires, "count": len(fires), "area": area, "days": days}
    return _safe("FIRMS detections", _run)


def get_raws_stations(state: str = "") -> dict:
    """RAWS fire-weather stations + current readings. Requires SYNOPTIC_API_KEY."""
    return _safe("RAWS stations", lambda: _wims.fetch_stations(state=state or None))


def get_air_quality(state: str = "", min_aqi: int = 0) -> dict:
    """AirNow AQI / wildfire smoke observations. Requires AIRNOW_API_KEY."""
    def _run():
        obs = _fetch_observations()
        if state:
            obs = [o for o in obs if str(o.get("state", "")).upper() == state.upper()]
        if min_aqi:
            obs = [o for o in obs if o.get("aqi", -1) >= min_aqi]
        return {"observations": obs, "count": len(obs)}
    return _safe("AirNow observations", _run)


def get_incident_trends(state: str = "") -> dict:
    """Year-to-date incident trends from IRWIN — counts, causes, acreage."""
    def _run():
        result = fetch_ytd_incidents(state=state or None)
        incidents = result.get("incidents", [])
        if not incidents:
            return {"trends": None, "error": result.get("error", "no data")}
        return {"trends": compute_trends(incidents), "incident_count": len(incidents)}
    return _safe("IRWIN trends", _run)
