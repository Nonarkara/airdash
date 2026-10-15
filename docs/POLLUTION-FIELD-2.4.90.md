# Pollution fields and a truthful timeline — 2.4.90

The requested reference image communicates a regional field more clearly than isolated circles. Its appearance does not supply a calibrated pollution model. AirDash's next visualization distinguishes measurements, display interpolation, atmospheric model output and transport screening.

## Implemented

- Replaced the old heat layer's `lighten` RGB compositing. That operation can create colours that do not correspond to any scalar concentration, and “the worse red wins” was mathematically false for mixed palette channels.
- New numerical inverse-distance interpolation uses up to four nearby values; colour is applied only after estimating a scalar PM2.5 concentration. The palette is a display concentration scale (0/15/25/37.5/75/150/300 µg/m³), not a common AQI or a claim of regulatory compliance.
- Reported-data field: at least three points within 60 km, nearest point within 30 km, edge opacity tapers. Unsupported areas transparent. These are conservative display-support rules, NOT confidence intervals or validated interpolation skill. No terrain, coast, boundary-layer or urban-source model is implied. A surface may cross a coast or administrative boundary inside its support radius.
- Operator snapshot now retains `pm25_time` separately. The new heat surface only uses PM observations <=90 minutes old; a newer ozone observation cannot refresh an older PM value. Operator point-marker behavior is otherwise unchanged.
- Regional page offers reported-data field, hourly Thailand model field or no field. Satellite imagery and PM fields are mutually exclusive to avoid conflating AOD colours with surface concentration.
- Hourly time slider reuses `cams_hourly_v1` from the existing source. Bias correction uses the existing per-province adjustment. Only available frames from approximately now to +48 hours; retrieval older than 13 hours disables model rendering. Missing hours remain null. No extra upstream requests or quota workaround.
- Model surface comes from stored province-centroid samples, not the native CAMS grid. It requires three points within 160 km and a point within 80 km; only Thailand has these inputs. No interpolated values are offered as precise street-level forecasts. Source timestamps and method are visible.
- Existing daily dominant wind direction is shown as arrows pointing **towards** flow (meteorological wind-from +180°). Tooltip identifies the daily basis and input time. No particles animated at fabricated speeds. These arrows do not change into valid hourly wind fields when the PM model slider changes.
- Source pins remain current reports, explicitly separate from model frame time. Fire markers remain 48-hour satellite detection aggregates, not ignition locations or growing fire perimeters.

## What is still required for “when will smoke reach me, and at what AQI?”

This release does not calculate smoke arrival, fire arrival, attributed PM or forecast AQI. Wind speed × distance alone is insufficient: winds vary in space/time/height; emissions, plume rise, mixing, terrain, rain/deposition and background pollution matter. Advecting a coloured polygon at the nearest surface wind speed would create false precision.

[NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php) separates trajectory and dispersion workflows and provides compatible meteorology. A trajectory shows possible air-mass paths; concentration requires dispersion/emission assumptions and validation. [AirNow's fire/smoke map](https://www.airnow.gov/fasm-v4/about/) distinguishes current particle pollution, fire/plume information and available smoke outlooks. Follow this separation.

A real follow-on requires: regional hourly gridded meteorology at relevant heights; regional surface PM forecast grids; temporally resolved fire detections/emissions and plume height assumptions; forecast-vs-station held-out validation by season/area; then arrival ranges and exceedance probabilities. Label AQI with its exact national formula/averaging window. First satellite detection is not true ignition time, and smoke transport is not the moving fire front.

The current source constraints remain: Southeast Asia numeric observations connected for TH/SG, native averaging periods differ, existing fire archive is mainland-only. CAMS is a general air-quality model and does not attribute pollution to the displayed fires. Sparse areas must stay visibly unsupported.

## Verification

Pure regression checks exercise scalar interpolation, min-neighbor/distance masking, null/invalid values, colour range/clamping, actual hourly frame indexing and timezone, existing bias adjustment, null preservation and stale/malformed model rejection. Full release and browser evidence appended after verification.
