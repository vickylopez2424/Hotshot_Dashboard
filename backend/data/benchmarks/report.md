# Spread engine benchmark against historical fires

Generated 2026-09-09T22:14:57+00:00. Code 3b235d2cf0ce. ELMFIRE: elmfire 1.1. Device engine: ondevice-rothermel 1.0 (frontend/src/engine).

Each fire is re-run from its real ignition point and time with Open-Meteo ERA5 archive weather and the newest LANDFIRE fuels older than the fire. Predicted acres are measured in EPSG:5070. At the final horizon Sorensen and Jaccard compare the prediction with the observed final perimeter (NIFC). At earlier horizons they are a containment measure against that same final perimeter (how much of the prediction lies inside where the fire eventually burned), not a perimeter match, and the area ratio against the timeline acres is the number to read.

## Camp Fire (camp2018)

Ignition 39.8104, -121.4347 at 2018-11-08T06:20:00-08:00. Final perimeter 153336 ac (CALFIRE, NIFC). Fuels requested: LF2016.

| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| elmfire | 6 | 31267 | 46 | 0.0015 | 0.0006 | 0.0003 | 1.0 | 0.47 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 1.0 |  |
| elmfire | 12 | 54771 | 86 | 0.0016 | 0.0011 | 0.0006 | 1.0 | 0.73 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 3.0 |  |
| elmfire | 24 | 69021 | 2435 | 0.0353 | 0.0313 | 0.0159 | 1.0 | 5.6 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 13.1 |  |
| ondevice | 6 | 31267 | 182 | 0.0058 | 0.0024 | 0.0012 | 1.0 | 1.08 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.053 |  |
| ondevice | 12 | 54771 | 988 | 0.018 | 0.0128 | 0.0064 | 1.0 | 2.27 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.198 |  |
| ondevice | 24 | 69021 | 10592 | 0.1535 | 0.1292 | 0.0691 | 1.0 | 9.57 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.592 |  |

### Camp Fire hourly progression, observed vs predicted

| hours | local time | observed ac | observed run km | ondevice ac | ondevice run km | elmfire ac | elmfire run km | note (source) |
|---|---|---|---|---|---|---|---|---|
| 0.83 | 07:10 | 250 |  | 2 | 0.1 | 1 | 0.1 | engine reports 200 to 300 ac, rapid spread toward Concow Reservoir (NIST TN 2135 p.91 (TD-028)) |
| 1.08 | 07:25 |  | 5 | 2 | 0.1 | 1 | 0.1 | first structures burning in Concow, 5 km from origin (NIST TN 2135 p.19 and p.176) |
| 1.4 | 07:44 |  | 12 | 2 | 0.1 | 1 | 0.1 | first spot fires in Paradise, 12 km from origin (TN 2252 p.42 says 07:50) (NIST TN 2135 p.19) |
| 2.17 | 08:30 |  | 12 | 13 | 0.2 | 3 | 0.1 | main fire front reaches Pentz Road, Paradise; 30 spot fires up to 3.4 km into town (NIST TN 2135 p.19) |
| 5.67 | 12:00 | 31267 |  | 85 | 0.7 | 41 | 0.4 | IMT estimated perimeter (NIST TN 2135 Table 37 p.195) |
| 11.67 | 18:00 | 54771 |  | 811 | 2.1 | 79 | 0.7 | IR flight perimeter (NIST TN 2135 Table 37 p.195) |
| 12.67 | 19:00 |  |  | 988 | 2.3 | 86 | 0.7 | fire jumps Durham-Pentz Road near Highway 99 (NIST TN 2135 p.135) |
| 15.0 | 21:20 |  | 30 | 2344 | 5.9 | 135 | 0.7 | Pulga to Highway 99, 30 km in 15 h, about 0.55 m/s overall (NIST TN 2135 p.180) |
| 15.67 | 22:00 | 69021 |  | 2344 | 5.9 | 135 | 0.7 | IMT estimated perimeter (NIST TN 2135 Table 37 p.195) |
| 41.67 | 2018-11-09 24:00 | 102985 |  | 10593 | 9.6 | 2435 | 5.6 | end of Nov 9 cumulative (NIST TN 2135 Table 37 p.195) |

Weather at ignition (ERA5, UTC): 14:00 6.9 mph NNE, 48.8 F, 29 % RH; 15:00 5.3 mph NNE, 48.2 F, 28 % RH; 16:00 3.6 mph W, 50.7 F, 25 % RH; 17:00 3.6 mph W, 54.1 F, 22 % RH; 18:00 2.8 mph WNW, 58.2 F, 17 % RH; 19:00 2.6 mph WNW, 61.7 F, 14 % RH

## Kincade Fire (kincade2019)

Ignition 38.7924, -122.7802 at 2019-10-23T21:27:00-07:00. Final perimeter 77762 ac (CALFIRE, NIFC). Fuels requested: LF2016.

| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| elmfire | 10 | 10000 | 1378 | 0.1379 | 0.0348 | 0.0177 | 1.0 | 3.2 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 7.1 | observed acres low confidence |
| elmfire | 24 | 16000 | 11755 | 0.7347 | 0.209 | 0.1167 | 0.7959 | 9.21 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 34.6 | observed acres low confidence |
| ondevice | 10 | 10000 | 1963 | 0.1963 | 0.0468 | 0.024 | 0.9512 | 2.4 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.212 | observed acres low confidence |
| ondevice | 24 | 16000 | 16050 | 1.0031 | 0.212 | 0.1186 | 0.6195 | 8.38 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.592 | observed acres low confidence |

Weather at ignition (ERA5, UTC): 04:00 14.5 mph NE, 71.3 F, 11 % RH; 05:00 15.1 mph NE, 71.0 F, 11 % RH; 06:00 17.2 mph NE, 71.2 F, 11 % RH; 07:00 17.7 mph NE, 71.2 F, 11 % RH; 08:00 18.5 mph NE, 70.7 F, 11 % RH; 09:00 19.1 mph NE, 69.9 F, 12 % RH

## Tubbs Fire (tubbs2017)

Ignition 38.6131, -122.6204 at 2017-10-08T21:43:00-07:00. Final perimeter 36807 ac (BLM, NIFC). Fuels requested: LF2016.

| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| elmfire | 6 | 20000 | 237 | 0.0119 | 0.0128 | 0.0064 | 1.0 | 1.06 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | None | observed acres low confidence |
| elmfire | 12 | 25000 | 1372 | 0.0549 | 0.0718 | 0.0372 | 0.9988 | 2.59 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | None | observed acres low confidence |
| ondevice | 6 | 20000 | 423 | 0.0212 | 0.0227 | 0.0115 | 1.0 | 1.87 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.054 | observed acres low confidence |
| ondevice | 12 | 25000 | 1960 | 0.0784 | 0.0991 | 0.0521 | 0.9794 | 3.09 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.204 | observed acres low confidence |

Weather at ignition (ERA5, UTC): 04:00 16.5 mph NE, 68.2 F, 14 % RH; 05:00 19.6 mph NE, 67.9 F, 14 % RH; 06:00 21.7 mph NE, 67.2 F, 14 % RH; 07:00 23.3 mph NE, 66.8 F, 13 % RH; 08:00 23.6 mph NE, 66.1 F, 13 % RH; 09:00 22.7 mph NE, 65.3 F, 14 % RH

## Thomas Fire (thomas2017)

Ignition 34.4136, -119.0836 at 2017-12-04T18:26:00-08:00. Final perimeter 281791 ac (USFS, NIFC). Fuels requested: LF2016.

| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| elmfire | 12 | 31000 | 5954 | 0.1921 | 0.0414 | 0.0211 | 1.0 | 7.39 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 6.1 | observed acres low confidence |
| elmfire | 24 | 65000 | 25795 | 0.3968 | 0.1623 | 0.0883 | 0.9676 | 15.07 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 40.0 | prediction reached the 24 km domain edge; the modelled fire is clipped; observed acres low confidence |
| ondevice | 12 | 31000 | 13056 | 0.4212 | 0.0885 | 0.0463 | 0.9989 | 10.36 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.213 | observed acres low confidence |
| ondevice | 24 | 65000 | 52114 | 0.8018 | 0.2737 | 0.1585 | 0.8767 | 19.43 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive | 0.728 | observed acres low confidence |

Weather at ignition (ERA5, UTC): 02:00 11.6 mph NE, 57.5 F, 11 % RH; 03:00 13.3 mph NE, 56.7 F, 11 % RH; 04:00 14.5 mph NE, 55.7 F, 11 % RH; 05:00 14.9 mph NE, 55.1 F, 12 % RH; 06:00 14.9 mph NE, 54.8 F, 12 % RH; 07:00 14.4 mph NE, 54.5 F, 12 % RH

## Camp Fire (sensitivity, ridge-cell weather) (camp2018_ridgewx)

Ignition 39.8104, -121.4347 at 2018-11-08T06:20:00-08:00. Final perimeter 153336 ac (CALFIRE, NIFC). Fuels requested: LF2016.

| engine | horizon h | observed ac | predicted ac | ratio | Sorensen | Jaccard | inside final | run km | LANDFIRE | weather | run time s | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| elmfire | 6 | 31267 | 26 | 0.0008 | 0.0003 | 0.0002 | 1.0 | 0.44 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 1.2 |  |
| elmfire | 12 | 54771 | 54 | 0.001 | 0.0007 | 0.0003 | 1.0 | 0.61 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 3.1 |  |
| elmfire | 24 | 69021 | 51 | 0.0007 | 0.0007 | 0.0003 | 1.0 | 0.65 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 8.1 |  |
| ondevice | 6 | 31267 | 648 | 0.0207 | 0.0084 | 0.0042 | 1.0 | 3.32 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 0.056 |  |
| ondevice | 12 | 54771 | 3425 | 0.0625 | 0.0437 | 0.0223 | 1.0 | 6.27 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 0.213 |  |
| ondevice | 24 | 69021 | 14773 | 0.214 | 0.1757 | 0.0963 | 0.9999 | 11.21 | LF2016 fuels + LF2020 topography (CONUS) | Open-Meteo ERA5 archive sampled at 39.794,-121.433 (ridge cell 2 km S of origin, ERA5-Land elevation 840 m, sensitivity variant) | 0.641 |  |

