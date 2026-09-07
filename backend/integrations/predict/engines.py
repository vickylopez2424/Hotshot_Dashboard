"""
Spread engines. One interface, two implementations:

  elmfire  the real model, run through prediction/run_elmfire.sh (Docker).
           Raises EngineUnavailable until that script exists.
  sample   the bundled sample shape moved to the ignition point. Exists only so
           the screen can be built and demoed before the model is connected.
           Every response from it is stamped source="sample" and the UI shows
           that badge. It must never be presented as a model run.

Both return a GeoJSON FeatureCollection of cumulative burned-area polygons,
one per time step, with properties.time_minutes and properties.time_label.
"""
import math
import os
import subprocess
import logging
from pathlib import Path
from shapely.geometry import shape, Point
from shapely.ops import transform
from pyproj import Transformer

logger = logging.getLogger(__name__)

RUNNER = Path(__file__).resolve().parents[3] / "prediction" / "run_elmfire.sh"


class EngineUnavailable(Exception):
    pass


def _label(minutes: int) -> str:
    h, m = divmod(int(minutes), 60)
    return f"{h}h {m:02d}m"


# ── sample ─────────────────────────────────────────────────────────────────
def run_sample(lat: float, lon: float, hours: int, weather: dict, progress=None) -> dict:
    from integrations.elmfire.connector import ElmfireConnector
    base = ElmfireConnector().get_prediction_geojson("sample_run")
    ig = base.get("ignition_point")
    if not ig:
        # centre of the first ring is as good an ignition point as any
        first = shape(base["features"][0]["geometry"]).centroid
        ig = [first.x, first.y]
    dx, dy = lon - ig[0], lat - ig[1]
    base_max = base.get("max_time_minutes") or 360
    target_max = hours * 60
    scale = 1.0  # keep the sample's real footprint; only the time labels are re-stamped

    feats = []
    for f in base.get("features", []):
        t = int(round(f["properties"]["time_minutes"] * target_max / base_max))
        coords = f["geometry"]["coordinates"]

        def mv(ring):
            return [[lon + (x - ig[0]) * scale, lat + (y - ig[1]) * scale] for x, y in ring]
        geom = {"type": "Polygon", "coordinates": [mv(r) for r in coords]}
        feats.append({"type": "Feature",
                      "properties": {"time_minutes": t, "time_seconds": t * 60, "time_label": _label(t)},
                      "geometry": geom})
    return {"type": "FeatureCollection", "features": feats,
            "max_time_minutes": target_max, "ignition_point": [lon, lat], "source": "sample"}


# ── elmfire ────────────────────────────────────────────────────────────────
def run_elmfire(lat: float, lon: float, hours: int, weather: dict, progress=None) -> dict:
    if not RUNNER.exists() or not os.access(RUNNER, os.X_OK):
        raise EngineUnavailable("ELMFIRE is not connected yet. prediction/run_elmfire.sh is missing.")
    raise EngineUnavailable("ELMFIRE runner exists but the input pipeline (LANDFIRE clip + weather table) is not built yet.")


ENGINES = {"sample": run_sample, "elmfire": run_elmfire}


# ── summary numbers ────────────────────────────────────────────────────────
def summarize_result(result: dict, lat: float, lon: float, weather_summary: dict) -> dict:
    feats = result.get("features") or []
    if not feats:
        return {}
    last = max(feats, key=lambda f: f["properties"]["time_minutes"])
    poly = shape(last["geometry"])
    # local equal-area projection centred on the ignition point
    tr = Transformer.from_crs("EPSG:4326", f"+proj=laea +lat_0={lat} +lon_0={lon} +units=m", always_xy=True)
    poly_m = transform(tr.transform, poly)
    acres = poly_m.area / 4046.856
    c = poly_m.centroid
    bearing = (math.degrees(math.atan2(c.x, c.y)) + 360) % 360
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    compass = dirs[int((bearing + 22.5) // 45) % 8]
    # farthest run from ignition, in miles
    far = max(Point(x, y).distance(Point(0, 0)) for x, y in poly_m.exterior.coords) / 1609.34
    return {
        "acres_at_horizon": round(acres),
        "horizon_minutes":  last["properties"]["time_minutes"],
        "spread_bearing":   round(bearing),
        "spread_dir":       compass,
        "max_run_miles":    round(far, 2),
        "wind_mph":         weather_summary.get("now_wind_mph"),
        "wind_dir":         weather_summary.get("now_wind_dir"),
        "peak_wind_mph":    weather_summary.get("peak_wind_mph"),
        "min_rh_pct":       weather_summary.get("min_rh_pct"),
        "source":           result.get("source", "unknown"),
    }
