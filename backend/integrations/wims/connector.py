"""
WIMS / RAWS Fire Weather Station Integration
Uses the Synoptic Data API (formerly MesoWest) to fetch real-time
Remote Automated Weather Station (RAWS) data.

API docs: https://docs.synopticdata.com/services/latest
Get a free token at: https://synopticdata.com/

Fire danger levels assessed from NFDRS thresholds:
  LOW      — RH >= 25% and wind < 15 mph
  MODERATE — RH 15-24% or wind 15-24 mph
  HIGH     — RH < 15% or wind >= 25 mph
  EXTREME  — RH < 10% AND wind >= 25 mph
"""
import time
import httpx
from fastapi import APIRouter, Query
from typing import Optional
from config import SYNOPTIC_API_KEY, SYNOPTIC_BASE_URL, WIMS_CACHE_TTL
from integrations.base import BasePlatformConnector

router = APIRouter()

# ─── Variables requested from each station ───────────────────────────────────
FIRE_WEATHER_VARS = ",".join([
    "air_temp",
    "relative_humidity",
    "wind_speed",
    "wind_direction",
    "fuel_moisture",
    "precip_accum",
    "dew_point_temperature",
])

# ─── Simple in-memory cache ───────────────────────────────────────────────────
_cache: dict = {}   # key -> {"data": ..., "ts": float}


def _cached(key: str, fetch_fn, ttl: int = WIMS_CACHE_TTL):
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < ttl:
        return _cache[key]["data"]
    data = fetch_fn()
    _cache[key] = {"data": data, "ts": now}
    return data


# ─── Fire danger helper ───────────────────────────────────────────────────────
def _danger_level(rh: Optional[float], wind_mph: Optional[float]) -> str:
    if rh is None and wind_mph is None:
        return "unknown"
    rh = rh if rh is not None else 100
    wind_mph = wind_mph if wind_mph is not None else 0
    if rh < 10 and wind_mph >= 25:
        return "extreme"
    if rh < 15 or wind_mph >= 25:
        return "high"
    if rh < 25 or wind_mph >= 15:
        return "moderate"
    return "low"


DANGER_COLORS = {
    "extreme":  "#ff0000",
    "high":     "#ff6600",
    "moderate": "#ffcc00",
    "low":      "#00cc44",
    "unknown":  "#888888",
}


def _parse_obs_value(obs: dict, key: str) -> Optional[float]:
    """Extract a numeric observation value from Synoptic response."""
    field = obs.get(f"{key}_value_1")
    if field and field.get("value") is not None:
        try:
            return float(field["value"])
        except (TypeError, ValueError):
            return None
    return None


def _parse_station(raw: dict) -> dict:
    """Normalize a Synoptic station record into a clean dict."""
    obs = raw.get("OBSERVATIONS", {})
    temp_f      = _parse_obs_value(obs, "air_temp")
    rh          = _parse_obs_value(obs, "relative_humidity")
    wind_speed  = _parse_obs_value(obs, "wind_speed")
    wind_dir    = _parse_obs_value(obs, "wind_direction")
    fuel_moist  = _parse_obs_value(obs, "fuel_moisture")
    precip      = _parse_obs_value(obs, "precip_accum")
    dew_point   = _parse_obs_value(obs, "dew_point_temperature")

    danger = _danger_level(rh, wind_speed)

    # Synoptic returns wind in m/s for RAWS unless units=english requested
    # We request english units so wind is already in mph

    return {
        "station_id":    raw.get("STID", raw.get("ID", "")),
        "name":          raw.get("NAME", "Unknown"),
        "state":         raw.get("STATE", ""),
        "latitude":      float(raw.get("LATITUDE", 0)),
        "longitude":     float(raw.get("LONGITUDE", 0)),
        "elevation_ft":  raw.get("ELEVATION", None),
        "network":       raw.get("SHORTNAME", "RAWS"),
        "type":          "wims",
        "temp_f":        round(temp_f, 1)   if temp_f    is not None else None,
        "rh":            round(rh, 1)       if rh        is not None else None,
        "wind_speed":    round(wind_speed, 1) if wind_speed is not None else None,
        "wind_dir":      round(wind_dir)    if wind_dir  is not None else None,
        "wind_dir_card": _degrees_to_cardinal(wind_dir),
        "fuel_moisture": round(fuel_moist, 1) if fuel_moist is not None else None,
        "precip_in":     round(precip, 2)   if precip    is not None else None,
        "dew_point_f":   round(dew_point, 1) if dew_point is not None else None,
        "danger_level":  danger,
        "danger_color":  DANGER_COLORS[danger],
        "obs_time":      _latest_obs_time(obs),
    }


def _latest_obs_time(obs: dict) -> Optional[str]:
    """Return the most recent observation timestamp from any variable."""
    for key, val in obs.items():
        if isinstance(val, dict) and val.get("date_time"):
            return val["date_time"]
    return None


