# Changelog

All notable changes to AirDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its purpose and the problem
> it solved. If a feature is in the code but not in this log, it is in the
> wrong place.

---

## [1.0.0] — 2026-07-16

### AirDash born from the FloodDash backbone

AirDash is a full transformation of the FloodDash codebase (Thailand flood
watch) into a Thailand air-quality / PM2.5 dust watch. Same single-process
Node ≥ 22.5 architecture, zero npm dependencies, SQLite WAL storage, SSE
tap, bilingual TH/EN frontend — refocused on the hazard Thais face five
months of every year.

#### Added

* **Air4Thai as the primary pipeline** — PCD ground AQI network (~200
  stations, hourly): PM2.5, PM10, O3, NO2, SO2, CO, AQI, matched to
  provinces via the gazetteer.
* **CAMS air-quality forecast pipeline** (`openmeteo_aq`, 3-hourly) —
  PM2.5/PM10/dust outlook to 72 h per province centroid.
* **Air Watch Score** (`server/risk.js`) — `0.40·pm25 + 0.10·pollutants +
  0.15·trend + 0.20·forecast + 0.15·stagnation`, sub-score curves anchored
  on the Thai AQI 2023 PM2.5 breakpoints (15/25/37.5/75 µg/m³). Bands and
  JMA-style verbs: GOOD AIR / STAY INFORMED / LIMIT OUTDOOR TIME /
  PROTECT NOW.
* **Rain-Washout engine** (`server/washout.js`) — the signature feature.
  Per province: forecast rain amount × probability → `relief_if_rain_pct`
  (≥5 mm ≈ 20%, ≥15 mm ≈ 30%, ≥35 mm ≈ 40%), `expected_relief_pct`,
  `projected_pm25`, band none/light/moderate/strong, `helps_dust` flag.
  New endpoint `GET /api/washout`; `GET /api/wetness` kept as a
  back-compat alias.
* **Dust-season override** — window 1 Dec – 30 Apr; national `dustLoadPct`
  (% provinces with worst PM2.5 ≥ 25 µg/m³); at ≥30% inside the window, a
  "normal" national band renders as LOW — STAY INFORMED.
* **Stagnation sub-score** — ventilation proxy from forecast wind + rain
  probability; zeroed by observed rain >10 mm.
* **WHAT-IF rain simulator** — `GET /api/whatif?rain=X`: "if X mm falls in
  24 h" → projected PM2.5 per province through the washout curve.
* **Citizen panel, air edition** — hotlines 1650 (PCD) / 1422 (DDC) /
  1669 (EMS), per-band health checklists (N95, windows, clean room,
  sensitive groups), 3 nearest AQ stations via
  `GET /api/stations/nearest`, share/LINE.
* **The Air Bible** (`corpus/bible/sec00–10`, 22 bilingual files) — the
  in-app methodology library: Thai AQI 2023 standard, data sources, score
  derivation, washout science, dust seasonality, ventilation, sensor
  health, action framework, historical episodes (2019 Bangkok, Chiang Mai
  2019/2023, 2015 southern haze), limitations & ethics. Validated by
  `scripts/validate-bible.mjs` (all 11 EN/TH pairs pass).
* **Knowledge notes rewritten for air** (`knowledge/*.md`) — paper.md
  (bilingual research paper), rain-washout.md, score-method.md,
  aqi-bands.md, pollutant-standards.md, dust-seasonality.md,
  historical-haze.md, data-sources.md, glossary.md, project-vision.md.

#### Changed

* Identity: port 8340 → **8341**, DB `data/flooddash.db` →
  `data/airdash.db`, launchd `com.flooddash.*` → `com.airdash.*`,
  Pages project `flood` → `airdash`, tunnel `api-flood` → `api-air`,
  live URL flood.nonarkara.org → **air.nonarkara.org**.
* Risk payload keys: `soilSaturationPct→dustLoadPct`,
  `wetSaturatedCount→dustyProvinceCount`, `soilSampledCount→dustSampledCount`,
  `floodSeason→dustSeason`.
* Map: AQ stations are the primary markers (PM2.5-coloured); RainViewer
  radar and NASA GIBS stay (they now serve the washout story).
* News pipeline keywords: น้ำท่วม/อุทกภัย → ฝุ่น/PM2.5/หมอกควัน.
* Design language unchanged (paper ground, navy chrome, squares, Sarabun +
  IBM Plex Mono); Thai-flag red `#A51931` still reserved for genuine danger.

#### Removed

* Flood-only modules: `rivers.js` (cascade), `wetness.js` (soil API),
  `shelters.js`; endpoints `/api/rivers`, `/api/shelters*`.
* Flood-only pipelines: `thaiwater-level`, `thaiwater-dam`,
  `rid-reservoir`, `glofas`.
* Flood knowledge notes: connected-waterways, soil-wetness, rain-bands,
  situation-levels, flood-seasonality, historical-floods, risk-method
  (replaced by air equivalents).

---

**Live:** [air.nonarkara.org](https://air.nonarkara.org)
