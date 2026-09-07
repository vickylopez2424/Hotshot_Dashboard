# Hotshot Dashboard — MCP Server + Firefighter LLM Assistant Plan
*NB Tech AI Solutions | Generated: 2026-05-18 | Revised: 2026-05-20*

---

## Vision

A **web-based wildland firefighter platform** with three layers:

1. **The dashboard** — React/Leaflet web app that any firefighter, IC, or dispatcher can open in a browser. Live map + situational data from all 13 integrations.
2. **The Firefighter LLM Assistant** — embedded chat panel in the web app. A wildland-fire-tuned AI that answers questions in plain English, calls live data tools, and renders results onto the map.
3. **The MCP server** — the engine underneath. Exposes every integration as a callable tool, ingests telemetry from field devices, stores AI interactions + outcomes, and serves the trained fire-spread model.

The MCP server is both the *interface* (the assistant calls it; other AI clients can too) and the *collector* (devices feed it). The data flowing through becomes a proprietary fire-domain training corpus — bootstrapped from **WildfireDB** (UCR/Vanderbilt/Stanford, CC-BY-4.0, 17M rows) and extended with every incident the platform sees.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    WEB APP (browser)                            │
  │  ┌──────────────────────┐    ┌────────────────────────────┐     │
  │  │  React + Leaflet map │ ◄► │  Firefighter LLM Assistant │     │
  │  │  (incidents, fires,  │    │  chat panel                │     │
  │  │   weather, cameras)  │    │                            │     │
  │  └──────────────────────┘    └─────────────┬──────────────┘     │
  └────────────────────────────────────────────┼─────────────────────┘
                                               │ HTTPS
                                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │              Hotshot_Dashboard backend + mcp_server/            │
  │                                                                 │
  │  /api/assistant ──► LLM orchestrator (Claude API)               │
  │                       │                                         │
  │                       ├──► MCP tools (live data)                │──► live APIs
  │                       ├──► RAG retrieval (WildfireDB + history) │   (FIRMS, RAWS,
  │                       └──► Spread-prediction model              │    NWS, cameras)
  │                                                                 │
  │  Field devices ──► /ingest/* ──► Storage layer                  │
  │  (tablets,                       • Supabase (Postgres+pgvector) │
  │   FLIR, drones,                  • Object storage (imagery)     │
  │   wearables)                                                    │
  │                                          │                      │
  │                                          ▼                      │
  │                                  Training pipeline              │──► RAG index
  │                                  • WildfireDB ETL               │    fine-tune
  │                                  • dataset_builder              │    prediction
  │                                  • Spread model trainer         │    models
  └─────────────────────────────────────────────────────────────────┘
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
    ├── training/                  # ML pipeline
    │   ├── wildfire_db/           # WildfireDB ETL + spread model trainer
    │   │   ├── ingest.py          # Unzip + load 17M rows to Postgres
    │   │   ├── features.py        # Feature engineering for spread prediction
    │   │   └── train_spread.py    # Train + evaluate the spread model
    │   ├── dataset_builder.py     # In-house logged data → JSONL training samples
    │   ├── rag_indexer.py         # Build vector index (WildfireDB + history)
    │   └── export.py              # Push to fine-tune API / HF dataset
    ├── auth.py                    # Device API keys + user JWTs (reuses Supabase)
    ├── config.py
    ├── requirements.txt
    └── README.md
```

**Key principle:** the MCP server *imports* `backend/integrations/*` directly — no HTTP hop, no duplicated logic. The existing FastAPI backend and the new MCP server share connector code.

---

## Firefighter LLM Assistant

The face of the product. A chat panel inside the React web app, scoped specifically to wildland firefighters.

### What it does
A firefighter or IC types (or speaks) a question like:
- *"What fires are within 10 miles of my position?"*
- *"What's the wind forecast for the Bear Ridge fire over the next 6 hours?"*
- *"Show me cameras near Big Bear Lake."*
- *"What spread rate should I expect given these conditions?"*
- *"Have we seen a fire like this before — same fuel model, same RH, same slope?"*
- *"Identify this plant"* (photo upload)
- *"What's the AQI at the staging area?"*

The assistant answers in plain English **and** renders results onto the Leaflet map (incident pins, smoke plumes, camera markers, spread contours, RAWS readings).

### How it's built
- **LLM:** Claude (Anthropic API) via the standard messages endpoint with **tool use**.
- **Tool catalog:** every MCP tool below is also exposed to the assistant. Same code, same auth, single source of truth.
- **RAG retrieval:** before each answer, the assistant pulls relevant chunks from the WildfireDB-derived knowledge base and the in-house incident history.
- **Spread predictions:** when the question is "what will this fire do next," the assistant calls the trained spread-prediction model (Phase 3c) and returns its output as a tool result.
- **System prompt:** tuned for wildland firefighter context — terse answers, units in standard fireline (mph wind, % RH, ft flame length, chains/hr spread), and safety-first phrasing.

### Web-app surface (Phase 1.5)
Add to existing `frontend/src/`:
```
frontend/src/
├── components/
│   ├── AssistantPanel.tsx       # chat UI, sits next to the map
│   ├── AssistantMessage.tsx     # renders LLM responses + tool results
│   └── MapResultsLayer.tsx      # auto-renders LLM tool results as map layers
└── hooks/
    └── useAssistant.ts          # streaming chat + tool-call rendering
```

Backend new route: `POST /api/assistant` → SSE stream → orchestrates Claude + MCP tools + RAG.

### Offline mode (later)
On the fireline cell coverage is unreliable. Future option: ship a smaller fine-tuned model (Llama 3.1 8B or similar) running locally on a ruggedized tablet for offline Q&A on cached data. Out of scope for v1 but the architecture supports it because all logic lives behind the `/api/assistant` interface.

---

## Datasets & Training Sources

### WildfireDB (primary bootstrap)
- **Source:** Zenodo record `10.5281/zenodo.5636429` (UCR/Vanderbilt/Stanford)
- **License:** **CC-BY-4.0 — commercial use permitted with attribution.** ✅ Federal-contract-compatible.
- **Scale:** 17M+ rows, 4.6GB compressed, continental US, ~2011–2021
- **Granularity:** Row-level fire-spread records connecting each fire observation to weather + vegetation + topography covariates
- **Use:**
  - **RAG corpus** — embed each row's situational context (region, fuel type, weather, observed spread) into pgvector. The assistant can recall "fires that looked like this one" instantly.
  - **Training data for spread-prediction model** — supervised regression: features (weather, fuels, terrain) → target (observed spread). This becomes the `predict_fire_spread` MCP tool.
  - **Evaluation set** — even before training in-house, WildfireDB gives us a benchmark to score future models against.

### Attribution requirement
Add to the web app footer and the assistant's about page:
> *Spread-prediction model trained in part on WildfireDB (Singla et al., 2021), CC-BY-4.0.*

### In-house corpus (built up over time)
- Every `mcp_interactions` row (assistant Q&A on real fires)
- Every `incident_outcomes` row (what actually happened, recorded by your firefighter users)
- Every `telemetry_readings` + `media_assets` from field devices

The in-house corpus is the moat — it grows every fire and is exclusive to you.

### Future datasets to consider
- **NIFC historical incident reports** (public)
- **InciWeb archives** (public)
- **NASA FIRMS historical archive** (already in the MCP tool list — could be bulk-pulled)
- **NIST WUI incident postmortems** for structure-loss labels

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
| `recall_similar_incidents` | `description, location` | RAG retrieval from WildfireDB + in-house corpus |
| `predict_fire_spread` | `lat, lon, weather, fuel_model, slope` | Trained model output: spread rate, direction, confidence |

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

-- WildfireDB bootstrap corpus
create table wildfire_db_records (
  id bigserial primary key,
  location geography(point, 4326),
  observed_at date,
  fuel_model text,
  weather jsonb,                   -- temp, RH, wind speed, wind direction, precip
  topography jsonb,                -- slope, aspect, elevation
  spread_observed jsonb,           -- the target variable(s)
  source text default 'wildfiredb-v1.1'
);
create index on wildfire_db_records using gist (location);
create index on wildfire_db_records (fuel_model);

-- Vector embeddings for RAG (pgvector)
create extension if not exists vector;
create table rag_chunks (
  id bigserial primary key,
  source_table text not null,      -- 'wildfire_db_records' | 'mcp_interactions' | 'incident_outcomes'
  source_id bigint not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);
create index on rag_chunks using ivfflat (embedding vector_cosine_ops);
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

### Phase 0 — WildfireDB ingest (runs in parallel with Phase 1, Week 1)
- [ ] Download `wildfireDB.zip` (4.6GB) from Zenodo
- [ ] Read the dataset's accompanying tutorial/README to understand the schema
- [ ] Create `wildfire_db_records` table + indexes (PostGIS + pgvector)
- [ ] Write `training/wildfire_db/ingest.py` — streams the 17M rows into Postgres
- [ ] Spot-check 100 random rows for sanity (geography ranges, units, missing values)
- [ ] **Deliverable:** queryable WildfireDB in your Supabase, ready for both RAG and model training

### Phase 1 — Read-only MCP server (Week 1–2)
- [ ] Scaffold `mcp_server/` directory + dependencies (`mcp`, `httpx`, existing connectors)
- [ ] Implement `server.py` with stdio transport
- [ ] Wrap all 13 integrations as MCP tools (tool signatures above)
- [ ] Implement `situational_summary` composite tool
- [ ] Add Claude Desktop config snippet to README
- [ ] **Demo:** connect Claude Desktop, ask "what fires are burning in California right now?"

### Phase 1.5 — Firefighter LLM Assistant in the web app (Week 2–3)
- [ ] Backend: `POST /api/assistant` SSE route, wraps Claude messages API with tool use
- [ ] Wire MCP tools as Claude tool definitions
- [ ] System prompt tuned for wildland firefighter language and units
- [ ] Frontend: `AssistantPanel.tsx` chat UI alongside the existing Leaflet map
- [ ] Tool results auto-render onto the map (incident pins, weather overlays, camera markers)
- [ ] **Demo:** firefighter opens the web app, asks the assistant a question, sees the answer + map update

### Phase 2 — Telemetry + interaction logging (Week 3–4)
- [ ] Supabase migrations: `devices`, `telemetry_readings`, `media_assets`, `mcp_interactions`
- [ ] `/devices/register` + per-device API keys
- [ ] `/ingest/telemetry`, `/ingest/media`, `/ingest/event` endpoints
- [ ] MCP server middleware to auto-log every tool call to `mcp_interactions`
- [ ] Simple test client: a Python script simulating a tablet + a weather meter posting data

### Phase 3a — RAG corpus on WildfireDB (Week 4, accelerated by Phase 0)
- [ ] `rag_indexer.py` — embeds WildfireDB rows into `rag_chunks` (batch job)
- [ ] `recall_similar_incidents` MCP tool wired to vector search
- [ ] Assistant retrieves WildfireDB context on every fire-behavior question
- [ ] **No waiting for in-house data** — WildfireDB makes this live in week 4

### Phase 3b — Spread-prediction model trained on WildfireDB (Month 2)
- [ ] `training/wildfire_db/features.py` — feature engineering pipeline
- [ ] `training/wildfire_db/train_spread.py` — train a gradient-boosted regression (XGBoost / LightGBM) for spread rate
- [ ] Evaluate against a held-out 10% of WildfireDB
- [ ] Expose as `predict_fire_spread` MCP tool
- [ ] **Deliverable:** the assistant can give numerical spread forecasts, not just verbal

### Phase 3c — Fine-tuning on in-house Q&A + outcomes (Month 3+)
- [ ] `dataset_builder.py` → JSONL with `{situation, recommendation, outcome}`
- [ ] Manual labeling UI (or just a spreadsheet) for outcome quality
- [ ] First fine-tune job once you have ~200+ labeled samples

### Phase 3d — Additional prediction models (Month 4+)
- [ ] Crew fatigue / heat injury risk from wearables
- [ ] New-ignition detection from camera frames
- [ ] Re-train spread model with in-house data appended to WildfireDB

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

Two parallel tracks for next session:

1. **Phase 0:** download `wildfireDB.zip` from Zenodo, read the tutorial, and start writing `training/wildfire_db/ingest.py` to load the 17M rows into Supabase. This is the highest-leverage move — every later phase benefits.
2. **Phase 1, Step 1:** scaffold `mcp_server/` and implement `list_active_incidents` (your WildCAD/IRWIN integration is already live, so this is the fastest tool to ship and demo).

These can be done concurrently — Phase 0 is mostly data engineering (long-running ingest), Phase 1 is MCP plumbing. They don't block each other.
