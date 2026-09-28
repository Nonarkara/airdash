# 2. Data Sources: The Complete Catalog

An air-quality watch is only as trustworthy as the feeds behind it. AirDash deliberately uses only open, keyless (or free-token) public sources, ingested by a single-process scheduler and persisted to SQLite so every number on screen can be traced to an upstream URL and an observation timestamp.

This chapter is in two parts. **2.1–2.4** catalog what AirDash actually ingests and renders today — nineteen polled pipelines and the client-side map layers, each with its cadence and caveats. **2.5** records sources that were surveyed, tested, and deliberately *not* integrated, with the reason. That second list matters: a data catalogue that only lists what works reads as a claim that the problem is solved, and it is not.

## 2.1 The polled pipelines

Nineteen sources run on the scheduler. Four are token-gated and skip quietly when unconfigured; the rest are keyless.

| # | Source | Agency | Cadence | What it gives us |
|---|---|---|---|---|
| 1 | Air4Thai ground AQI network | Pollution Control Department (PCD) | 1 h | PM2.5, PM10, O3, NO2, SO2, CO, AQI from roughly 200 stations — the primary ground truth |
| 2 | GISTDA PM2.5 | GISTDA | 1 h | Satellite + ground fusion PM2.5 per province, current hour and 24 h mean — contiguous coverage where PCD is sparse |
| 3 | PCD noise network | Pollution Control Department | 1 h | Leq and Lmax per station, all 7 daily values retained; compared against WHO and Thai residential standards |
| 4 | FIRMS active fires | NASA LANCE | 6 h | Hotspots from three satellites (Suomi NPP, NOAA-20, NOAA-21) with Radiative Power; drives the upwind smoke model |
| 5 | AERONET | NASA GSFC | 1 d | Sun-photometer AOD at ground truth sites — the only *direct* aerosol measurement in the system, and the calibration anchor for satellite AOD |
| 6 | Open-Meteo weather forecast | Open-Meteo | 6 h | Precipitation amount and probability, plus wind speed and dominant direction per province (77 provinces) |
| 7 | CAMS air-quality forecast | Copernicus, via Open-Meteo | 6 h | PM2.5, PM10, dust and wind outlook out to 72 h per province |
| 8 | GPM IMERG satellite precipitation | NASA | 30 min | Satellite rain per province; token-gated, skips quietly when absent |
| 9 | HII rain gauges | Multi-agency via HII | 10 min | Observed rain, roughly 4,200 gauges — verifies that a forecast washout actually happened |
| 10 | Thai Meteorological Department relay | TMD, via the FloodDash twin | 15 min | TMD 7-day province forecast and 125 synoptic stations, ingested once and shared by both dashboards |
| 11 | Burn-area detection | GISTDA / HII | 1 d | Burned-area scars, seasonal |
| 12 | Agricultural burn scars | HII + Kasetsart, Sentinel-2 at 20 m | seasonal | Season-accumulated crop-classified burn scars (rice, cane, maize) with forest masked out |
| 13 | Drought and crop risk | GISTDA | 1 d | Weekly drought and crop-loss risk |
| 14 | ENSO / ONI ocean state | NOAA CPC | 12 h | El Niño / La Niña context — a drier or wetter dust season |
| 15 | Thai air-quality news | Google News TH + Khaosod | 30 min | Keyword-filtered headlines (ฝุ่น, PM2.5, หมอกควัน) |
| 16 | CCTV stream health probe | AirDash, over iTIC / GISTDA / NST feeds | 30 min | Probes 1,385 camera streams and marks dead ones; feeds the haze-eyes surface |
| 17 | Camera-frame haze features | AirDash | 30 min | One raw frame per live camera, reduced to haze features and paired with nearby PM2.5 — the calibration training set |
| 18 | Air-quality history backfill | Air4Thai | 1 d | Multi-year PM2.5 history for trend and forecast-skill scoring |
| 19 | **DustBoy** | **Chiang Mai University CCDC** | 1 h | **Dense low-cost sensor network across northern Thailand. Token-gated; skips quietly until `DUSTBOY_TOKEN` is set.** |