### Camp Fire (sensitivity, ridge-cell weather) hourly progression, observed vs predicted

| hours | local time | observed ac | observed run km | elmfire ac | elmfire run km | ondevice ac | ondevice run km | note (source) |
|---|---|---|---|---|---|---|---|---|
| 0.83 | 07:10 | 250 |  | 2 | 0.1 | 4 | 0.2 | engine reports 200 to 300 ac, rapid spread toward Concow Reservoir (NIST TN 2135 p.91 (TD-028)) |
| 1.08 | 07:25 |  | 5 | 2 | 0.1 | 4 | 0.2 | first structures burning in Concow, 5 km from origin (NIST TN 2135 p.19 and p.176) |
| 1.4 | 07:44 |  | 12 | 2 | 0.1 | 4 | 0.2 | first spot fires in Paradise, 12 km from origin (TN 2252 p.42 says 07:50) (NIST TN 2135 p.19) |
| 2.17 | 08:30 |  | 12 | 5 | 0.2 | 22 | 0.7 | main fire front reaches Pentz Road, Paradise; 30 spot fires up to 3.4 km into town (NIST TN 2135 p.19) |
| 5.67 | 12:00 | 31267 |  | 25 | 0.4 | 374 | 2.0 | IMT estimated perimeter (NIST TN 2135 Table 37 p.195) |
| 11.67 | 18:00 | 54771 |  | 48 | 0.6 | 2926 | 6.0 | IR flight perimeter (NIST TN 2135 Table 37 p.195) |
| 12.67 | 19:00 |  |  | 49 | 0.6 | 3425 | 6.3 | fire jumps Durham-Pentz Road near Highway 99 (NIST TN 2135 p.135) |
| 15.0 | 21:20 |  | 30 | 51 | 0.6 | 5921 | 8.2 | Pulga to Highway 99, 30 km in 15 h, about 0.55 m/s overall (NIST TN 2135 p.180) |
| 15.67 | 22:00 | 69021 |  | 51 | 0.6 | 5921 | 8.2 | IMT estimated perimeter (NIST TN 2135 Table 37 p.195) |
| 41.67 | 2018-11-09 24:00 | 102985 |  | 51 | 0.6 | 14773 | 11.2 | end of Nov 9 cumulative (NIST TN 2135 Table 37 p.195) |

Weather at ignition (ERA5, UTC): 14:00 22.7 mph NE, 43.3 F, 34 % RH; 15:00 23.1 mph NE, 43.2 F, 32 % RH; 16:00 19.0 mph NE, 44.4 F, 32 % RH; 17:00 19.4 mph NE, 47.5 F, 27 % RH; 18:00 18.5 mph NE, 50.7 F, 21 % RH; 19:00 14.2 mph NE, 54.6 F, 16 % RH

## Caveats

- Fuels: LANDFIRE LF2016 Remap is the oldest version lfps.usgs.gov serves. It is used for every fire from 2017 to 2021 and represents conditions around 2016, so fuels are pre-fire but not year-exact; disturbances between 2016 and the fire are missing. Fires after 2022 use LF2022, which may already include the fire scar of earlier fires. The version actually served is recorded per run.
- Weather: Open-Meteo ERA5 / ERA5-Land reanalysis, roughly 9 to 31 km grid, hourly, 10 m wind, uniform over the whole domain. Terrain-channelled winds such as the Jarbo Gap jet in the Camp Fire (RAWS gusts over 50 mph) are smoothed to 20 to 25 mph, which by itself halves Rothermel spread rates.
- No suppression is modelled, and no structure fuels: the observed perimeters include what crews stopped and what burned through towns.
- No spotting: both engines are surface spread only in this configuration. The Camp Fire reached Paradise (12 km) in under 1.5 h mostly by long-range spotting, which no surface model reproduces.
- Device engine is surface fire only (Rothermel/Albini), 16-neighbour minimum travel time; ELMFIRE runs with its defaults and the app's fixed live moisture (30 % herbaceous, 60 % woody) and no time-lag on dead fuel moisture.
- Domains: ELMFIRE runs on the app's 10, 16 and 24 km domains; the device engine on 20, 40 and 60 km packs. When a prediction reaches the domain edge it is clipped and the row says so. Fires that ran farther than half the domain in the horizon could not be reproduced regardless of model skill.
- Observed acres at intermediate horizons come from IMT estimates, IR flights and press-reported agency updates at the nearest available time, not exactly at the horizon; the catalogue marks each row's confidence and source. Final perimeters are the largest NIFC feature per incident.
- Sorensen and Jaccard at intermediate horizons compare against the FINAL perimeter and are reported as containment only.
- Ignition points are approximate (hundreds of metres) and are snapped to the nearest burnable cell by the engines; the snap distance is recorded per run.