def _degrees_to_cardinal(deg: Optional[float]) -> str:
    if deg is None:
        return "N/A"
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
            "S","SSW","SW","WSW","W","WNW","NW","NNW"]
    ix = int((deg + 11.25) / 22.5) % 16
    return dirs[ix]


# ─── Connector class ──────────────────────────────────────────────────────────
class WimsConnector(BasePlatformConnector):
    platform_id = "wims"
    platform_name = "WIMS/RAWS"

    def get_status(self) -> dict:
        if not SYNOPTIC_API_KEY:
            return {
                "state": "no_api_key",
                "message": "Set SYNOPTIC_API_KEY in .env — get a free token at synopticdata.com",
            }
        return {"state": "ready"}

    def get_data(self) -> dict:
        return self.fetch_stations()

    def fetch_stations(
        self,
        state: Optional[str] = None,
        bbox: Optional[str] = None,
        within: int = 60,
    ) -> dict:
        """
        Fetch RAWS stations and latest fire weather readings.

        state : two-letter state code, e.g. 'CA'  (mutually exclusive with bbox)
        bbox  : 'lon_min,lat_min,lon_max,lat_max'
        within: max age of observations in minutes (default 60)
        """
        if not SYNOPTIC_API_KEY:
            return {"stations": [], "error": "SYNOPTIC_API_KEY not set"}

        cache_key = f"wims:{state or ''}:{bbox or ''}:{within}"
        return _cached(cache_key, lambda: self._fetch_from_api(state, bbox, within))

    def _fetch_from_api(
        self,
        state: Optional[str],
        bbox: Optional[str],
        within: int,
    ) -> dict:
        params = {
            "token":    SYNOPTIC_API_KEY,
            "shortname": "raws",
            "vars":     FIRE_WEATHER_VARS,
            "units":    "english",
            "within":   within,
            "limit":    500,
        }
        if state:
            params["state"] = state.upper()
        elif bbox:
            params["bbox"] = bbox

        try:
            resp = httpx.get(
                f"{SYNOPTIC_BASE_URL}/stations/latest",
                params=params,
                timeout=20,
            )
            resp.raise_for_status()
            raw = resp.json()

            if raw.get("SUMMARY", {}).get("RESPONSE_CODE") != 1:
                return {
                    "stations": [],
                    "error": raw.get("SUMMARY", {}).get("RESPONSE_MESSAGE", "API error"),
                }

            stations = [_parse_station(s) for s in raw.get("STATION", [])]
            return {
                "stations": stations,
                "count":    len(stations),
                "source":   "Synoptic Data / RAWS",
            }
        except httpx.HTTPError as e:
            return {"stations": [], "error": f"HTTP error: {e}"}
        except Exception as e:
            return {"stations": [], "error": str(e)}


_connector = WimsConnector()


# ─── API Endpoints ────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Check WIMS/RAWS connector status."""
    return _connector.get_status()


@router.get("/stations")
def list_stations(
    state: Optional[str] = Query(None, description="Two-letter state code, e.g. CA"),
    bbox:  Optional[str] = Query(None, description="Bounding box: lon_min,lat_min,lon_max,lat_max"),
    within: int          = Query(60,   description="Max observation age in minutes"),
):
    """
    Returns RAWS fire weather stations with current readings.

    Filter by state (e.g. ?state=CA) or bounding box (?bbox=-124,32,-114,42).
    Includes fire danger level (low/moderate/high/extreme) for each station.
    Results are cached for WIMS_CACHE_TTL seconds (default 15 min).
    """
    return _connector.fetch_stations(state=state, bbox=bbox, within=within)


@router.get("/station/{station_id}")
def station_detail(station_id: str):
    """
    Returns detailed current readings for a single RAWS station by STID.
    Example: /api/wims/station/CALS1
    """
    if not SYNOPTIC_API_KEY:
        return {"error": "SYNOPTIC_API_KEY not set"}

    try:
        resp = httpx.get(
            f"{SYNOPTIC_BASE_URL}/stations/latest",
            params={
                "token": SYNOPTIC_API_KEY,
                "stid":  station_id.upper(),
                "vars":  FIRE_WEATHER_VARS,
                "units": "english",
            },
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()
        stations = raw.get("STATION", [])
        if not stations:
            return {"error": f"Station {station_id} not found"}
        return _parse_station(stations[0])
    except Exception as e:
        return {"error": str(e)}


@router.get("/danger-summary")
def danger_summary(
    state: Optional[str] = Query(None),
    bbox:  Optional[str] = Query(None),
):
    """
    Returns a summary count of stations by fire danger level for the region.
    Useful for a dashboard overview widget.
    """
    result = _connector.fetch_stations(state=state, bbox=bbox)
    stations = result.get("stations", [])
    summary = {"extreme": 0, "high": 0, "moderate": 0, "low": 0, "unknown": 0}
    for s in stations:
        level = s.get("danger_level", "unknown")
        summary[level] = summary.get(level, 0) + 1
    return {"summary": summary, "total": len(stations)}
