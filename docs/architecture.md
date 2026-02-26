# Hotshot Dashboard — Architecture

## Overview

```
Browser
  └── React SPA (frontend/)
        ├── Leaflet Map  ← overlays from all platforms
        ├── Right Panel  ← per-platform data view
        └── Sidebar      ← layer on/off toggles
              │
              │ HTTP / WebSocket
              ▼
        FastAPI (backend/)
              ├── /api/firms       ← NASA satellite fire data
              ├── /api/elmfire     ← wildfire spread predictions
              ├── /api/cameras     ← ALERTWildfire feeds
              ├── /api/wims        ← WIMS/RAWS weather stations
              ├── /api/rx_weather  ← Rx fire weather stations
              └── /api/<new>       ← add new platforms here
```

## Frontend Architecture

```
src/
├── config/platforms.js     ← single source of truth for all platforms
├── context/PlatformContext ← global layer active/inactive state
├── components/
│   ├── Map/MapView.jsx     ← Leaflet map, renders platform layers
│   ├── Map/layers/         ← one file per platform overlay
│   ├── Sidebar/            ← layer toggle controls
│   └── <Platform>/         ← per-platform right panel
└── integrations/           ← frontend data connectors (axios calls)
```

## Backend Architecture

```
backend/
├── main.py                 ← FastAPI app, mounts all routers
├── config.py               ← env-based configuration
└── integrations/
    ├── base.py             ← BasePlatformConnector abstract class
    ├── _template/          ← copy this to add a new platform
    └── <platform>/
        ├── __init__.py
        └── connector.py    ← FastAPI router + data fetching logic
```

## Data Flow

1. Frontend loads → fetches `/api/platforms` to know what's available
2. Map renders → each active layer calls its `/api/<platform>` endpoint
3. Right panel renders → shows detailed data from the selected platform
4. Sidebar toggles → updates PlatformContext → map layers show/hide

## Adding Platforms

See [adding-platforms.md](adding-platforms.md) for the step-by-step guide.