Air4Thai units matter: particulate matter arrives in µg/m³, ozone and the nitrogen and sulphur gases in ppb, carbon monoxide in ppm. Stations are matched to provinces by name against the province gazetteer so every reading can join the per-province score.

### 2.1.1 Why DustBoy matters more than its size suggests

Air4Thai's roughly 200 stations are adequate for national coverage and close to useless for the north. The northern burning season turns on whether the Mae Mo basin and the Doi Suthep–Doi Inthanon ridges are under smoke, and PCD has a handful of regulatory sites for an area the size of several provinces. DustBoy is a dense low-cost network run out of Chiang Mai University for exactly that question, at a resolution PCD has no prospect of matching.

It is also the natural partner to the satellite work. AOD gives coverage where sensors are absent; DustBoy gives the ground truth that turns AOD into a surface PM2.5 estimate. Today `/api/smoke` tells you fires are burning upwind and `/api/forecast` tells you the model expects it to worsen, and the only thing that says what the air *is* in the north is a province-level score. DustBoy closes that gap at sub-district resolution.

The API is open and free at `https://open-api.cmuccdc.org/` — registration only, no cost, no institutional agreement. Every endpoint takes an `Authorization: Bearer` token. The source is shipped and waiting; it needs a key that only the operator can request.

## 2.2 Map layers rendered client-side

These are tile services fetched directly by the browser and never stored. NASA GIBS layers are one calendar day behind their retrieval; the geostationary ones are live.

- **Aerosol and smoke:** combined MODIS AOD (Terra+Aqua), MODIS Aqua and Terra AOD at 3 km, OMPS UV aerosol index, OMPS PyroCb index (upper-air smoke, the cross-border transport signal), OMI UV aerosol index, OMI AOD at 388 nm, OMI single-scattering albedo (the smoke-versus-sulphate discriminator), VIIRS NOAA-20 aerosol type (smoke versus dust versus sea salt), and AIRS L2 dust score.
- **Transport:** AIRS carbon monoxide at 500 hPa — smoke that has already lofted and is travelling.
- **Volcanic and industrial gas:** OMPS NOAA-20 SO2 in the mid-troposphere and in the boundary layer.
- **Precipitation and cloud:** GPM IMERG near-real-time rain, Himawari-9 infrared, and JAXA Himawari-9 aerosol optical thickness live at 10-minute cadence.
- **True colour and night:** MODIS Terra corrected reflectance, VIIRS Day/Night Band radiance — the latter shows evening agricultural burning and the diffuse bloom of a city under haze.
- **Radar and cameras:** the Thai rain radar mosaic, and 1,385 public CCTV cameras whose pin colour is the PM2.5 of the nearest station.

## 2.3 Reading haze off the cameras

AirDash reduces a live camera frame to a set of absolute features and a *provisional* triage score. The physical basis is that contrast falls with distance exponentially, at a rate set by the atmosphere — Koschmierder's relation `C(x) = C₀·e^(−βx)` with visual range `V = 3/β`.

This is deliberately **not** a neural dehazing model. The published work on camera-based visibility (Babari et al. 2011, *Atmospheric Environment* 45:5316) fitted per-camera coefficients against a reference transmissometer, and no open implementation of that method exists. A dehazing network outputs a prettier picture, not a number, and a prettier picture is worthless on a data product. The features are computed in microseconds of CPU, where a small network would take hundreds of milliseconds per frame — a thousand-fold difference across 1,385 cameras.

Three honest limits apply:

- **No kilometres are claimed.** Absolute visibility needs the path length from camera to subject, and nobody publishes the geometry of municipal cameras. A per-camera *relative* haze index is what the system produces.
- **Urban cameras are the worst case.** Babari's method assumes a continuous distribution of object distance. Traffic cameras pointed along a road with vertical buildings violate that, and the authors say so. Open-road and Nakhon Si Thammarat cameras fit it better.
- **The score is withheld, not guessed, when the frame has no usable structure.** A featureless frame returns null with a stated reason rather than a confident zero.

