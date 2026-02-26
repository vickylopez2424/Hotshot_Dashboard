"""
Plant ID Integration
Identifies plant species from field photos using the iNaturalist
Computer Vision API (free, no key required), then enriches results
with fire behavior data — fuel model, flammability, fire ecology notes.

API: https://api.inaturalist.org/v1/computervision/score_image
"""
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)

INAT_CV_URL = "https://api.inaturalist.org/v1/computervision/score_image"

# ─── Fire behavior database ───────────────────────────────────────────────────
# Maps iNaturalist taxon names (genus or species) to fire behavior data.
# fuel_model: Scott-Burgan FBFM40 code
# flammability: low / moderate / high / extreme
# season_risk: when fire risk is highest
# notes: operational fire behavior context

FIRE_SPECIES_DB = {
    # ── Invasive annual grasses (catastrophic for fire regimes) ──
    "Bromus tectorum": {
        "common": "Cheatgrass",
        "fuel_model": "GR2",
        "flammability": "extreme",
        "season_risk": "June–August (cures early)",
        "notes": "Worst invasive fire species in the West. Creates a near-continuous fine-fuel carpet that cures 4–6 weeks before native grasses. Dramatically increases fire frequency. Carrier of fire into previously non-burning areas.",
        "invasive": True,
    },
    "Taeniatherum caput-medusae": {
        "common": "Medusahead",
        "fuel_model": "GR1",
        "flammability": "high",
        "season_risk": "July–September",
        "notes": "Highly invasive, replaces cheatgrass in degraded sites. Dense litter layer. Fire spreads rapidly through medusahead stands.",
        "invasive": True,
    },
    "Avena": {
        "common": "Wild Oats (genus)",
        "fuel_model": "GR3",
        "flammability": "high",
        "season_risk": "May–July",
        "notes": "Tall annual grass. Cures in late spring and early summer creating heavy fine fuel loads. Common in California foothills.",
        "invasive": True,
    },
    # ── High-risk native shrubs ──
    "Adenostoma fasciculatum": {
        "common": "Chamise (Greasewood)",
        "fuel_model": "SH5",
        "flammability": "extreme",
        "season_risk": "July–October",
        "notes": "Dominant chaparral shrub. Extremely flammable — high essential oil content. Old chamise (>30 yrs) accumulates dead wood (deadwood ratio can be 40-60%). Burns with intense, long-flame-length fires. Resprouts vigorously after fire.",
        "invasive": False,
    },
    "Arctostaphylos": {
        "common": "Manzanita (genus)",
        "fuel_model": "SH7",
        "flammability": "extreme",
        "season_risk": "July–October",
        "notes": "Dense resinous shrub. Extremely flammable. Dead fuel fraction is very responsive to drought. Crown fires common in manzanita-dominated slopes. Multiple species across CA, OR, WA mountains.",
        "invasive": False,
    },
    "Ceanothus": {
        "common": "Ceanothus / Wild Lilac (genus)",
        "fuel_model": "SH7",
        "flammability": "extreme",
        "season_risk": "July–October",
        "notes": "High oil content in leaves and stems. Burns explosively. Often co-dominant with chamise in mixed chaparral. Seeds germinate after fire — fire-adapted species.",
        "invasive": False,
    },
    "Artemisia tridentata": {
        "common": "Big Sagebrush",
        "fuel_model": "SH2",
        "flammability": "high",
        "season_risk": "August–October",
        "notes": "Dominant shrub of the Great Basin. Highly aromatic — volatile oils increase flammability. Interspersed with cheatgrass creates the most fire-prone landscape type in the West. Does NOT resprout after fire; loss is permanent unless seeded.",
        "invasive": False,
    },
    "Cytisus scoparius": {
        "common": "Scotch Broom",
        "fuel_model": "SH1",
        "flammability": "high",
        "season_risk": "July–September",
        "notes": "Invasive shrub from Europe. Dense stands dry completely by midsummer. Seeds can lie dormant 30+ years — spreads rapidly after fire.",
        "invasive": True,
    },
    "Ulex europaeus": {
        "common": "Gorse",
        "fuel_model": "SH5",
        "flammability": "extreme",
        "season_risk": "Year-round",
        "notes": "Invasive spiny shrub. Considered one of the most flammable plants in the world. Waxy cuticle and volatile oils. Burns in all seasons including wet winters.",
        "invasive": True,
    },
    # ── Eucalyptus ──
    "Eucalyptus globulus": {
        "common": "Blue Gum Eucalyptus",
        "fuel_model": "TL8",
        "flammability": "extreme",
        "season_risk": "Summer-Fall dry season",
        "notes": "Non-native. Produces enormous volumes of long-ribbon bark and leaf litter that dry quickly. Burns with very long flames and generates abundant firebrands (spotting). Associated with major urban interface fires (1991 Oakland Hills). Toxic to most native understory plants.",
        "invasive": True,
    },
    "Eucalyptus": {
        "common": "Eucalyptus (genus)",
        "fuel_model": "TL8",
        "flammability": "extreme",
        "season_risk": "Summer-Fall dry season",
        "notes": "Multiple invasive eucalyptus species in California. All are extreme fire hazards due to bark, litter load, and volatile oil content.",
        "invasive": True,
    },
    # ── Conifers ──
    "Pinus ponderosa": {
        "common": "Ponderosa Pine",
        "fuel_model": "TU1",
        "flammability": "moderate",
        "season_risk": "Late summer drought",
        "notes": "Historically maintained by low-intensity surface fire. 100+ years of fire suppression has led to dense, ladder-fuel-laden stands. Stressed trees highly susceptible to bark beetle attack — dead snags become extreme fuel. Crown fire risk rises sharply in beetle-killed stands.",
        "invasive": False,
    },
    "Pinus jeffreyi": {
        "common": "Jeffrey Pine",
        "fuel_model": "TL4",
        "flammability": "moderate",
        "season_risk": "Late summer drought",
        "notes": "Similar to Ponderosa but at higher elevations. Open parklike structure when managed with fire. Needles and cones contribute to surface fire.",
        "invasive": False,
    },
    "Abies concolor": {
        "common": "White Fir",
        "fuel_model": "TL5",
        "flammability": "high",
        "season_risk": "Summer drought",
        "notes": "Fire-sensitive species that has expanded due to fire suppression. Low-branching creates ladder fuels for crown fire spread. Often co-invades ponderosa pine forests.",
        "invasive": False,
    },
    "Calocedrus decurrens": {
        "common": "Incense Cedar",
        "fuel_model": "TL5",
        "flammability": "moderate",
        "season_risk": "Late summer drought",
        "notes": "Dense bark provides some fire resistance. Can carry crown fire in dense stands. Often a ladder fuel indicator in mixed conifer forests.",
        "invasive": False,
    },
    # ── Oaks ──
    "Quercus agrifolia": {
        "common": "Coast Live Oak",
        "fuel_model": "TL3",
        "flammability": "moderate",
        "season_risk": "Summer drought",
        "notes": "Evergreen oak. Litter layer can smolder for long periods. Interface between chaparral and oak woodland is a critical fire transition zone.",
        "invasive": False,
    },
    # ── Grasslands ──
    "Stipa pulchra": {
        "common": "Purple Needlegrass",
        "fuel_model": "GR3",
        "flammability": "moderate",
        "season_risk": "July–September",
        "notes": "Native California grass. Less flammable than invasive annual grasses. Where it dominates, fire frequency and intensity are lower than annual-grass-dominated areas.",
        "invasive": False,
    },
}

