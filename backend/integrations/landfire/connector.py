"""
LANDFIRE Integration
USDA/USDI national vegetation and fire behavior fuel dataset.
30-meter resolution, covers the entire continental US.

Data accessed via LANDFIRE's public ArcGIS services — no API key required.
WMS tiles are served directly to the frontend; backend provides layer info
and point-query capability (what fuel model is at this location?).

Service: https://landfire.cr.usgs.gov/arcgis/rest/services/Landfire/US_220/MapServer
WMS:     https://landfire.cr.usgs.gov/arcgis/services/Landfire/US_220/MapServer/WmsServer
"""
import logging
import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
logger = logging.getLogger(__name__)

LANDFIRE_REST = "https://landfire.cr.usgs.gov/arcgis/rest/services/Landfire/US_220/MapServer"
LANDFIRE_WMS  = "https://landfire.cr.usgs.gov/arcgis/services/Landfire/US_220/MapServer/WmsServer"

# Available WMS layers — layer name as used in WMS requests
LAYERS = [
    {
        "id":    "fbfm40",
        "wms":   "US_220FBFM40",
        "label": "Fuel Model (FBFM40)",
        "desc":  "Scott-Burgan 40 fire behavior fuel models — the standard for fire spread prediction. Shows what type of fuel is present and how it will burn.",
        "rest_layer": 7,
    },
    {
        "id":    "fbfm13",
        "wms":   "US_220FBFM13",
        "label": "Fuel Model (FBFM13)",
        "desc":  "Anderson 13 fire behavior fuel models — classic Northern Forest Fire Lab classification.",
        "rest_layer": 6,
    },
    {
        "id":    "evt",
        "wms":   "US_220EVT",
        "label": "Existing Vegetation Type",
        "desc":  "Current plant community mapped to 700+ types. Shows what species and communities dominate each area.",
        "rest_layer": 14,
    },
    {
        "id":    "evc",
        "wms":   "US_220EVC",
        "label": "Vegetation Cover",
        "desc":  "Percentage of ground covered by existing vegetation. Dense cover = higher fuel continuity.",
        "rest_layer": 12,
    },
    {
        "id":    "cc",
        "wms":   "US_220CC",
        "label": "Canopy Cover",
        "desc":  "Forest canopy closure percentage. Relevant for spotting potential and crown fire risk.",
        "rest_layer": 3,
    },
    {
        "id":    "ch",
        "wms":   "US_220CH",
        "label": "Canopy Height",
        "desc":  "Forest canopy height in meters. Higher canopy with ladder fuels increases crown fire potential.",
        "rest_layer": 4,
    },
]

