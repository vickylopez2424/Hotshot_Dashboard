"""
ELMFIRE input pipeline: ignition point + horizon + NWS hourly weather in,
time-of-arrival GeoJSON out.

Stages (each reported through the optional progress callback):

  1. Domain      square UTM grid centred on the ignition, 30 m cells
                 (10 km for 6 h, 16 km for 12 h, 24 km for 24 h)
  2. LANDFIRE    8 landscape layers fetched from the LANDFIRE ArcGIS
                 ImageServers on lfps.usgs.gov (exportImage, format=tiff,
                 bbox in the domain CRS, size = cell counts) and cached on
                 disk under backend/data/landfire_cache/
  3. Weather     one Float32 band per hour for ws, wd, m1, m10, m100 built
                 from the NWS forecast, constant across the domain
  4. Config      elmfire.data generated from the tutorial template
  5. Run         prediction/run_elmfire.sh <run_dir> (Docker, elmfire:arm64)
  6. Results     GeoTIFFs copied to backend/data/elmfire_outputs/<run_id>/
                 and turned into hourly rings by geotiff_processor

Only this module knows about LANDFIRE URLs and ELMFIRE file layouts.
"""
from __future__ import annotations

import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx
from integrations.predict import docker_api
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

logger = logging.getLogger(__name__)

HERE = Path(__file__).resolve()
BACKEND_DIR = HERE.parents[2]
PROJECT_DIR = HERE.parents[3]
DATA_DIR = BACKEND_DIR / "data"
CACHE_DIR = DATA_DIR / "landfire_cache"
RUNS_DIR = DATA_DIR / "elmfire_runs"
OUTPUTS_DIR = DATA_DIR / "elmfire_outputs"
RUNNER = PROJECT_DIR / "prediction" / "run_elmfire.sh"
IMAGE = os.environ.get("ELMFIRE_IMAGE", "elmfire:arm64")

CELL_M = 30
DOMAIN_KM = {6: 10, 12: 16, 24: 24}
NODATA = -9999

# LANDFIRE (verified live 2026-09-07 with curl; see README "Real runs").
LF_BASE = "https://lfps.usgs.gov/arcgis/rest/services"
# Newest fuel version first. Each folder holds <ver>_<PRODUCT>_<REGION> ImageServers.
FUEL_VERSIONS = ("LF2025", "LF2024", "LF2023")
FUEL_PRODUCTS = {"fbfm40": "FBFM40", "cc": "CC", "ch": "CH", "cbh": "CBH", "cbd": "CBD"}
# Topography is only published once (LF2020) and shared by every later version.
TOPO_SERVICES = {"dem": "Landfire_Topo/LF2020_Elev_{region}",
                 "slp": "Landfire_Topo/LF2020_SlpD_{region}",
                 "asp": "Landfire_Topo/LF2020_Asp_{region}"}
# ELMFIRE landscape.tif band order (README table).
BAND_ORDER = ("dem", "slp", "asp", "fbfm40", "cc", "ch", "cbh", "cbd")

NONBURNABLE_FILL = 99          # LANDFIRE "barren" used for water/nodata cells
BURNABLE_MIN, BURNABLE_MAX = 101, 204
SNAP_RADIUS_M = 1000           # move an urban/water ignition to the nearest fuel

# Live fuel moisture, percent. Seasonal defaults matching the ELMFIRE tutorial;
# a summer (cured) scenario. No live moisture comes from the NWS forecast.
LH_MOISTURE = 30.0
LW_MOISTURE = 60.0

