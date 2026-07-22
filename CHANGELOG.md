# Changelog

All notable changes to AirDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its purpose and the problem
> it solved. If a feature is in the code but not in this log, it is in the
> wrong place.

---

## [1.1.0] — 2026-07-21

### Air Story front door + Science engine

The front page becomes a story, the dashboard becomes Mission Control,
and every µg/m³ gets translated into human units — with receipts.

#### Added

* **Air Story** (`public/index.html` + `public/css/story.css` +
  `public/js/story.js`) — a scroll-based bilingual narrative front door
  for smart kids and curious adults: a breathing full-viewport hero
  circle tinted by the live Thai AQI band carrying a giant
  cigarette-equivalents number (22 µg/m³·day ≈ 1 cigarette, Berkeley
  Earth rule); a 7-persona selector (kid / teen / adult / athlete /
  senior / pregnant / asthma, kid default) driving personalized dose,
  play budget, and guidance from `/api/science/personal`; a body-journey
  SVG; **The Wallet** (daily national haze bill via VSL, per-person
  "haze tax", 3 freakonomics cards — the externality of field burning,
  the information asymmetry of invisible PM2.5, present bias); **The
  Sky** (Koschmieder visibility estimate + stagnation explainer + cause
  chips); **The Forest** (AOT40-style ozone crop stress); a **Science
  Receipts** formula wall rendered from `/api/science` `meta.formulas`;
  and an **ACT** chapter (band-aware checklist, LINE OA / LINE Notify /
  Telegram signup, link to Mission Control).
* **Science engine** (`server/science.js`, `createScience` factory,
  60 s TTL cache) — the health-translation layer: cigarette-equivalents,
  life-minutes, excess mortality, AQLI life-expectancy years, the
  national haze bill + per-person haze tax, Koschmieder visibility, and
  AOT40-style ozone crop stress. New endpoints `GET /api/science`
  (national + 77 provinces + persona profiles + `meta.formulas`
  receipts) and `GET /api/science/personal?pm25|province&profile&outdoorMin&activity`.
  Constants in `CONFIG.science`; citations include WHO 2021, Liu et al.
  2019 (NEJM), Burnett et al. 2018 (GEMM), AQLI / EPIC U. Chicago,
  Müller & Müller (Berkeley Earth), Koschmieder 1924, and Spiegelhalter
  microlives.
* **`server/populations.js`** — 77 DOPA province populations for the
  per-capita haze economics.
* **`server/washout-curve.js`** — the ONE shared rain-relief curve
  (1–5 mm → 8% · 5–15 → 20% · 15–35 → 30% · 35+ → 40%), now used by
  both `danger.js` and `washout.js` so every engine agrees.
* **`knowledge/health-science.md`** — full formula documentation; feeds
  the in-app Air Library via the `knowledge/*.md → rag_docs` convention.

#### Changed

* **Operator dashboard preserved at `/ops.html`** ("Mission Control") —
  the former index.html (header + ranking rail + Leaflet map + 11-tab
  right rail + ticker) with a หน้าแรก/Home chip back to `/`. Chart and
  analytics palettes de-FloodDashed to the AirDash tokens.
* **Palette rebrand** — the FloodDash palette (warm paper `#F6F4EF`,
  navy `#241E4E`, Thai-flag red `#A51931`, IBM Plex Mono) is replaced by
  light sky paper `#F4F8FB`, deep-teal ink `#0E4A5E`, sage `#3A8A6E`,
  ochre `#D8893A`, brick `#C8453A`, purple `#6B2D5C`, and the Thai-AQI
  5-band severity palette; Sarabun + Manrope + JetBrains Mono. Sharp
  corners, no shadows, full automatic dark mode, and
  `prefers-reduced-motion` support throughout.

#### Fixed

* TMD rain thresholds added (10 / 35 / 90 mm).
* One shared washout relief curve (8 / 20 / 30 / 40 %) across the
  danger, washout, forecast, and what-if engines.
* Danger-score forecast base reconciled.
* Non-Thai province codes filtered (78 → 77 provinces; Myanmar gauge
  excluded).
* Sensor freshness map completed (gistda_pm25 3 h, pcd_noise 36 h,
  openmeteo_aq_hist 7 d).
* Rate-limit keys computed on the last untrusted XFF hop (Cloudflare
  Pages proxy topology).

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
