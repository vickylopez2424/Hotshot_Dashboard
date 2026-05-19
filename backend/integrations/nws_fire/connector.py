"""
NWS Fire Weather Integration
National Weather Service fire weather alerts — no API key required.

Alert types fetched:
  Red Flag Warning    — critical fire weather (high wind + low RH + dry fuels)
  Fire Weather Watch  — conditions possible within 24-48 hrs
  Fire Weather Statement — less severe advisory

Docs: https://www.weather.gov/documentation/services-web-api
"""
import time
import logging
import httpx
from fastapi import APIRouter, HTTPException
from config import NWS_BASE_URL, NWS_USER_AGENT, NWS_CACHE_TTL

router = APIRouter()
logger = logging.getLogger(__name__)

ALERT_EVENTS = [
    "Red Flag Warning",
    "Fire Weather Watch",
    "Fire Weather Statement",
    "Extreme Fire Danger",
]

SEVERITY_COLOR = {
    "Red Flag Warning":     "#cc0000",
    "Fire Weather Watch":   "#ff6600",
    "Fire Weather Statement": "#ffaa00",
    "Extreme Fire Danger":  "#990000",
}

_cache: dict = {}


def _cached(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < NWS_CACHE_TTL:
        return entry["data"]
    return None


def _store(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def _fetch_alerts() -> list:
    cached = _cached("alerts")
    if cached is not None:
        return cached

    headers = {
        "User-Agent":  NWS_USER_AGENT,
        "Accept":      "application/geo+json",
        "Feature-Flags": "",
    }

    # Fetch each event type and combine
    all_alerts = []
    seen_ids = set()

    for event in ALERT_EVENTS:
        try:
            resp = httpx.get(
                f"{NWS_BASE_URL}/alerts/active",
                params={"event": event, "status": "actual"},
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            for feature in data.get("features", []):
                alert_id = feature.get("id", "")
                if alert_id in seen_ids:
                    continue
                seen_ids.add(alert_id)
                props = feature.get("properties", {})
                geom  = feature.get("geometry")
                alert = {
                    "id":          alert_id,
                    "event":       props.get("event", event),
                    "severity":    props.get("severity", "Unknown"),
                    "urgency":     props.get("urgency", "Unknown"),
                    "certainty":   props.get("certainty", "Unknown"),
                    "headline":    props.get("headline", ""),
                    "description": props.get("description", ""),
                    "instruction": props.get("instruction", ""),
                    "area_desc":   props.get("areaDesc", ""),
                    "sent":        props.get("sent", ""),
                    "effective":   props.get("effective", ""),
                    "expires":     props.get("expires", ""),
                    "color":       SEVERITY_COLOR.get(event, "#ff6600"),
                    "geometry":    geom,
                }
                all_alerts.append(alert)
        except Exception as e:
            logger.warning("NWS alert fetch failed for %s: %s", event, e)

    _store("alerts", all_alerts)
    return all_alerts


# ─── Endpoints ────────────────────────────────────────────

@router.get("/status")
def status():
    return {"state": "ready", "source": "api.weather.gov", "auth": "none_required"}


@router.get("/alerts")
def get_alerts():
    """Active fire weather alerts nationwide."""
    try:
        alerts = _fetch_alerts()
        by_type = {}
        for a in alerts:
            by_type[a["event"]] = by_type.get(a["event"], 0) + 1
        return {"alerts": alerts, "count": len(alerts), "by_type": by_type}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/alerts/map")
def alerts_map():
    """Fire weather alerts as GeoJSON — includes polygon geometry where available."""
    try:
        alerts = _fetch_alerts()
        features = []
        for a in alerts:
            if not a["geometry"]:
                continue
            features.append({
                "type": "Feature",
                "geometry": a["geometry"],
                "properties": {k: v for k, v in a.items() if k != "geometry"},
            })
        return {"type": "FeatureCollection", "features": features, "total_alerts": len(alerts)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/refresh")
def refresh_alerts():
    """Force-clear the alert cache."""
    _cache.clear()
    return {"status": "cache_cleared"}
