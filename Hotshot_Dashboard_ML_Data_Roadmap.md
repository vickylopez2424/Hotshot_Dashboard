# Hotshot Dashboard — ML & Data Roadmap
*NB Tech AI Solutions | Generated: 2026-05-18*

This consolidates the machine-learning strategy, data sources, and use cases
into one place. It sits alongside `Hotshot_Dashboard_30Day_Plan.md` (the demo
sprint) and `MCP_Server_Plan.md` (the AI interface).

---

## The core principle

Three different things get called "AI" — they are NOT equal in difficulty:

1. **LLM reasoning** — Claude reads live data via MCP and reasons. No training. Works today.
2. **RAG memory** — store past incidents, retrieve similar ones. No training. Modest effort.
3. **Trained ML models** — *you* train a model to predict. Needs lots of data. Hardest.

You cannot train a model (#3) on data you have not collected. So the order is
fixed: **collect data → sell the LLM/RAG version → customers generate more data
→ train ML → sell the predictive tier.** The moat is the dataset, not the
algorithm — algorithms are public; the data is yours.

---

## Foundation — the data pipeline ✅ BUILT

`data_pipeline/` snapshots IRWIN incidents + NWS fire weather alerts to a local
database every 3 hours, automatically (launchd). This is the trajectory dataset
all ML use cases below depend on. **Running now.** See `data_pipeline/README.md`.

---

## Data sources — "more information in one platform"

### Already in the dashboard
IRWIN incidents · FIRMS satellite detections · NWS fire weather · RAWS weather ·
LANDFIRE fuels · AirNow air quality · ALERTWildfire cameras (feed needs repair) ·
ELMFIRE spread · vegetation/NDVI.

### Recommended additions (public, ingest into the pipeline)

| Data source | Why it matters for ML | Priority |
|---|---|---|
| **ERC / NFDRS fuel-moisture indices** | *The* fire-danger metric — top predictor | High |
| **Terrain / DEM (USGS 3DEP)** | Slope, aspect, elevation — fire runs uphill | High |
| **Historical fire perimeters (WFIGS, MTBS)** | Learn spread patterns + burn history | High |
| **Lightning strike data (NWS / NLDN)** | Holdover-ignition prediction | Medium |
| **US Drought Monitor** | Seasonal dryness context | Medium |
| **Building footprints (Microsoft, free)** | Structure-threat modeling | Medium |
| **Road networks** | Resource routing / access | Low |

### Proprietary data — collect, this is the actual moat
Every MCP question asked + answer · field device telemetry · **incident
outcomes** (what was decided, what worked, containment time). No competitor has
this. Collection mechanism = `MCP_Server_Plan.md` Phase 2.

---

## Use-case backlog (the "1–5" suggestions, sequenced)

Ordered by *value ÷ effort*, not by excitement. Each builds on the one before.

### A. ICS-209 auto-drafting — **LLM only, do first**
AI drafts the situation report every Incident Commander must file. No ML
training; pure LLM over dashboard data. Removes a universally hated chore — the
best sales opener. **Unblocked now.**

### B. RAWS anomaly early-warning
Flags a dangerous shift (humidity crash + wind spike) before a human notices.
Lightweight — rules + simple stats over live RAWS. **Needs the Synoptic API key.**

### C. Fire-escalation risk classifier
Given a fire's first hours, scores its chance of becoming a 300+ acre fire.
Trains on the snapshot pipeline's trajectory data (self-labeled by final size).
**Unblocked once the pipeline has ~4–8 weeks of history.**

### D. Pre-positioning risk surface
"Stage engines here before the weekend." Combines fire weather forecasts +
fuels + historical ignition density. Plays to your hotshot preparedness
instinct. **Needs sources C + ERC + historical perimeters.**

### E. Structure-threat prediction
Which homes/communities are in a fire's path, and when. Combines spread
(ELMFIRE) + building footprints. Sellable to counties *and* fire agencies.
**Needs building footprints + working spread model.**

### F. Multi-source ignition-confirmation engine
NOT a single-camera smoke detector (can't out-train ALERTCalifornia's labeled
imagery). Instead, *fuse* signals: camera + FIRMS hotspot + lightning + RAWS →
confirm real ignitions faster, with far fewer false positives than camera-alone.
Defensible because it uses integrations you already have, and needs no computer-
vision training to start. Add CV later if camera access is secured.
**Partly unblocked now (fusion logic); full version needs camera feed repair.**

---

## Sequenced timeline

| Phase | Work | Depends on |
|---|---|---|
| **Now** | Data pipeline running (done); ICS-209 drafting (A); fusion logic for (F) | — |
| **Month 1** | Get API keys → RAWS anomaly (B); ingest ERC + terrain | API keys |
| **Month 2** | Fire-escalation classifier (C) — first real trained model | ~4–8 wks of snapshots |
| **Month 3** | Pre-positioning surface (D); MCP telemetry ingestion (Phase 2) | C + customers |
| **Month 4+** | Structure-threat (E); full ignition engine (F); RAG over outcomes | data volume |

**Honest note:** these are sequenced deliberately. Building all six at once
would produce six broken stubs. Each one ships only when its data dependency is
met — and the data pipeline that started today is what unlocks the chain.

---

## What to sell, and when

- **Now:** "AI assistant that reads live fire conditions and recommends resource
  staging" + "auto-drafts your ICS-209s." True today (LLM + MCP).
- **Soon:** "recalls similar past incidents and what worked" (RAG).
- **Later, only once trained:** "prediction models trained on your agency's
  incident history."

Do not put unbuilt predictive ML in a federal proposal — overpromising is a
credibility and contractual risk. Lead with what runs.
