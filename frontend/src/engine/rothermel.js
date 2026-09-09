/**
 * Rothermel (1972) surface fire spread with Albini (1976) corrections, as
 * implemented in BehavePlus / FARSITE / the firelab "behave" library.
 *
 * Pure functions, English units inside (ft, lb, BTU, min). No dependencies.
 *
 * Fuel models
 *   Scott and Burgan (2005) "Standard fire behavior fuel models: a
 *   comprehensive set for use with Rothermel's surface fire spread model",
 *   USDA Forest Service RMRS-GTR-153, Tables 4 to 9 (all 40 models, loads in
 *   tons/acre, SAV in 1/ft, depth in ft, dead moisture of extinction in
 *   percent, heat content BTU/lb). Codes 101 to 204 are the LANDFIRE FBFM40
 *   codes. Codes 91 to 99 are the non-burnable classes (NB1 urban, NB2 snow,
 *   NB3 agriculture, NB8 water, NB9 barren) and give zero spread.
 *   Codes 1 to 13 are the original Anderson (1982) models, kept for the
 *   BehavePlus reference tests. 10-h SAV is 109 and 100-h SAV is 30 for
 *   every model (Scott and Burgan p. 12).
 *
 * Validation: frontend/src/engine/__tests__/run.js reproduces the surface
 * fire cases in firelab/behave src/testBehave/testBehave.cpp to 1e-4.
 */

const TONS_PER_ACRE_TO_LB_PER_FT2 = 2000 / 43560;   // 0.0459137
const PARTICLE_DENSITY = 32.0;      // lb/ft3
const TOTAL_MINERAL = 0.0555;       // S_T
const EFFECTIVE_MINERAL = 0.010;    // S_e
const SAV_10H = 109, SAV_100H = 30;

