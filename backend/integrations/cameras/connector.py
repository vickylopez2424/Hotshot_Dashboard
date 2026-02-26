"""
ALERTWildfire Camera Integration

Serves camera data from the public ALERTWildfire S3 JSON feed.
Covers ~1,600+ cameras across ALERTWildfire, ALERTCalifornia,
ALERTWest, and HPWREN networks.

No API key required — all data is publicly accessible.
"""
import httpx
import logging
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from integrations.base import BasePlatformConnector
from integrations.cameras.alert_wildfire import (
    fetch_all_cameras,
    filter_cameras,
    REGION_BY_STATE,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class CamerasConnector(BasePlatformConnector):
    platform_id = "cameras"
    platform_name = "ALERTWildfire Cameras"

    def get_status(self) -> dict:
        cameras = fetch_all_cameras()
        return {
            "state":        "ready" if cameras else "no_data",
            "camera_count": len(cameras),
            "source":       "ALERTWildfire S3 public feed",
        }

    def get_data(self) -> dict:
        return {"cameras": fetch_all_cameras()}


_connector = CamerasConnector()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Camera connector status and total count."""
    return _connector.get_status()


@router.get("/list")
def list_cameras(
    state:   Optional[str] = Query(None, description="State code, e.g. CA"),
    region:  Optional[str] = Query(None, description="ALERTWildfire region, e.g. california"),
    network: Optional[str] = Query(None, description="Network: ALERTCalifornia, ALERTWest, HPWREN"),
    bbox:    Optional[str] = Query(None, description="Bounding box: lon_min,lat_min,lon_max,lat_max"),
    search:  Optional[str] = Query(None, description="Search camera name"),
    limit:   int           = Query(200,  description="Page size (max 500)"),
    offset:  int           = Query(0,    description="Pagination offset"),
):
    """
    Returns wildfire cameras from ALERTWildfire network.

    Each camera includes:
      - camera_id  : Axis identifier used in stream URLs
      - name       : Human-readable name
      - latitude / longitude
      - stream_url : MJPEG live stream
      - viewer_url : Full ALERTWildfire viewer page
      - network    : ALERTCalifornia | ALERTWest | HPWREN | ALERTWildfire
      - is_ptz     : Pan-Tilt-Zoom capable
      - is_infrared: Night vision / thermal

    Results cached for 1 hour. Use ?limit and ?offset for pagination.
    """
    limit = min(limit, 500)
    cameras = fetch_all_cameras()
    return filter_cameras(
        cameras, state=state, region=region, network=network,
        bbox=bbox, search=search, limit=limit, offset=offset,
    )


@router.get("/map")
def cameras_for_map(
    state:   Optional[str] = Query(None),
    region:  Optional[str] = Query(None),
    bbox:    Optional[str] = Query(None),
    limit:   int           = Query(500),
):
    """
    Returns cameras as a GeoJSON FeatureCollection for map rendering.
    Use this endpoint for the map layer — it returns coordinates
    and essential metadata without pagination overhead.
    """
    cameras = fetch_all_cameras()
    result  = filter_cameras(cameras, state=state, region=region, bbox=bbox, limit=limit)

    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [c["longitude"], c["latitude"]],
            },
            "properties": {k: v for k, v in c.items()
                           if k not in ("latitude", "longitude")},
        }
        for c in result["cameras"]
    ]

    return {
        "type":     "FeatureCollection",
        "features": features,
        "total":    result["total"],
    }


@router.get("/camera/{camera_id}")
def camera_detail(camera_id: str):
    """
    Returns metadata for a single camera by ID.
    Example: /api/cameras/camera/Axis-DeerCanyon1
    """
    cameras = fetch_all_cameras()
    cam = next((c for c in cameras if c["camera_id"] == camera_id), None)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found")
    return cam


@router.get("/snapshot/{camera_id}")
async def camera_snapshot(camera_id: str):
    """
    Proxies a single MJPEG frame from the ALERTWildfire stream.
    Returns the raw JPEG image (useful for thumbnails).
    """
    stream_url = f"https://{camera_id}.prx.alertwildfire.org"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(stream_url)
            resp.raise_for_status()
            # MJPEG boundary — extract the first frame
            content_type = resp.headers.get("content-type", "")
            if "multipart" in content_type:
                frame = _extract_first_jpeg(resp.content)
            else:
                frame = resp.content
            from fastapi.responses import Response
            return Response(content=frame, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stream unavailable: {e}")


@router.get("/networks")
def list_networks():
    """Returns all available networks and their camera counts."""
    cameras = fetch_all_cameras()
    from collections import Counter
    counts = Counter(c.get("network", "Unknown") for c in cameras)
    return {
        "networks": [{"name": k, "count": v} for k, v in sorted(counts.items())]
    }


@router.get("/regions")
def list_regions():
    """Returns all available regions and their camera counts."""
    cameras = fetch_all_cameras()
    from collections import Counter
    counts = Counter(c.get("region", "unknown") for c in cameras)
    return {
        "regions": [{"name": k, "count": v} for k, v in sorted(counts.items())]
    }


@router.post("/refresh")
def refresh_cameras():
    """Force-refresh the camera list from the S3 feed (clears cache)."""
    cameras = fetch_all_cameras(force_refresh=True)
    return {"status": "refreshed", "camera_count": len(cameras)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_first_jpeg(mjpeg_bytes: bytes) -> bytes:
    """Extract the first JPEG frame from an MJPEG stream response."""
    SOI = b"\xff\xd8"
    EOI = b"\xff\xd9"
    start = mjpeg_bytes.find(SOI)
    if start == -1:
        return mjpeg_bytes
    end = mjpeg_bytes.find(EOI, start)
    if end == -1:
        return mjpeg_bytes[start:]
    return mjpeg_bytes[start: end + 2]
