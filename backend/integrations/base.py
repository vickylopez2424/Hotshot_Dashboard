"""
Base connector class for all platform integrations.

Every platform connector should inherit from BasePlatformConnector
and implement the required methods.
"""
from abc import ABC, abstractmethod
from fastapi import APIRouter


class BasePlatformConnector(ABC):
    """
    Base class for wildfire platform integrations.

    To add a new platform:
    1. Create a folder under backend/integrations/<platform_id>/
    2. Create connector.py with a class extending BasePlatformConnector
    3. Create a FastAPI router and expose the endpoints
    4. Mount the router in main.py

    See backend/integrations/_template/connector.py for a full example.
    """

    platform_id: str = ""
    platform_name: str = ""

    @abstractmethod
    def get_status(self) -> dict:
        """Return the current connection/data status of this platform."""
        ...

    @abstractmethod
    def get_data(self) -> dict:
        """Fetch and return the primary data payload for this platform."""
        ...
