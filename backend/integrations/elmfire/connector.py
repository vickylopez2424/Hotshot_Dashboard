"""
ELMFIRE Integration
Serves wildfire spread predictions from ELMFIRE simulation outputs.

ELMFIRE (Eulerian Level set Method FIRE spread model) is a physics-based
wildfire spread prediction tool.
GitHub: https://github.com/lautenberger/elmfire
Docs:   https://elmfire.io/

How it works:
  1. ELMFIRE runs (locally or on HPC) and writes GeoTIFF outputs to
     the directory configured as ELMFIRE_OUTPUT_DIR.
  2. This connector watches that directory, detects completed runs,
     and converts time_of_arrival.tif → GeoJSON time-step contours.
  3. The map layer renders the contours as an animated fire progression.
  4. Optional: trigger new ELMFIRE runs via the /trigger endpoint
     if the ELMFIRE binary is available.

Output directory structure expected:
  ELMFIRE_OUTPUT_DIR/
  └── <run_id>/
      ├── time_of_arrival_0000001_XXXXXXX.tif   ← primary
      ├── head_fire_flame_length_NNN.tif
      ├── fireline_intensity_NNN.tif
      └── spread_rate_NNN.tif
"""
import os
import json
import subprocess
import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from config import ELMFIRE_OUTPUT_DIR, ELMFIRE_BINARY
from integrations.base import BasePlatformConnector
from integrations.elmfire.geotiff_processor import (
    process_time_of_arrival,
    scan_run_directory,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Simple in-memory prediction cache: run_id -> geojson dict
_prediction_cache: dict = {}


class ElmfireConnector(BasePlatformConnector):
    platform_id = "elmfire"
    platform_name = "ELMFIRE"

    def get_status(self) -> dict:
        if not os.path.isdir(ELMFIRE_OUTPUT_DIR):
            return {
                "state": "no_output_dir",
                "message": (
                    f"Output directory not found: {ELMFIRE_OUTPUT_DIR}. "
                    "Set ELMFIRE_OUTPUT_DIR in .env to point to your ELMFIRE outputs."
                ),
                "binary_available": _binary_available(),
            }
        runs = _list_runs()
        return {
            "state":            "ready",
            "run_count":        len(runs),
            "binary_available": _binary_available(),
            "output_dir":       ELMFIRE_OUTPUT_DIR,
        }

    def get_data(self) -> dict:
        return {"runs": _list_runs()}

    def get_prediction_geojson(self, run_id: Optional[str] = None) -> dict:
        """
        Return the time_of_arrival GeoJSON for a specific run (or the latest).
        Results are cached in memory per run_id.
        """
        runs = _list_runs()
        if not runs:
            return {"type": "FeatureCollection", "features": [], "max_time_minutes": 0}

        if run_id:
            target = next((r for r in runs if r["id"] == run_id), None)
            if not target:
                raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
        else:
            target = runs[0]  # most recent

        # Check for hand-placed GeoJSON first (allows manual upload workflow)
        geojson_path = os.path.join(ELMFIRE_OUTPUT_DIR, target["id"], "fire_perimeter.geojson")
        if os.path.exists(geojson_path):
            if target["id"] not in _prediction_cache:
                with open(geojson_path) as f:
                    _prediction_cache[target["id"]] = json.load(f)
            return _prediction_cache[target["id"]]

        # Process from GeoTIFF if available
        toa_file = target.get("toa_file")
        if toa_file and os.path.exists(toa_file):
            if target["id"] not in _prediction_cache:
                logger.info("Processing GeoTIFF for run %s", target["id"])
                _prediction_cache[target["id"]] = process_time_of_arrival(toa_file)
            return _prediction_cache[target["id"]]

        return {"type": "FeatureCollection", "features": [], "max_time_minutes": 0}


def _list_runs() -> list:
    """Scan ELMFIRE output directory for completed run folders."""
    if not os.path.isdir(ELMFIRE_OUTPUT_DIR):
        return []

    runs = []
    for entry in sorted(
        os.scandir(ELMFIRE_OUTPUT_DIR),
        key=lambda e: e.stat().st_mtime,
        reverse=True,
    ):
        if not entry.is_dir():
            continue
        meta = scan_run_directory(entry.path)
        runs.append({
            "id":          entry.name,
            "name":        entry.name,
            "started_at":  _mtime_iso(entry.path),
            "status":      "complete",
            "has_data":    meta["has_data"],
            "layers":      [l["type"] for l in meta["layers"]],
            "toa_file":    meta.get("toa_file"),
        })
    return runs


def _binary_available() -> bool:
    """Check whether the ELMFIRE binary is on the PATH."""
    import shutil
    return bool(shutil.which(ELMFIRE_BINARY))


def _mtime_iso(path: str) -> str:
    t = os.path.getmtime(path)
    return datetime.datetime.fromtimestamp(t).isoformat()


_connector = ElmfireConnector()


# ─── API Endpoints ────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Check ELMFIRE connector status and output directory."""
    return _connector.get_status()


@router.get("/runs")
def list_runs():
    """
    List available ELMFIRE prediction runs found in ELMFIRE_OUTPUT_DIR.
    Each entry shows the run ID, timestamp, and available data layers.
    """
    runs = _list_runs()
    return {"runs": runs, "count": len(runs)}


@router.get("/prediction")
def latest_prediction(interval_minutes: int = 60):
    """
    Returns the most recent ELMFIRE fire spread prediction as GeoJSON.

    The GeoJSON contains one Feature per time step (spaced interval_minutes apart).
    Each feature is the cumulative burned area polygon up to that time.
    Use the time slider in the frontend to animate the fire progression.

    interval_minutes: time between contour steps (default 60).
    """
    return _connector.get_prediction_geojson()


@router.get("/prediction/{run_id}")
def run_prediction(run_id: str, interval_minutes: int = 60):
    """
    Returns the fire spread prediction for a specific run by ID.
    """
    return _connector.get_prediction_geojson(run_id=run_id)


@router.get("/runs/{run_id}/layers")
def run_layers(run_id: str):
    """
    List available raster layers for a specific run.
    Returns layer names and types (flame_length, fireline_intensity, etc.)
    """
    run_dir = os.path.join(ELMFIRE_OUTPUT_DIR, run_id)
    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return scan_run_directory(run_dir)


@router.post("/trigger")
def trigger_run(background_tasks: BackgroundTasks, config_file: str = ""):
    """
    Trigger a new ELMFIRE simulation run (requires ELMFIRE binary installed).
    Set ELMFIRE_BINARY in .env to the path of your elmfire executable.

    config_file: optional path to .nml config file. Uses default if blank.
    """
    if not _binary_available():
        raise HTTPException(
            status_code=503,
            detail=(
                f"ELMFIRE binary '{ELMFIRE_BINARY}' not found. "
                "Install ELMFIRE and set ELMFIRE_BINARY in .env."
            ),
        )
    run_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join(ELMFIRE_OUTPUT_DIR, run_id)
    os.makedirs(run_dir, exist_ok=True)

    background_tasks.add_task(_run_elmfire, run_id, run_dir, config_file)
    return {"status": "triggered", "run_id": run_id}


def _run_elmfire(run_id: str, run_dir: str, config_file: str):
    """Execute ELMFIRE as a background subprocess."""
    cmd = [ELMFIRE_BINARY]
    if config_file:
        cmd.append(config_file)
    logger.info("Starting ELMFIRE run %s: %s", run_id, " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            cwd=run_dir,
            capture_output=True,
            text=True,
            timeout=3600,  # 1-hour timeout
        )
        if result.returncode != 0:
            logger.error("ELMFIRE run %s failed: %s", run_id, result.stderr)
        else:
            logger.info("ELMFIRE run %s complete", run_id)
    except subprocess.TimeoutExpired:
        logger.error("ELMFIRE run %s timed out after 1 hour", run_id)
    except Exception as e:
        logger.exception("ELMFIRE run %s error: %s", run_id, e)
