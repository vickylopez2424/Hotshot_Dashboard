"""
Mission pack: the LANDFIRE landscape for a square area as one gzip download,
so the phone can run the on-device Rothermel engine (frontend/src/engine)
with no signal.

  GET /api/predict/pack?lat=&lon=&km=     binary pack, see FORMAT below
  GET /api/predict/pack/estimate?km=      bytes before and after compression

The LANDFIRE fetch, cleaning and disk cache are the ones in
elmfire_pipeline.py; this module only builds a square domain of the
requested size and packs the eight cleaned Int16 layers.

FORMAT (after gunzip):
  uint32 LE   header length H (a multiple of 4; the JSON is space padded)
  H bytes     JSON header:
                format, epsg, x0, y0 (lower-left corner, metres),
                cell_m, ncols, nrows, layers (names in order),
                landfire_version, built_at, center {lat, lon}, km,
                center_cell {row, col}, bytes_raw
  then        one Int16 little-endian array per layer, nrows*ncols cells,
              row 0 is the NORTH edge, col 0 the west edge (same as the
              cached GeoTIFFs and ELMFIRE's landscape.tif)

The same JSON is sent in the X-Pack-Meta response header. Note the app's
CORS config does not expose that header to cross-origin JavaScript, so a
client should read the header from the body, which always carries it.
"""
from __future__ import annotations

import gzip
import json
import logging
import math
import struct
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from pyproj import Transformer

from auth import get_approved_user
from integrations.predict.elmfire_pipeline import (
    BAND_ORDER, CELL_M, DATA_DIR, Domain, LandfireError, clean_landscape,
    fetch_landscape, landfire_region, utm_epsg,
)

logger = logging.getLogger(__name__)
router = APIRouter()

PACK_DIR = DATA_DIR / "packs"
FORMAT = "hotshot-pack/1"
KM_MIN, KM_MAX, KM_DEFAULT = 10, 60, 30
HEADER_RESERVE = 600          # rough JSON header size for estimates
DEFAULT_RATIO = 0.25          # gzip ratio guess before any pack has been built


def pack_domain(lat: float, lon: float, km: float) -> Domain:
    """Square UTM domain of `km` per side centred on the point, 30 m cells,
    corner snapped to the 30 m lattice exactly like build_domain."""
    epsg = utm_epsg(lon)
    x, y = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform(lon, lat)
    n = int(round(km * 1000 / CELL_M))
    half = n * CELL_M / 2
    x0 = math.floor((x - half) / CELL_M) * CELL_M
    y0 = math.floor((y - half) / CELL_M) * CELL_M
    return Domain(epsg=epsg, x0=x0, y0=y0, n=n, cell=CELL_M, x_ign=x, y_ign=y)


def _key(dom: Domain) -> str:
    return f"{dom.epsg}_{dom.x0:.0f}_{dom.y0:.0f}_{dom.n}"


def raw_bytes_for(n: int) -> int:
    return 4 + HEADER_RESERVE + len(BAND_ORDER) * n * n * 2


def build_pack(lat: float, lon: float, km: float) -> tuple[bytes, dict]:
    """Returns (gzipped body, header dict). Built packs are kept on disk under
    backend/data/packs/ keyed by the domain, so the second request is a file read."""
    dom = pack_domain(lat, lon, km)
    key = _key(dom)
    gz_path = PACK_DIR / f"{key}.pack.gz"
    meta_path = PACK_DIR / f"{key}.json"
    if gz_path.exists() and meta_path.exists():
        return gz_path.read_bytes(), json.loads(meta_path.read_text())

    region = landfire_region(lat, lon)
    raw, lf_version = fetch_landscape(dom, region)
    layers = clean_landscape(raw)
    row, col = dom.index(dom.x_ign, dom.y_ign)

    arrays = b"".join(layers[name].astype("<i2").tobytes(order="C") for name in BAND_ORDER)
    meta = {
        "format": FORMAT,
        "epsg": dom.epsg,
        "x0": float(dom.x0),
        "y0": float(dom.y0),
        "cell_m": dom.cell,
        "ncols": dom.n,
        "nrows": dom.n,
        "layers": list(BAND_ORDER),
        "landfire_version": f"{lf_version} fuels + LF2020 topography ({region})",
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "center": {"lat": round(lat, 6), "lon": round(lon, 6)},
        "center_cell": {"row": row, "col": col},
        "km": km,
        "bytes_raw": 0,
    }
    header = json.dumps(meta).encode()
    header += b" " * (-len(header) % 4)
    body_len = 4 + len(header) + len(arrays)
    meta["bytes_raw"] = body_len
    header = json.dumps(meta).encode()
    header += b" " * (-len(header) % 4)
    # re-padding can change the length by a few bytes; recompute once more
    meta["bytes_raw"] = 4 + len(header) + len(arrays)
    header = json.dumps(meta).encode()
    header += b" " * (-len(header) % 4)
    body = struct.pack("<I", len(header)) + header + arrays

    gz = gzip.compress(body, compresslevel=6, mtime=0)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    tmp = gz_path.with_suffix(".tmp")
    tmp.write_bytes(gz)
    tmp.replace(gz_path)
    meta_path.write_text(json.dumps(meta))
    logger.info("pack %s built: %d raw, %d gz", key, len(body), len(gz))
    return gz, meta


def _observed_ratio() -> tuple[float, int]:
    """Median gzip ratio over packs already built on this server, and how many."""
    ratios = []
    if PACK_DIR.exists():
        for meta_path in PACK_DIR.glob("*.json"):
            gz_path = meta_path.with_name(meta_path.stem + ".pack.gz")
            try:
                raw = json.loads(meta_path.read_text()).get("bytes_raw") or 0
                if raw and gz_path.exists():
                    ratios.append(gz_path.stat().st_size / raw)
            except Exception:
                continue
    if not ratios:
        return DEFAULT_RATIO, 0
    ratios.sort()
    return ratios[len(ratios) // 2], len(ratios)


def _check_km(km: float) -> float:
    if not (KM_MIN <= km <= KM_MAX):
        raise HTTPException(400, f"km must be between {KM_MIN} and {KM_MAX}")
    return float(km)


@router.get("/pack/estimate")
def pack_estimate(km: float = KM_DEFAULT, user: dict = Depends(get_approved_user)):
    km = _check_km(km)
    n = int(round(km * 1000 / CELL_M))
    raw = raw_bytes_for(n)
    ratio, samples = _observed_ratio()
    return {"km": km, "cells": n, "cell_m": CELL_M, "layers": list(BAND_ORDER),
            "bytes_raw": raw, "bytes_gzip_estimate": int(raw * ratio),
            "ratio": round(ratio, 3), "ratio_samples": samples}


@router.get("/pack")
def pack(lat: float, lon: float, km: float = KM_DEFAULT, user: dict = Depends(get_approved_user)):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "lat/lon out of range")
    km = _check_km(km)
    try:
        gz, meta = build_pack(lat, lon, km)
    except LandfireError as e:
        raise HTTPException(502, str(e)[:400])
    fname = f"pack_{meta['center']['lat']}_{meta['center']['lon']}_{int(km)}km.gz"
    return Response(content=gz, media_type="application/octet-stream",
                    headers={"X-Pack-Meta": json.dumps(meta, separators=(",", ":")),
                             "Content-Disposition": f'attachment; filename="{fname}"',
                             "Cache-Control": "private, max-age=86400"})
