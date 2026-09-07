# ELMFIRE in Docker (Apple Silicon)

Runs the open-source [ELMFIRE](https://github.com/lautenberger/elmfire) fire
spread model inside Docker on this Mac (Colima, arm64) and places its GeoTIFF
outputs where `backend/integrations/elmfire/geotiff_processor.py` expects them:

```
backend/data/elmfire_outputs/<run_id>/time_of_arrival_<member>_<seconds>.tif
```

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Native build: Ubuntu 24.04, gfortran, OpenMPI, GDAL 3.8, ELMFIRE compiled from a pinned upstream commit |
| `Dockerfile.upstream` | Verbatim copy of the upstream Dockerfile, kept for reference. It is amd64-only (linux-64 micromamba) |
| `run_tutorial.sh` | Runs one bundled tutorial and copies the `.tif` files to the backend run folder |
| `outputs/<run_id>/` | Raw container output per run (log, `elmfire.data`, rasters, isochrone shapefile) |

## Build (once, about 5 to 10 minutes)

```
cd prediction/elmfire-docker
docker build -t elmfire:arm64 .
```

Only one Docker build at a time on this machine, the Colima VM has about 6 GB.

## Run a tutorial

```
./run_tutorial.sh                       # 01-constant-wind, run_id tutorial_01
./run_tutorial.sh 02-transient-wind tutorial_02
```

Then verify from the backend:

```
cd backend
.venv/bin/python -c "from integrations.elmfire.geotiff_processor import scan_run_directory, process_time_of_arrival; \
m = scan_run_directory('data/elmfire_outputs/tutorial_01'); print(m['toa_file']); \
g = process_time_of_arrival(m['toa_file']); print(len(g['features']), g['max_time_minutes'])"
```

## Output rasters (tutorial 01, one dump at SIMULATION_TSTOP)

| File | Meaning | Backend classification |
|---|---|---|
| `time_of_arrival_0000001_0019800.tif` | seconds since ignition, -1 = unburned | time_of_arrival (primary) |
| `flin_0000001_0019800.tif` | fireline intensity, kW/m | fireline_intensity |
| `vs_0000001_0019800.tif` | spread rate (velocity), copied to `spread_rate_...tif` by the script | spread_rate |
| `sts_0000001_0019800.tif` | surface fire spread type / status flag | not classified |
| `segments_0000001_0019800.tif` | ignition segment id | not classified |

`head_fire_flame_length_*.tif` appears only when `DUMP_FLAME_LENGTH = .TRUE.`
is added to the `&OUTPUTS` group in `elmfire.data`; the tutorial does not set it.

## Why not the published image

`clauten/elmfire` on Docker Hub is amd64-only (version 2025.0212). It pulls and
starts under Colima's x86 emulation, and the GDAL preprocessing works, but the
Fortran binary fails with `Problem opening input file ./inputs/elmfire.data`
and segfaults under `mpirun`. The native build avoids all of that.

## Inputs ELMFIRE needs (from `tutorials/01-constant-wind`)

All rasters share one grid (cell size, extent, CRS). The tutorial uses 30 m
cells on a 12 km by 12 km domain in EPSG:32610.

Landscape (Int16, stacked into `landscape.tif` bands 1 to 8 in this order):

| Band | Name | Unit |
|---|---|---|
| 1 | dem | elevation, m |
| 2 | slp | slope, degrees |
| 3 | asp | aspect, degrees |
| 4 | fbfm40 | Scott and Burgan 40 fuel model code |
| 5 | cc | canopy cover, percent |
| 6 | ch | canopy height, 10 x meters |
| 7 | cbh | canopy base height, 10 x meters |
| 8 | cbd | canopy bulk density, 100 x kg/m3 |

Weather (Float32, one band per `DT_METEOROLOGY` step, 3600 s here):

| Name | Unit |
|---|---|
| ws | 20 ft wind speed, mph |
| wd | wind direction, degrees (from) |
| m1 | 1 hr dead fuel moisture, percent |
| m10 | 10 hr dead fuel moisture, percent |
| m100 | 100 hr dead fuel moisture, percent |

Scalars in `elmfire.data`: `LH_MOISTURE_CONTENT` (live herbaceous, percent),
`LW_MOISTURE_CONTENT` (live woody, percent), `adj` raster (spread rate
adjustment factor, unitless, 1.0), `phi` raster (level set initial value,
1.0 = unburned), ignition `X_IGN / Y_IGN` (projected meters) and `T_IGN` (s),
`SIMULATION_TSTOP` (s), `SIMULATION_DT` (s), `DTDUMP` (s between output
rasters), `A_SRS` (CRS of the grid).

LANDFIRE supplies the eight landscape bands directly (its CH, CBH, CBD
products are already in the 10x and 100x integer encodings ELMFIRE expects).
NWS forecasts supply ws, wd, and the fuel moistures (via NFDRS or a simple
fuel-moisture model).

## Real runs

`backend/integrations/predict/elmfire_pipeline.py` turns an ignition point,
a horizon (6, 12 or 24 h) and the NWS hourly forecast into a full ELMFIRE run.
`engines.py` calls it as the `elmfire` engine. Verified 2026-09-07:
Placerville 12 h in 5.7 s cold (LANDFIRE download) and 3.3 s warm,
Hesperia 6 h in 4.2 s.

```
cd backend
.venv/bin/python -c "
from integrations.predict import weather as wx
from integrations.predict.engines import run_elmfire
w = wx.hourly(38.7296, -120.7985, 12)
r = run_elmfire(38.7296, -120.7985, 12, w, progress=print)
print(len(r['features']), r['max_time_minutes'], r['run']['run_id'])"
```

### Domain

Square UTM grid centred on the ignition, 30 m cells: 10 km (333 cells) for
6 h, 16 km (533) for 12 h, 24 km (800) for 24 h. CRS is the UTM zone of the
ignition longitude (EPSG:326xx). The lower-left corner is snapped to a 30 m
multiple so LANDFIRE pixels line up.

### LANDFIRE

Fetched synchronously from the LANDFIRE ArcGIS ImageServers, one request
per layer, in the domain CRS at 30 m, as the native Int16 encodings:

```
https://lfps.usgs.gov/arcgis/rest/services/<folder>/<service>/ImageServer/exportImage
  ?f=image&format=tiff&pixelType=S16&bbox=<x0,y0,x1,y1>&bboxSR=<epsg>&imageSR=<epsg>
  &size=<n>,<n>&interpolation=RS_NearestNeighbor
```

| Band | Layer | Service (CONUS shown; AK, HI, PRVI exist for most) |
|---|---|---|
| 1 | dem | `Landfire_Topo/LF2020_Elev_CONUS` |
| 2 | slp | `Landfire_Topo/LF2020_SlpD_CONUS` |
| 3 | asp | `Landfire_Topo/LF2020_Asp_CONUS` |
| 4 | fbfm40 | `Landfire_LF2025/LF2025_FBFM40_CONUS` |
| 5 | cc | `Landfire_LF2025/LF2025_CC_CONUS` |
| 6 | ch | `Landfire_LF2025/LF2025_CH_CONUS` |
| 7 | cbh | `Landfire_LF2025/LF2025_CBH_CONUS` |
| 8 | cbd | `Landfire_LF2025/LF2025_CBD_CONUS` |

Fuels come from the newest version folder that serves the domain
(LF2025, then LF2024, then LF2023). Topography is only published once
(LF2020) and is shared by every later version. Service max image size is
100000 px per side, well above the 800 needed. Each layer is cached at
`backend/data/landfire_cache/<layer>/<service>_<epsg>_<x0>_<y0>_<n>.tif`
so repeat runs in the same area make no requests.

Nodata handling: fuel model codes outside 91 to 204 become 99 (barren,
non-burnable), canopy nodata becomes 0, aspect -1 (flat) becomes 0, DEM
nodata takes the domain median.

Ignition: if the requested cell (or any of its 8 neighbours) is
non-burnable, the modelled ignition moves to the nearest cell within 1 km
whose whole 3x3 neighbourhood is burnable. Downtown Placerville and
Hesperia are both LANDFIRE code 91 (urban), so both move about 450 m. The
move is reported in `run.ignition_snap_m` and `run.ignition_used`, and the
returned `ignition_point` stays at the requested location.

### Weather

One Float32 band per hour (hours + 1 bands; the last forecast hour is
repeated), constant across the domain:

| Raster | Source | Simplification |
|---|---|---|
| ws | NWS 10 m wind, mph | used as the 20 ft wind with no height reduction |
| wd | NWS 16-point compass text | converted to degrees from |
| m1 | Simard (1968) EMC from hourly T and RH | no shading or time-of-day correction |
| m10 | m1 + 1 | NWCG rule of thumb, no 10 h lag |
| m100 | m1 + 3 | NWCG rule of thumb, no 100 h lag |

Live moisture scalars `LH_MOISTURE_CONTENT = 30`, `LW_MOISTURE_CONTENT = 60`
are seasonal (cured summer) defaults, not forecast. `adj` and `phi` are 1.0.

### Run layout

```
backend/data/elmfire_runs/<run_id>/     inputs/, outputs/, scratch/, a_srs.txt, run.log
backend/data/elmfire_outputs/<run_id>/  time_of_arrival_*, flin_*, vs_* + spread_rate_* copy,
                                        elmfire.data, run.json (the run dict)
```

`run_id` is `predict_<job id or timestamp>`. `prediction/run_elmfire.sh
<run_dir>` mounts the folder at `/run`, runs `elmfire_1.1 ./inputs/elmfire.data`,
converts the `.bil` outputs to compressed GeoTIFF with the CRS from
`a_srs.txt`, and enforces a 180 s watchdog (`ELMFIRE_TIMEOUT` to change,
exit 124 on timeout, log tail on stderr for any failure).

`elmfire.data` follows the tutorial template with `SIMULATION_DT = 1.0`,
`TARGET_CFL = 0.2` (adaptive step, as in tutorial 02), `DTDUMP =
SIMULATION_TSTOP = hours * 3600` so the single time_of_arrival dump covers
the whole run, and `NUM_METEOROLOGY_TIMES` = the weather band count.
