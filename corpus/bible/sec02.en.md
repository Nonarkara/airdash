# 2. Data Sources: The Complete Catalog

An air-quality watch is only as trustworthy as the feeds behind it. AirDash deliberately uses only open, keyless (or free-token) public sources, ingested by a single-process scheduler and persisted to SQLite so every number on screen can be traced to an upstream URL and an observation timestamp. This chapter catalogs each pipeline, its cadence, and its caveats.

## 2.1 The seven polled pipelines

| # | Source | Agency | Cadence | What it gives us |
|---|---|---|---|---|
| 1 | Air4Thai ground AQI network | Pollution Control Department (PCD) | 1 h | PM2.5, PM10, O3, NO2, SO2, CO, AQI from roughly 200 stations — the primary ground truth |
| 2 | Open-Meteo weather forecast | Open-Meteo | 3 h | precipitation amount and probability, wind speed per province centroid (77 provinces) |
| 3 | CAMS air-quality forecast | Copernicus, via Open-Meteo | 3 h | PM2.5, PM10 and dust outlook out to 72 h per province |
| 4 | HII rain gauges | Multi-agency via HII | 10 min | observed rain, roughly 4,200 gauges — verifies that a forecast washout actually happened |
| 5 | GPM IMERG satellite precipitation | NASA | 30 min | satellite rain per province; token-gated, skips quietly when absent |
| 6 | ENSO / ONI ocean state | NOAA CPC | 12 h | El Niño / La Niña context — a drier or wetter dust season |
| 7 | Thai air-quality news | Google News TH + Khaosod | 30 min | keyword-filtered headlines (ฝุ่น, PM2.5, หมอกควัน) |

Air4Thai units matter: particulate matter arrives in µg/m³, ozone and the nitrogen and sulphur gases in ppb, carbon monoxide in ppm. Stations are matched to provinces by name against the province gazetteer so every reading can join the per-province score.

## 2.2 Map layers rendered client-side

RainViewer radar mosaic, NASA GIBS satellite imagery, and JAXA precipitation products render directly on the map and are not stored. They answer "where is it raining right now?" — the visual companion to the washout analysis.

## 2.3 Caveats a reader should know

- **Ground stations are sparse in some provinces.** A province with one station is scored on one station; the dashboard shows the station count rather than hiding it.
- **Forecasts are models.** The CAMS product is a global model with known biases over Southeast Asia during intense burning episodes; AirDash treats it as one input among five, never as truth.
- **Cadence is not latency.** An hourly station can publish an observation that is itself an hour old. Timestamps shown are the upstream observation times, and the scoring engine discards readings older than its freshness windows rather than silently reusing them.
- **The news feed is keyword-filtered**, not curated; it exists so a spike on the map and a headline can be seen side by side.

Everything stored is exportable: raw readings are retained 90 days and rolled into permanent hourly aggregates thereafter, and the full dataset ships as CSV from the export endpoint.
