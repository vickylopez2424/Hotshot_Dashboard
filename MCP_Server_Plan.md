# Hotshot Dashboard MCP Server — Implementation Plan
*NB Tech AI Solutions | Generated: 2026-05-18*

---

## Vision

A **Model Context Protocol (MCP) server** that turns Hotshot Dashboard into the AI nervous system of the fireline:

- **Reads** live data from all 13 wildfire integrations and exposes them as MCP tools any AI assistant can call (Claude on a tablet, an in-cab voice agent, a future custom field assistant).
- **Receives** telemetry from field devices — tablets, FLIR cameras, drones, wearable sensors — through a generic ingestion API.
- **Stores** every AI interaction + every device reading + every outcome into a training-ready dataset.
- **Trains** progressively smarter fire-domain AI from that dataset (RAG today → fine-tuning → custom prediction models).

The MCP server is both the *interface* (AI calls the dashboard) and the *collector* (devices feed the dashboard), and the data they exchange becomes the moat: a proprietary fire-domain corpus no competitor has.

---

## Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │       Hotshot_Dashboard/mcp_server/          │
                  │                                              │
  AI clients ────►│  READ tools (MCP)                            │──► live APIs
  (Claude,        │   • incidents, fires, weather, cameras,      │   (FIRMS, RAWS,
   field          │     air quality, fire spread, fuels, plants  │    NWS, cameras,
   assistants)    │                                              │    WildCAD, ...)
                  │  WRITE ingestion (HTTP + MCP)                │
  Field   ────────│   • POST /ingest/telemetry                   │
  devices         │   • POST /ingest/media                       │
  (tablets,       │   • Auto-log every MCP tool call             │
   FLIR,                                                          │
   drones,        │         │                                    │
   sensors)       │         ▼                                    │
                  │  Storage layer                               │
                  │   • Supabase (Postgres): structured records  │
                  │   • Object storage: imagery, GeoTIFFs, audio │
                  │                                              │
                  │         │                                    │
                  │         ▼                                    │
                  │  Training pipeline                           │──► RAG corpus
                  │   • dataset_builder → JSONL                  │    fine-tune jobs
                  │   • RAG indexer                              │    prediction
                  └──────────────────────────────────────────────┘    models
```

### Directory layout

```
Hotshot_Dashboard/
└── mcp_server/
    ├── server.py                  # MCP entrypoint (stdio + SSE transports)
    ├── tools/                     # MCP read tools — one module per domain
    │   ├── incidents.py           # WildCAD / IRWIN
    │   ├── fire_detections.py     # NASA FIRMS
    │   ├── weather.py             # WIMS/RAWS + NWS + Rx weather
    │   ├── cameras.py             # ALERTWildfire
    │   ├── air_quality.py         # AirNow
    │   ├── fire_spread.py         # ELMFIRE
    │   ├── fuels.py               # LANDFIRE
    │   ├── vegetation.py          # Plant ID + Vegetation
    │   └── watch_duty.py
    ├── ingest/                    # WRITE path
    │   ├── telemetry.py           # Structured sensor/device data
    │   ├── media.py               # Imagery, video, audio uploads
    │   ├── interactions.py        # Auto-log every MCP tool call
    │   └── schema.py              # Pydantic models for ingestion
    ├── storage/
    │   ├── db.py                  # Supabase client (reuses backend/auth.py)
    │   ├── blob.py                # Object storage adapter
    │   └── migrations/            # SQL schema
    ├── training/                  # Phase 3
    │   ├── dataset_builder.py     # Logged data → JSONL training samples
    │   ├── rag_indexer.py         # Build vector index for retrieval
    │   └── export.py              # Push to fine-tune API / HF dataset
    ├── auth.py                    # Device API keys + user JWTs (reuses Supabase)
    ├── config.py
    ├── requirements.txt
    └── README.md
