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
