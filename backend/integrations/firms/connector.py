"""
NASA FIRMS Integration — Active Fire Detections
Satellite hotspot data from VIIRS (375m) and MODIS (1km) sensors.

API key: https://firms.modaps.eosdis.nasa.gov/api/
Sources: VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | MODIS_NRT
"""
import time
import logging
import httpx
from fastapi import APIRouter, HTTPException, Query
from config import FIRMS_API_KEY, FIRMS_BASE_URL

router = APIRouter()
logger = logging.getLogger(__name__)

# Bounding box: continental US
CONUS_BBOX = "-125,24,-66,49"

# Available data sources
SOURCES = {
    "VIIRS_SNPP_NRT":   "VIIRS S-NPP (375m, real-time)",
    "VIIRS_NOAA20_NRT": "VIIRS NOAA-20 (375m, real-time)",
    "MODIS_NRT":        "MODIS Terra+Aqua (1km, real-time)",
}

# Cache
_cache: dict = {}
CACHE_TTL = 600  # 10 minutes


def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        return entry["data"]
    return None


def _set_cache(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def _confidence_level(fire: dict, source: str) -> str:
    """Normalise confidence to high/nominal/low across sensor types."""
    raw = fire.get("confidence", "")
    if source.startswith("VIIRS"):
        # VIIRS uses text: 'high', 'nominal', 'low'
        return raw.lower() if raw.lower() in ("high", "nominal", "low") else "nominal"
    else:
        # MODIS uses 0-100 integer
        try:
            v = int(raw)
            if v >= 80: return "high"
            if v >= 50: return "nominal"
            return "low"
        except (ValueError, TypeError):
            return "nominal"


def _confidence_color(level: str) -> str:
    return {"high": "#ff2200", "nominal": "#ff8c00", "low": "#ffd700"}.get(level, "#ff8c00")


def _fetch_fires(source: str = "VIIRS_SNPP_NRT", area: str = CONUS_BBOX, days: int = 1) -> list:
    cache_key = f"{source}:{area}:{days}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    if not FIRMS_API_KEY:
        return []

    url = f"{FIRMS_BASE_URL}/area/csv/{FIRMS_API_KEY}/{source}/{area}/{days}"
    try:
        resp = httpx.get(url, timeout=20)
        resp.raise_for_status()
        fires = _parse_csv(resp.text, source)
        _set_cache(cache_key, fires)
        return fires
    except Exception as e:
        logger.error("FIRMS fetch failed (%s): %s", source, e)
        raise


def _parse_csv(csv_text: str, source: str) -> list:
    lines = csv_text.strip().split("\n")
    if len(lines) < 2:
        return []
    headers = [h.strip() for h in lines[0].split(",")]
    fires = []
    for line in lines[1:]:
        values = [v.strip() for v in line.split(",")]
        if len(values) != len(headers):
            continue
        fire = dict(zip(headers, values))
        # Normalise lat/lon field names across sources
        lat = fire.get("latitude") or fire.get("lat")
        lon = fire.get("longitude") or fire.get("lon")
        if not lat or not lon:
            continue
        level = _confidence_level(fire, source)
        fires.append({
            "latitude":   float(lat),
            "longitude":  float(lon),
            "brightness": fire.get("bright_ti4") or fire.get("brightness", ""),
            "frp":        fire.get("frp", ""),
            "confidence": fire.get("confidence", ""),
            "confidence_level": level,
            "confidence_color": _confidence_color(level),
            "acq_date":   fire.get("acq_date", ""),
            "acq_time":   fire.get("acq_time", ""),
            "satellite":  fire.get("satellite", source),
            "daynight":   fire.get("daynight", ""),
            "source":     source,
        })
    return fires


# ─── Endpoints ────────────────────────────────────────────

@router.get("/status")
def status():
    if not FIRMS_API_KEY:
        return {"state": "no_api_key", "message": "Set FIRMS_API_KEY in backend/.env — free at https://firms.modaps.eosdis.nasa.gov/api/"}
    return {"state": "ready", "sources": list(SOURCES.keys())}


@router.get("/sources")
def list_sources():
    return {"sources": [{"id": k, "label": v} for k, v in SOURCES.items()]}


@router.get("/active")
def active_fires(
    source: str = Query("VIIRS_SNPP_NRT", description="Satellite sensor source"),
    days:   int  = Query(1,               ge=1, le=3, description="Days of data (1-3)"),
    area:   str  = Query(CONUS_BBOX,      description="Bounding box lon_min,lat_min,lon_max,lat_max"),
):
    """Active fire detections as a list of points."""
    if not FIRMS_API_KEY:
        return {"fires": [], "count": 0, "error": "FIRMS_API_KEY not set"}
    try:
        fires = _fetch_fires(source=source, area=area, days=days)
        return {"fires": fires, "count": len(fires), "source": source, "days": days}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/map")
def fire_map(
    source: str = Query("VIIRS_SNPP_NRT"),
    days:   int  = Query(1, ge=1, le=3),
    area:   str  = Query(CONUS_BBOX),
):
    """Active fires as GeoJSON FeatureCollection for map rendering."""
    if not FIRMS_API_KEY:
        return {"type": "FeatureCollection", "features": []}
    try:
        fires = _fetch_fires(source=source, area=area, days=days)
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [f["longitude"], f["latitude"]]},
                "properties": {k: v for k, v in f.items() if k not in ("latitude", "longitude")},
            }
            for f in fires
        ]
        return {"type": "FeatureCollection", "features": features, "count": len(features)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats")
def fire_stats(
    source: str = Query("VIIRS_SNPP_NRT"),
    days:   int  = Query(1, ge=1, le=3),
):
    """Summary stats: total detections, confidence distribution."""
    if not FIRMS_API_KEY:
        return {"total": 0, "by_confidence": {}}
    try:
        fires = _fetch_fires(source=source, days=days)
        by_conf = {"high": 0, "nominal": 0, "low": 0}
        for f in fires:
            by_conf[f["confidence_level"]] = by_conf.get(f["confidence_level"], 0) + 1
        return {"total": len(fires), "by_confidence": by_conf, "source": source, "days": days}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
