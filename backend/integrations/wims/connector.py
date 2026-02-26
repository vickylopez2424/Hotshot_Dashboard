"""
WIMS / RAWS Fire Weather Station Integration
Fetches weather data from the Weather Information Management System (WIMS)
and Remote Automated Weather Stations (RAWS).

Data source: NRCS Web Services / WIMS API
Docs: https://www.wcc.nrcs.usda.gov/webwims/
"""
import httpx
from fastapi import APIRouter
from config import WIMS_BASE_URL
from integrations.base import BasePlatformConnector

router = APIRouter()


class WimsConnector(BasePlatformConnector):
    platform_id = "wims"
    platform_name = "WIMS/RAWS"

    def get_status(self) -> dict:
        return {"state": "stub", "message": "WIMS API integration in progress"}

    def get_data(self) -> dict:
        return self.fetch_stations()

    def fetch_stations(self, state: str = "CA") -> dict:
        """
        Fetch RAWS weather station list and current readings.
        state: two-letter state code (e.g. 'CA', 'OR', 'WA')
        """
        # TODO: Implement full WIMS API call
        # Reference: https://www.wcc.nrcs.usda.gov/webwims/
        return {
            "stations": [],
            "state": state,
            "message": "WIMS API integration pending — add API call here",
        }


_connector = WimsConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/stations")
def list_stations(state: str = "CA"):
    """Returns WIMS/RAWS weather stations and current fire weather readings."""
    return _connector.fetch_stations(state=state)
