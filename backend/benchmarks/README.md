# Spread engine benchmarks

Re-runs historical wildfires through both spread engines (server ELMFIRE and
the on-device JavaScript Rothermel engine in `frontend/src/engine`) from the
real ignition point and time, with the weather that actually occurred and the
LANDFIRE fuels from before the fire, then scores every run against what the
fire really did. Every run lands in the app's science store
(`jobs.record(origin="benchmark")`) and every score in the `benchmarks` table
(`jobs.add_benchmark`).

    cd backend
    DEMO_MODE=true .venv/bin/python -m benchmarks.run --fire camp2018 --engine both --hours 6,12,24
    DEMO_MODE=true .venv/bin/python -m benchmarks.run --fire all --engine both

Output: `backend/data/benchmarks/report.md` and `report.json` (merged across
invocations, one table per fire), plus caches under `backend/data/benchmarks/`.

## Files

| file | job |
|---|---|
| `fires.yaml` | catalogue: ignition point and time, horizons, observed acres per horizon, NIFC perimeter lookup, Camp hourly progression, a citation for every number |
| `weather.py` | Open-Meteo ERA5 archive to the app's weather dict (`periods` of `{time, wind_mph, wind_dir 16-point, temp_f, rh_pct}`, `source: "Open-Meteo ERA5 archive"`) from the ignition hour; cached on disk |
| `landfire.py` | probes lfps.usgs.gov for served LANDFIRE fuel versions, `fuels_version_for_year()`, and `fuel_versions()` which makes the pipeline try an older version first |
| `perimeters.py` | observed final perimeter per fire from the NIFC Interagency Fire Perimeter History layer, largest feature, WGS84, cached |
| `score.py` | predicted acres (EPSG:5070), area ratio, Sorensen, Jaccard, fraction inside the final perimeter, max run distance, domain-edge check, progression table |
| `run_device.mjs` | Node bridge: `predictOnDevice(pack, weather, [lon, lat], hours)` on a pack file, writes the result GeoJSON |
| `run.py` | the CLI: weather, fuels, both engines, record, score, report |

## How the older fuels get in

`elmfire_pipeline.fetch_landscape` walks the module tuple
`elmfire_pipeline.FUEL_VERSIONS` (`LF2025, LF2024, LF2023`) and uses the first
version that serves the domain. That module is not edited. `landfire.fuel_versions(ver)`
is a context manager that swaps the tuple to `(ver, LF2025, LF2024, LF2023)` for
the duration of the call, for both `elmfire_pipeline.run()` and
`pack.build_pack()` (which imports the same function). The version the
pipeline really used comes back in `result["run"]["landfire_version"]` and
that string is what gets recorded; nothing is assumed.

Because `pack.py` caches packs by domain only, benchmark packs are built into
`data/benchmarks/packs/<version>/` (the module's `PACK_DIR` is pointed there
around the call) so an LF2016 pack never masquerades as an LF2025 one for the app.

What lfps.usgs.gov serves for CONUS fuels (probed 2026-09-09, cached in
`data/benchmarks/landfire_versions.json`): LF2016 Remap, LF2022, LF2023, LF2024,
LF2025. The LF2020 folder has no CONUS fuel ImageServers. So every fire from
2017 to 2021 runs on LF2016 fuels (conditions around 2016) and a 2023 fire on
LF2022. LF2020 topography is shared by all versions.

## Domains

ELMFIRE uses the app's domains (10, 16, 24 km for 6, 12, 24 h). The device
engine uses 20, 40, 60 km packs (`pack.py` allows up to 60). A horizon that is
not 6, 12 or 24 (Kincade's 10 h) runs at the next size up and is scored from
that run's ring at the requested hour. When a prediction reaches the domain
edge the score row says `left_domain` and the report says the modelled fire
was clipped.

## Scores

At the final catalogued horizon Sorensen `2|A n B| / (|A| + |B|)` and Jaccard
are against the NIFC final perimeter. At earlier horizons they are computed
against that same final perimeter and labelled containment (they say how much
of the prediction lies where the fire eventually burned, not how well the
perimeter at that hour matches); the area ratio against the timeline acres is
the primary number there. For Camp the hourly NIST TN 2135 progression is
compared row by row (acres and run distance from the origin).

## Known limits

- `engines.summarize_result` raises on MultiPolygon rings; the harness falls
  back to its own summary and notes it in the job's summary JSON.
- Weather is one ERA5 / ERA5-Land grid cell at the ignition point, uniform over
  the domain. In canyon ignitions (Camp) that cell can report a fraction of the
  ridge-top wind; the report caveats say so. No attempt is made to pick a windier cell.
- Observed intermediate acres for fires other than Camp are press-reported
  agency updates recalled in this session and marked `confidence: low` in the
  catalogue; verify them against the CAL FIRE incident archive before quoting.
