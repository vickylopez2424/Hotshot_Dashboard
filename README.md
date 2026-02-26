# Hotshot Dashboard 🔥

A unified wildfire situational awareness dashboard that aggregates multiple fire monitoring platforms into a single interface.

## Platforms Integrated

| Platform | Type | Status |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Active fire satellite data | Stub |
| [ELMFIRE](https://github.com/lautenberger/elmfire) | Wildfire spread prediction | Stub |
| [ALERTWildfire](https://www.alertwildfire.org/) | Live camera feeds | Stub |
| [WIMS](https://www.wcc.nrcs.usda.gov/webwims/) | Fire weather stations (RAWS) | Stub |
| Rx Fire Weather Stations | Prescribed burn weather | Stub |

> Platforms are modular — new integrations can be added without touching core dashboard code. See [docs/adding-platforms.md](docs/adding-platforms.md).

## Project Structure

```
Hotshot_Dashboard/
├── frontend/           # React dashboard (Leaflet maps, panels, feeds)
│   └── src/
│       ├── components/ # UI panels: Map, Cameras, Weather, ELMFIRE
│       ├── integrations/ # Per-platform data connectors
│       └── config/     # Platform enable/disable config
├── backend/            # Python FastAPI backend
│   └── integrations/   # Per-platform API connectors
└── docs/               # Architecture, integration guides
```

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+

### Frontend
```bash
cd frontend
npm install
npm start
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Adding a New Platform

See [docs/adding-platforms.md](docs/adding-platforms.md) for step-by-step instructions on adding a new platform integration.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React-Leaflet, Leaflet.js |
| Backend | Python, FastAPI, Uvicorn |
| Maps | Leaflet.js + GeoJSON/GeoTIFF overlays |
| Real-time | WebSocket (FastAPI) |
| Geospatial | rasterio, geopandas, shapely |

## Contributing

This project is built to be extended. Each platform lives in its own folder under `integrations/` — frontend and backend — so teams can work on platforms independently.
