"""
NIFC / IRWIN ArcGIS REST API connector

IRWIN (Integrated Reporting of Wildland-fire Information) is the federal
data exchange hub that WildCAD, WFDSS, IROC, and other fire applications
feed incident data into.

NIFC publishes this data publicly via ArcGIS FeatureServer endpoints:
  Current incidents: WFIGS_Incident_Locations_Current (active fires now)
  YTD incidents:     CY_WildlandFire_Locations_ToDate (current year, for trends)

No authentication is required for these public endpoints.
Docs: https://data-nifc.opendata.arcgis.com/
"""
import time
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ─── NIFC ArcGIS REST endpoints ───────────────────────────────────────────────
# Hosted in the NIFC ArcGIS Online org (T4QMspbfLg3qTGWY). Service names per
# the NIFC Open Data site: https://data-nifc.opendata.arcgis.com/
NIFC_BASE = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services"

ENDPOINTS = {
    # Active / current fire incidents
    "current": f"{NIFC_BASE}/WFIGS_Incident_Locations_Current/FeatureServer/0/query",
    # Year-to-date (used for trends)
    "ytd":     f"{NIFC_BASE}/WFIGS_Incident_Locations_YearToDate/FeatureServer/0/query",
}

# Fire weather only — exclude prescribed burns, non-fire
WILDFIRE_FILTER = "IncidentTypeCategory='WF'"

# Fields we care about (subset of full IRWIN schema)
INCIDENT_FIELDS = ",".join([
    "IrwinID",
    "IncidentName",
    "POOState",
    "POOCounty",
    "POOLandownerCategory",
    "IncidentTypeCategory",
    "FireDiscoveryDateTime",
    "ContainmentDateTime",
    "ControlDateTime",
    "IncidentSize",          # current acreage (WFIGS renamed this from DailyAcres)
    "InitialResponseAcres",
    "FireCause",
    "FireCauseGeneral",
    "TotalIncidentPersonnel",
    "DispatchCenterID",
    "POOJurisdictionalUnit",
    "IsMultiJurisdictional",
    "PercentContained",
    "UniqueFireIdentifier",
])

# Simple TTL cache
_cache: dict = {}
CACHE_TTL = 600  # 10 minutes


def _cached(key: str, fetch_fn, ttl: int = CACHE_TTL):
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < ttl:
        return _cache[key]["data"]
    data = fetch_fn()
    _cache[key] = {"data": data, "ts": now}
    return data


# ─── Public functions ─────────────────────────────────────────────────────────

def fetch_current_incidents(
    state: Optional[str] = None,
    dispatch_center: Optional[str] = None,
    limit: int = 500,
) -> dict:
    """
    Fetch active wildfire incidents from NIFC WFIGS.

    state           : two-letter postal code, e.g. 'CA'
    dispatch_center : DispatchCenterID filter, e.g. 'CANCA'
    limit           : max records returned (NIFC cap is 2000)
    """
    cache_key = f"current:{state}:{dispatch_center}:{limit}"
    return _cached(cache_key, lambda: _query_incidents(
        endpoint=ENDPOINTS["current"],
        state=state,
        dispatch_center=dispatch_center,
        limit=limit,
    ))


def fetch_ytd_incidents(
    state: Optional[str] = None,
    limit: int = 2000,
) -> dict:
    """
    Fetch year-to-date wildfire incidents for trends analysis.
    """
    cache_key = f"ytd:{state}:{limit}"
    return _cached(cache_key, lambda: _query_incidents(
        endpoint=ENDPOINTS["ytd"],
        state=state,
        limit=limit,
        ttl_override=3600,  # cache trends for 1 hour
    ), ttl=3600)


