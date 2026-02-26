"""
ELMFIRE Integration
Reads ELMFIRE wildfire spread prediction outputs (GeoTIFF/GeoJSON).
ELMFIRE repo: https://github.com/lautenberger/elmfire

ELMFIRE runs produce output files in the configured output directory.
This connector reads those files and serves them as GeoJSON for the map.
"""
import os
import json
import glob
from fastapi import APIRouter
from config import ELMFIRE_OUTPUT_DIR
from integrations.base import BasePlatformConnector

router = APIRouter()


class ElmfireConnector(BasePlatformConnector):
    platform_id = "elmfire"
    platform_name = "ELMFIRE"

    def get_status(self) -> dict:
        if not os.path.isdir(ELMFIRE_OUTPUT_DIR):
            return {
                "state": "no_output_dir",
                "message": f"Output directory not found: {ELMFIRE_OUTPUT_DIR}",
            }
        runs = _list_runs()
        return {"state": "ready", "run_count": len(runs)}

    def get_data(self) -> dict:
        return {"runs": _list_runs()}

    def get_latest_geojson(self) -> dict | None:
        """Load the most recent ELMFIRE prediction as GeoJSON."""
        runs = _list_runs()
        if not runs:
            return None
        latest = runs[0]
        geojson_path = os.path.join(ELMFIRE_OUTPUT_DIR, latest["id"], "fire_perimeter.geojson")
        if not os.path.exists(geojson_path):
            return None
        with open(geojson_path) as f:
            return json.load(f)


def _list_runs() -> list:
    """Scan output directory for completed ELMFIRE runs."""
    if not os.path.isdir(ELMFIRE_OUTPUT_DIR):
        return []
    runs = []
    for entry in sorted(os.scandir(ELMFIRE_OUTPUT_DIR), key=lambda e: e.stat().st_mtime, reverse=True):
        if entry.is_dir():
            runs.append({
                "id": entry.name,
                "name": entry.name,
                "started_at": _mtime(entry.path),
                "status": "complete",
            })
    return runs


def _mtime(path: str) -> str:
    import datetime
    t = os.path.getmtime(path)
    return datetime.datetime.fromtimestamp(t).isoformat()


_connector = ElmfireConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/runs")
def list_runs():
    """List available ELMFIRE prediction runs."""
    return {"runs": _list_runs()}


@router.get("/prediction")
def latest_prediction():
    """
    Returns the most recent ELMFIRE fire spread prediction as GeoJSON.
    Place output files in ELMFIRE_OUTPUT_DIR/<run_id>/fire_perimeter.geojson
    """
    geojson = _connector.get_latest_geojson()
    if not geojson:
        return {"type": "FeatureCollection", "features": []}
    return geojson
