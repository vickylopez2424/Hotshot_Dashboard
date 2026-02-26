"""
Vegetation Analysis — NDVI & Burn Scar Mapping
Satellite-derived vegetation indices for fire risk assessment.

Data sources (all free, no API key required):
  NDVI tiles:  NASA GIBS WMS (MODIS 16-day composite)
  Point query: MODIS Land Product Subsets API (ORNL DAAC)

NDVI (Normalized Difference Vegetation Index):
  -1.0 to 0.0  : Water, bare soil, rock
   0.0 to 0.2  : Sparse vegetation, desert
   0.2 to 0.4  : Shrubland, stressed/dry vegetation — ELEVATED FIRE RISK
   0.4 to 0.6  : Moderate vegetation (grassland, crops)
   0.6 to 1.0  : Dense healthy vegetation (forests)

  LOW NDVI in historically vegetated areas = drought stress = higher fire risk

NBR (Normalized Burn Ratio) — post-fire severity:
  dNBR < 0     : Post-fire regrowth (greening)
  0  to 0.1   : Enhanced regrowth / unburned
  0.1 to 0.27 : Low severity
  0.27 to 0.44: Moderate-low severity
  0.44 to 0.66: Moderate-high severity
  > 0.66      : High severity burn scar
"""
import time
import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
logger = logging.getLogger(__name__)

# NASA GIBS WMS (serves pre-rendered tiles directly to Leaflet)
NASA_GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"

# ORNL DAAC MODIS Web Service (point queries)
ORNL_BASE = "https://modis.ornl.gov/rst/api/v1"

# Available map layers
WMS_LAYERS = [
    {
        "id":    "ndvi",
        "wms":   "MOD13A2_006_NDVI",
        "label": "NDVI (MODIS 16-day)",
        "desc":  "Vegetation greenness composite. Low values in vegetated areas indicate drought stress and elevated fire risk.",
        "opacity": 0.7,
    },
    {
        "id":    "evi",
        "wms":   "MOD13A2_006_EVI",
        "label": "EVI (Enhanced Vegetation Index)",
        "desc":  "Similar to NDVI but less saturated in dense forests. Better in humid or high-canopy areas.",
        "opacity": 0.7,
    },
    {
        "id":    "lst_day",
        "wms":   "MOD11A2_006_LST_Day_1km",
        "label": "Land Surface Temperature",
        "desc":  "Daytime surface temperature from MODIS. Hot, dry, stressed vegetation burns more readily.",
        "opacity": 0.65,
    },
    {
        "id":    "burn_scar",
        "wms":   "MODIS_Terra_L3_EVI_16Day",
        "label": "Burn Scar (MODIS BA)",
        "desc":  "MODIS Burned Area product — confirmed burn scars from recent fires.",
        "opacity": 0.7,
    },
]

# NDVI classification for fire risk
NDVI_CLASSES = [
    {"range": (-1.0, 0.0),  "label": "Water / bare soil",         "fire_risk": "none",     "color": "#4444cc"},
    {"range": (0.0,  0.15), "label": "Sparse / desert vegetation", "fire_risk": "low",      "color": "#888833"},
    {"range": (0.15, 0.30), "label": "Stressed / dry vegetation",  "fire_risk": "high",     "color": "#cc6600"},
    {"range": (0.30, 0.45), "label": "Moderate vegetation",        "fire_risk": "moderate", "color": "#99cc33"},
    {"range": (0.45, 0.65), "label": "Healthy vegetation",         "fire_risk": "low",      "color": "#33aa33"},
    {"range": (0.65, 1.0),  "label": "Dense healthy vegetation",   "fire_risk": "low",      "color": "#006600"},
]

_cache: dict = {}
CACHE_TTL = 3600  # 1 hour for satellite data


def _get_ndvi_class(ndvi: float) -> dict:
    for cls in NDVI_CLASSES:
        lo, hi = cls["range"]
        if lo <= ndvi <= hi:
            return cls
    return {"label": "Unknown", "fire_risk": "unknown", "color": "#888888"}


def _current_modis_date() -> str:
    """Return current date in MODIS 'AYYYYDDD' format."""
    now = datetime.now(timezone.utc)
    return f"A{now.year}{now.timetuple().tm_yday:03d}"


def _fetch_ndvi_point(lat: float, lon: float) -> dict:
    cache_key = f"ndvi:{lat:.3f}:{lon:.3f}"
    entry = _cache.get(cache_key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        return entry["data"]

    # ORNL DAAC MODIS Web Service for MOD13Q1 (250m NDVI, 16-day)
    product = "MOD13Q1"
    doy     = _current_modis_date()
    # Fetch last 3 16-day composites
    try:
        # First get available dates
        dates_resp = httpx.get(
            f"{ORNL_BASE}/{product}/dates",
            params={"latitude": lat, "longitude": lon},
            timeout=10,
        )
        dates_resp.raise_for_status()
        dates = dates_resp.json().get("dates", [])
        if not dates:
            return {"ndvi": None, "error": "No MODIS data for this location"}

        # Get the most recent 3 dates
        recent_dates = dates[-3:]

        subset_resp = httpx.get(
            f"{ORNL_BASE}/{product}/subset",
            params={
                "latitude":     lat,
                "longitude":    lon,
                "band":         "250m_16_days_NDVI",
                "startDate":    recent_dates[0],
                "endDate":      recent_dates[-1],
                "kmAboveBelow": 0,
                "kmLeftRight":  0,
            },
            timeout=15,
        )
        subset_resp.raise_for_status()
        subset = subset_resp.json()

        # Extract NDVI values (MODIS scale: -2000 to 10000, divide by 10000)
        subsets = subset.get("subset", [])
        readings = []
        for s in subsets:
            raw = s.get("data", [])
            if raw:
                ndvi_raw = raw[0]
                if ndvi_raw != -3000:  # -3000 is fill value
                    readings.append({
                        "date":  s.get("calendar_date", ""),
                        "ndvi":  round(ndvi_raw / 10000, 3),
                    })

        if not readings:
            return {"ndvi": None, "error": "No valid NDVI readings (possible cloud cover or out of range)"}

        latest   = readings[-1]
        ndvi_val = latest["ndvi"]
        cls      = _get_ndvi_class(ndvi_val)

        result = {
            "ndvi":       ndvi_val,
            "date":       latest["date"],
            "trend":      readings,
            "class":      cls["label"],
            "fire_risk":  cls["fire_risk"],
            "color":      cls["color"],
            "lat":        lat,
            "lon":        lon,
        }
        _cache[cache_key] = {"data": result, "ts": time.time()}
        return result

    except Exception as e:
        logger.error("NDVI fetch failed (%s, %s): %s", lat, lon, e)
        raise


# ─── Endpoints ────────────────────────────────────────────

@router.get("/status")
def status():
    return {
        "state":  "ready",
        "wms":    NASA_GIBS_WMS,
        "source": "NASA GIBS + ORNL DAAC MODIS",
        "auth":   "none_required",
    }


@router.get("/layers")
def list_layers():
    """Available vegetation WMS layers for the map."""
    return {"layers": WMS_LAYERS, "wms_url": NASA_GIBS_WMS}


@router.get("/ndvi-classes")
def ndvi_classes():
    """NDVI classification thresholds with fire risk levels."""
    return {"classes": NDVI_CLASSES}


@router.get("/ndvi")
def get_ndvi(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """
    Current MODIS NDVI at a point with fire risk classification.
    Uses ORNL DAAC MODIS Land Product Subsets API — 250m resolution.
    """
    try:
        return _fetch_ndvi_point(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