// [code, name, w1, w10, w100, wHerb, wWoody, sav1, savHerb, savWoody, depth, mxDead%, heatDead, heatLive, dynamic]
// prettier-ignore
const TABLE = [
  // Anderson 13 (static). Live fuel is herbaceous for FM2 and woody for 4, 5, 7, 10.
  [1,  'FM1',  0.74, 0.00, 0.00, 0.00, 0.00, 3500, 1500, 1500, 1.0, 12, 8000, 8000, false],
  [2,  'FM2',  2.00, 1.00, 0.50, 0.50, 0.00, 3000, 1500, 1500, 1.0, 15, 8000, 8000, false],
  [3,  'FM3',  3.01, 0.00, 0.00, 0.00, 0.00, 1500, 1500, 1500, 2.5, 25, 8000, 8000, false],
  [4,  'FM4',  5.01, 4.01, 2.00, 0.00, 5.01, 2000, 1500, 1500, 6.0, 20, 8000, 8000, false],
  [5,  'FM5',  1.00, 0.50, 0.00, 0.00, 2.00, 2000, 1500, 1500, 2.0, 20, 8000, 8000, false],
  [6,  'FM6',  1.50, 2.50, 2.00, 0.00, 0.00, 1750, 1500, 1500, 2.5, 25, 8000, 8000, false],
  [7,  'FM7',  1.13, 1.87, 1.50, 0.00, 0.37, 1750, 1500, 1550, 2.5, 40, 8000, 8000, false],
  [8,  'FM8',  1.50, 1.00, 2.50, 0.00, 0.00, 2000, 1500, 1500, 0.2, 30, 8000, 8000, false],
  [9,  'FM9',  2.92, 0.41, 0.15, 0.00, 0.00, 2500, 1500, 1500, 0.2, 25, 8000, 8000, false],
  [10, 'FM10', 3.01, 2.00, 5.01, 0.00, 2.00, 2000, 1500, 1500, 1.0, 25, 8000, 8000, false],
  [11, 'FM11', 1.50, 4.51, 5.51, 0.00, 0.00, 1500, 1500, 1500, 1.0, 15, 8000, 8000, false],
  [12, 'FM12', 4.01, 14.03, 16.53, 0.00, 0.00, 1500, 1500, 1500, 2.3, 20, 8000, 8000, false],
  [13, 'FM13', 7.01, 23.04, 28.05, 0.00, 0.00, 1500, 1500, 1500, 3.0, 25, 8000, 8000, false],
  // Non-burnable
  [91, 'NB1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false],
  [92, 'NB2', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false],
  [93, 'NB3', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false],
  [98, 'NB8', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false],
  [99, 'NB9', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false],
  // Grass (all dynamic)
  [101, 'GR1', 0.10, 0.00, 0.00, 0.30, 0.00, 2200, 2000, 9999, 0.4, 15, 8000, 8000, true],
  [102, 'GR2', 0.10, 0.00, 0.00, 1.00, 0.00, 2000, 1800, 9999, 1.0, 15, 8000, 8000, true],
  [103, 'GR3', 0.10, 0.40, 0.00, 1.50, 0.00, 1500, 1300, 9999, 2.0, 30, 8000, 8000, true],
  [104, 'GR4', 0.25, 0.00, 0.00, 1.90, 0.00, 2000, 1800, 9999, 2.0, 15, 8000, 8000, true],
  [105, 'GR5', 0.40, 0.00, 0.00, 2.50, 0.00, 1800, 1600, 9999, 1.5, 40, 8000, 8000, true],
  [106, 'GR6', 0.10, 0.00, 0.00, 3.40, 0.00, 2200, 2000, 9999, 1.5, 40, 9000, 9000, true],
  [107, 'GR7', 1.00, 0.00, 0.00, 5.40, 0.00, 2000, 1800, 9999, 3.0, 15, 8000, 8000, true],
  [108, 'GR8', 0.50, 1.00, 0.00, 7.30, 0.00, 1500, 1300, 9999, 4.0, 30, 8000, 8000, true],
  [109, 'GR9', 1.00, 1.00, 0.00, 9.00, 0.00, 1800, 1600, 9999, 5.0, 40, 8000, 8000, true],
  // Grass-shrub (all dynamic)
  [121, 'GS1', 0.20, 0.00, 0.00, 0.50, 0.65, 2000, 1800, 1800, 0.9, 15, 8000, 8000, true],
  [122, 'GS2', 0.50, 0.50, 0.00, 0.60, 1.00, 2000, 1800, 1800, 1.5, 15, 8000, 8000, true],
  [123, 'GS3', 0.30, 0.25, 0.00, 1.45, 1.25, 1800, 1600, 1600, 1.8, 40, 8000, 8000, true],
  [124, 'GS4', 1.90, 0.30, 0.10, 3.40, 7.10, 1800, 1600, 1600, 2.1, 40, 8000, 8000, true],
  // Shrub
  [141, 'SH1', 0.25, 0.25, 0.00, 0.15, 1.30, 2000, 1800, 1600, 1.0, 15, 8000, 8000, true],
  [142, 'SH2', 1.35, 2.40, 0.75, 0.00, 3.85, 2000, 9999, 1600, 1.0, 15, 8000, 8000, false],
  [143, 'SH3', 0.45, 3.00, 0.00, 0.00, 6.20, 1600, 9999, 1400, 2.4, 40, 8000, 8000, false],
  [144, 'SH4', 0.85, 1.15, 0.20, 0.00, 2.55, 2000, 1800, 1600, 3.0, 30, 8000, 8000, false],
  [145, 'SH5', 3.60, 2.10, 0.00, 0.00, 2.90, 750, 9999, 1600, 6.0, 15, 8000, 8000, false],
  [146, 'SH6', 2.90, 1.45, 0.00, 0.00, 1.40, 750, 9999, 1600, 2.0, 30, 8000, 8000, false],
  [147, 'SH7', 3.50, 5.30, 2.20, 0.00, 3.40, 750, 9999, 1600, 6.0, 15, 8000, 8000, false],
  [148, 'SH8', 2.05, 3.40, 0.85, 0.00, 4.35, 750, 9999, 1600, 3.0, 40, 8000, 8000, false],
  [149, 'SH9', 4.50, 2.45, 0.00, 1.55, 7.00, 750, 1800, 1500, 4.4, 40, 8000, 8000, true],
  // Timber-understory
  [161, 'TU1', 0.20, 0.90, 1.50, 0.20, 0.90, 2000, 1800, 1600, 0.6, 20, 8000, 8000, true],
  [162, 'TU2', 0.95, 1.80, 1.25, 0.00, 0.20, 2000, 9999, 1600, 1.0, 30, 8000, 8000, false],
  [163, 'TU3', 1.10, 0.15, 0.25, 0.65, 1.10, 1800, 1600, 1400, 1.3, 30, 8000, 8000, true],
  [164, 'TU4', 4.50, 0.00, 0.00, 0.00, 2.00, 2300, 9999, 2000, 0.5, 12, 8000, 8000, false],
  [165, 'TU5', 4.00, 4.00, 3.00, 0.00, 3.00, 1500, 9999, 750, 1.0, 25, 8000, 8000, false],
  // Timber litter
  [181, 'TL1', 1.00, 2.20, 3.60, 0.00, 0.00, 2000, 9999, 9999, 0.2, 30, 8000, 8000, false],
  [182, 'TL2', 1.40, 2.30, 2.20, 0.00, 0.00, 2000, 9999, 9999, 0.2, 25, 8000, 8000, false],
  [183, 'TL3', 0.50, 2.20, 2.80, 0.00, 0.00, 2000, 9999, 9999, 0.3, 20, 8000, 8000, false],
  [184, 'TL4', 0.50, 1.50, 4.20, 0.00, 0.00, 2000, 9999, 9999, 0.4, 25, 8000, 8000, false],
  [185, 'TL5', 1.15, 2.50, 4.40, 0.00, 0.00, 2000, 9999, 9999, 0.6, 25, 8000, 8000, false],
  [186, 'TL6', 2.40, 1.20, 1.20, 0.00, 0.00, 2000, 9999, 9999, 0.3, 25, 8000, 8000, false],
  [187, 'TL7', 0.30, 1.40, 8.10, 0.00, 0.00, 2000, 9999, 9999, 0.4, 25, 8000, 8000, false],
  [188, 'TL8', 5.80, 1.40, 1.10, 0.00, 0.00, 1800, 9999, 9999, 0.3, 35, 8000, 8000, false],
  [189, 'TL9', 6.65, 3.30, 4.15, 0.00, 0.00, 1800, 9999, 9999, 0.6, 35, 8000, 8000, false],
  // Slash-blowdown
  [201, 'SB1', 1.50, 3.00, 11.00, 0.00, 0.00, 2000, 9999, 9999, 1.0, 25, 8000, 8000, false],
  [202, 'SB2', 4.50, 4.25, 4.00, 0.00, 0.00, 2000, 9999, 9999, 1.0, 25, 8000, 8000, false],
  [203, 'SB3', 5.50, 2.75, 3.00, 0.00, 0.00, 2000, 9999, 9999, 1.2, 25, 8000, 8000, false],
  [204, 'SB4', 5.25, 3.50, 5.25, 0.00, 0.00, 2000, 9999, 9999, 2.7, 25, 8000, 8000, false],
];

export const FUEL_MODELS = new Map();
for (const r of TABLE) {
  FUEL_MODELS.set(r[0], {
    code: r[0], name: r[1],
    load: { h1: r[2], h10: r[3], h100: r[4], herb: r[5], woody: r[6] },   // tons/acre
    sav: { h1: r[7], herb: r[8], woody: r[9] },
    depth: r[10], mxDead: r[11] / 100, heatDead: r[12], heatLive: r[13],
    dynamic: r[14],
    burnable: r[2] + r[3] + r[4] + r[5] + r[6] > 0,
  });
}

export function isBurnable(code) {
  const fm = FUEL_MODELS.get(code);
  return !!(fm && fm.burnable);
}

/** Size class group of a SAV (Rothermel 1972 net load weighting, Albini 1976). */
function sizeGroup(sav) {
  if (sav >= 1200) return 0;
  if (sav >= 192) return 1;
  if (sav >= 96) return 2;
  if (sav >= 48) return 3;
  if (sav >= 16) return 4;
  return 5;
}

/**
 * Fuel bed intermediates that depend only on the fuel model and the moistures.
 * Wind and slope are applied afterwards by spreadRate(). Doing it in two steps
 * lets the grid engine compute this once per fuel model per hour.
 *
 * @param {number} code fuel model code
 * @param {object} m moisture in PERCENT: {h1, h10, h100, herb, woody}
 * @returns {object|null} null when the fuel model is non-burnable or unknown
 */
export function fuelBed(code, m) {
  const fm = FUEL_MODELS.get(code);
  if (!fm || !fm.burnable) return null;

  const K = TONS_PER_ACRE_TO_LB_PER_FT2;
  // Dead classes: 1-h, 10-h, 100-h, plus cured herbaceous for dynamic models
  const dead = [
    { w: fm.load.h1 * K, sav: fm.sav.h1, m: m.h1 / 100 },
    { w: fm.load.h10 * K, sav: SAV_10H, m: m.h10 / 100 },
    { w: fm.load.h100 * K, sav: SAV_100H, m: m.h100 / 100 },
  ];
  const live = [];
  let herb = fm.load.herb * K;
  if (fm.dynamic && herb > 0) {
    // Live herbaceous curing transfer (Scott and Burgan 2005; BehavePlus):
    // all dead below 30 % moisture, all live above 120 %, linear between.
    const mh = m.herb / 100;
    const cured = mh <= 0.30 ? 1 : mh >= 1.20 ? 0 : (1.20 - mh) / 0.90;
    dead.push({ w: herb * cured, sav: fm.sav.herb, m: m.h1 / 100 });
    herb *= 1 - cured;
  }
  if (herb > 0) live.push({ w: herb, sav: fm.sav.herb, m: m.herb / 100 });
  const woody = fm.load.woody * K;
  if (woody > 0) live.push({ w: woody, sav: fm.sav.woody, m: m.woody / 100 });

  const cats = [{ parts: dead, heat: fm.heatDead, mx: fm.mxDead },
                { parts: live, heat: fm.heatLive, mx: 0 }];

  let totalLoad = 0, areaTotal = 0;
  for (const c of cats) {
    c.area = 0;
    for (const p of c.parts) {
      p.a = p.sav > 0 ? p.sav * p.w / PARTICLE_DENSITY : 0;
      c.area += p.a;
      totalLoad += p.w;
    }
    areaTotal += c.area;
  }
  if (totalLoad <= 0 || fm.depth <= 0 || areaTotal <= 0) return null;

  const bulkDensity = totalLoad / fm.depth;
  const beta = bulkDensity / PARTICLE_DENSITY;

  let sigma = 0;
  for (const c of cats) {
    c.f = c.area / areaTotal;
    c.sav = 0; c.moisture = 0; c.netLoad = 0; c.heatSink = 0;
    if (c.area <= 0) continue;
    const g = [0, 0, 0, 0, 0, 0];
    for (const p of c.parts) {
      p.f = p.a / c.area;
      g[sizeGroup(p.sav)] += p.f;
    }
    for (const p of c.parts) {
      c.sav += p.f * p.sav;
      c.moisture += p.f * p.m;
      c.netLoad += g[sizeGroup(p.sav)] * p.w * (1 - TOTAL_MINERAL);
      const eps = p.sav > 0 ? Math.exp(-138 / p.sav) : 0;
      c.heatSink += p.f * eps * (250 + 1116 * p.m);
    }
    sigma += c.f * c.sav;
  }
  const [D, L] = cats;

  // Live moisture of extinction (Albini 1976)
  if (L.area > 0) {
    let wDead = 0, wDeadM = 0, wLive = 0;
    for (const p of D.parts) { const e = Math.exp(-138 / p.sav); wDead += p.w * e; wDeadM += p.w * e * p.m; }
    for (const p of L.parts) wLive += p.w * Math.exp(-500 / p.sav);
    const W = wLive > 0 ? wDead / wLive : 0;
    const mfDead = wDead > 0 ? wDeadM / wDead : 0;
    L.mx = Math.max(2.9 * W * (1 - mfDead / D.mx) - 0.226, D.mx);
  }

  const betaOpt = 3.348 * Math.pow(sigma, -0.8189);
  const ratio = beta / betaOpt;
  const A = 133 * Math.pow(sigma, -0.7913);
  const gammaMax = Math.pow(sigma, 1.5) / (495 + 0.0594 * Math.pow(sigma, 1.5));
  const gamma = gammaMax * Math.pow(ratio, A) * Math.exp(A * (1 - ratio));
  const etaS = 0.174 * Math.pow(EFFECTIVE_MINERAL, -0.19);

  let reactionIntensity = 0;
  for (const c of cats) {
    if (c.area <= 0 || c.mx <= 0) continue;
    const r = c.moisture / c.mx;
    let etaM = r >= 1 ? 0 : 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r;
    if (etaM < 0) etaM = 0;
    c.etaM = etaM;
    reactionIntensity += gamma * c.netLoad * c.heat * etaM * etaS;
  }
  const xi = Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (beta + 0.1)) / (192 + 0.2595 * sigma);
  let heatSink = 0;
  for (const c of cats) heatSink += c.f * c.heatSink;
  heatSink *= bulkDensity;
  const r0 = heatSink > 0 ? reactionIntensity * xi / heatSink : 0;

  return {
    code, name: fm.name, depth: fm.depth,
    sigma, beta, betaOpt, packingRatio: ratio,
    reactionIntensity,            // BTU/ft2/min
    propagatingFlux: xi,
    heatSink,                     // BTU/ft3
    r0,                           // ft/min, no wind no slope
    heatSource: reactionIntensity * xi,
    windB: 0.02526 * Math.pow(sigma, 0.54),
    windC: 7.47 * Math.exp(-0.133 * Math.pow(sigma, 0.55)),
    windE: 0.715 * Math.exp(-0.000359 * sigma),
    slopeK: 5.275 * Math.pow(beta, -0.3),
    residenceTime: 384 / sigma,   // min
    deadMoisture: D.moisture * 100, liveMoisture: L.moisture * 100,
    mxDead: D.mx * 100, mxLive: L.mx * 100,
  };
}

