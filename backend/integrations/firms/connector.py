"""
NASA FIRMS Integration
Fetches active fire detections from NASA FIRMS API.
Docs: https://firms.modaps.eosdis.nasa.gov/api/
"""
import httpx
from fastapi import APIRouter, HTTPException
from config import FIRMS_API_KEY, FIRMS_BASE_URL
from integrations.base import BasePlatformConnector

router = APIRouter()


class FirmsConnector(BasePlatformConnector):
    platform_id = "firms"
    platform_name = "NASA FIRMS"

    def get_status(self) -> dict:
        if not FIRMS_API_KEY:
            return {"state": "no_api_key", "message": "Set FIRMS_API_KEY in .env"}
        return {"state": "ready"}

    def get_data(self) -> dict:
        return self.fetch_active_fires()

    def fetch_active_fires(self, area: str = "world", days: int = 1, source: str = "VIIRS_SNPP_NRT") -> dict:
        """
        Fetch recent fire detections from FIRMS.
        area: 'world' or bounding box 'lon_min,lat_min,lon_max,lat_max'
        days: 1-10
        source: VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | MODIS_NRT
        """
        if not FIRMS_API_KEY:
            return {"fires": [], "error": "FIRMS_API_KEY not set"}

        url = f"{FIRMS_BASE_URL}/area/csv/{FIRMS_API_KEY}/{source}/{area}/{days}"
        try:
            response = httpx.get(url, timeout=15)
            response.raise_for_status()
            fires = _parse_firms_csv(response.text)
            return {"fires": fires, "source": source, "days": days}
        except Exception as e:
            return {"fires": [], "error": str(e)}


def _parse_firms_csv(csv_text: str) -> list:
    """Parse FIRMS CSV response into list of fire dicts."""
    lines = csv_text.strip().split("\n")
    if len(lines) < 2:
        return []
    headers = [h.strip() for h in lines[0].split(",")]
    fires = []
    for line in lines[1:]:
        values = line.split(",")
        if len(values) == len(headers):
            fires.append(dict(zip(headers, values)))
    return fires


_connector = FirmsConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/active")
def active_fires(area: str = "world", days: int = 1):
    """Returns active fire detections as a list of points."""
    return _connector.fetch_active_fires(area=area, days=days)