Features are stored with the paired ground PM2.5 so a calibration *can* be fitted once a real haze episode supplies the variance. The fitter refuses to run unless the target actually varies and the correlation is strong, and it separately reports how much of the observed variation is between-camera rather than within-camera — because a pooled fit that mostly explains "which camera is this" is not measuring the air.

## 2.4 Caveats a reader should know

- **Ground stations are sparse in some provinces.** A province with one station is scored on one station; the dashboard shows the station count rather than hiding it. Eight provinces with silent sensors currently fall back to a clearly-labelled satellite estimate.
- **Forecasts are models.** The CAMS product is a global model with known biases over Southeast Asia during intense burning episodes. AirDash applies a per-province bias correction learned from ground observations, and caps the correction range — an uncorrected or over-corrected forecast is worse than an uncorrected one. The forecast is one input among five, never truth.
- **Cadence is not latency.** An hourly station can publish an observation that is itself an hour old. Timestamps shown are the upstream observation times, and the scoring engine discards readings older than its freshness windows rather than silently reusing them.
- **The news feed is keyword-filtered**, not curated; it exists so a spike on the map and a headline can be seen side by side.
- **Satellite AOD is missing exactly where it is needed.** Cloud and haze itself both suppress the optical retrieval, so AOD holes cluster over the worst episodes. This is why ground stations, not satellites, remain the reference.

## 2.5 Surveyed, tested, and not integrated

Recording these matters more than listing the successes. Each was probed directly on 2026-09-28 unless noted; "unreachable" means the hostname has no DNS A record, which is a fact about the host, not a limit on our network.

| Source | Status | Why it is not integrated |
|---|---|---|
| ASMC ASEAN haze portal (`haze.asean.org`) | Unreachable | NXDOMAIN — the hostname publishes no A record. Would have been the best transboundary fit: daily ASEAN hotspot reports and a 24 h PM10 dispersion simulation. |
| SatPM2.5, Washington University ACAG | Unreachable | `satepsanone.ecs.wustl.edu` is NXDOMAIN. A peer-reviewed fused satellite-model-monitor PM2.5 product, so a genuine loss. |
| GEMS (GEO-KOMPSAT-2B) hourly AOD | Unavailable keyless | Hourly daytime AOD over Southeast Asia would be the single best addition for diurnal haze tracking. Distributed by the Korean NIER via SFTP on application, not on NASA GIBS — probed `GEMS_Aerosol_Optical_Depth` and variants on GIBS, all HTTP 400. Worth an application. |
| MAIAC 1 km AOD (MODIS) | Requires Earthdata token | Higher resolution than Deep Blue for PM estimation. Available from NASA LANCE/LAADS with a free Earthdata Login; a token-gated source could be added the way IMERG is. |
| OpenAQ v3 | Requires API key | Aggregates the same PCD stations AirDash already ingests directly, so it adds coverage only in neighbouring countries, where it is thin. |
| WAQI | Requires token, crowdsourced | Sensor-grade data of uncertain provenance. Wrong input for a public-health product that already has the official network. |
| SERVIR AQ Tracker | Reference, not a source | A pre-built platform rather than a feed. Useful as a cross-check for our own smoke model. |
| Envi Link (BDI Thailand) | Reference, not a source | A national fusion platform with over 200 datasets, including a Chiang Mai pilot. Worth reading for its PM2.5 presentation; the underlying feeds are ones we already hold. |
| Global PM2.5 Watch (World Bank) | Not integrated | Daily city-level ML estimates. Corroborative at best, and a modelled number beside a measured one invites confusion. |
| Northern Thailand 1 km monthly PM maps | Reference | A published GEE product covering 2020–2024 burning seasons. Excellent for post-event analysis and for the library; the live system does not need it. |

Everything stored is exportable: raw readings are retained on SSD for a rolling window and permanently archived to the external drive, and the full dataset ships as CSV from the export endpoint.
