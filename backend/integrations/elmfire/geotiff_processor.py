"""
ELMFIRE GeoTIFF Processor

Converts ELMFIRE raster outputs (time_of_arrival.tif) into GeoJSON
time-step polygon contours suitable for animated map rendering.

ELMFIRE outputs are typically in EPSG:5070 (NAD83 / CONUS Albers).
This module reprojects to EPSG:4326 (WGS84) for Leaflet compatibility.

Output naming convention from ELMFIRE:
  time_of_arrival_XXXXXXX_YYYYYYY.tif
    XXXXXXX = ensemble member ID (7 digits)
    YYYYYYY = simulation time in seconds (7 digits)
"""
import os
import re
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Time interval between contour rings (default 60 minutes)
DEFAULT_INTERVAL_MINUTES = 60

# Simplification tolerance in degrees (~100m at midlatitudes)
SIMPLIFY_TOLERANCE = 0.001


def process_time_of_arrival(
    tif_path: str,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> dict:
    """
    Convert an ELMFIRE time_of_arrival.tif to GeoJSON time-step polygons.

    Each feature in the returned FeatureCollection represents the cumulative
    fire area at one time interval. Rendering all features simultaneously
    creates an animated fire progression.

    Args:
        tif_path        : Absolute path to time_of_arrival GeoTIFF
        interval_minutes: Time between contour steps (default 60 min)

    Returns:
        GeoJSON FeatureCollection with one feature per time step, each
        containing the cumulative burned area up to that time.
        Feature properties include: time_seconds, time_minutes, time_label.
        Top-level property max_time_minutes gives the total simulation time.
    """
    try:
        import rasterio
        from rasterio.warp import calculate_default_transform, reproject, Resampling
        from rasterio.features import shapes as rasterio_shapes
        from rasterio.crs import CRS
        from shapely.geometry import shape, mapping
        from shapely.ops import unary_union
        import numpy as np
    except ImportError as e:
        return {
            "error": (
                f"Missing dependency: {e}. "
                "Install with: pip install rasterio shapely"
            )
        }

    TARGET_CRS = CRS.from_epsg(4326)

    try:
        with rasterio.open(tif_path) as src:
            data = src.read(1).astype("float32")
            src_crs = src.crs
            src_transform = src.transform
            nodata = src.nodata

        # ── Reproject to WGS84 if needed ────────────────────────────────
        if src_crs and src_crs != TARGET_CRS:
            import numpy as np
            transform, width, height = calculate_default_transform(
                src_crs, TARGET_CRS, data.shape[1], data.shape[0],
                *rasterio.open(tif_path).bounds
            )
            reprojected = np.zeros((height, width), dtype="float32")
            reproject(
                source=data,
                destination=reprojected,
                src_transform=src_transform,
                src_crs=src_crs,
                dst_transform=transform,
                dst_crs=TARGET_CRS,
                resampling=Resampling.nearest,
            )
            data = reprojected
            src_transform = transform

        # ── Valid-data mask ──────────────────────────────────────────────
        import numpy as np
        if nodata is not None:
            valid = (data != nodata) & (data > 0)
        else:
            valid = data > 0

        valid_data = data[valid]
        if len(valid_data) == 0:
            logger.warning("time_of_arrival raster contains no valid fire pixels")
            return {
                "type": "FeatureCollection",
                "features": [],
                "max_time_minutes": 0,
            }

        max_time_s = float(valid_data.max())
        interval_s = interval_minutes * 60
        time_steps = np.arange(interval_s, max_time_s + interval_s, interval_s)

        # ── Build GeoJSON contour features ──────────────────────────────
        features = []
        for step in time_steps:
            mask = (valid & (data <= step)).astype(np.uint8)
            if mask.sum() == 0:
                continue

            polygons = [
                shape(geom)
                for geom, val in rasterio_shapes(mask, transform=src_transform)
                if val == 1
            ]
            if not polygons:
                continue

            merged = unary_union(polygons)
            simplified = merged.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

            features.append({
                "type": "Feature",
                "properties": {
                    "time_seconds": int(step),
                    "time_minutes": int(step / 60),
                    "time_label":   _fmt_time(step),
                },
                "geometry": mapping(simplified),
            })

        return {
            "type": "FeatureCollection",
            "features": features,
            "max_time_minutes": int(max_time_s / 60),
        }

    except Exception as e:
        logger.exception("Error processing GeoTIFF: %s", tif_path)
        return {"error": str(e)}


def scan_run_directory(run_dir: str) -> dict:
    """
    Scan an ELMFIRE run output directory and return metadata about
    available raster files and time steps.

    Expected files include:
      time_of_arrival_*.tif
      head_fire_flame_length_*.tif
      fireline_intensity_*.tif
      spread_rate_*.tif

    Returns a dict with keys: run_id, layers, time_steps, toa_file
    """
    run_id = os.path.basename(run_dir)
    layers = []
    toa_file = None

    for fname in sorted(os.listdir(run_dir)):
        if not fname.endswith(".tif"):
            continue
        fpath = os.path.join(run_dir, fname)
        layer_type = _classify_layer(fname)
        if layer_type:
            layers.append({"name": fname, "type": layer_type, "path": fpath})
            if layer_type == "time_of_arrival" and toa_file is None:
                toa_file = fpath

    time_steps = _extract_time_steps(run_dir)

    return {
        "run_id":     run_id,
        "layers":     layers,
        "time_steps": time_steps,
        "toa_file":   toa_file,
        "has_data":   toa_file is not None,
    }


def _classify_layer(fname: str) -> Optional[str]:
    """Map a filename to a known ELMFIRE layer type."""
    patterns = {
        "time_of_arrival":       r"time_of_arrival",
        "flame_length":          r"(head_fire_)?flame_length",
        "fireline_intensity":    r"(fireline_intensity|flin)",
        "spread_rate":           r"spread_rate",
        "surface_fire":          r"surface_fire_occurrence",
        "crown_fire":            r"crown_fire_occurrence",
        "wind_speed":            r"wind_speed",
        "wind_direction":        r"wind_direction",
    }
    for layer_type, pattern in patterns.items():
        if re.search(pattern, fname, re.IGNORECASE):
            return layer_type
    return None


def _extract_time_steps(run_dir: str) -> list:
    """Extract sorted simulation time steps (in seconds) from filenames."""
    times = set()
    for fname in os.listdir(run_dir):
        m = re.search(r"_(\d{7})\.tif$", fname)
        if m:
            times.add(int(m.group(1)))
    return sorted(times)


def _fmt_time(seconds: float) -> str:
    """Format seconds-since-ignition as human-readable string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    if h > 0:
        return f"{h}h {m:02d}m"
    return f"{m}m"
