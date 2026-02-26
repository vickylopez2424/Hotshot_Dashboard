# ALERTWildfire Camera Integration

## Overview

Integrates the full ALERTWildfire camera network — 1,600+ high-definition
wildfire monitoring cameras across the western US.

**Networks covered:**

| Network | Cameras | States | Operator |
|---|---|---|---|
| ALERTCalifornia | ~1,200 | CA | UC San Diego |
| ALERTWest | 400+ | OR, WA, ID, MT, CO, NV, HI | Multi-agency |
| HPWREN | ~280 | CA (Southern) | UC San Diego SDSC |
| ALERTWildfire | Original | NV, OR, CA, ID | UNR/UCSD/U Oregon |

**No API key required** — camera list is served from a public S3 JSON feed.

## Data Source

```
https://s3-us-west-2.amazonaws.com/awf-data-public-prod/all-cameras.json
```

Cached for 1 hour. Force-refresh via `POST /api/cameras/refresh`.

## Camera Stream URLs

Each camera has two access methods:

| Method | URL | Use case |
|---|---|---|
| **MJPEG stream** | `https://{camera_id}.prx.alertwildfire.org` | Live feed in dashboard |
| **Viewer page** | `https://www.alertwildfire.org/{region}/index.html?camera={camera_id}` | Full interactive viewer |

The MJPEG stream is embedded via `<img src="...">` in the dashboard.
If the stream is unavailable, the card shows a link to open on alertwildfire.org.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/cameras/status` | Total camera count and source |
| `GET /api/cameras/list` | Paginated camera list with filters |
| `GET /api/cameras/map` | Camera list as GeoJSON (for map) |
| `GET /api/cameras/camera/{camera_id}` | Single camera metadata |
| `GET /api/cameras/snapshot/{camera_id}` | First MJPEG frame as JPEG |
| `GET /api/cameras/networks` | Camera count by network |
| `GET /api/cameras/regions` | Camera count by region |
| `POST /api/cameras/refresh` | Force-refresh from S3 |

### Filter parameters (`/list` and `/map`)

| Parameter | Example | Description |
|---|---|---|
| `state` | `CA` | Two-letter state code |
| `region` | `california` | ALERTWildfire region name |
| `network` | `ALERTCalifornia` | Sub-network filter |
| `bbox` | `-124,32,-114,42` | Bounding box (lon_min,lat_min,lon_max,lat_max) |
| `search` | `canyon` | Search camera name |
| `limit` | `200` | Page size (max 500) |
| `offset` | `0` | Pagination offset |

## Camera Fields

| Field | Description |
|---|---|
| `camera_id` | Axis identifier (used in stream/viewer URLs) |
| `name` | Human-readable camera name |
| `latitude / longitude` | Camera location |
| `network` | Sub-network (ALERTCalifornia, ALERTWest, HPWREN) |
| `region` | ALERTWildfire region name |
| `state` | Two-letter state code |
| `stream_url` | Direct MJPEG stream URL |
| `viewer_url` | Full ALERTWildfire viewer page |
| `is_ptz` | Pan-Tilt-Zoom capable |
| `is_infrared` | Night vision / thermal imaging |
| `elevation_ft` | Camera elevation in feet |

## Attribution

- **ALERTWildfire** — alertwildfire.org
- **HPWREN** — hpwren.ucsd.edu (UC San Diego SDSC)
  - Requires attribution if HPWREN images are published
