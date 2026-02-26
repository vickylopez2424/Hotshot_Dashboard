"""
TEMPLATE: Copy this folder to integrations/<your_platform_id>/
and fill in the implementation.

Steps:
  1. Copy this folder: cp -r _template <your_platform_id>
  2. Rename the class and fill in get_status / get_data
  3. Add your API endpoints to the router
  4. Mount the router in main.py
  5. Add the platform to frontend/src/config/platforms.js
  6. Create the map layer in frontend/src/components/Map/layers/
  7. Create the panel in frontend/src/components/<YourPlatform>/
"""
from fastapi import APIRouter
from integrations.base import BasePlatformConnector

router = APIRouter()


class TemplatePlatformConnector(BasePlatformConnector):
    platform_id = "template"
    platform_name = "Template Platform"

    def get_status(self) -> dict:
        return {"state": "stub", "message": "Not yet implemented"}

    def get_data(self) -> dict:
        return {"items": []}


_connector = TemplatePlatformConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/data")
def data():
    return _connector.get_data()
