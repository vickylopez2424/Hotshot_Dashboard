"""
Predict: the one-question API behind the Predict screen.

  POST /api/predict            {lat, lon, hours, incident_id?, incident_name?, engine?}
  GET  /api/predict/{job_id}   status, weather, result contours, summary numbers
  GET  /api/predict/weather    the hourly fire weather line for a point
  GET  /api/predict            recent jobs

Engines live in engines.py. Until ELMFIRE is connected, `engine` defaults to
"sample" and every response carries source="sample" so the UI can say so.
"""
import json
import logging
import shutil
import subprocess
import threading
import traceback
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_approved_user
from integrations.base import BasePlatformConnector
from integrations.predict import jobs, weather as wx
from integrations.predict.engines import ENGINES, EngineUnavailable, summarize_result
from integrations.predict.elmfire_pipeline import NoSpread

router = APIRouter()
from integrations.predict.pack import router as pack_router; router.include_router(pack_router)  # /pack must register before /{job_id}
logger = logging.getLogger(__name__)
jobs.init()

def _elmfire_ready() -> bool:
    """Docker reachable and the native image present."""
    if not shutil.which("docker"):
        return False
    try:
        out = subprocess.run(["docker", "image", "inspect", "elmfire:arm64"], capture_output=True, timeout=10)
        return out.returncode == 0
    except Exception:
        return False


def _code_sha() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5,
                             cwd=str(__import__("pathlib").Path(__file__).resolve().parents[3]))
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


CODE_SHA = _code_sha()
ENGINE_VERSIONS = {"elmfire": "elmfire 1.1 (native docker build)", "sample": "sample shape", "ondevice": "ondevice-rothermel 1.0"}
ELMFIRE_READY = _elmfire_ready()
DEFAULT_ENGINE = "elmfire" if ELMFIRE_READY else "sample"
ALLOWED_HOURS = (6, 12, 24)


class PredictRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    hours: int = 12
    incident_id: Optional[str] = None
    incident_name: Optional[str] = None
    engine: Optional[str] = None


class RecordRequest(BaseModel):
    """A simulation that already ran on a phone, posted when signal returns."""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    hours: int
    engine: str = "ondevice"
    result: dict
    summary: Optional[dict] = None
    weather: Optional[dict] = None
    incident_id: Optional[str] = None
    incident_name: Optional[str] = None
    device_id: Optional[str] = None
    client_created: Optional[str] = None
    pack_landfire_version: Optional[str] = None
    engine_version: Optional[str] = None


class PredictConnector(BasePlatformConnector):
    platform_id = "predict"
    platform_name = "Predict"

    def get_status(self) -> dict:
        return {"state": "ready", "engines": list(ENGINES), "default_engine": DEFAULT_ENGINE,
                "elmfire_connected": ELMFIRE_READY}

    def get_data(self) -> dict:
        return {"jobs": jobs.recent()}


def _run(jid: str):
    job = jobs.get(jid)
    try:
        jobs.update(jid, status="running", step="Fetching fire weather")
        w = wx.hourly(job["lat"], job["lon"], job["hours"])
        w_sum = wx.summarize(w["periods"])
        jobs.update(jid, weather={"summary": w_sum, "source": w["source"], "grid": w["station"], "periods": w["periods"]},
                    step="Running spread model")
        engine = ENGINES[job["engine"]]
        result = engine(job["lat"], job["lon"], job["hours"], w,
                        progress=lambda step: jobs.update(jid, step=step))
        summary = summarize_result(result, job["lat"], job["lon"], w_sum)
        run = result.get("run") or {}
        jobs.update(jid, status="done", step="Done", result=result, summary=summary,
                    origin="app", engine_version=ENGINE_VERSIONS.get(job["engine"], job["engine"]), code_sha=CODE_SHA,
                    landfire_version=run.get("landfire_version"), weather_source=w.get("source"),
                    ignition_used=json.dumps(run.get("ignition_used")) if run.get("ignition_used") else None,
                    ignition_snap_m=run.get("ignition_snap_m"), domain_km=run.get("domain_km"), cell_m=run.get("cell_size_m"))
    except EngineUnavailable as e:
        jobs.update(jid, status="model_unavailable", step="Model not connected", error=str(e))
    except (wx.WeatherUnavailable, NoSpread) as e:
        # written for the screen, no exception name in front
        jobs.update(jid, status="failed", step="No prediction", error=str(e))
    except Exception as e:
        logger.error("predict job %s failed: %s\n%s", jid, e, traceback.format_exc())
        msg = str(e).splitlines()[0][:220] if str(e) else type(e).__name__
        jobs.update(jid, status="failed", step="Failed", error=f"The run failed: {msg}")


@router.get("/status")
def status():
    return PredictConnector().get_status()


@router.get("/weather")
def weather(lat: float, lon: float, hours: int = 12):
    try:
        w = wx.hourly(lat, lon, hours)
    except wx.WeatherUnavailable as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"Weather service unavailable: {str(e)[:160]}")
    return {"summary": wx.summarize(w["periods"]), "source": w["source"], "grid": w["station"], "periods": w["periods"]}


@router.post("")
def create(req: PredictRequest, background: BackgroundTasks, user: dict = Depends(get_approved_user)):
    if req.hours not in ALLOWED_HOURS:
        raise HTTPException(400, f"hours must be one of {ALLOWED_HOURS}")
    engine = req.engine or DEFAULT_ENGINE
    if engine not in ENGINES:
        raise HTTPException(400, f"unknown engine {engine}")
    user_id = (user or {}).get("sub") or (user or {}).get("id")
    jid = jobs.create(req.lat, req.lon, req.hours, engine, req.incident_id, req.incident_name, user_id)
    threading.Thread(target=_run, args=(jid,), daemon=True, name=f"predict-{jid}").start()
    return {"job_id": jid, "status": "queued", "engine": engine}


@router.post("/record")
def record_run(req: RecordRequest, user: dict = Depends(get_approved_user)):
    """Store an on-device run so the science record is complete."""
    if len(json.dumps(req.result)) > 4_000_000:
        raise HTTPException(413, "result too large")
    run = req.result.get("run") or {}
    jid = jobs.record(lat=req.lat, lon=req.lon, hours=req.hours, engine=req.engine, result=req.result, summary=req.summary,
                      weather=req.weather, origin="app", user_id=(user or {}).get("sub") or (user or {}).get("id"),
                      incident_id=req.incident_id, incident_name=req.incident_name,
                      engine_version=req.engine_version or ENGINE_VERSIONS.get("ondevice"), code_sha=CODE_SHA,
                      landfire_version=req.pack_landfire_version, weather_source=(req.weather or {}).get("source") or "stored pack forecast",
                      ignition_used=run.get("ignition_used"), ignition_snap_m=run.get("ignition_snap_m"),
                      domain_km=run.get("domain_km"), cell_m=30, device_id=req.device_id, client_created=req.client_created)
    return {"job_id": jid, "status": "recorded"}


@router.get("/benchmarks")
def list_benchmarks(fire: Optional[str] = None):
    return {"benchmarks": jobs.benchmarks(fire)}


@router.get("")
def recent(limit: int = 20):
    return {"jobs": jobs.recent(limit=min(limit, 100))}


@router.get("/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job