# Genus-level fallback lookup
GENUS_FIRE_DB = {g.split()[0]: data for g, data in FIRE_SPECIES_DB.items()}


def _lookup_fire_info(taxon_name: str, ancestors: list) -> dict:
    """Search fire DB by species name, genus, or any ancestor name."""
    # Try exact species match
    if taxon_name in FIRE_SPECIES_DB:
        return FIRE_SPECIES_DB[taxon_name]
    # Try genus (first word)
    genus = taxon_name.split()[0] if taxon_name else ""
    if genus in GENUS_FIRE_DB:
        return GENUS_FIRE_DB[genus]
    # Try ancestor names
    for ancestor in ancestors:
        aname = ancestor.get("name", "")
        if aname in FIRE_SPECIES_DB:
            return FIRE_SPECIES_DB[aname]
        if aname.split()[0] in GENUS_FIRE_DB:
            return GENUS_FIRE_DB[aname.split()[0]]
    return None


# ─── Endpoints ────────────────────────────────────────────

@router.get("/status")
def status():
    return {
        "state":  "ready",
        "source": "iNaturalist Computer Vision API",
        "auth":   "none_required",
        "species_in_fire_db": len(FIRE_SPECIES_DB),
    }


@router.get("/fire-species")
def fire_species():
    """List all species in the fire behavior database."""
    return {
        "species": [
            {"name": name, **data}
            for name, data in FIRE_SPECIES_DB.items()
        ]
    }


@router.post("/identify")
async def identify_plant(image: UploadFile = File(...)):
    """
    Identify a plant from an uploaded photo.
    Returns top species matches + fire behavior data for each.
    """
    # Read image bytes
    image_bytes = await image.read()
    if len(image_bytes) > 20_000_000:
        raise HTTPException(status_code=413, detail="Image too large — max 20MB")

    content_type = image.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Call iNaturalist Computer Vision API
    try:
        resp = httpx.post(
            INAT_CV_URL,
            files={"image": (image.filename, image_bytes, content_type)},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"iNaturalist API error: {e}")
    except Exception as e:
        logger.error("Plant ID failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    results = data.get("results", [])[:5]  # Top 5 matches

    enriched = []
    for result in results:
        taxon = result.get("taxon", {})
        name  = taxon.get("name", "")
        ancestors = taxon.get("ancestors", [])

        fire_info = _lookup_fire_info(name, ancestors)

        enriched.append({
            "score":        round(result.get("combined_score", 0) * 100, 1),
            "taxon_id":     taxon.get("id"),
            "scientific":   name,
            "common":       taxon.get("preferred_common_name", ""),
            "rank":         taxon.get("rank", ""),
            "iconic_taxon": taxon.get("iconic_taxon_name", ""),
            "photo_url":    (taxon.get("default_photo") or {}).get("square_url"),
            "inat_url":     f"https://www.inaturalist.org/taxa/{taxon.get('id')}" if taxon.get("id") else None,
            "fire":         fire_info,
        })

    # Common ancestor summary
    ancestor = data.get("common_ancestor", {})
    ancestor_taxon = ancestor.get("taxon", {}) if ancestor else {}

    return {
        "top_match":       enriched[0] if enriched else None,
        "results":         enriched,
        "common_ancestor": {
            "name":  ancestor_taxon.get("name"),
            "rank":  ancestor_taxon.get("rank"),
            "score": ancestor.get("score") if ancestor else None,
        },
    }
