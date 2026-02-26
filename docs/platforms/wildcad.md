# WildCAD / IRWIN Integration

## Overview

WildCAD is a Computer Aided Dispatch (CAD) system used by wildland fire agencies.
Incident data from WildCAD flows automatically into **IRWIN** (Integrated Reporting
of Wildland-fire Information), the federal wildfire data exchange hub.

This integration uses two complementary sources:

| Source | What it provides | Auth required |
|---|---|---|
| **NIFC IRWIN** (ArcGIS REST) | Fire incidents, acreage, cause, personnel, containment | None (public) |
| **WildCAD HTML scraper** | Dispatcher-level detail: resources, CAD notes, unit status | None (public pages) |

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/wildcad/status` | Connector health check |
| `GET /api/wildcad/incidents?state=CA` | Active fire incidents from NIFC IRWIN |
| `GET /api/wildcad/incidents/map` | Same data as GeoJSON (for map rendering) |
| `GET /api/wildcad/trends?state=CA` | Year-to-date trend statistics |
| `GET /api/wildcad/trends/ytd-incidents` | Raw YTD incident list |
| `GET /api/wildcad/dispatch?center_code=WCIDBDC` | Scrape a WildCAD center page |
| `GET /api/wildcad/dispatch/{CENTER_CODE}` | Same, path-based |

## Incident Data Fields (from IRWIN)

| Field | Description |
|---|---|
| `name` | Fire name |
| `state` | State (e.g. CA) |
| `county` | County |
| `dispatch_center` | WildCAD dispatch center ID |
| `daily_acres` | Current reported acreage |
| `percent_contained` | % containment |
| `personnel` | Total incident personnel |
| `cause_general` | Human-caused / Lightning / Unknown |
| `discovery_epoch` | Discovery timestamp (ms since epoch) |
| `size_class` | NWCG fire size class (A–G) |
| `landowner_category` | Federal / State / Private |
| `jurisdictional_unit` | Responsible unit |

## Trends Statistics

The `/trends` endpoint computes from year-to-date NIFC data:
- **Monthly incident counts** — bar chart by month
- **By cause** — Human vs Lightning breakdown
- **By agency** — Federal, State, Private, etc.
- **Top 15 states** by incident count
- **Total YTD acreage** burned
- **Containment rate** — % of incidents contained

## WildCAD Dispatch Scraper

The dispatch tab scrapes HTML from specific WildCAD center pages for
resources assigned and CAD notes not available through IRWIN.

**Finding your center code:**
1. Visit [wildcad.net/WildCADWeb.asp](http://www.wildcad.net/WildCADWeb.asp)
2. Click your dispatch center
3. Note the URL: `wildcad.net/WC{CODE}.htm`

**Known center codes:**
| Code | Center |
|---|---|
| `WCIDBDC` | Boise Interagency Dispatch Center |
| `WCNMTDC` | Taos Interagency Dispatch Center |
| `WCNVCNC` | Central Nevada Interagency DC |
| `WCCASQF` | Sequoia-Kings Canyon NPS |
| `WCCAYOS` | Yosemite National Park |

## Map Marker Legend

| Color | Meaning |
|---|---|
| Red | Active, 0% contained |
| Orange | Partially contained (1–49%) |
| Amber | Majority contained (50–99%) |
| Green | Fully contained / controlled |

Marker size scales with acreage (larger = bigger fire).

## Data Sources

- NIFC Open Data Portal: [data-nifc.opendata.arcgis.com](https://data-nifc.opendata.arcgis.com)
- IRWIN Overview: [wildfire.gov/application/irwin](https://www.wildfire.gov/application/irwin-integrated-reporting-wildfire-information)
- WildCAD: [wildcad.net](http://www.wildcad.net)
