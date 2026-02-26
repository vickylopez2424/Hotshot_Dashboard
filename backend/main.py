"""
Hotshot Dashboard — FastAPI Backend
Aggregates data from all wildfire platform integrations.
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS
from auth import get_approved_user

# Platform routers
from integrations.firms.connector import router as firms_router
from integrations.elmfire.connector import router as elmfire_router
from integrations.cameras.connector import router as cameras_router
from integrations.wims.connector import router as wims_router
from integrations.rx_weather.connector import router as rx_weather_router
from integrations.wildcad.connector import router as wildcad_router
from integrations.admin.connector import router as admin_router

app = FastAPI(
    title="Hotshot Dashboard API",
    description="Unified wildfire situational awareness platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register platform routers ───────────────────────────
# Each platform is a self-contained router under /api/<platform>
# All platform routes require an approved user account.
_auth = [Depends(get_approved_user)]

app.include_router(firms_router,      prefix="/api/firms",      tags=["FIRMS"],      dependencies=_auth)
app.include_router(elmfire_router,    prefix="/api/elmfire",    tags=["ELMFIRE"],    dependencies=_auth)
app.include_router(cameras_router,    prefix="/api/cameras",    tags=["Cameras"],    dependencies=_auth)
app.include_router(wims_router,       prefix="/api/wims",       tags=["WIMS"],       dependencies=_auth)
app.include_router(rx_weather_router, prefix="/api/rx_weather", tags=["Rx Weather"], dependencies=_auth)
app.include_router(wildcad_router,    prefix="/api/wildcad",    tags=["WildCAD"],    dependencies=_auth)

# Admin endpoints — each route internally requires role='admin'
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])

# ─── Add new platforms below ─────────────────────────────
# from integrations.my_platform.connector import router as my_platform_router
# app.include_router(my_platform_router, prefix="/api/my_platform", tags=["My Platform"], dependencies=_auth)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/platforms")
def list_platforms():
    """Returns all registered platform integrations and their status."""
    return {
        "platforms": [
            {"id": "firms",      "label": "NASA FIRMS",       "status": "stub"},
            {"id": "elmfire",    "label": "ELMFIRE",          "status": "stub"},
            {"id": "cameras",    "label": "ALERTWildfire",    "status": "stub"},
            {"id": "wims",       "label": "WIMS/RAWS",        "status": "stub"},
            {"id": "rx_weather", "label": "Rx Fire Weather",  "status": "stub"},
            {"id": "wildcad",    "label": "WildCAD / IRWIN",  "status": "active"},
        ]
    }
