"""
Rx Fire Weather Station Integration
Provides weather data from stations used for prescribed burn planning.
These may include dedicated Rx fire weather stations or RAWS stations
flagged for prescribed burn support.
"""
from fastapi import APIRouter
from integrations.base import BasePlatformConnector

router = APIRouter()


class RxWeatherConnector(BasePlatformConnector):
    platform_id = "rx_weather"
    platform_name = "Rx Fire Weather"

    def get_status(self) -> dict:
        return {"state": "stub", "message": "Rx weather integration in progress"}

    def get_data(self) -> dict:
        return self.fetch_stations()

    def fetch_stations(self) -> dict:
        """
        Fetch Rx fire weather station data.
        TODO: Connect to your Rx weather station data source.
        """
        return {
            "stations": [],
            "message": "Rx weather station integration pending",
        }


_connector = RxWeatherConnector()


@router.get("/status")
def status():
    return _connector.get_status()


@router.get("/stations")
def list_stations():
    """Returns Rx fire weather station data."""
    return _connector.fetch_stations()
