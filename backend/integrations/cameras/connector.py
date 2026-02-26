"""
ALERTWildfire Camera Integration
Provides camera metadata and stream URLs for wildfire monitoring cameras.
Networks: ALERTWildfire, HPWREN, ALERT2

Camera data can be loaded from a static config file or fetched from an API.
"""
import json
import os
from fastapi import APIRouter
from integrations.base import BasePlatformConnector

router = APIRouter()

# Path to static camera list JSON (populate as you add cameras)
CAMERAS_CONFIG = os.path.join(os.path.dirname(__file__), "cameras.json")


class CamerasConnector(BasePlatformConnector):
    platform_id = "cameras"
    platform_name = "ALERTWildfire Cameras"

    def get_status(self) -> dict:
        cameras = _load_cameras()
        return {"state": "ready", "camera_count": len(cameras)}

    def get_data(self) -> dict:
        return {"cameras": _load_cameras()}


def _load_cameras() -> list:
    """Load camera list from local config file."""
    if not os.path.exists(CAMERAS_CONFIG):
        return []
    with open(CAMERAS_CONFIG) as f:
        return json.load(f)


_connector = CamerasConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/list")
def list_cameras():
    """Returns all configured wildfire cameras with location and stream info."""
    return {"cameras": _load_cameras()}
