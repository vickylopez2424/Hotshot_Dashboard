"""
Score an engine's hourly rings against what really happened.

Areas are measured in EPSG:5070 (CONUS Albers equal-area) with pyproj.

At the final horizon the comparison is polygon to polygon: Sorensen
2|A n B| / (|A| + |B|) and Jaccard |A n B| / |A u B| against the observed
final perimeter. At earlier horizons the final perimeter is not what the fire
looked like, so the primary number is the area ratio against the acres the
timeline gives for that hour, and Sorensen / Jaccard against the final
perimeter are reported only as a "containment" measure (how much of the
prediction lies where the fire eventually burned), labelled as such.
"""
from __future__ import annotations

import math

from pyproj import Transformer
from shapely.geometry import shape, Point, box
from shapely.ops import transform
from shapely.validation import make_valid

M2_PER_ACRE = 4046.856
_EA = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)


def to_ea(geom_wgs84):
    return make_valid(transform(_EA.transform, geom_wgs84))


def acres(geom_ea) -> float:
    return geom_ea.area / M2_PER_ACRE


def ring_at(result: dict, hours: float):
    """(WGS84 geometry, minutes) of the cumulative ring nearest to `hours`
    without going past it (falls back to the first ring for sub-hour times)."""
    feats = [f for f in (result or {}).get("features") or [] if f.get("geometry")]
    if not feats:
        return None, None
    want = hours * 60
    at_or_before = [f for f in feats if f["properties"]["time_minutes"] <= want + 1e-6]
    f = max(at_or_before, key=lambda f: f["properties"]["time_minutes"]) if at_or_before \
        else min(feats, key=lambda f: f["properties"]["time_minutes"])
    return make_valid(shape(f["geometry"])), f["properties"]["time_minutes"]


def overlap(pred_ea, obs_ea) -> dict:
    inter = pred_ea.intersection(obs_ea).area
    a, b = pred_ea.area, obs_ea.area
    union = a + b - inter
    return {"sorensen": 2 * inter / (a + b) if (a + b) else None,
            "jaccard": inter / union if union else None,
            "fraction_inside": inter / a if a else None}


def max_run_km(geom_ea, ignition_lonlat) -> float:
    ign = Point(_EA.transform(*ignition_lonlat))
    pts = []

    def walk(g):
        if g.geom_type == "Polygon":
            pts.extend(g.exterior.coords)
        elif hasattr(g, "geoms"):          # MultiPolygon or GeometryCollection from make_valid
            for sub in g.geoms:
                walk(sub)
    walk(geom_ea)
    return max((ign.distance(Point(p)) for p in pts), default=0.0) / 1000


def touches_edge(result: dict, hours: float, cell_m: float = 30, margin_cells: int = 2) -> bool:
    """True if the ring at `hours` comes within margin_cells of the model domain edge."""
    run = (result or {}).get("run") or {}
    bbox, crs = run.get("bbox"), run.get("crs")
    if not bbox or not crs:
        return False
    geom, _ = ring_at(result, hours)
    if geom is None:
        return False
    tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    g = transform(tr.transform, geom)
    inner = box(bbox[0] + margin_cells * cell_m, bbox[1] + margin_cells * cell_m,
                bbox[2] - margin_cells * cell_m, bbox[3] - margin_cells * cell_m)
    return not inner.contains(g)


def score_horizon(result: dict, horizon_hours: float, observed_final_wgs84, observed_acres: float | None,
                  is_final: bool, ignition_lonlat, cell_m: float = 30) -> dict:
    geom, minutes = ring_at(result, horizon_hours)
    if geom is None:
        return {"horizon_hours": horizon_hours, "predicted_acres": 0.0, "observed_acres": observed_acres,
                "area_ratio": 0.0 if observed_acres else None, "error": "no ring"}
    pred_ea = to_ea(geom)
    obs_ea = to_ea(observed_final_wgs84)
    pred_acres = acres(pred_ea)
    ov = overlap(pred_ea, obs_ea)
    out = {
        "horizon_hours": horizon_hours,
        "ring_minutes": minutes,
        "predicted_acres": round(pred_acres, 1),
        "observed_acres": observed_acres,
        "area_ratio": round(pred_acres / observed_acres, 4) if observed_acres else None,
        "final_perimeter_acres": round(acres(obs_ea), 1),
        "sorensen": round(ov["sorensen"], 4) if ov["sorensen"] is not None else None,
        "jaccard": round(ov["jaccard"], 4) if ov["jaccard"] is not None else None,
        "fraction_inside_final": round(ov["fraction_inside"], 4) if ov["fraction_inside"] is not None else None,
        "overlap_meaning": ("final perimeter comparison" if is_final else
                            "containment: overlap with the FINAL perimeter, not the perimeter at this hour"),
        "max_run_km": round(max_run_km(pred_ea, ignition_lonlat), 2),
        "left_domain": touches_edge(result, horizon_hours, cell_m),
    }
    return out


def progression_table(result: dict, progression: list, ignition_lonlat) -> list[dict]:
    """Camp-style timeline rows (hours, acres and/or run_km) against the prediction."""
    rows = []
    for p in progression or []:
        h = float(p["hours"])
        geom, minutes = ring_at(result, h)
        row = {"hours": h, "at": p.get("at"), "note": p.get("note"), "source": p.get("source"),
               "observed_acres": p.get("acres"), "observed_run_km": p.get("run_km")}
        if geom is None:
            row.update({"predicted_acres": None, "predicted_run_km": None, "ring_minutes": None})
        else:
            ea = to_ea(geom)
            row.update({"ring_minutes": minutes, "predicted_acres": round(acres(ea)),
                        "predicted_run_km": round(max_run_km(ea, ignition_lonlat), 1)})
            if p.get("acres"):
                row["area_ratio"] = round(row["predicted_acres"] / p["acres"], 3)
        rows.append(row)
    return rows
