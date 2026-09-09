"""
Observed final perimeters from the NIFC Interagency Fire Perimeter History
layer, as WGS84 shapely geometry, cached under data/benchmarks/perimeters/.
The layer often holds several features per incident (agency duplicates and
small slivers); the largest GIS_ACRES feature is taken.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
from shapely.geometry import shape, mapping
from shapely.validation import make_valid

BENCH_DIR = Path(__file__).resolve().parents[1] / "data" / "benchmarks"
CACHE_DIR = BENCH_DIR / "perimeters"
NIFC_URL = ("https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
            "InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0/query")


def fetch(incident: str, fire_year: str, key: str | None = None, refresh: bool = False) -> dict:
    """{"geometry": shapely (WGS84), "gis_acres", "source", "agency", "n_features", "url", "path"}"""
    key = key or f"{incident.lower()}{fire_year}"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key}.geojson"
    where = f"UPPER(INCIDENT)='{incident.upper()}' AND FIRE_YEAR='{fire_year}'"
    params = {"where": where, "outFields": "*", "returnGeometry": "true", "outSR": "4326", "f": "geojson"}
    url = str(httpx.URL(NIFC_URL, params=params))
    if path.exists() and not refresh:
        feat = json.loads(path.read_text())
    else:
        r = httpx.get(NIFC_URL, params=params, timeout=120)
        r.raise_for_status()
        fc = r.json()
        feats = fc.get("features") or []
        if not feats:
            raise RuntimeError(f"NIFC returned no perimeter for {incident} {fire_year} ({url})")
        best = max(feats, key=lambda f: (f.get("properties") or {}).get("GIS_ACRES") or 0)
        best["properties"]["_n_features"] = len(feats)
        best["properties"]["_query_url"] = url
        path.write_text(json.dumps(best))
        feat = best
    geom = make_valid(shape(feat["geometry"]))
    p = feat["properties"]
    return {"geometry": geom, "gis_acres": p.get("GIS_ACRES"), "source": p.get("SOURCE"),
            "agency": p.get("AGENCY"), "n_features": p.get("_n_features"), "url": url, "path": str(path),
            "layer": "NIFC InterAgencyFirePerimeterHistory_All_Years_View"}
