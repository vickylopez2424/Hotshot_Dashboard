"""
AirNow Integration — EPA Air Quality / Wildfire Smoke
Real-time AQI readings from EPA monitoring stations.

API key: https://docs.airnowapi.org/account/request/ (free)
Primary parameter: PM2.5 (most relevant for wildfire smoke)

Strategy: query a grid of anchor points covering the western US
with a 250-mile radius each, then deduplicate by station name.
Cache results for 1 hour (AirNow data updates hourly).
"""
import time
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import APIRouter, HTTPException, Query
from config import AIRNOW_API_KEY, AIRNOW_BASE_URL, AIRNOW_CACHE_TTL

router = APIRouter()
logger = logging.getLogger(__name__)

# Grid of anchor points covering western US + key fire states
ANCHOR_POINTS = [
    (37.7, -122.4),   # San Francisco, CA
    (34.0, -118.2),   # Los Angeles, CA
    (40.7, -120.5),   # Northern CA
    (36.7, -119.8),   # Central Valley, CA
    (45.5, -122.7),   # Portland, OR
    (47.6, -122.3),   # Seattle, WA
    (43.6, -116.2),   # Boise, ID
    (39.7, -104.9),   # Denver, CO
    (36.2, -115.1),   # Las Vegas, NV
    (33.4, -112.1),   # Phoenix, AZ
    (35.1, -106.7),   # Albuquerque, NM
    (46.9, -114.1),   # Missoula, MT (critical fire area)
]

# AQI category definitions
AQI_CATEGORIES = [
    {"label": "Good",           "range": (0,   50),  "color": "#00e400"},
    {"label": "Moderate",       "range": (51,  100), "color": "#ffff00"},
    {"label": "Unhealthy (Sensitive)", "range": (101, 150), "color": "#ff7e00"},
    {"label": "Unhealthy",      "range": (151, 200), "color": "#ff0000"},
    {"label": "Very Unhealthy", "range": (201, 300), "color": "#8f3f97"},
    {"label": "Hazardous",      "range": (301, 500), "color": "#7e0023"},
]


def _aqi_category(aqi: int) -> dict:
    for cat in AQI_CATEGORIES:
        lo, hi = cat["range"]
        if lo <= aqi <= hi:
            return cat
    return {"label": "Unknown", "color": "#888888"}


_cache: dict = {}


def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < AIRNOW_CACHE_TTL:
        return entry["data"]
    return None


def _set_cache(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def _current_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")


def _fetch_observations() -> list:
    cached = _get_cached("observations")
    if cached is not None:
        return cached

    if not AIRNOW_API_KEY:
        return []

    all_obs = []
    seen = set()

    with httpx.Client(timeout=15) as client:
        for lat, lon in ANCHOR_POINTS:
            try:
                resp = client.get(
                    f"{AIRNOW_BASE_URL}/observation/latLong/current/",
                    params={
                        "format":    "application/json",
                        "latitude":  lat,
                        "longitude": lon,
                        "distance":  250,
                        "API_KEY":   AIRNOW_API_KEY,
                    },
                )
                resp.raise_for_status()
                for obs in resp.json():
                    name = obs.get("ReportingArea", "") + str(obs.get("StateCode", ""))
                    if name in seen:
                        continue
                    seen.add(name)
                    aqi = obs.get("AQI", -1)
                    cat = _aqi_category(aqi)
                    all_obs.append({
                        "reporting_area": obs.get("ReportingArea", ""),
                        "state":          obs.get("StateCode", ""),
                        "latitude":       obs.get("Latitude"),
                        "longitude":      obs.get("Longitude"),
                        "parameter":      obs.get("ParameterName", "PM2.5"),
                        "aqi":            aqi,
                        "category":       cat["label"],
                        "color":          cat["color"],
                        "date_observed":  obs.get("DateObserved", ""),
                        "hour_observed":  obs.get("HourObserved", ""),
                    })
            except Exception as e:
                logger.debug("AirNow fetch failed for (%s,%s): %s", lat, lon, e)

    _set_cache("observations", all_obs)
    return all_obs


# ─── Endpoints ────────────────────────────────────────────

@router.get("/status")
def status():
    if not AIRNOW_API_KEY:
        return {
            "state":   "no_api_key",
            "message": "Set AIRNOW_API_KEY in backend/.env — free at https://docs.airnowapi.org/account/request/",
        }
    return {"state": "ready", "source": "airnowapi.org", "parameter": "PM2.5"}


@router.get("/categories")
def aqi_categories():
    return {"categories": AQI_CATEGORIES}


@router.get("/observations")
def get_observations(
    min_aqi: Optional[int] = Query(None, description="Filter: only return stations at or above this AQI"),
):
    """Current AQI observations across the western US."""
    if not AIRNOW_API_KEY:
        return {"observations": [], "count": 0, "error": "AIRNOW_API_KEY not set"}
    try:
        obs = _fetch_observations()
        if min_aqi is not None:
            obs = [o for o in obs if o["aqi"] >= min_aqi]
        return {"observations": obs, "count": len(obs)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/map")
def observations_map(
    min_aqi: Optional[int] = Query(None),
):
    """AQI observations as GeoJSON FeatureCollection for map rendering."""
    if not AIRNOW_API_KEY:
        return {"type": "FeatureCollection", "features": []}
    try:
        obs = _fetch_observations()
        if min_aqi is not None:
            obs = [o for o in obs if o["aqi"] >= min_aqi]
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [o["longitude"], o["latitude"]]},
                "properties": {k: v for k, v in o.items() if k not in ("latitude", "longitude")},
            }
            for o in obs
            if o.get("latitude") and o.get("longitude")
        ]
        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/refresh")
def refresh():
    _cache.clear()
    return {"status": "cache_cleared"}
