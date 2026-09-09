"""
Historical hourly weather for a benchmark run, from the Open-Meteo ERA5
archive (no key). Returned in the same dict shape the app's NWS fetcher
produces, so elmfire_pipeline.weather_bands and the on-device engine's
hourlyWeather can consume it unchanged:

  {"source": "Open-Meteo ERA5 archive", "periods": [{time, wind_mph, wind_dir, temp_f, rh_pct}, ...]}

wind_dir is 16-point compass text (direction the wind blows FROM). The
periods start at the ignition hour (floored to the hour, UTC) and run for
hours + pad_hours entries. Responses are cached under backend/data/benchmarks/weather/.

Resolution caveat: ERA5 is a roughly 31 km reanalysis (Open-Meteo blends
ERA5-Land at 9 km for the surface fields), so canyon winds such as the Jarbo
Gap jet that drove the Camp Fire are smoothed. Speeds are the 10 m wind.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

BENCH_DIR = Path(__file__).resolve().parents[1] / "data" / "benchmarks"
CACHE_DIR = BENCH_DIR / "weather"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
SOURCE = "Open-Meteo ERA5 archive"
HOURLY = "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m"
POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
          "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def compass(deg) -> str:
    """Degrees-from to 16-point text: 49 -> 'NE', 247 -> 'WSW'."""
    if deg is None:
        return ""
    return POINTS[int((float(deg) % 360) / 22.5 + 0.5) % 16]


def _url(lat: float, lon: float, start: str, end: str) -> str:
    return (f"{ARCHIVE}?latitude={lat:.4f}&longitude={lon:.4f}&start_date={start}&end_date={end}"
            f"&hourly={HOURLY}&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC")


def _fetch(lat: float, lon: float, start: str, end: str) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"openmeteo_{lat:.4f}_{lon:.4f}_{start}_{end}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    url = _url(lat, lon, start, end)
    r = httpx.get(url, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "hourly" not in data:
        raise RuntimeError(f"Open-Meteo returned no hourly block: {str(data)[:200]} ({url})")
    data["_url"] = url
    cached.write_text(json.dumps(data))
    return data


def historical(lat: float, lon: float, ignition_iso: str, hours: int, pad_hours: int = 2) -> dict:
    """Weather dict starting at the ignition hour, hours + pad_hours periods long."""
    t_ign = datetime.fromisoformat(ignition_iso)
    if t_ign.tzinfo is None:
        raise ValueError("ignition_time needs a UTC offset, e.g. 2018-11-08T06:20:00-08:00")
    t_ign = t_ign.astimezone(timezone.utc)
    start_h = t_ign.replace(minute=0, second=0, microsecond=0)
    end_h = start_h + timedelta(hours=hours + pad_hours)
    data = _fetch(lat, lon, start_h.date().isoformat(), end_h.date().isoformat())
    h = data["hourly"]
    times = h["time"]
    try:
        i0 = times.index(start_h.strftime("%Y-%m-%dT%H:%M"))
    except ValueError:
        raise RuntimeError(f"ignition hour {start_h} not in the archive response ({data.get('_url')})")
    periods = []
    for k in range(i0, min(len(times), i0 + hours + pad_hours + 1)):
        ws, wd = h["wind_speed_10m"][k], h["wind_direction_10m"][k]
        periods.append({
            "time": times[k] + ":00+00:00",
            "wind_mph": round(float(ws), 1) if ws is not None else 0.0,
            "wind_dir": compass(wd),
            "wind_dir_deg": wd,
            "temp_f": h["temperature_2m"][k],
            "rh_pct": h["relative_humidity_2m"][k],
            "short": "",
        })
    if len(periods) < hours + 1:
        raise RuntimeError(f"archive gave {len(periods)} hours, needed {hours + 1}")
    return {
        "source": SOURCE,
        "station": f"ERA5 grid cell at {lat:.4f},{lon:.4f}, model elevation {data.get('elevation')} m",
        "ignition_time": ignition_iso,
        "ignition_time_utc": t_ign.isoformat(),
        "archive_url": data.get("_url"),
        "periods": periods,
    }
