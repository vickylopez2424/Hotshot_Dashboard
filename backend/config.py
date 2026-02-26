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

# ─── WIMS ────────────────────────────────────────────────
WIMS_BASE_URL = "https://www.wcc.nrcs.usda.gov/webwims"

# ─── ALERTWildfire ────────────────────────────────────────
ALERTWILDFIRE_BASE_URL = "https://cameras.alertwildfire.org"

# ─── ELMFIRE ─────────────────────────────────────────────
ELMFIRE_OUTPUT_DIR = os.getenv("ELMFIRE_OUTPUT_DIR", "./data/elmfire_outputs")
ELMFIRE_BINARY = os.getenv("ELMFIRE_BINARY", "elmfire_single_processor")

# ─── App ─────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