/**
 * Wind adjustment factor, 20 ft wind to midflame wind (Albini and Baughman
 * 1979, as coded in BehavePlus). Unsheltered uses the fuel bed depth;
 * sheltered (crown fill portion cover*crownRatio/3 > 5 %) uses the canopy.
 * Falls back to 0.4 with no depth information.
 */
export function windAdjustmentFactor({ depth = 0, canopyCover = 0, canopyHeightFt = 0, crownRatio = 0.5 } = {}) {
  const fill = (canopyCover / 100) * crownRatio / 3;
  if (fill > 0.05 && canopyHeightFt > 0) {
    return 0.555 / (Math.sqrt(fill * canopyHeightFt) * Math.log((20 + 0.36 * canopyHeightFt) / (0.13 * canopyHeightFt)));
  }
  if (depth > 0) return 1.83 / Math.log((20 + 0.36 * depth) / (0.13 * depth));
  return 0.4;
}

/**
 * Length to breadth ratio of the fire ellipse from the effective wind speed.
 * Anderson (1983) as used in FARSITE and BehavePlus, U in METRES PER SECOND
 * (BehavePlus reproduces 1.590064 at 5 mi/h only with U in m/s), capped at 8.
 * @param {number} uMph effective wind speed, mi/h
 */
export function lengthToBreadth(uMph) {
  const u = Math.max(0, uMph) * 0.44704;
  const lb = 0.936 * Math.exp(0.2566 * u) + 0.461 * Math.exp(-0.1548 * u) - 0.397;
  return Math.min(8, Math.max(1, lb));
}

