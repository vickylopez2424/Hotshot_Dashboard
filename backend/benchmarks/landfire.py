"""
Which LANDFIRE fuel versions lfps.usgs.gov serves, and how to make the
app's pipeline use an older one for a historical fire.

elmfire_pipeline.fetch_landscape walks the module-level tuple
elmfire_pipeline.FUEL_VERSIONS (newest first) and returns the first version
that serves the domain. It reads that global at call time, and pack.py calls
the same function, so the harness swaps the tuple for the duration of a run
(see fuel_versions()) instead of editing the pipeline. The version actually
used comes back in result["run"]["landfire_version"] and is what gets
recorded; nothing is assumed.

Probed 2026-09-09 (see probe_versions, cached in data/benchmarks/landfire_versions.json):
  Landfire_LF2016  LF2016 Remap        FBFM40, CC, CH, CBH, CBD for CONUS   (conditions c. 2016)
  Landfire_LF2020  no CONUS fuel ImageServers in that folder
  Landfire_LF2022  LF2022              full CONUS fuel set                  (c. 2022)
  Landfire_LF2023, LF2024, LF2025      full CONUS fuel sets
So a 2017 to 2021 fire gets LF2016 fuels; 2023 gets LF2022; and so on.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path

import httpx

from integrations.predict import elmfire_pipeline as pipe

BENCH_DIR = Path(__file__).resolve().parents[1] / "data" / "benchmarks"
PROBE_CACHE = BENCH_DIR / "landfire_versions.json"

# Reference year of the landscape each version represents.
REF_YEAR = {"LF2016": 2016, "LF2020": 2020, "LF2022": 2022, "LF2023": 2023,
            "LF2024": 2024, "LF2025": 2025}


def probe_versions(region: str = "CONUS", refresh: bool = False) -> dict:
    """{version: {folder, products: [...], complete: bool}} for every Landfire_LF* folder."""
    if PROBE_CACHE.exists() and not refresh:
        cached = json.loads(PROBE_CACHE.read_text())
        if region in cached:
            return cached[region]
    out = {}
    with httpx.Client(timeout=60) as c:
        root = c.get(f"{pipe.LF_BASE}?f=json").json()
        for folder in root.get("folders", []):
            if not folder.startswith("Landfire_LF"):
                continue
            ver = folder.split("_", 1)[1]
            if not ver.startswith("LF") or not ver[2:6].isdigit() or len(ver) != 6:
                continue          # e.g. LF2025_Seasonal_Fuels_2026
            svcs = c.get(f"{pipe.LF_BASE}/{folder}?f=json").json().get("services", [])
            names = {s["name"].split("/")[-1] for s in svcs if s.get("type") == "ImageServer"}
            have = [p for p in pipe.FUEL_PRODUCTS.values() if f"{ver}_{p}_{region}" in names]
            out[ver] = {"folder": folder, "products": have,
                        "complete": len(have) == len(pipe.FUEL_PRODUCTS),
                        "ref_year": REF_YEAR.get(ver, int(ver[2:6]))}
    BENCH_DIR.mkdir(parents=True, exist_ok=True)
    cached = json.loads(PROBE_CACHE.read_text()) if PROBE_CACHE.exists() else {}
    cached[region] = out
    PROBE_CACHE.write_text(json.dumps(cached, indent=2))
    return out


def served_fuel_versions(region: str = "CONUS") -> list[str]:
    """Complete fuel versions, newest reference year first."""
    v = probe_versions(region)
    return sorted((k for k, d in v.items() if d["complete"]), key=lambda k: v[k]["ref_year"], reverse=True)


def fuels_version_for_year(year: int, region: str = "CONUS") -> str | None:
    """Newest served version whose reference year is strictly before the fire year,
    i.e. the landscape as it was before the fire. None if nothing older is served."""
    v = probe_versions(region)
    for ver in served_fuel_versions(region):
        if v[ver]["ref_year"] < year:
            return ver
    return None


@contextmanager
def fuel_versions(preferred: str | None):
    """Make the pipeline try `preferred` first (then its usual list) for the
    duration of the block. The pipeline reports what it really used."""
    orig = pipe.FUEL_VERSIONS
    if preferred:
        pipe.FUEL_VERSIONS = (preferred,) + tuple(v for v in orig if v != preferred)
    try:
        yield
    finally:
        pipe.FUEL_VERSIONS = orig


def run_elmfire(lat: float, lon: float, hours: int, weather: dict, version: str | None,
                run_id: str | None = None, progress=None) -> dict:
    """elmfire_pipeline.run() with the preferred fuel version tried first."""
    with fuel_versions(version):
        return pipe.run(lat, lon, hours, weather, progress=progress, run_id=run_id)


def recover_result(lat: float, lon: float, hours: int, weather: dict, run_id: str, version: str | None) -> dict | None:
    """elmfire_pipeline.run() reads the LAST time_of_arrival_*.tif by name. ELMFIRE
    sometimes writes two dumps (tstop and tstop + 1 s) and the later one is empty, so
    the pipeline raises NoSpread although its own log says the fire burned. This
    rebuilds the result from the raster that actually has burned cells. The
    returned run dict says so in `recovered_from`."""
    import numpy as np
    import rasterio
    from pyproj import Transformer
    from integrations.elmfire.geotiff_processor import process_time_of_arrival

    run_id = "predict_" + run_id
    out_dir = pipe.OUTPUTS_DIR / run_id
    run_dir = pipe.RUNS_DIR / run_id
    src_dir = out_dir if list(out_dir.glob("time_of_arrival_*.tif")) else run_dir / "outputs"
    best, best_n = None, 0
    for f in sorted(src_dir.glob("time_of_arrival_*.tif")):
        with rasterio.open(f) as ds:
            n = int((ds.read(1) >= 0).sum())
        if n > best_n:
            best, best_n = f, n
    if best is None or best_n < 2:
        return None
    geo = process_time_of_arrival(str(best))
    if geo.get("error") or not geo.get("features"):
        return None
    dom = pipe.build_domain(lat, lon, hours)
    region = pipe.landfire_region(lat, lon)
    used = None
    for ver in ((version,) if version else ()) + tuple(pipe.FUEL_VERSIONS):
        if pipe._cache_path("fbfm40", f"Landfire_{ver}/{ver}_FBFM40_{region}", dom).exists():
            used = ver
            break
    x_ign = y_ign = None
    data = (run_dir / "inputs" / "elmfire.data")
    if data.exists():
        import re
        m = re.search(r"X_IGN\(1\)\s*=\s*([\d.]+)", data.read_text()); x_ign = float(m.group(1)) if m else None
        m = re.search(r"Y_IGN\(1\)\s*=\s*([\d.]+)", data.read_text()); y_ign = float(m.group(1)) if m else None
    to_wgs = Transformer.from_crs(dom.crs, "EPSG:4326", always_xy=True)
    ign_used = list(to_wgs.transform(x_ign, y_ign)) if x_ign is not None else [lon, lat]
    snap_m = float(np.hypot(x_ign - dom.x_ign, y_ign - dom.y_ign)) if x_ign is not None else 0.0
    log_tail = (run_dir / "run.log").read_text()[-300:] if (run_dir / "run.log").exists() else ""
    result = dict(geo)
    result.update({"type": "FeatureCollection", "ignition_point": [lon, lat], "source": "elmfire",
                   "run": {"run_id": run_id, "cell_size_m": dom.cell, "domain_km": pipe.DOMAIN_KM[hours],
                           "domain_cells": dom.n, "crs": dom.crs, "bbox": [dom.x0, dom.y0, dom.x1, dom.y1],
                           "landfire_version": f"{used} fuels + LF2020 topography ({region})" if used else "unknown (recovered run)",
                           "landfire_source": pipe.LF_BASE, "ignition_used": [round(v, 6) for v in ign_used],
                           "ignition_snap_m": round(snap_m, 1), "hours": hours, "model_s": None, "elapsed_s": None,
                           "output_dir": str(out_dir), "recovered_from": best.name, "burned_cells": best_n,
                           "recovery_note": "elmfire_pipeline.run() raised NoSpread because the last-named "
                                            "time_of_arrival raster was empty; result rebuilt from the raster with burned cells. "
                                            "Pipeline log tail: " + log_tail.strip().replace("\n", " | ")}})
    return result
