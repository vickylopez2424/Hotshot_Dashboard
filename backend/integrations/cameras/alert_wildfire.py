"""
ALERTCalifornia Camera Data Source

Fetches the camera list from the public ALERTCalifornia "Live Cameras"
ArcGIS Feature Service, published by Esri + UC San Diego in the ArcGIS
Living Atlas. ~1,250 cameras, no API key or login required.

This replaced the old ALERTWildfire S3 JSON feed
(s3-us-west-2.amazonaws.com/awf-data-public-prod/all-cameras.json),
which now returns HTTP 403.

Data source (public, no auth):
  https://services8.arcgis.com/X84q166Srnyl4JMV/arcgis/rest/services/
    ALERTCalifornia_Camera_Feed/FeatureServer/0

Each camera record exposes a `latest-frame.jpg` still image (refreshed
server-side every ~15s) and a public viewer-page URL.
"""
import time
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Public data endpoint ─────────────────────────────────────────────────────
FEATURE_SERVICE_URL = (
    "https://services8.arcgis.com/X84q166Srnyl4JMV/arcgis/rest/services/"
    "ALERTCalifornia_Camera_Feed/FeatureServer/0/query"
)
_PAGE_SIZE = 1000  # ArcGIS pagination chunk

# Cache for 1 hour — the camera list rarely changes
CAMERAS_CACHE_TTL = 3600
_cameras_cache: dict = {"data": None, "ts": 0.0}


# ─── State → region map (kept for connector import compatibility) ────────────
REGION_BY_STATE = {
    "CA": "california", "OR": "oregon", "WA": "washington",
    "NV": "nevada",     "ID": "idaho",  "MT": "montana",
    "CO": "colorado",   "HI": "hawaii", "AZ": "arizona",
    "UT": "utah",       "NM": "newmexico",
}


def fetch_all_cameras(force_refresh: bool = False) -> list:
    """
    Returns the full camera list from the ALERTCalifornia Feature Service.
    Pages through all records; results are cached for 1 hour.
    """
    now = time.time()
    if not force_refresh and _cameras_cache["data"] and \
            now - _cameras_cache["ts"] < CAMERAS_CACHE_TTL:
        return _cameras_cache["data"]

    try:
        features: list = []
        offset = 0
        with httpx.Client(timeout=25, follow_redirects=True) as client:
            while True:
                resp = client.get(FEATURE_SERVICE_URL, params={
                    "where":             "1=1",
                    "outFields":         "*",
                    "outSR":             "4326",      # return lat/lon
                    "returnGeometry":    "true",
                    "resultOffset":      offset,
                    "resultRecordCount": _PAGE_SIZE,
                    "f":                 "json",
                })
                resp.raise_for_status()
                page = resp.json().get("features", [])
                features.extend(page)
                if len(page) < _PAGE_SIZE:
                    break
                offset += _PAGE_SIZE

        cameras = [_normalize(f) for f in features]
        cameras = [c for c in cameras if c.get("latitude") and c.get("longitude")]

        _cameras_cache["data"] = cameras
        _cameras_cache["ts"]   = now
        logger.info("ALERTCalifornia: loaded %d cameras", len(cameras))
        return cameras

    except httpx.HTTPError as e:
        logger.error("ALERTCalifornia feature service fetch failed: %s", e)
    except Exception:
        logger.exception("ALERTCalifornia camera fetch error")

    # Return stale cache on error rather than empty
    return _cameras_cache["data"] or []


def filter_cameras(
    cameras: list,
    state:    Optional[str] = None,
    region:   Optional[str] = None,
    network:  Optional[str] = None,
    bbox:     Optional[str] = None,
    search:   Optional[str] = None,
    limit:    int = 200,
    offset:   int = 0,
) -> dict:
    """
    Filter the camera list and return a paginated result.

    state   : two-letter state code, e.g. 'CA'
    region  : county / region name
    network : 'ALERTCalifornia', 'ALERTWest', 'HPWREN', etc.
    bbox    : 'lon_min,lat_min,lon_max,lat_max'
    search  : search camera name or id
    limit   : page size (default 200)
    offset  : pagination offset
    """
    filtered = cameras

    if state:
        s = state.upper()
        filtered = [c for c in filtered if c.get("state", "").upper() == s]

    if region:
        r = region.lower()
        filtered = [c for c in filtered if r in c.get("region", "").lower()]

    if network:
        n = network.lower()
        filtered = [c for c in filtered if n in c.get("network", "").lower()]

    if bbox:
        try:
            lon_min, lat_min, lon_max, lat_max = [float(x) for x in bbox.split(",")]
            filtered = [
                c for c in filtered
                if lon_min <= c["longitude"] <= lon_max
                and lat_min <= c["latitude"]  <= lat_max
            ]
        except (ValueError, TypeError):
            pass

    if search:
        s = search.lower()
        filtered = [c for c in filtered if s in c.get("name", "").lower()
                    or s in c.get("camera_id", "").lower()]

    total = len(filtered)
    page  = filtered[offset: offset + limit]

    return {
        "cameras":  page,
        "total":    total,
        "offset":   offset,
        "limit":    limit,
        "has_more": offset + limit < total,
    }


# ─── Normalization ────────────────────────────────────────────────────────────

def _normalize(feature: dict) -> dict:
    """Normalize one ArcGIS feature into the dashboard camera schema."""
    attr = feature.get("attributes", {}) or {}
    geom = feature.get("geometry", {}) or {}

    camera_id = attr.get("siteId") or attr.get("cameraName") or ""
    if not camera_id:
        return {}

    organization = attr.get("organization") or ""
    county       = (attr.get("county") or "").strip()
    image_url    = attr.get("imageURL") or ""

    return {
        "camera_id":    camera_id,
        "name":         attr.get("cameraName") or camera_id,
        "latitude":     _num(geom.get("y")),
        "longitude":    _num(geom.get("x")),
        "region":       county.title(),
        "county":       county.title(),
        "state":        _state_for(organization),
        "network":      _network_display(organization),
        "viewer_url":   attr.get("cameraURL") or "",
        # latest-frame.jpg still image — used directly by the camera card <img>
        "stream_url":   image_url,
        "image_url":    image_url,
        "is_ptz":       attr.get("positionPan") is not None,
        "is_infrared":  False,  # not exposed by this feed
        "is_online":    str(attr.get("isOnline") or "").lower() == "online",
        "is_active":    str(attr.get("isActive") or "").lower() == "active",
        "view_time":    attr.get("viewTime") or "",
        "elevation_ft": None,
    }


def _num(val) -> Optional[float]:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _network_display(organization: str) -> str:
    """Map the raw `organization` value to a display network name."""
    o = (organization or "").lower()
    if "california" in o:
        return "ALERTCalifornia"
    if "west" in o:
        return "ALERTWest"
    if "hpwren" in o:
        return "HPWREN"
    return organization or "ALERTWildfire"


def _state_for(organization: str) -> str:
    """Best-effort state code from the camera's organization."""
    return "CA" if "california" in (organization or "").lower() else ""
