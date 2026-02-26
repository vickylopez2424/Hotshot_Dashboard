"""
WildCAD / IRWIN Integration

Combines two data sources:
  1. NIFC IRWIN ArcGIS API   — current fire incidents + year-to-date trends
  2. WildCAD HTML scraper    — dispatch-level detail (resources, CAD notes)

WildCAD incidents flow into IRWIN automatically, so IRWIN is the primary
source for incident locations and fire data. The WildCAD scraper fills
in dispatcher-specific fields not exposed through IRWIN.
"""
from fastapi import APIRouter, Query
from typing import Optional
from integrations.base import BasePlatformConnector
from integrations.wildcad.irwin import (
    fetch_current_incidents,
    fetch_ytd_incidents,
    compute_trends,
)
from integrations.wildcad.scraper import (
    fetch_center_incidents,
    fetch_wildcad_web,
)

router = APIRouter()


class WildcadConnector(BasePlatformConnector):
    platform_id = "wildcad"
    platform_name = "WildCAD / IRWIN"

    def get_status(self) -> dict:
        return {"state": "ready", "sources": ["NIFC IRWIN ArcGIS", "WildCAD HTML"]}

    def get_data(self) -> dict:
        return fetch_current_incidents()


_connector = WildcadConnector()


# ─── Incident endpoints ───────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Check WildCAD/IRWIN connector status."""
    return _connector.get_status()


@router.get("/incidents")
def current_incidents(
    state:           Optional[str] = Query(None, description="Two-letter state code, e.g. CA"),
    dispatch_center: Optional[str] = Query(None, description="WildCAD dispatch center ID, e.g. CANCA"),
    limit:           int           = Query(500,  description="Max records (NIFC cap: 2000)"),
):
    """
    Returns active wildfire incidents from NIFC IRWIN.
    Filter by state (?state=CA) or dispatch center (?dispatch_center=CANCA).

    Data source: NIFC WFIGS_Incident_Locations_Current (ArcGIS REST)
    Update frequency: ~10 min cache
    """
    return fetch_current_incidents(state=state, dispatch_center=dispatch_center, limit=limit)


@router.get("/incidents/map")
def incidents_for_map(
    state:           Optional[str] = Query(None),
    dispatch_center: Optional[str] = Query(None),
):
    """
    Returns active fire incidents as a GeoJSON FeatureCollection for map rendering.
    Each feature includes size class, containment status, and dispatch center.
    """
    result = fetch_current_incidents(state=state, dispatch_center=dispatch_center)
    incidents = result.get("incidents", [])

    features = []
    for inc in incidents:
        if inc.get("latitude") is None or inc.get("longitude") is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [inc["longitude"], inc["latitude"]],
            },
            "properties": inc,
        })

    return {
        "type":     "FeatureCollection",
        "features": features,
        "count":    len(features),
    }


# ─── Trends endpoints ─────────────────────────────────────────────────────────

@router.get("/trends")
def trends(
    state: Optional[str] = Query(None, description="Filter by state, e.g. CA"),
):
    """
    Returns year-to-date wildfire trend statistics:
      - Monthly incident counts
      - Breakdown by cause (human-caused vs lightning)
      - Breakdown by agency (Federal, State, Private)
      - Top 15 states by incident count
      - Total acreage burned YTD
      - Total incidents YTD

    Data is cached for 1 hour (refreshes YTD stats periodically).
    """
    result = fetch_ytd_incidents(state=state)
    incidents = result.get("incidents", [])
    if "error" in result:
        return {"error": result["error"], "trends": None}
    return {"trends": compute_trends(incidents), "incident_count": len(incidents)}


@router.get("/trends/ytd-incidents")
def ytd_incidents(
    state: Optional[str] = Query(None),
    limit: int           = Query(2000),
):
    """Returns the raw year-to-date incident list (useful for custom analysis)."""
    return fetch_ytd_incidents(state=state, limit=limit)


# ─── WildCAD scraper endpoints ────────────────────────────────────────────────

@router.get("/dispatch")
def dispatch_incidents(
    center_code: Optional[str] = Query(
        None,
        description="WildCAD center code, e.g. WCIDBDC (Boise). "
                    "Leave blank for main WildCADWeb.asp portal. "
                    "Find codes at wildcad.net/WildCADWeb.asp"
    ),
):
    """
    Scrapes WildCAD HTML for dispatch-level incident data.
    Returns resources assigned, CAD notes, and unit status not in IRWIN.

    center_code examples:
      WCIDBDC = Boise Interagency Dispatch Center
      WCNMTDC = Taos Interagency Dispatch Center
      WCCASQF = Sequoia-Kings Canyon
    """
    return fetch_wildcad_web(center_code=center_code)


@router.get("/dispatch/{center_code}")
def dispatch_by_center(center_code: str):
    """
    Scrapes a specific WildCAD center page by code.
    Example: /api/wildcad/dispatch/WCIDBDC
    """
    return fetch_center_incidents(center_code.upper())
