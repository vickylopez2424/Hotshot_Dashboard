"""
ALERTWildfire Camera Data Source

Fetches the complete camera list from the public ALERTWildfire S3 JSON feed.
This covers all ~1,600+ cameras in the ALERTWildfire, ALERTCalifornia,
ALERTWest, and HPWREN networks.

Data source (no auth required):
  https://s3-us-west-2.amazonaws.com/awf-data-public-prod/all-cameras.json

Camera stream URLs:
  MJPEG stream : https://{camera_id}.prx.alertwildfire.org
  Viewer page  : https://www.alertwildfire.org/{region}/index.html?camera={camera_id}
"""
import time
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Public data endpoints ────────────────────────────────────────────────────
S3_CAMERAS_URL = (
    "https://s3-us-west-2.amazonaws.com/awf-data-public-prod/all-cameras.json"
)
ALERTWILDFIRE_VIEWER = "https://www.alertwildfire.org"
MJPEG_PROXY_BASE     = "https://{camera_id}.prx.alertwildfire.org"

# Cache for 1 hour — camera list rarely changes
CAMERAS_CACHE_TTL = 3600
_cameras_cache: dict = {"data": None, "ts": 0.0}


# ─── Known regions (for URL construction when not in JSON) ───────────────────
REGION_BY_STATE = {
    "CA": "california", "OR": "oregon", "WA": "washington",
    "NV": "nevada",     "ID": "idaho",  "MT": "montana",
    "CO": "colorado",   "HI": "hawaii", "AZ": "arizona",
    "UT": "utah",       "NM": "newmexico",
}


def fetch_all_cameras(force_refresh: bool = False) -> list:
    """
    Returns the full camera list from the ALERTWildfire S3 feed.
    Results are cached for 1 hour.
    """
    now = time.time()
    if not force_refresh and _cameras_cache["data"] and \
            now - _cameras_cache["ts"] < CAMERAS_CACHE_TTL:
        return _cameras_cache["data"]

    try:
        resp = httpx.get(S3_CAMERAS_URL, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        raw = resp.json()

        # The S3 feed may return a list or a dict with a cameras key
        if isinstance(raw, list):
            cameras_raw = raw
        elif isinstance(raw, dict):
            cameras_raw = (
                raw.get("cameras") or raw.get("data") or
                raw.get("items") or list(raw.values())[0]
                if raw else []
            )
        else:
            cameras_raw = []

        cameras = [_normalize(c) for c in cameras_raw if c]
        cameras = [c for c in cameras if c.get("latitude") and c.get("longitude")]

        _cameras_cache["data"] = cameras
        _cameras_cache["ts"]   = now
        logger.info("ALERTWildfire: loaded %d cameras from S3", len(cameras))
        return cameras

    except httpx.HTTPError as e:
        logger.error("ALERTWildfire S3 fetch failed: %s", e)
    except Exception as e:
        logger.exception("ALERTWildfire camera fetch error")

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
    region  : alertwildfire region name, e.g. 'california'
    network : 'ALERTCalifornia', 'ALERTWest', 'HPWREN', etc.
    bbox    : 'lon_min,lat_min,lon_max,lat_max'
    search  : search camera name
    limit   : page size (default 200)
    offset  : pagination offset
    """
    filtered = cameras

    if state:
        s = state.upper()
        filtered = [c for c in filtered if c.get("state", "").upper() == s]

    if region:
        r = region.lower()
        filtered = [c for c in filtered if c.get("region", "").lower() == r]

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
        "cameras": page,
        "total":   total,
        "offset":  offset,
        "limit":   limit,
        "has_more": offset + limit < total,
    }


# ─── Normalization ────────────────────────────────────────────────────────────

def _normalize(raw: dict) -> dict:
    """
    Normalize a raw camera record from the S3 JSON.
    The ALERTWildfire JSON schema is not formally documented, so we handle
    several known field name variations.
    """
    # Camera ID — try multiple field names
    camera_id = (
        raw.get("id") or raw.get("cameraId") or raw.get("camera_id") or
        raw.get("name") or ""
    )
    if not camera_id:
        return {}

    # Name — prefer a human-readable name
    name = (
        raw.get("displayName") or raw.get("display_name") or
        raw.get("cameraName") or raw.get("camera_name") or
        raw.get("title") or raw.get("name") or camera_id
    )

    # Location
    lat = _num(raw.get("latitude") or raw.get("lat"))
    lon = _num(raw.get("longitude") or raw.get("lon") or raw.get("lng"))

    # Region / state
    region = (
        raw.get("region") or raw.get("area") or raw.get("state") or ""
    ).lower().replace(" ", "")

    state = _infer_state(raw, region)

    # Network
    network = (
        raw.get("network") or raw.get("type") or
        _infer_network(raw, region)
    )

    # Build URLs
    viewer_url = _viewer_url(camera_id, region)
    stream_url = MJPEG_PROXY_BASE.format(camera_id=camera_id)

    return {
        "camera_id":   camera_id,
        "name":        name,
        "latitude":    lat,
        "longitude":   lon,
        "region":      region,
        "state":       state,
        "network":     network,
        "viewer_url":  viewer_url,
        "stream_url":  stream_url,
        "is_ptz":      bool(raw.get("ptz") or raw.get("isPtz") or
                            "ptz" in camera_id.lower()),
        "is_infrared": bool(raw.get("infrared") or raw.get("ir") or
                            "ir" in camera_id.lower() or
                            "flir" in camera_id.lower()),
        "elevation_ft": raw.get("elevation") or raw.get("elevation_ft"),
        "timezone":    raw.get("timezone") or raw.get("tz") or "",
    }


def _num(val) -> Optional[float]:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _infer_state(raw: dict, region: str) -> str:
    """Infer two-letter state code from raw data or region name."""
    if raw.get("state"):
        s = str(raw["state"]).upper().replace("US-", "")
        if len(s) == 2:
            return s
    for state, reg in REGION_BY_STATE.items():
        if reg in region:
            return state
    return ""


def _infer_network(raw: dict, region: str) -> str:
    """Infer which sub-network a camera belongs to."""
    camera_id = str(raw.get("id") or raw.get("name") or "").upper()
    if "HPWREN" in camera_id or region == "hpwren":
        return "HPWREN"
    if region in ("california", "alertcalifornia"):
        return "ALERTCalifornia"
    if region in ("oregon", "washington", "idaho", "montana", "colorado", "nevada", "hawaii"):
        return "ALERTWest"
    return "ALERTWildfire"


def _viewer_url(camera_id: str, region: str) -> str:
    """Construct the alertwildfire.org viewer URL for this camera."""
    reg = region or "california"
    # Some IDs include the region prefix; use it if present
    for state, r in REGION_BY_STATE.items():
        if camera_id.upper().startswith(state):
            reg = r
            break
    return f"{ALERTWILDFIRE_VIEWER}/{reg}/index.html?camera={camera_id}"