/** Byram (1959) flame length ft from fireline intensity BTU/ft/s. */
export function flameLength(firelineIntensity) {
  return firelineIntensity > 0 ? 0.45 * Math.pow(firelineIntensity, 0.46) : 0;
}

const DEG = Math.PI / 180;

/**
 * Spread rate in the direction of maximum spread for a prepared fuel bed.
 *
 * @param {object} bed        from fuelBed()
 * @param {number} midflameFtMin  midflame wind speed, ft/min
 * @param {number} windFromDeg    direction the wind blows FROM, degrees from north
 * @param {number} slopeFraction  rise/run (tan of the slope angle)
 * @param {number} aspectDeg      downslope direction, degrees from north
 * @param {object} [opt]          {windLimit: true} applies Rothermel's 0.9 IR wind limit
 * @returns {{ros, direction, lb, eccentricity, effectiveWindMph, phiW, phiS, firelineIntensity, flameLength}}
 *   ros ft/min, direction degrees from north (direction the head fire travels)
 */
export function spreadRate(bed, midflameFtMin, windFromDeg, slopeFraction, aspectDeg, opt = {}) {
  if (!bed || bed.r0 <= 0) return ZERO_SPREAD;
  const windLimit = opt.windLimit !== false;
  let u = Math.max(0, midflameFtMin);
  if (windLimit) u = Math.min(u, 0.9 * bed.reactionIntensity);

  const ratioE = Math.pow(bed.packingRatio, -bed.windE);
  const phiW = u > 0 ? bed.windC * Math.pow(u, bed.windB) * ratioE : 0;
  const phiS = bed.slopeK * slopeFraction * slopeFraction;

  // Rothermel's vector combination (BehavePlus "direction of maximum spread"):
  // slope vector points upslope, wind vector points where the wind blows to.
  const upslope = (aspectDeg + 180) % 360;
  const windTo = (windFromDeg + 180) % 360;
  const omega = (windTo - upslope) * DEG;
  const rs = bed.r0 * phiS, rw = bed.r0 * phiW;
  const x = rs + rw * Math.cos(omega), y = rw * Math.sin(omega);
  const rv = Math.sqrt(x * x + y * y);
  const ros = bed.r0 + rv;
  let direction = upslope;
  if (rv > 0) direction = (upslope + Math.atan2(y, x) / DEG + 720) % 360;

  const phiEff = rv / bed.r0;
  let effWindFtMin = phiEff > 0 ? Math.pow(phiEff / (bed.windC * ratioE), 1 / bed.windB) : 0;
  if (windLimit) effWindFtMin = Math.min(effWindFtMin, 0.9 * bed.reactionIntensity);
  const effectiveWindMph = effWindFtMin / 88;
  const lb = lengthToBreadth(effectiveWindMph);
  const eccentricity = Math.sqrt(lb * lb - 1) / lb;

  const firelineIntensity = bed.reactionIntensity * ros * bed.residenceTime / 60;   // BTU/ft/s
  return { ros, direction, lb, eccentricity, effectiveWindMph, phiW, phiS,
           firelineIntensity, flameLength: flameLength(firelineIntensity) };
}

