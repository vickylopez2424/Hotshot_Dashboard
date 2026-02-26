"""
WildCAD HTML Scraper

Scrapes dispatch-level data (resources assigned, CAD notes, unit status)
from WildCAD center pages that are not available through IRWIN.

WildCAD center URL patterns:
  http://www.wildcad.net/WC{CENTER_CODE}.htm
  http://www.wildcad.net/WildCADWeb.asp

Center code examples (prefix WC + unit code):
  WCIDBDC  = Boise Interagency Dispatch Center
  WCNMTDC  = Taos Interagency Dispatch Center
  WCNVCNC  = Central Nevada Interagency Dispatch Center
  WCCASQF  = Sequoia-Kings Canyon
  WCCAYOS  = Yosemite National Park

To find your center's code:
  Browse http://www.wildcad.net/WildCADWeb.asp and note the URL
  of your specific center page.
"""
import time
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

WILDCAD_BASE = "http://www.wildcad.net"
REQUEST_TIMEOUT = 15
CACHE_TTL = 300  # 5 minutes (dispatch data refreshes frequently)

_cache: dict = {}


def fetch_center_incidents(center_code: str) -> dict:
    """
    Scrape a WildCAD center page for current incidents and resources.

    center_code: WildCAD center code, e.g. 'WCIDBDC'
    Returns: dict with 'incidents', 'source_url', 'scraped_at'
    """
    now = time.time()
    if center_code in _cache and now - _cache[center_code]["ts"] < CACHE_TTL:
        return _cache[center_code]["data"]

    url = f"{WILDCAD_BASE}/{center_code}.htm"
    result = _scrape_page(url, center_code)
    _cache[center_code] = {"data": result, "ts": now}
    return result


def fetch_wildcad_web(center_code: Optional[str] = None) -> dict:
    """
    Fetch from the main WildCAD web portal or a specific center.
    Falls back to the main WildCADWeb.asp if no center specified.
    """
    if center_code:
        return fetch_center_incidents(center_code)

    url = f"{WILDCAD_BASE}/WildCADWeb.asp"
    return _scrape_page(url, "WildCADWeb")


def _scrape_page(url: str, center_id: str) -> dict:
    """Fetch and parse a WildCAD HTML page."""
    try:
        resp = httpx.get(
            url,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "HotshotDashboard/1.0 WildfireMonitoring"},
        )
        resp.raise_for_status()
        return _parse_wildcad_html(resp.text, url, center_id)

    except httpx.TimeoutException:
        return {"incidents": [], "error": f"Timeout fetching {url}", "source_url": url}
    except httpx.HTTPStatusError as e:
        return {"incidents": [], "error": f"HTTP {e.response.status_code}", "source_url": url}
    except Exception as e:
        logger.exception("WildCAD scrape error for %s", url)
        return {"incidents": [], "error": str(e), "source_url": url}


def _parse_wildcad_html(html: str, url: str, center_id: str) -> dict:
    """
    Parse WildCAD HTML table into structured incident dicts.

    WildCAD pages typically render a table with columns like:
    Incident Name | Location | Cause | Size | Resources | Status | Date/Time

    NOTE: WildCAD HTML structure varies by center configuration.
    Adjust column mapping below if your center uses different headers.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return {
            "incidents": [],
            "error": "beautifulsoup4 not installed. Run: pip install beautifulsoup4 lxml",
            "source_url": url,
        }

    import datetime

    soup = BeautifulSoup(html, "lxml")
    incidents = []

    # WildCAD pages use HTML tables — find all tables with meaningful data
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        # Extract headers from first row
        headers = [
            th.get_text(strip=True).lower().replace(" ", "_")
            for th in rows[0].find_all(["th", "td"])
        ]
        if not headers or len(headers) < 2:
            continue

        # Parse data rows
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) != len(headers):
                continue

            values = [c.get_text(strip=True) for c in cells]
            record = dict(zip(headers, values))

            # Normalize common field names across WildCAD center configurations
            incident = _normalize_record(record, center_id)
            if incident:
                incidents.append(incident)

    return {
        "incidents":   incidents,
        "count":       len(incidents),
        "center_id":   center_id,
        "source_url":  url,
        "scraped_at":  datetime.datetime.utcnow().isoformat() + "Z",
    }


def _normalize_record(record: dict, center_id: str) -> Optional[dict]:
    """
    Map variable WildCAD field names to a standard incident schema.
    WildCAD centers can customize their column names — this handles
    the most common variations.
    """
    def _get(*keys):
        for k in keys:
            val = record.get(k, "")
            if val:
                return val
        return ""

    name = _get("incident_name", "name", "fire_name", "incident", "fire")
    if not name:
        return None  # Skip rows with no incident name

    return {
        "name":          name,
        "location":      _get("location", "address", "place"),
        "cause":         _get("cause", "fire_cause"),
        "size":          _get("size", "acres", "estimated_acres", "fire_size"),
        "resources":     _get("resources", "resource", "units_assigned"),
        "personnel":     _get("personnel", "persons", "people"),
        "status":        _get("status", "incident_status", "disposition"),
        "dispatch_date": _get("date", "dispatch_date", "reported", "time"),
        "center_id":     center_id,
        "source":        "wildcad_scraper",
        # Raw dict preserved for debugging / unmapped fields
        "_raw":          record,
    }