```

**Key principle:** the MCP server *imports* `backend/integrations/*` directly — no HTTP hop, no duplicated logic. The existing FastAPI backend and the new MCP server share connector code.

---

## MCP Tool Inventory

One tool per useful question a fireline AI would ask. All tools return structured JSON.

### Incidents & detections
| Tool | Inputs | Returns |
|---|---|---|
| `list_active_incidents` | `state?, region?` | All current WildCAD/IRWIN incidents |
| `get_incident_detail` | `incident_id` | Full incident record + linked resources |
| `get_active_fires` | `bbox, time_window` | NASA FIRMS satellite hotspots (VIIRS+MODIS) |
| `get_fire_spread_forecast` | `incident_id, hours_ahead` | ELMFIRE contours as GeoJSON |

### Weather & conditions
| Tool | Inputs | Returns |
|---|---|---|
| `get_raws_stations` | `bbox \| station_ids` | Current RAWS readings (Synoptic) |
| `get_fire_weather_outlook` | `lat, lon` | NWS fire weather forecast + red flag warnings |
| `get_rx_weather` | `unit_id` | Prescribed burn weather windows |
| `get_air_quality` | `lat, lon, radius` | AirNow AQI + smoke plumes |

### Imagery & camera
| Tool | Inputs | Returns |
|---|---|---|
| `list_cameras_near` | `lat, lon, radius` | ALERTWildfire camera list with feed URLs |
| `get_camera_snapshot` | `camera_id` | Current still frame |
| `search_camera_history` | `camera_id, time_range` | Past frames for retrospective analysis |

### Terrain & fuels
| Tool | Inputs | Returns |
|---|---|---|
| `query_fuel_model` | `bbox` | LANDFIRE fuel model classification |
| `identify_plant` | `image` | Plant ID API result |
| `get_vegetation_layer` | `bbox` | Vegetation type GeoJSON |

### Cross-cutting
| Tool | Inputs | Returns |
|---|---|---|
| `situational_summary` | `lat, lon, radius` | Composite: nearby fires + weather + cameras + AQ in one call |
| `recall_similar_incidents` | `description, location` | RAG retrieval from historical corpus (Phase 3) |

**Why `situational_summary` matters:** it's the "one-question" tool. A firefighter asks "what's going on at my position?" and gets fires, weather, cameras, smoke, fuels in a single response. This is your demo killer.

---

## Telemetry Ingestion API

A generic, device-agnostic write path. Any device that can speak HTTP can register and stream.

### Endpoints

```
POST /ingest/telemetry          # Structured sensor reading
POST /ingest/media              # Binary upload (image/video/audio)
POST /ingest/event              # Discrete event (button press, alarm, AI query result)
POST /devices/register          # Issue a per-device API key
```

### Telemetry payload (Pydantic schema)

```python
class TelemetryReading(BaseModel):
    device_id: str            # registered device
    device_kind: Literal["tablet", "flir", "drone", "wearable", "weather_meter", "other"]
    timestamp: datetime       # device-local time, ISO 8601 with TZ
    location: GeoPoint        # lat, lon, optional altitude
    incident_id: str | None   # link to active incident if known
    crew_id: str | None       # link to crew/unit
    measurements: dict        # device-specific: {"temp_f": 92, "rh": 14, "wind_mph": 22}
    raw: dict | None          # original device payload for replay
```

### Media payload
- Multipart upload → object storage
- Sidecar metadata row in Postgres with EXIF, GPS, device, incident link
- Returns a `media_id` the device can reference in later telemetry

### Interaction logging (auto)
Every MCP tool call is logged with: caller identity, tool name, inputs, response, timestamp, latency, location (if provided). No extra code per tool — wrapped in `server.py`.

---

## Storage Schema (Phase 1 cut)

```sql
-- Supabase / Postgres

create table devices (
  id uuid primary key,
  kind text not null,
  owner_user_id uuid references auth.users,
  api_key_hash text not null,
  registered_at timestamptz default now(),
  last_seen_at timestamptz
);

create table telemetry_readings (
  id bigserial primary key,
  device_id uuid references devices,
  timestamp timestamptz not null,
  location geography(point, 4326),
  incident_id text,
  crew_id text,
  measurements jsonb,
  raw jsonb,
  ingested_at timestamptz default now()
);

create table media_assets (
  id uuid primary key,
  device_id uuid references devices,
  timestamp timestamptz not null,
  location geography(point, 4326),
  incident_id text,
  blob_url text not null,
  mime_type text,
  exif jsonb,
  ingested_at timestamptz default now()
);

create table mcp_interactions (
  id bigserial primary key,
  caller_id text,
  tool_name text not null,
  inputs jsonb,
  response jsonb,
  latency_ms int,
  location geography(point, 4326),
  occurred_at timestamptz default now()
);

create table incident_outcomes (   -- the labels for fine-tuning
  id bigserial primary key,
  incident_id text not null,
  recorded_by uuid references auth.users,
  outcome jsonb,                   -- containment time, acres, structures, decisions made, what worked
  recorded_at timestamptz default now()
);
```

Indexes on `(timestamp, incident_id)` and PostGIS index on `location`.

---

## Training Pipeline — three phases

### Phase 3a: RAG corpus (fastest value)
- Embed every `mcp_interactions` row + `incident_outcomes` summary into a vector store (pgvector inside Supabase, no new infra).
- Expose `recall_similar_incidents` MCP tool.
- Result: when a crew encounters a situation, Claude can pull up 3–5 historically similar incidents with their outcomes.
- **No model training required.**

### Phase 3b: Supervised fine-tuning
- Build JSONL where each sample is `{situation, expert_recommendation, outcome}`.
- Use your USFS expertise + retired fire experts to label "what was the right call."
- Fine-tune a small open model (or Anthropic fine-tuning when available) on this corpus.
- Result: a model that gives *better* fireline answers than vanilla Claude because it's seen your domain.

### Phase 3c: Custom prediction models
- From correlated sensor + outcome data, train specialized models:
  - "Given current RAWS readings + fuel model, predict spread rate."
  - "Given wearable biometrics, predict crew fatigue / heat injury risk."
  - "Given camera frames over time, detect new ignitions."
- These run alongside MCP tools as additional capabilities.

---

## Auth Model

| Caller | Auth method |
|---|---|
| AI client (Claude Desktop, Claude API) | User JWT (reuse Supabase auth) |
| Field device | Per-device API key, issued at `/devices/register` |
| Admin operations | Role check via existing `backend/auth.py` |

MCP transports: **stdio** for local Claude Desktop dev, **SSE/HTTP** for production field clients. Both supported by the official `mcp` Python SDK.

---

## Deployment

- **Phase 1:** runs locally via stdio for development + demo (no infra needed).
- **Phase 2:** deploy SSE transport on Render (you already have `render.yaml`) or Fly.io — same env as the FastAPI backend, shared `.env`.
- **Phase 3:** when training pipeline runs, dataset export job runs as a scheduled task (Render cron or GitHub Actions).

---

## Phased Timeline

### Phase 1 — Read-only MCP server (Week 1–2)
- [ ] Scaffold `mcp_server/` directory + dependencies (`mcp`, `httpx`, existing connectors)
- [ ] Implement `server.py` with stdio transport
- [ ] Wrap all 13 integrations as MCP tools (tool signatures above)
- [ ] Implement `situational_summary` composite tool
- [ ] Add Claude Desktop config snippet to README
- [ ] **Demo:** connect Claude Desktop, ask "what fires are burning in California right now?"

### Phase 2 — Telemetry + interaction logging (Week 3–4)
- [ ] Supabase migrations: `devices`, `telemetry_readings`, `media_assets`, `mcp_interactions`
- [ ] `/devices/register` + per-device API keys
- [ ] `/ingest/telemetry`, `/ingest/media`, `/ingest/event` endpoints
- [ ] MCP server middleware to auto-log every tool call to `mcp_interactions`
- [ ] Simple test client: a Python script simulating a tablet + a weather meter posting data

### Phase 3a — RAG corpus (Month 2)
- [ ] Add pgvector extension to Supabase
- [ ] `rag_indexer.py` — embeds interactions + incident outcomes
- [ ] `recall_similar_incidents` MCP tool
- [ ] Backfill: seed with 5–10 historical incidents you can describe in detail

### Phase 3b — Fine-tuning (Month 3+)
- [ ] `dataset_builder.py` → JSONL with `{situation, recommendation, outcome}`
- [ ] Manual labeling UI (or just a spreadsheet) for outcome quality
- [ ] First fine-tune job once you have ~200+ labeled samples

### Phase 3c — Custom prediction models (Month 4+)
- [ ] Pick one use case (spread rate from RAWS + fuels is the obvious first one)
- [ ] Train, evaluate, expose as MCP tool

---

## Why this is a moat (commercial angle)

Selling the dashboard gets you contracts. Selling the dashboard **plus the MCP server that learns from every fire it sees** gets you a defensible product no one else can ship from scratch — because the value compounds with every incident logged.

License tier add-on:
- **AI Assist tier:** +$5K/year per unit — adds MCP server access + Claude integration
- **Intelligence tier:** +$15K/year per agency — adds RAG over the agency's own incident history
- **Predictive tier:** +$40K/year per agency — adds custom prediction models trained on the agency's data

---

## Open decisions (resolve before coding Phase 1)

1. **MCP SDK language:** Python (matches existing backend) or TypeScript? → **Recommend Python** to share `integrations/` code directly.
2. **Object storage backend:** Supabase Storage (already in stack) or S3? → **Recommend Supabase** for simplicity in Phase 1.
3. **Imagery scale:** how big do you expect FLIR / drone uploads to be? Affects storage cost and whether we need image compression at ingest.
4. **Privacy / FOIA implications:** field telemetry on federal incidents may be subject to records laws. Worth a conversation with each agency about who owns the captured data. (Probably bake this into the license agreement: NB Tech operates the system, agency owns its data, NB Tech retains anonymized rights for training.)
5. **Offline mode for fireline:** cell coverage on a fire is unreliable. Should devices queue telemetry locally and sync when reconnected? → **Yes, design ingest API to accept batched + delayed timestamps from day one.**

---

## Next session pickup

Resume at: **Phase 1, Step 1** — scaffold `mcp_server/` and implement the first MCP tool (`list_active_incidents` — quickest win since WildCAD/IRWIN already returns live data).