# Scott-Burgan FBFM40 fuel model descriptions
FUEL_MODEL_INFO = {
    # Grass models
    "GR1": {"name": "Short, sparse dry climate grass",    "risk": "low",     "type": "grass"},
    "GR2": {"name": "Low load dry climate grass",         "risk": "moderate","type": "grass"},
    "GR3": {"name": "Low load very coarse humid climate grass","risk":"moderate","type": "grass"},
    "GR4": {"name": "Moderate load dry climate grass",    "risk": "high",    "type": "grass"},
    "GR5": {"name": "Low load humid climate grass",       "risk": "moderate","type": "grass"},
    "GR6": {"name": "Moderate load humid climate grass",  "risk": "high",    "type": "grass"},
    "GR7": {"name": "High load dry climate grass",        "risk": "extreme", "type": "grass"},
    "GR8": {"name": "High load very coarse humid climate grass","risk":"high","type":"grass"},
    "GR9": {"name": "Very high load humid climate grass", "risk": "extreme", "type": "grass"},
    # Grass-shrub models
    "GS1": {"name": "Low load dry climate grass-shrub",   "risk": "moderate","type": "grass-shrub"},
    "GS2": {"name": "Moderate load dry climate grass-shrub","risk":"high",   "type": "grass-shrub"},
    "GS3": {"name": "Moderate load humid climate grass-shrub","risk":"high", "type": "grass-shrub"},
    "GS4": {"name": "High load humid climate grass-shrub","risk": "extreme", "type": "grass-shrub"},
    # Shrub models
    "SH1": {"name": "Low load dry climate shrub",         "risk": "moderate","type": "shrub"},
    "SH2": {"name": "Moderate load dry climate shrub",    "risk": "high",    "type": "shrub"},
    "SH3": {"name": "Moderate load humid climate shrub",  "risk": "high",    "type": "shrub"},
    "SH4": {"name": "Low load humid climate timber-shrub","risk": "moderate","type": "shrub"},
    "SH5": {"name": "High load dry climate shrub",        "risk": "extreme", "type": "shrub"},
    "SH6": {"name": "Low load humid climate shrub",       "risk": "high",    "type": "shrub"},
    "SH7": {"name": "Very high load dry climate shrub",   "risk": "extreme", "type": "shrub"},
    "SH8": {"name": "High load humid climate shrub",      "risk": "extreme", "type": "shrub"},
    "SH9": {"name": "Very high load humid climate shrub", "risk": "extreme", "type": "shrub"},
    # Timber-understory
    "TU1": {"name": "Low load dry climate timber-grass-shrub","risk":"moderate","type":"timber"},
    "TU2": {"name": "Moderate load humid climate timber-shrub","risk":"moderate","type":"timber"},
    "TU3": {"name": "Moderate load humid climate timber-grass","risk":"high", "type": "timber"},
    "TU4": {"name": "Dwarf conifer understory",           "risk": "high",    "type": "timber"},
    "TU5": {"name": "Very high load dry climate timber-shrub","risk":"extreme","type":"timber"},
    # Timber-litter
    "TL1": {"name": "Low load compact conifer litter",    "risk": "moderate","type": "litter"},
    "TL2": {"name": "Low load broadleaf litter",          "risk": "low",     "type": "litter"},
    "TL3": {"name": "Moderate load conifer litter",       "risk": "moderate","type": "litter"},
    "TL4": {"name": "Small downed logs",                  "risk": "moderate","type": "litter"},
    "TL5": {"name": "High load conifer litter",           "risk": "high",    "type": "litter"},
    "TL6": {"name": "High load broadleaf litter",         "risk": "moderate","type": "litter"},
    "TL7": {"name": "Large downed logs",                  "risk": "high",    "type": "litter"},
    "TL8": {"name": "Long-needle litter",                 "risk": "high",    "type": "litter"},
    "TL9": {"name": "Very high load broadleaf litter",    "risk": "extreme", "type": "litter"},
    # Slash models
    "SB1": {"name": "Low load activity fuel",             "risk": "moderate","type": "slash"},
    "SB2": {"name": "Moderate load activity fuel",        "risk": "high",    "type": "slash"},
    "SB3": {"name": "High load activity fuel",            "risk": "extreme", "type": "slash"},
    "SB4": {"name": "High load humid climate activity fuel","risk":"extreme", "type": "slash"},
    # Non-burnable
    "NB1": {"name": "Urban/developed",                    "risk": "none",    "type": "non-burnable"},
    "NB2": {"name": "Snow/ice",                           "risk": "none",    "type": "non-burnable"},
    "NB3": {"name": "Agricultural",                       "risk": "low",     "type": "non-burnable"},
    "NB8": {"name": "Open water",                         "risk": "none",    "type": "non-burnable"},
    "NB9": {"name": "Bare ground",                        "risk": "none",    "type": "non-burnable"},
}

RISK_COLOR = {
    "none":     "#888888",
    "low":      "#238636",
    "moderate": "#9a6700",
    "high":     "#e05c2a",
    "extreme":  "#cc0000",
}


@router.get("/status")
def status():
    try:
        resp = httpx.get(f"{LANDFIRE_REST}?f=json", timeout=8)
        resp.raise_for_status()
        return {"state": "ready", "source": "LANDFIRE US_220", "auth": "none_required"}
    except Exception:
        return {"state": "unavailable", "source": "LANDFIRE US_220"}


@router.get("/layers")
def list_layers():
    """Available LANDFIRE WMS layers with descriptions."""
    return {"layers": LAYERS, "wms_url": LANDFIRE_WMS}


@router.get("/fuel-models")
def fuel_models():
    """Scott-Burgan FBFM40 descriptions and risk levels."""
    return {"fuel_models": FUEL_MODEL_INFO, "risk_colors": RISK_COLOR}


@router.get("/query")
def query_point(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """
    Returns the LANDFIRE data values at a specific lat/lon point.
    Uses the ArcGIS REST identify endpoint to query raster values.
    """
    # Build a small bounding box around the point for the identify call
    delta = 0.01
    bbox  = f"{lon-delta},{lat-delta},{lon+delta},{lat+delta}"

    results = {}
    for layer in LAYERS[:3]:  # Query top 3 most useful layers
        try:
            resp = httpx.get(
                f"{LANDFIRE_REST}/identify",
                params={
                    "geometry":        f"{lon},{lat}",
                    "geometryType":    "esriGeometryPoint",
                    "tolerance":       2,
                    "mapExtent":       bbox,
                    "imageDisplay":    "400,400,96",
                    "layers":          f"all:{layer['rest_layer']}",
                    "returnGeometry":  "false",
                    "f":               "json",
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            for result in data.get("results", []):
                attrs = result.get("attributes", {})
                value = attrs.get("Pixel Value") or attrs.get("Value")
                results[layer["id"]] = {
                    "layer": layer["label"],
                    "value": value,
                    "fuel_info": FUEL_MODEL_INFO.get(str(value), {}) if layer["id"] == "fbfm40" else None,
                }
        except Exception as e:
            results[layer["id"]] = {"layer": layer["label"], "error": str(e)}

    return {"lat": lat, "lon": lon, "results": results}
