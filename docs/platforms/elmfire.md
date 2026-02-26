# ELMFIRE Integration

## Overview

[ELMFIRE](https://elmfire.io) (Eulerian Level set Method FIRE spread model) is an open-source,
physics-based wildfire spread prediction tool developed by Chris Lautenberger.

The dashboard reads ELMFIRE GeoTIFF outputs and renders them as an animated
fire progression overlay on the map, with a time slider for playback.

## Setup — Option A: Use your own ELMFIRE outputs

### 1. Run ELMFIRE
Follow the [ELMFIRE getting started guide](https://elmfire.io/getting_started.html).
ELMFIRE writes outputs to the directory specified in your `.nml` config file.

### 2. Point the dashboard at your outputs
In `backend/.env`:
```
ELMFIRE_OUTPUT_DIR=/path/to/your/elmfire/outputs
ELMFIRE_BINARY=elmfire_single_processor   # optional: enables /api/elmfire/trigger
```

### 3. Output directory structure expected
```
ELMFIRE_OUTPUT_DIR/
└── <run_name>/
    ├── time_of_arrival_0000001_XXXXXXX.tif   ← required
    ├── head_fire_flame_length_NNN.tif
    ├── fireline_intensity_NNN.tif
    └── spread_rate_NNN.tif
```

Alternatively, place a pre-computed `fire_perimeter.geojson` in the run folder
(see sample_run for format) to skip GeoTIFF processing.

## Setup — Option B: Sample data (no ELMFIRE needed)

A sample run is included at `backend/data/elmfire_outputs/sample_run/`.
The default `ELMFIRE_OUTPUT_DIR` points to this directory, so the map
will show a simulated fire spread in Northern California immediately.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/elmfire/status` | Engine status, output dir, binary availability |
| `GET /api/elmfire/runs` | List completed runs in output directory |
| `GET /api/elmfire/prediction` | Latest run → animated GeoJSON time-steps |
| `GET /api/elmfire/prediction/{run_id}` | Specific run prediction |
| `GET /api/elmfire/runs/{run_id}/layers` | Available raster layers for a run |
| `POST /api/elmfire/trigger` | Trigger a new ELMFIRE simulation (binary required) |

## GeoTIFF Processing

The backend automatically converts `time_of_arrival.tif` to GeoJSON:

1. Opens the GeoTIFF with rasterio
2. Reprojects from source CRS (typically EPSG:5070) to WGS84 (EPSG:4326)
3. Creates binary masks at each time interval (default: 60 min)
4. Vectorizes each mask into a cumulative burn polygon
5. Simplifies geometry to reduce file size
6. Returns as a GeoJSON FeatureCollection with `time_minutes` per feature

## ELMFIRE Output Files

| File | Units | Description |
|---|---|---|
| `time_of_arrival_*.tif` | seconds | When fire reaches each pixel |
| `head_fire_flame_length_*.tif` | feet | Head fire flame length |
| `fireline_intensity_*.tif` | kW/m | Fireline intensity |
| `spread_rate_*.tif` | ft/min | Rate of spread |
| `surface_fire_occurrence_*.tif` | % | Surface fire probability |
| `crown_fire_occurrence_*.tif` | — | Crown fire probability |

## Time Animation

The frontend time slider steps through the GeoJSON features (one per interval).
Each step shows the cumulative fire perimeter up to that point in time.
Colors range from deep red (early arrival) to yellow (late arrival).
