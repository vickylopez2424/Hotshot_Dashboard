"""
Central configuration — reads from environment variables or .env file.
Copy .env.example to .env and fill in your API keys.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ─── NASA FIRMS ───────────────────────────────────────────
FIRMS_API_KEY = os.getenv("FIRMS_API_KEY", "")
FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api"

# ─── WIMS / RAWS (Synoptic Data API) ─────────────────────
# Get a free token at: https://synopticdata.com/
SYNOPTIC_API_KEY = os.getenv("SYNOPTIC_API_KEY", "")
SYNOPTIC_BASE_URL = "https://api.synopticdata.com/v2"
WIMS_CACHE_TTL = int(os.getenv("WIMS_CACHE_TTL", "900"))  # seconds (15 min default)

# ─── ALERTWildfire ────────────────────────────────────────
ALERTWILDFIRE_BASE_URL = "https://cameras.alertwildfire.org"

# ─── ELMFIRE ─────────────────────────────────────────────
ELMFIRE_OUTPUT_DIR = os.getenv("ELMFIRE_OUTPUT_DIR", "./data/elmfire_outputs")
ELMFIRE_BINARY = os.getenv("ELMFIRE_BINARY", "elmfire_single_processor")

# ─── NWS Fire Weather (no key required) ──────────────────
NWS_BASE_URL = "https://api.weather.gov"
NWS_USER_AGENT = os.getenv("NWS_USER_AGENT", "HotshotDashboard/1.0 admin@nbtechai.com")
NWS_CACHE_TTL = 900  # 15 minutes

# ─── AirNow (EPA air quality / smoke) ────────────────────
# Free API key: https://docs.airnowapi.org/account/request/
AIRNOW_API_KEY  = os.getenv("AIRNOW_API_KEY", "")
AIRNOW_BASE_URL = "https://www.airnowapi.org/aq"
AIRNOW_CACHE_TTL = 3600  # 1 hour

# ─── App ─────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