def compute_trends(incidents: list) -> dict:
    """
    Compute trend statistics from a list of incident dicts.
    Returns monthly counts, cause breakdown, agency breakdown,
    state breakdown, and cumulative acreage.
    """
    from collections import defaultdict

    by_month   = defaultdict(int)
    by_cause   = defaultdict(int)
    by_agency  = defaultdict(int)
    by_state   = defaultdict(int)
    total_acres = 0
    contained   = 0

    for inc in incidents:
        # Monthly
        dt = inc.get("discovery_epoch")
        if dt:
            import datetime
            d = datetime.datetime.utcfromtimestamp(dt / 1000)
            key = d.strftime("%Y-%m")
            by_month[key] += 1

        # Cause
        cause = inc.get("cause_general") or inc.get("cause") or "Unknown"
        by_cause[cause] += 1

        # Agency
        agency = inc.get("landowner_category") or "Unknown"
        by_agency[agency] += 1

        # State
        state = inc.get("state") or "Unknown"
        by_state[state] += 1

        # Acreage
        acres = inc.get("daily_acres") or 0
        try:
            total_acres += float(acres)
        except (TypeError, ValueError):
            pass

        # Containment
        if inc.get("containment_datetime"):
            contained += 1

    # Sort monthly by key
    sorted_months = sorted(by_month.items())

    return {
        "by_month":    [{"month": k, "count": v} for k, v in sorted_months],
        "by_cause":    [{"cause": k,  "count": v} for k, v in sorted(by_cause.items(),  key=lambda x: -x[1])],
        "by_agency":   [{"agency": k, "count": v} for k, v in sorted(by_agency.items(), key=lambda x: -x[1])],
        "by_state":    [{"state": k,  "count": v} for k, v in sorted(by_state.items(),  key=lambda x: -x[1])[:15]],
        "total_incidents": len(incidents),
        "total_acres":     round(total_acres, 1),
        "contained_count": contained,
    }


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _query_incidents(
    endpoint: str,
    state: Optional[str] = None,
    dispatch_center: Optional[str] = None,
    limit: int = 500,
    ttl_override: Optional[int] = None,
) -> dict:
    where_clauses = [WILDFIRE_FILTER]
    if state:
        where_clauses.append(f"POOState='US-{state.upper()}'")
    if dispatch_center:
        where_clauses.append(f"DispatchCenterID='{dispatch_center.upper()}'")

    params = {
        "where":           " AND ".join(where_clauses),
        "outFields":       INCIDENT_FIELDS,
        "returnGeometry":  "true",
        "geometryType":    "esriGeometryPoint",
        "outSR":           "4326",
        "f":               "json",
        "resultRecordCount": limit,
    }

    try:
        resp = httpx.get(endpoint, params=params, timeout=20)
        resp.raise_for_status()
        raw = resp.json()

        if "error" in raw:
            return {
                "incidents": [],
                "error": raw["error"].get("message", "ArcGIS API error"),
            }

        incidents = [_parse_feature(f) for f in raw.get("features", [])]
        return {"incidents": incidents, "count": len(incidents)}

    except httpx.HTTPError as e:
        logger.error("NIFC API HTTP error: %s", e)
        return {"incidents": [], "error": f"HTTP error: {e}"}
    except Exception as e:
        logger.exception("NIFC API error")
        return {"incidents": [], "error": str(e)}


def _parse_feature(feature: dict) -> dict:
    """Normalize an ArcGIS feature into a clean incident dict."""
    attrs = feature.get("attributes", {})
    geom  = feature.get("geometry") or {}

    return {
        "id":                  attrs.get("IrwinID") or attrs.get("UniqueFireIdentifier"),
        "name":                attrs.get("IncidentName", "Unknown Fire"),
        "state":               _strip_us(attrs.get("POOState", "")),
        "county":              attrs.get("POOCounty", ""),
        "dispatch_center":     attrs.get("DispatchCenterID", ""),
        "jurisdictional_unit": attrs.get("POOJurisdictionalUnit", ""),
        "landowner_category":  attrs.get("POOLandownerCategory", ""),
        "daily_acres":         attrs.get("IncidentSize"),
        "initial_acres":       attrs.get("InitialResponseAcres"),
        "percent_contained":   attrs.get("PercentContained"),
        "personnel":           attrs.get("TotalIncidentPersonnel"),
        "cause":               attrs.get("FireCause", ""),
        "cause_general":       attrs.get("FireCauseGeneral", ""),
        "discovery_epoch":     attrs.get("FireDiscoveryDateTime"),
        "containment_datetime":attrs.get("ContainmentDateTime"),
        "control_datetime":    attrs.get("ControlDateTime"),
        "is_multi_juris":      attrs.get("IsMultiJurisdictional", False),
        "latitude":            geom.get("y"),
        "longitude":           geom.get("x"),
        # Computed helpers
        "is_contained":        attrs.get("ContainmentDateTime") is not None,
        "size_class":          _size_class(attrs.get("IncidentSize")),
    }


def _strip_us(state_str: str) -> str:
    """Convert 'US-CA' → 'CA'."""
    return state_str.replace("US-", "") if state_str else ""


def _size_class(acres) -> str:
    """NWCG fire size class from acreage."""
    if acres is None:
        return "Unknown"
    try:
        a = float(acres)
    except (TypeError, ValueError):
        return "Unknown"
    if a < 0.25:   return "A (< 0.25 ac)"
    if a < 10:     return "B (0.25–10 ac)"
    if a < 100:    return "C (10–100 ac)"
    if a < 300:    return "D (100–300 ac)"
    if a < 1000:   return "E (300–1k ac)"
    if a < 5000:   return "F (1k–5k ac)"
    return "G (5k+ ac)"
