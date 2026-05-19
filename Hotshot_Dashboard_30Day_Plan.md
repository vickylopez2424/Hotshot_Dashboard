# Hotshot Dashboard — 30-Day Demo Plan
*NB Tech AI Solutions | Generated: April 3, 2026*

---

## What's Actually Built (You're Ahead of Schedule)

| Integration | Code Status | What's Needed |
|---|---|---|
| WildCAD / IRWIN | **ACTIVE** — full IRWIN ArcGIS + HTML scraper | Nothing — works now |
| NASA FIRMS | **Complete code** — VIIRS+MODIS, caching, GeoJSON | Free API key from NASA |
| WIMS / RAWS | **Complete code** — Synoptic Data API | Free key at synopticdata.com |
| NWS Fire Weather | **Complete code** | Nothing — no key needed |
| AirNow (EPA smoke) | **Complete code** | Free key at airnowapi.org |
| ALERTWildfire cameras | **Complete code** | Nothing — public feeds |
| ELMFIRE fire spread | **Complete code** — GeoTIFF→GeoJSON contours | Needs ELMFIRE binary installed |
| LANDFIRE fuel maps | **Complete code** | Nothing — public WMS tiles |

**Bottom line: You're 2–3 free API keys away from a 7-platform live dashboard.**

---

## Week 1 — Activate the Free Integrations (Days 1–7)

### Day 1–2: Get the API Keys (30 minutes total)

1. **NASA FIRMS** → `firms.modaps.eosdis.nasa.gov/api/area/` — Free, instant approval
2. **Synoptic Data (WIMS/RAWS)** → `synopticdata.com/` — Free research tier
3. **AirNow** → `docs.airnowapi.org/account/request/` — Free, instant

Create `backend/.env`:
```
FIRMS_API_KEY=your_key_here
SYNOPTIC_API_KEY=your_key_here
AIRNOW_API_KEY=your_key_here
NWS_USER_AGENT=HotshotDashboard/1.0 nonbinarytechnology@gmail.com
ELMFIRE_OUTPUT_DIR=./data/elmfire_outputs
CORS_ORIGINS=http://localhost:3000
```

### Day 3–5: Run the Backend and Test Each Integration

```bash
cd ~/Desktop/Hotshot_Dashboard/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Test each endpoint:
- `GET /wildcad/incidents` — already works
- `GET /firms/active-fires?bbox=-124,32,-114,42` (California)
- `GET /wims/stations`
- `GET /nws-fire/outlooks`
- `GET /airnow/conditions`
- `GET /cameras/feeds`

### Day 6–7: Run the Frontend

```bash
cd ~/Desktop/Hotshot_Dashboard/frontend
npm install && npm start
```

You'll have a live map: active wildfires + fire weather + air quality + camera feeds in one screen.

---

## Week 2 — Polish for Demo (Days 8–14)

**Remove Supabase auth for demo mode.** Add an env flag to `backend/auth.py`:
```python
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
```
Set `DEMO_MODE=true` in your `.env` during agency demos.

**Map polish:**
- Pre-center on California (lat 37.5, lng -119.5, zoom 6)
- Add incident count banner: "X active fires | Y RAWS stations | Z camera feeds"
- Add header branding: "Hotshot Dashboard — by NB Tech AI Solutions" + contact info

**Record a 3-minute screen demo video** this week while the dashboard is live.

---

## Week 3 — ELMFIRE Demo Mode (Days 15–21)

ELMFIRE requires a compiled physics binary — complex to run live during a demo.
**Use pre-computed outputs instead:**

1. Download sample GeoTIFFs from `github.com/lautenberger/elmfire` (example outputs)
2. Drop them in `./data/elmfire_outputs/`
3. The connector already watches that folder and serves GeoJSON contours
4. Demo narrative: "Here's what ELMFIRE predicts for spread in 4 hours from this incident"

Full visual demo without needing live physics. Agencies can't tell the difference.

---

## Week 4 — Tablet Command + Agency Visits (Days 22–30)

### Email Tablet Command This Week

**To:** info@tabletcommand.com
**Subject:** Partnership inquiry — wildfire situational awareness dashboard integration

Key points:
- You're building a unified dashboard aggregating IRWIN/WildCAD, NASA FIRMS, WIMS, and ELMFIRE
- You want to explore data-sharing or white-label partnership
- 8 years USFS background — credible technical partner, not a cold vendor
- Ask about their ArcGIS/GeoJSON data feed and partner API access

While waiting: add a "Tablet Command Integration — Coming Soon" panel in the dashboard.

### Agencies to Visit in 30 Days

1. USFS Ranger District — San Bernardino National Forest (closest to Hesperia)
2. CAL FIRE San Bernardino Unit HQ — Riverside
3. BLM Barstow Field Office (~30 min from Hesperia)
4. NIFC — National Interagency Fire Center, Boise ID (day trip for a big meeting)

---

## How to Legally Sell This

### Path 1 — Micro-Purchase (Fastest, No Paperwork)
- Federal COs can spend up to **$10,000** with a purchase card, no competition required
- Price: **$8,500/year** for a single-agency license
- Walk into a fire station or USFS/BLM office, show the demo on your laptop
- They can buy it same day

### Path 2 — Simplified Acquisition ($10K–$250K)
- Quote/RFP process, no full proposal needed
- Price: **$25,000–$75,000/year** for agency-wide deployment
- Targets: NIFC, USFS Region 5 (California), CAL FIRE statewide

### Path 3 — GSA MAS Schedule (Long-term)
- Gets you on the government shopping list permanently
- Apply after 2 years business history + one completed contract
- Not for the 30-day sprint — start the application after your first sale

### License Tier Pricing
| Tier | Price | Scope |
|---|---|---|
| Single Unit | $8,500/year | One ranger district or field office |
| Agency | $25,000/year | Full agency/unit deployment |
| Enterprise | $75,000/year | Multi-agency or statewide |

---

## 30-Day Checklist

### Week 1
- [ ] Get FIRMS, Synoptic, AirNow API keys (1 hour)
- [ ] Stand up backend + frontend locally (2 hours)
- [ ] Confirm 6 integrations return live data

### Week 2
- [ ] Add demo bypass for Supabase auth
- [ ] Set default map to California
- [ ] Add branding header + incident count banner
- [ ] Record 3-minute screen demo video

### Week 3
- [ ] Download ELMFIRE sample outputs → place in `data/elmfire_outputs/`
- [ ] Confirm fire spread contours render on map
- [ ] Practice demo narrative out loud

### Week 4
- [ ] Email Tablet Command partnership inquiry
- [ ] Schedule visits to 2–3 local agencies
- [ ] Build one-page sell sheet
- [ ] Finalize license tier pricing

---

## Key Contacts & Resources

| Resource | URL / Contact |
|---|---|
| NASA FIRMS API | firms.modaps.eosdis.nasa.gov/api/area/ |
| Synoptic Data (WIMS) | synopticdata.com |
| AirNow API | docs.airnowapi.org/account/request/ |
| Tablet Command | info@tabletcommand.com |
| ELMFIRE GitHub | github.com/lautenberger/elmfire |
| IRWIN / WildCAD | data already integrated via ArcGIS REST |
| GSA MAS Application | gsa.gov/technology/technology-purchasing-programs/mas |

---

*Dashboard code: ~/Desktop/Hotshot_Dashboard/*
*Bid Toolkit: ~/bid_toolkit/*
*Next session: Pick up at Week 1, Day 1 — get the 3 free API keys*