const ZERO_SPREAD = Object.freeze({ ros: 0, direction: 0, lb: 1, eccentricity: 0, effectiveWindMph: 0,
                                    phiW: 0, phiS: 0, firelineIntensity: 0, flameLength: 0 });

/**
 * Spread rate in an arbitrary direction from the ellipse (Rothermel/Albini):
 * R(theta) = R_max (1 - e) / (1 - e cos theta), theta measured from the
 * direction of maximum spread.
 */
export function spreadInDirection(head, thetaDeg) {
  const e = head.eccentricity;
  return head.ros * (1 - e) / (1 - e * Math.cos(thetaDeg * DEG));
}

/**
 * One-call convenience: fuel code, moistures in percent, midflame wind mph.
 */
export function rothermel({ code, m1, m10, m100, herb = 60, woody = 90, midflameMph = 0,
                            windFromDeg = 0, slope = 0, aspect = 0, windLimit = true }) {
  const bed = fuelBed(code, { h1: m1, h10: m10, h100: m100, herb, woody });
  if (!bed) return { ...ZERO_SPREAD, bed: null };
  const out = spreadRate(bed, midflameMph * 88, windFromDeg, slope, aspect, { windLimit });
  return { ...out, bed, rosChPerHr: out.ros / 1.1 };
}
