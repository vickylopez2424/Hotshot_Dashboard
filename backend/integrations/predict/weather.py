"""
Hourly fire weather for a point, from the NWS API (no key needed).

Returns the next N hours of wind, temperature and relative humidity so a
firefighter can sanity check the inputs before a run, and so the spread
engine has a weather table. Cached per 0.05 degree cell for 15 minutes.
"""
import re
import time
import logging
import httpx
from config import NWS_BASE_URL, NWS_USER_AGENT

logger = logging.getLogger(__name__)
_cache: dict = {}
TTL = 900


def _key(lat: float, lon: float) -> str:
    return f"{round(lat, 2)},{round(lon, 2)}"


def _mph(text: str) -> float:
    """'10 to 15 mph' -> 12.5 ; '8 mph' -> 8.0"""
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", text or "")]
    return round(sum(nums) / len(nums), 1) if nums else 0.0


def hourly(lat: float, lon: float, hours: int = 24) -> dict:
    k = _key(lat, lon)
    hit = _cache.get(k)
    if hit and time.time() - hit[0] < TTL and len(hit[1]["periods"]) >= hours:
        data = dict(hit[1])
        data["periods"] = data["periods"][:hours]
        return data

    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    with httpx.Client(timeout=20, headers=headers, follow_redirects=True) as c:
        p = c.get(f"{NWS_BASE_URL}/points/{lat:.4f},{lon:.4f}")
        p.raise_for_status()
        props = p.json()["properties"]
        f = c.get(props["forecastHourly"])
        f.raise_for_status()
        periods = f.json()["properties"]["periods"]

    out = []
    for per in periods[:max(hours, 48)]:
        rh = (per.get("relativeHumidity") or {}).get("value")
        out.append({
            "time":      per["startTime"],
            "wind_mph":  _mph(per.get("windSpeed")),
            "wind_dir":  per.get("windDirection") or "",
            "temp_f":    per.get("temperature"),
            "rh_pct":    rh,
            "short":     per.get("shortForecast") or "",
        })
    data = {
        "source":   "NWS hourly forecast",
        "station":  f"{props.get('gridId')} {props.get('gridX')},{props.get('gridY')}",
        "periods":  out,
    }
    _cache[k] = (time.time(), data)
    data = dict(data)
    data["periods"] = out[:hours]
    return data


def summarize(periods: list) -> dict:
    """One line a crew boss can read: peak wind, driest hour, dominant direction."""
    if not periods:
        return {}
    peak = max(periods, key=lambda x: x["wind_mph"])
    driest = min((x for x in periods if x["rh_pct"] is not None), key=lambda x: x["rh_pct"], default=None)
    dirs = [x["wind_dir"] for x in periods if x["wind_dir"]]
    dominant = max(set(dirs), key=dirs.count) if dirs else ""
    return {
        "now_wind_mph":  periods[0]["wind_mph"],
        "now_wind_dir":  periods[0]["wind_dir"],
        "now_temp_f":    periods[0]["temp_f"],
        "now_rh_pct":    periods[0]["rh_pct"],
        "peak_wind_mph": peak["wind_mph"],
        "peak_wind_dir": peak["wind_dir"],
        "peak_wind_time": peak["time"],
        "min_rh_pct":    driest["rh_pct"] if driest else None,
        "dominant_dir":  dominant,
    }
