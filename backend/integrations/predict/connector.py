"""
Predict: the one-question API behind the Predict screen.

  POST /api/predict            {lat, lon, hours, incident_id?, incident_name?, engine?}
  GET  /api/predict/{job_id}   status, weather, result contours, summary numbers
  GET  /api/predict/weather    the hourly fire weather line for a point
  GET  /api/predict            recent jobs

Engines live in engines.py. Until ELMFIRE is connected, `engine` defaults to
"sample" and every response carries source="sample" so the UI can say so.
"""
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

router = APIRouter()
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
        jobs.update(jid, status="done", step="Done", result=result, summary=summary)
    except EngineUnavailable as e:
        jobs.update(jid, status="model_unavailable", step="Model not connected", error=str(e))
    except Exception as e:
        logger.error("predict job %s failed: %s\n%s", jid, e, traceback.format_exc())
        jobs.update(jid, status="failed", step="Failed", error=f"{type(e).__name__}: {e}")


@router.get("/status")
def status():
    return PredictConnector().get_status()


@router.get("/weather")
def weather(lat: float, lon: float, hours: int = 12):
    try:
        w = wx.hourly(lat, lon, hours)
    except Exception as e:
        raise HTTPException(502, f"NWS weather unavailable: {e}")
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


@router.get("")
def recent(limit: int = 20):
    return {"jobs": jobs.recent(limit=min(limit, 100))}


@router.get("/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job