COMPASS = {"N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5,
           "SE": 135, "SSE": 157.5, "S": 180, "SSW": 202.5, "SW": 225,
           "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5}

ELMFIRE_DATA_TEMPLATE = """&INPUTS
FUELS_AND_TOPOGRAPHY_DIRECTORY = './inputs'
LANDSCAPE_FILENAME             = 'landscape'
ADJ_FILENAME                   = 'adj'
PHI_FILENAME                   = 'phi'
DT_METEOROLOGY                 = 3600.0
WEATHER_DIRECTORY              = './inputs'
WS_FILENAME                    = 'ws'
WD_FILENAME                    = 'wd'
M1_FILENAME                    = 'm1'
M10_FILENAME                   = 'm10'
M100_FILENAME                  = 'm100'
LH_MOISTURE_CONTENT = {lh}
LW_MOISTURE_CONTENT = {lw}
/

&OUTPUTS
OUTPUTS_DIRECTORY    = './outputs'
DTDUMP               = {tstop}
DUMP_FLIN            = .TRUE.
DUMP_SPREAD_RATE     = .TRUE.
DUMP_TIME_OF_ARRIVAL = .TRUE.
CONVERT_TO_GEOTIFF   = .FALSE.
/

&TIME_CONTROL
SIMULATION_DT    = 1.0
TARGET_CFL       = 0.2
SIMULATION_TSTOP = {tstop}
/

&MONTE_CARLO
NUM_METEOROLOGY_TIMES = {nbands}
/

&SIMULATOR
NUM_IGNITIONS = 1
X_IGN(1)      = {x_ign}
Y_IGN(1)      = {y_ign}
T_IGN(1)      = 0.0
WX_BILINEAR_INTERPOLATION = .FALSE.
WSMFEFF_LOW_MULT = 0.011364
/

&MISCELLANEOUS
PATH_TO_GDAL                   = 'auto'
SCRATCH                        = './scratch'
/
"""


class DockerUnavailable(RuntimeError):
    """Docker daemon or the elmfire image is missing. engines.py maps this to EngineUnavailable."""


class NoSpread(RuntimeError):
    """The model ran but nothing burned. Message is written for the screen."""


FBFM40_NAMES = {91: "urban or developed", 92: "snow or ice", 93: "agriculture", 98: "open water", 99: "barren",
                101: "short sparse dry grass", 102: "low load dry grass", 121: "low load grass shrub",
                141: "low load dry shrub", 161: "light timber understory", 181: "low load timber litter",
                201: "low load slash"}


class LandfireError(RuntimeError):
    """A LANDFIRE request failed. The message carries the URL."""


# ── 1. domain ──────────────────────────────────────────────────────────────
@dataclass
class Domain:
    epsg: int
    x0: float          # lower-left corner, metres, multiple of 30
    y0: float
    n: int             # cells per side
    cell: int
    x_ign: float       # ignition in projected metres
    y_ign: float

    @property
    def x1(self): return self.x0 + self.n * self.cell

    @property
    def y1(self): return self.y0 + self.n * self.cell

    @property
    def bbox(self): return f"{self.x0:.0f},{self.y0:.0f},{self.x1:.0f},{self.y1:.0f}"

    @property
    def transform(self): return from_origin(self.x0, self.y1, self.cell, self.cell)

    @property
    def crs(self): return f"EPSG:{self.epsg}"

    def index(self, x, y):
        """(row, col) of a projected point; row 0 is the top (north) edge."""
        col = int((x - self.x0) // self.cell)
        row = int((self.y1 - y) // self.cell)
        return row, col


def utm_epsg(lon: float) -> int:
    zone = int(math.floor((lon + 180) / 6)) + 1
    return 32600 + max(1, min(60, zone))


def build_domain(lat: float, lon: float, hours: int) -> Domain:
    if hours not in DOMAIN_KM:
        raise ValueError(f"hours must be one of {sorted(DOMAIN_KM)}")
    epsg = utm_epsg(lon)
    x, y = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform(lon, lat)
    n = int(round(DOMAIN_KM[hours] * 1000 / CELL_M))
    half = n * CELL_M / 2
    x0 = math.floor((x - half) / CELL_M) * CELL_M
    y0 = math.floor((y - half) / CELL_M) * CELL_M
    return Domain(epsg=epsg, x0=x0, y0=y0, n=n, cell=CELL_M, x_ign=x, y_ign=y)


def landfire_region(lat: float, lon: float) -> str:
    if lat > 49.5 and lon < -129:
        return "AK"
    if 18 < lat < 23 and -161 < lon < -154:
        return "HI"
    if 17 < lat < 19 and -68 < lon < -64:
        return "PRVI"
    return "CONUS"


# ── 2. LANDFIRE ────────────────────────────────────────────────────────────
def _cache_path(layer: str, service: str, dom: Domain) -> Path:
    tag = service.split("/")[-1]
    return CACHE_DIR / layer / f"{tag}_{dom.epsg}_{dom.x0:.0f}_{dom.y0:.0f}_{dom.n}.tif"


def fetch_layer(layer: str, service: str, dom: Domain, client: httpx.Client) -> np.ndarray:
    """One LANDFIRE layer on the domain grid as int16. Cached on disk."""
    cached = _cache_path(layer, service, dom)
    if cached.exists():
        with rasterio.open(cached) as ds:
            return ds.read(1).astype(np.int16)

    url = f"{LF_BASE}/{service}/ImageServer/exportImage"
    params = {"f": "image", "format": "tiff", "pixelType": "S16",
              "bbox": dom.bbox, "bboxSR": dom.epsg, "imageSR": dom.epsg,
              "size": f"{dom.n},{dom.n}", "interpolation": "RS_NearestNeighbor"}
    try:
        r = client.get(url, params=params)
    except httpx.HTTPError as e:
        raise LandfireError(f"LANDFIRE request failed for {layer}: {e} ({url}?bbox={dom.bbox})") from e
    ctype = r.headers.get("content-type", "")
    if r.status_code != 200 or not ctype.startswith("image/tiff"):
        raise LandfireError(f"LANDFIRE {layer} returned HTTP {r.status_code} {ctype}: "
                            f"{r.text[:200]} ({url}?bbox={dom.bbox}&size={dom.n},{dom.n})")
    with rasterio.open(io.BytesIO(r.content)) as ds:
        arr = ds.read(1).astype(np.int16)
        if arr.shape != (dom.n, dom.n):
            raise LandfireError(f"LANDFIRE {layer} came back {arr.shape}, wanted {(dom.n, dom.n)} ({url})")
    if np.all(arr == NODATA) or np.all(arr == -32768):
        raise LandfireError(f"LANDFIRE {layer} is entirely nodata on this domain ({url}?bbox={dom.bbox})")

    cached.parent.mkdir(parents=True, exist_ok=True)
    tmp = cached.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", driver="GTiff", width=dom.n, height=dom.n, count=1,
                       dtype="int16", crs=dom.crs, transform=dom.transform,
                       nodata=NODATA, compress="deflate") as dst:
        dst.write(arr, 1)
        dst.update_tags(landfire_service=service, fetched=datetime.now(timezone.utc).isoformat())
    tmp.replace(cached)
    return arr


def fetch_landscape(dom: Domain, region: str) -> tuple[dict, str]:
    """All 8 layers. Fuels come from the newest LANDFIRE version that serves this region."""
    layers: dict[str, np.ndarray] = {}
    version_used = None
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {name: pool.submit(fetch_layer, name, svc.format(region=region), dom, client)
                    for name, svc in TOPO_SERVICES.items()}
            for name, fut in futs.items():
                layers[name] = fut.result()

        last_err = None
        for ver in FUEL_VERSIONS:
            try:
                with ThreadPoolExecutor(max_workers=5) as pool:
                    futs = {name: pool.submit(fetch_layer, name, f"Landfire_{ver}/{ver}_{prod}_{region}", dom, client)
                            for name, prod in FUEL_PRODUCTS.items()}
                    got = {name: fut.result() for name, fut in futs.items()}
                layers.update(got)
                version_used = ver
                break
            except LandfireError as e:
                logger.warning("LANDFIRE %s not usable here, trying older: %s", ver, e)
                last_err = e
        if version_used is None:
            raise LandfireError(f"No LANDFIRE fuel version served this domain. Last error: {last_err}")
    return layers, version_used


def clean_landscape(layers: dict) -> dict:
    """Apply ELMFIRE-friendly nodata handling. Returns new int16 arrays."""
    out = {}
    dem = layers["dem"].astype(np.int16)
    bad = (dem == NODATA) | (dem == -32768)
    if bad.any():
        dem = dem.copy()
        dem[bad] = int(np.median(dem[~bad])) if (~bad).any() else 0
    out["dem"] = dem

    slp = layers["slp"].astype(np.int16).copy()
    slp[(slp < 0) | (slp > 90)] = 0
    out["slp"] = slp

    asp = layers["asp"].astype(np.int16).copy()
    asp[(asp < 0) | (asp > 360)] = 0          # -1 = flat in LANDFIRE
    out["asp"] = asp

    fm = layers["fbfm40"].astype(np.int16).copy()
    fm[(fm < 91) | (fm > BURNABLE_MAX)] = NONBURNABLE_FILL   # nodata, water gaps, odd codes
    out["fbfm40"] = fm

    for k in ("cc", "ch", "cbh", "cbd"):
        a = layers[k].astype(np.int16).copy()
        a[a < 0] = 0
        out[k] = a
    return out


def write_landscape(layers: dict, dom: Domain, path: Path):
    with rasterio.open(path, "w", driver="GTiff", width=dom.n, height=dom.n, count=len(BAND_ORDER),
                       dtype="int16", crs=dom.crs, transform=dom.transform, nodata=NODATA,
                       compress="deflate", zlevel=6) as dst:
        for i, name in enumerate(BAND_ORDER, start=1):
            dst.write(layers[name], i)
            dst.set_band_description(i, name)


def snap_ignition(fbfm40: np.ndarray, dom: Domain) -> tuple[float, float, float]:
    """Pick the modelled ignition cell.

    If the requested cell is burnable and so are its 8 neighbours it is used
    as is. Otherwise (urban, water, ag, a one-cell sliver of fuel inside a
    town) move to the nearest cell within SNAP_RADIUS_M whose whole 3x3
    neighbourhood is burnable, falling back to the nearest burnable cell.
    Returns (x, y, distance_m); distance 0 means no move."""
    row, col = dom.index(dom.x_ign, dom.y_ign)
    burnable = (fbfm40 >= BURNABLE_MIN) & (fbfm40 <= BURNABLE_MAX)
    b = burnable.astype(np.int8)
    inner = np.zeros_like(b)
    inner[1:-1, 1:-1] = (b[:-2, :-2] & b[:-2, 1:-1] & b[:-2, 2:] &
                         b[1:-1, :-2] & b[1:-1, 1:-1] & b[1:-1, 2:] &
                         b[2:, :-2] & b[2:, 1:-1] & b[2:, 2:])
    if inner[row, col]:
        return dom.x_ign, dom.y_ign, 0.0
    r = int(SNAP_RADIUS_M // dom.cell)
    r0, r1 = max(0, row - r), min(dom.n, row + r + 1)
    c0, c1 = max(0, col - r), min(dom.n, col + r + 1)
    for mask in (inner, burnable):
        sub = mask[r0:r1, c0:c1]
        if not sub.any():
            continue
        rr, cc = np.nonzero(sub)
        d2 = (rr + r0 - row) ** 2 + (cc + c0 - col) ** 2
        k = int(np.argmin(d2))
        nrow, ncol = rr[k] + r0, cc[k] + c0
        if nrow == row and ncol == col:
            return dom.x_ign, dom.y_ign, 0.0
        x = dom.x0 + (ncol + 0.5) * dom.cell
        y = dom.y1 - (nrow + 0.5) * dom.cell
        return x, y, math.hypot(x - dom.x_ign, y - dom.y_ign)
    raise RuntimeError(f"No burnable fuel within {SNAP_RADIUS_M} m of the ignition "
                       f"(LANDFIRE FBFM40 = {int(fbfm40[row, col])} at the point)")


# ── 3. weather ─────────────────────────────────────────────────────────────
def wind_dir_deg(text: str, fallback: float = 0.0) -> float:
    """'WSW' -> 247.5 (direction the wind blows FROM, as ELMFIRE expects)."""
    t = (text or "").strip().upper()
    if t in COMPASS:
        return float(COMPASS[t])
    m = re.fullmatch(r"\d+(\.\d+)?", t)
    return float(t) % 360 if m else fallback


def emc_simard(temp_f: float, rh_pct: float) -> float:
    """Equilibrium moisture content, percent.
    Simard (1968) three-piece fit, as used for 1-h fuel moisture in the 1978
    NFDRS and the Fosberg-Deeming fine dead fuel moisture tables.
    Inputs: air temperature in degrees F, relative humidity in percent."""
    T, H = float(temp_f), float(rh_pct)
    if H < 10:
        emc = 0.03229 + 0.281073 * H - 0.000578 * H * T
    elif H < 50:
        emc = 2.22749 + 0.160107 * H - 0.014784 * T
    else:
        emc = 21.0606 + 0.005565 * H * H - 0.00035 * H * T - 0.483199 * H
    return max(1.0, min(35.0, emc))


def weather_bands(weather: dict, hours: int) -> dict:
    """hours+1 values per quantity (band k covers hour k; the last band repeats
    the final forecast hour so ELMFIRE never runs off the end of the table)."""
    periods = list((weather or {}).get("periods") or [])
    if not periods:
        raise ValueError("weather has no periods")
    while len(periods) < hours + 1:
        periods.append(periods[-1])
    periods = periods[:hours + 1]

    ws, wd, m1, m10, m100, rows = [], [], [], [], [], []
    last_dir = 0.0
    for p in periods:
        # NWS forecast wind is the 10 m (33 ft) value. ELMFIRE wants 20 ft wind.
        # Simplification: the 10 m value is used directly (no 20 ft reduction,
        # which would be roughly 0.87 x over open ground), so winds are a
        # little strong. Documented in the run dict assumptions.
        speed = float(p.get("wind_mph") or 0.0)
        last_dir = wind_dir_deg(p.get("wind_dir"), fallback=last_dir)
        temp = p.get("temp_f"); rh = p.get("rh_pct")
        temp = 70.0 if temp is None else float(temp)
        rh = 30.0 if rh is None else float(rh)
        emc = emc_simard(temp, rh)
        # Dead fuel moisture: 1-h taken as the hourly EMC (no shading or
        # time-lag correction); 10-h and 100-h use the NWCG rule of thumb
        # 10-h = 1-h + 1, 100-h = 1-h + 3 (percent). The larger fuels really
        # lag by 10 and 100 hours, so this over-reacts to a single dry hour.
        v1 = round(emc, 1)
        ws.append(speed); wd.append(last_dir)
        m1.append(v1); m10.append(min(35.0, v1 + 1.0)); m100.append(min(35.0, v1 + 3.0))
        rows.append({"time": p.get("time"), "ws_mph": speed, "wd_deg": last_dir,
                     "temp_f": temp, "rh_pct": rh, "m1": v1, "m10": m10[-1], "m100": m100[-1]})
    return {"ws": ws, "wd": wd, "m1": m1, "m10": m10, "m100": m100, "table": rows}


def write_float_raster(path: Path, dom: Domain, values: list[float]):
    """Spatially uniform Float32 raster, one band per value."""
    with rasterio.open(path, "w", driver="GTiff", width=dom.n, height=dom.n, count=len(values),
                       dtype="float32", crs=dom.crs, transform=dom.transform, nodata=NODATA,
                       compress="deflate", zlevel=6) as dst:
        for i, v in enumerate(values, start=1):
            dst.write(np.full((dom.n, dom.n), float(v), dtype=np.float32), i)


# ── 4. config ──────────────────────────────────────────────────────────────
def write_elmfire_data(path: Path, hours: int, nbands: int, x_ign: float, y_ign: float):
    tstop = float(hours * 3600)
    path.write_text(ELMFIRE_DATA_TEMPLATE.format(
        lh=LH_MOISTURE, lw=LW_MOISTURE, tstop=f"{tstop:.1f}", nbands=nbands,
        x_ign=f"{x_ign:.1f}", y_ign=f"{y_ign:.1f}"))


# ── 5. run ─────────────────────────────────────────────────────────────────
def check_docker():
    """Prefer the daemon socket; fall back to the CLI only when no socket exists."""
    try:
        d = docker_api.Docker()
    except docker_api.DockerUnavailable:
        return _check_docker_cli()
    d.ping()
    if not d.image_exists(IMAGE):
        raise DockerUnavailable(f"Docker image {IMAGE} not found. Build it with: "
                                f"cd prediction/elmfire-docker && docker build -t {IMAGE} .")


def _check_docker_cli():
    if not RUNNER.exists() or not os.access(RUNNER, os.X_OK):
        raise DockerUnavailable(f"ELMFIRE runner missing or not executable: {RUNNER}")
    if shutil.which("docker") is None:
        raise DockerUnavailable("docker CLI not found on PATH. Start Colima or Docker Desktop.")
    r = None
    for attempt in range(3):
        try:
            r = subprocess.run(["docker", "image", "inspect", IMAGE], capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as e:
            raise DockerUnavailable(f"docker is not responding: {e}") from e
        if r.returncode == 0:
            return
        logger.warning("docker image inspect attempt %d failed rc=%s stderr=%r", attempt + 1, r.returncode, (r.stderr or "")[:200])
        time.sleep(1.5)
    err = (r.stderr or "").strip()
    if "no such image" in err.lower():
        raise DockerUnavailable(f"Docker image {IMAGE} not found. Build it with: "
                                f"cd prediction/elmfire-docker && docker build -t {IMAGE} .")
    raise DockerUnavailable(f"Docker is not responding (is Colima or Docker Desktop running?): {err[:200]}")


CONTAINER_SCRIPT = r"""
set -e
"elmfire_${ELMFIRE_VER}" ./inputs/elmfire.data
for f in ./outputs/*.bil; do
  [ -e "$f" ] || continue
  b=$(basename "$f" .bil)
  if [ -n "$A_SRS" ]; then
    gdal_translate -q -a_srs "$A_SRS" -co COMPRESS=DEFLATE -co ZLEVEL=6 "$f" "./outputs/$b.tif"
  else
    gdal_translate -q -co COMPRESS=DEFLATE -co ZLEVEL=6 "$f" "./outputs/$b.tif"
  fi
done
for f in ./outputs/vs_*.tif; do
  [ -e "$f" ] && cp "$f" "./outputs/spread_rate_${f##*/vs_}"
done
rm -f ./outputs/*.bil ./outputs/*.hdr ./outputs/*.csv
rm -rf ./scratch/*
"""
MODEL_TIMEOUT_S = int(os.environ.get("ELMFIRE_TIMEOUT", "180"))


def run_model(run_dir: Path) -> float:
    t = time.time()
    try:
        d = docker_api.Docker()
    except docker_api.DockerUnavailable:
        return _run_model_cli(run_dir)

    run_dir = run_dir.resolve()
    (run_dir / "outputs").mkdir(exist_ok=True)
    (run_dir / "scratch").mkdir(exist_ok=True)
    for f in (run_dir / "outputs").iterdir():
        f.unlink()
    shutil.rmtree(run_dir / "scratch", ignore_errors=True)
    (run_dir / "scratch").mkdir(exist_ok=True)
    a_srs = ""
    if (run_dir / "a_srs.txt").exists():
        a_srs = (run_dir / "a_srs.txt").read_text().strip()
    name = "elmfire_" + re.sub(r"[^A-Za-z0-9_.-]", "_", run_dir.name)

    code, logs, timed_out = d.run(IMAGE, ["bash", "-c", CONTAINER_SCRIPT], binds=[f"{run_dir}:/run"],
                                  env=[f"A_SRS={a_srs}"], workdir="/run", name=name, timeout_s=MODEL_TIMEOUT_S)
    (run_dir / "run.log").write_text(logs)
    tail = logs.strip()[-1500:]
    if timed_out:
        raise RuntimeError(f"ELMFIRE timed out after {MODEL_TIMEOUT_S} s in {run_dir}:\n{tail}")
    if code != 0:
        raise RuntimeError(f"ELMFIRE exited {code} in {run_dir}:\n{tail}")
    if not list((run_dir / "outputs").glob("time_of_arrival_*.tif")):
        raise RuntimeError(f"ELMFIRE finished but wrote no time_of_arrival raster in {run_dir}/outputs:\n{tail}")
    return time.time() - t


def _run_model_cli(run_dir: Path) -> float:
    t = time.time()
    try:
        r = subprocess.run([str(RUNNER), str(run_dir)], capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"ELMFIRE runner did not return within 240 s ({run_dir})") from e
    if r.returncode != 0:
        tail = (r.stderr or r.stdout or "").strip()[-1500:]
        raise RuntimeError(f"ELMFIRE run failed (exit {r.returncode}) in {run_dir}:\n{tail}")
    return time.time() - t


# ── 6. all together ────────────────────────────────────────────────────────
def run(lat: float, lon: float, hours: int, weather: dict, progress=None, run_id: str | None = None) -> dict:
    from integrations.elmfire.geotiff_processor import process_time_of_arrival

    def step(msg):
        logger.info("elmfire: %s", msg)
        if progress:
            try:
                progress(msg)
            except Exception:
                pass

    check_docker()
    t_all = time.time()
    hours = int(hours)
    run_id = run_id or (weather or {}).get("job_id") or datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = "predict_" + re.sub(r"[^A-Za-z0-9_.-]", "_", str(run_id))
    dom = build_domain(lat, lon, hours)
    region = landfire_region(lat, lon)

    step("Fetching LANDFIRE fuels")
    raw, lf_version = fetch_landscape(dom, region)
    layers = clean_landscape(raw)
    x_ign, y_ign, snap_m = snap_ignition(layers["fbfm40"], dom)

    run_dir = RUNS_DIR / run_id
    inputs = run_dir / "inputs"
    if run_dir.exists():
        shutil.rmtree(run_dir)
    for d in (inputs, run_dir / "outputs", run_dir / "scratch"):
        d.mkdir(parents=True, exist_ok=True)
    write_landscape(layers, dom, inputs / "landscape.tif")

    step("Building weather")
    wx = weather_bands(weather, hours)
    for name in ("ws", "wd", "m1", "m10", "m100"):
        write_float_raster(inputs / f"{name}.tif", dom, wx[name])
    write_float_raster(inputs / "adj.tif", dom, [1.0])
    write_float_raster(inputs / "phi.tif", dom, [1.0])
    write_elmfire_data(inputs / "elmfire.data", hours, len(wx["ws"]), x_ign, y_ign)
    (run_dir / "a_srs.txt").write_text(dom.crs + "\n")

    step("Running ELMFIRE")
    model_s = run_model(run_dir)

    step("Reading results")
    out_dir = OUTPUTS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    tifs = sorted((run_dir / "outputs").glob("*.tif"))
    if not tifs:
        raise RuntimeError(f"ELMFIRE produced no GeoTIFFs in {run_dir / 'outputs'}")
    for f in tifs:
        shutil.copy2(f, out_dir / f.name)
    shutil.copy2(inputs / "elmfire.data", out_dir / "elmfire.data")
    toa = sorted(out_dir.glob("time_of_arrival_*.tif"))
    # ELMFIRE sometimes writes a second, empty dump one second past TSTOP; pick
    # the raster that actually holds burned cells (the most), not the last name.
    if len(toa) > 1:
        def burned(path):
            try:
                import rasterio
                with rasterio.open(path) as ds:
                    a = ds.read(1)
                    return int(((a > 0) & (a != ds.nodata)).sum()) if ds.nodata is not None else int((a > 0).sum())
            except Exception:
                return -1
        toa = sorted(toa, key=burned)
    if not toa:
        raise RuntimeError(f"No time_of_arrival raster in {out_dir}")
    geo = process_time_of_arrival(str(toa[-1]))
    if geo.get("error") or not geo.get("features"):
        row, col = dom.index(dom.x_ign, dom.y_ign)
        code = int(layers["fbfm40"][row, col])
        moved = f" even after moving the ignition {snap_m:.0f} m to the nearest fuel" if snap_m else ""
        if BURNABLE_MIN <= code <= BURNABLE_MAX:
            first = (weather.get("periods") or [{}])[0]
            raise NoSpread(f"The fire did not spread from this point{moved}. The fuel here is burnable "
                           f"(LANDFIRE model {code}) but with {first.get('rh_pct', '?')}% humidity and "
                           f"{first.get('wind_mph', '?')} mph wind the model says it will not carry. "
                           f"Conditions may be too wet, or try a drier hour.")
        raise NoSpread(f"The fire did not spread from this point{moved}. LANDFIRE fuel model {code} "
                       f"({FBFM40_NAMES.get(code, 'non-burnable or sparse fuel')}) at the tap. "
                       f"Try tapping on nearby brush, grass or timber.")
    if "error" in geo:
        raise RuntimeError(f"time_of_arrival post-processing failed for {toa[-1]}: {geo['error']}")

    to_wgs = Transformer.from_crs(dom.crs, "EPSG:4326", always_xy=True)
    ign_lon, ign_lat = to_wgs.transform(x_ign, y_ign)
    assumptions = [
        "Wind speed: NWS 10 m forecast wind used directly as the 20 ft wind (no height reduction).",
        "Wind direction: NWS 16-point compass text converted to degrees (from).",
        "Dead fuel moisture: 1-h = Simard (1968) EMC from hourly temperature and RH; 10-h = 1-h + 1; 100-h = 1-h + 3 (no time lag).",
        f"Live fuel moisture: herbaceous {LH_MOISTURE:.0f}%, woody {LW_MOISTURE:.0f}% (seasonal defaults, not forecast).",
        "Weather is uniform across the domain each hour; the last forecast hour is repeated for one extra band.",
        "Spread rate adjustment factor 1.0 everywhere; no spotting, suppression or crown fire tuning beyond ELMFIRE defaults.",
        f"Nodata and water cells set to non-burnable fuel model {NONBURNABLE_FILL}; canopy nodata set to 0.",
    ]
    if snap_m > 0:
        assumptions.append(f"Ignition cell is non-burnable (LANDFIRE code {int(raw['fbfm40'][dom.index(dom.x_ign, dom.y_ign)])}); "
                           f"modelled ignition moved {snap_m:.0f} m to the nearest burnable cell.")
    result = dict(geo)
    result.update({
        "type": "FeatureCollection",
        "ignition_point": [lon, lat],
        "source": "elmfire",
        "run": {
            "run_id": run_id,
            "cell_size_m": dom.cell,
            "domain_km": DOMAIN_KM[hours],
            "domain_cells": dom.n,
            "crs": dom.crs,
            "bbox": [dom.x0, dom.y0, dom.x1, dom.y1],
            "landfire_version": f"{lf_version} fuels + LF2020 topography ({region})",
            "landfire_source": LF_BASE,
            "ignition_used": [round(ign_lon, 6), round(ign_lat, 6)],
            "ignition_snap_m": round(snap_m, 1),
            "hours": hours,
            "weather_bands": len(wx["ws"]),
            "weather_table": wx["table"],
            "live_moisture": {"lh_pct": LH_MOISTURE, "lw_pct": LW_MOISTURE},
            "assumptions": assumptions,
            "model_s": round(model_s, 1),
            "elapsed_s": round(time.time() - t_all, 1),
            "output_dir": str(out_dir),
        },
    })
    (out_dir / "run.json").write_text(json.dumps(result["run"], indent=2, default=str))
    return result
