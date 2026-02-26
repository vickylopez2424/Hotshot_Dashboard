# WIMS / RAWS Integration

## Overview

Fire weather data is sourced from the **Synoptic Data API** (formerly MesoWest),
which aggregates readings from ~2,500 Remote Automated Weather Stations (RAWS)
managed by USDA Forest Service and BLM.

## Setup

### 1. Get a free Synoptic API token
Register at [synopticdata.com](https://synopticdata.com/) — free tier includes
5,000 requests/month and 5 million service units/month.

### 2. Add to `.env`
```
SYNOPTIC_API_KEY=your_token_here
WIMS_CACHE_TTL=900   # optional, seconds to cache results (default 15 min)
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/wims/status` | Check connector status and API key |
| `GET /api/wims/stations?state=CA` | All RAWS stations in a state |
| `GET /api/wims/stations?bbox=-124,32,-114,42` | Stations in a bounding box |
| `GET /api/wims/station/{STID}` | Single station detail (e.g. CALS1) |
| `GET /api/wims/danger-summary?state=CA` | Count of stations per danger level |

## Fire Weather Variables

| Variable | Units | Field |
|---|---|---|
| Temperature | °F | `temp_f` |
| Relative Humidity | % | `rh` |
| Wind Speed | mph | `wind_speed` |
| Wind Direction | degrees + cardinal | `wind_dir`, `wind_dir_card` |
| 10-hr Fuel Moisture | % | `fuel_moisture` |
| Precipitation | inches | `precip_in` |
| Dew Point | °F | `dew_point_f` |

## Fire Danger Levels

| Level | Color | Criteria |
|---|---|---|
| LOW | Green | RH ≥ 25% and wind < 15 mph |
| MODERATE | Yellow | RH 15–24% or wind 15–24 mph |
| HIGH | Orange | RH < 15% or wind ≥ 25 mph |
| EXTREME | Red | RH < 10% AND wind ≥ 25 mph |

## Data Source

- **Network**: RAWS (shortname: `raws`)
- **API**: Synoptic Data v2 `/stations/latest`
- **Update frequency**: Hourly (stations transmit via GOES satellite → NIFC → Synoptic)
- **Cache TTL**: 15 minutes (configurable via `WIMS_CACHE_TTL`)
