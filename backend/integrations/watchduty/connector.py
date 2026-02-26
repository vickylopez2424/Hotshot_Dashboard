"""
Watch Duty Integration
Watch Duty (watchduty.org) is a community wildfire alerting platform with
real-time scanner feeds, evacuation orders, and incident tracking.

Public access:
  - Incident viewer: https://app.watchduty.org/i/{incident_id}
  - State overview:  https://app.watchduty.org

API access:
  Watch Duty does not publish a public REST API. Enterprise/partner access
  is available — contact Watch Duty at watchduty.org for integration options.

This module provides:
  - Deep links to Watch Duty incident pages by state and coordinates
  - Quick-launch URLs for responders to open Watch Duty for a given area
"""
from fastapi import APIRouter

router = APIRouter()

# Direct links to Watch Duty's public incident viewer by US state
STATE_LINKS = {
    "CA": {"label": "California",   "url": "https://app.watchduty.org"},
    "OR": {"label": "Oregon",       "url": "https://app.watchduty.org"},
    "WA": {"label": "Washington",   "url": "https://app.watchduty.org"},
    "NV": {"label": "Nevada",       "url": "https://app.watchduty.org"},
    "ID": {"label": "Idaho",        "url": "https://app.watchduty.org"},
    "MT": {"label": "Montana",      "url": "https://app.watchduty.org"},
    "CO": {"label": "Colorado",     "url": "https://app.watchduty.org"},
    "AZ": {"label": "Arizona",      "url": "https://app.watchduty.org"},
    "NM": {"label": "New Mexico",   "url": "https://app.watchduty.org"},
    "UT": {"label": "Utah",         "url": "https://app.watchduty.org"},
    "WY": {"label": "Wyoming",      "url": "https://app.watchduty.org"},
    "TX": {"label": "Texas",        "url": "https://app.watchduty.org"},
}

WATCH_DUTY_APP_URL   = "https://app.watchduty.org"
WATCH_DUTY_IOS_URL   = "https://apps.apple.com/us/app/watch-duty-wildfire-maps/id1569580848"
WATCH_DUTY_ANDROID_URL = "https://play.google.com/store/apps/details?id=org.watchduty.app"


@router.get("/status")
def status():
    return {
        "state":   "linked",
        "message": "Watch Duty links are active. API integration requires Watch Duty partnership.",
        "app_url": WATCH_DUTY_APP_URL,
    }


@router.get("/links")
def get_links():
    """
    Returns Watch Duty access links.
    These open the Watch Duty web viewer or app for the given area.
    """
    return {
        "web_app":       WATCH_DUTY_APP_URL,
        "ios_app":       WATCH_DUTY_IOS_URL,
        "android_app":   WATCH_DUTY_ANDROID_URL,
        "states":        [
            {"state": code, "label": info["label"], "url": info["url"]}
            for code, info in STATE_LINKS.items()
        ],
        "integration_note": (
            "Watch Duty does not publish a public API. "
            "Contact watchduty.org for enterprise integration options. "
            "Links open the Watch Duty web viewer directly."
        ),
    }


@router.get("/launch")
def launch_for_location(lat: float, lon: float):
    """Returns a Watch Duty deep link for a specific lat/lon (map view)."""
    url = f"{WATCH_DUTY_APP_URL}?lat={lat:.4f}&lng={lon:.4f}&zoom=10"
    return {"url": url, "lat": lat, "lon": lon}
