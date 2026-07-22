# AirDash — Design Contract (transformation from FloodDash)

> **Reading guide:** the flood→air transformation notes below are
> preserved as honest archaeology — they record how AirDash was born
> from the FloodDash backbone. The **current** design language (2026
> rebrand) and the two-surface product (Air Story + Mission Control)
> are documented in *"Design language — the 2026 rebrand"* further
> down; that section is the truth for anything visual.

AirDash = เฝ้าระวังฝุ่นและคุณภาพอากาศประเทศไทย · **Thailand Air Quality Watch**.
Same backbone as FloodDash (single Node ≥22.5 process, zero deps, SQLite WAL,
vanilla ES-module frontend, SSE tap, bilingual TH/EN), refocused on PM2.5 /
dust, with a first-class **Rain-Washout** analysis: the chance of
precipitation and how much it would help the dust situation in each area.

This file is the contract every module follows. When adapting a file, honor
the names and semantics below exactly.

## Identity

| Key | Value |
|---|---|
| Name | **AirDash** · แอร์แดช |
| Tagline TH | เฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศประเทศไทย |
| Tagline EN | Thailand Air Quality & Dust Watch |
| Port | **8341** |
| DB | `data/airdash.db` (env `AIRDASH_DB_PATH`) |
| launchd | `com.airdash.server` |
| Hotlines | **1650** (PCD pollution hotline), **1422** (DDC health), **1669** (EMS) |
| Season | **Dust/burning season = 1 Dec – 30 Apr** (northern haze peaks Feb–Apr) |

## Data sources (scheduler)

| name | what | cadence | metrics stored |
|---|---|---|---|
| `air4thai` | PCD ground AQI network (~200 stations) — PRIMARY | 1 h | `pm25 pm10 o3 co no2 so2 aqi` |
| `openmeteo` | weather per province (77 centroids from `public/geo/provinces.json`) | 3 h | `precip_fc_d0 precip_fc_d1 precip_fc_d2 precip_fc_48h precip_prob_d0 precip_prob_d1 precip_prob_d2 precip_prob_24h precip_prob_48h wind_fc_kmh wind_fc_d1` |
| `openmeteo_aq` | CAMS air-quality forecast per province (air-quality-api.open-meteo.com) | 3 h | `pm25_fc_24h pm25_fc_48h pm25_fc_72h pm10_fc_24h dust_fc_24h` |
| `thaiwater_rain` | HII rain gauges (~4,200) — observed washout verification | 10 min | `rain_24h rain_1h` |
| `imerg` | NASA GPM IMERG satellite precip per province (token-gated, skips quietly) | 30 min | unchanged |
| `enso` | NOAA ONI — El Niño = drier = worse dust season (context prior) | 12 h | unchanged |
| `news` | Google News TH ฝุ่น/PM2.5/หมอกควัน + Khaosod filtered | 30 min | news_items |

Removed sources: `thaiwater-level`, `thaiwater-dam`, `rid-reservoir`, `glofas`.
Removed modules: `rivers.js`, `cascade.js`, `wetness.js`, `shelters.js`.

Air4Thai units: PM µg/m³ · O3, NO2, SO2 ppb · CO ppm.
Air4Thai stations get `province_code` by matching province_th/en against
`public/geo/provinces.json` (helper in `server/provinces.js`).

## Air Watch Score (server/risk.js)

`score = 0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation`
(CONFIG.risk.weights keys: `pm25 pollutants trend forecast stagnation`)

Sub-scores 0–100, piecewise-linear anchors (Thai AQI 2023 breakpoints
15 / 25 / 37.5 / 75 µg/m³ for PM2.5):

- **pm25** (worst fresh station, 3 h): (0,0)(15,8)(25,20)(37.5,45)(50,60)(75,80)(100,90)(150,100)
- **pollutants** = max of: pm10 (0,0)(50,10)(80,25)(120,50)(180,75)(250,100) ·
  o3 ppb (0,0)(70,25)(100,55)(120,75)(150,100) · no2 ppb (0,0)(100,30)(170,60)(250,100) ·
  so2 ppb (0,0)(100,30)(200,60)(300,100) · co ppm (0,0)(9,30)(15,60)(30,100)
- **trend**: max 6 h PM2.5 rise per province: ≥25→100 ≥15→70 ≥8→40 ≥4→15 else 0
- **forecast**: max(pm25_fc_24h, pm25_fc_48h) through the pm25 curve
- **stagnation** (ventilation proxy): base from `wind_fc_kmh`: <8→70 <12→45 <16→20 else 0;
  `+30` if precip_prob_24h<20, `+15` if <40; clamp 0–100; forced 0 if observed rain_24h>10 mm

Bands unchanged: `normal <20 · watch 20–44 · elevated 45–69 · high ≥70`.

BAND_LABELS: normal ปกติ/Normal · watch เฝ้าระวัง/Watch · elevated เสี่ยงสูง/Elevated · high วิกฤต/Critical

Hero action verbs (JMA-style, verdict layer):
| band | TH | EN |
|---|---|---|
| normal | อากาศดี | GOOD AIR |
| watch | ติดตามสถานการณ์ | STAY INFORMED |
| elevated | ลดกิจกรรมกลางแจ้ง | LIMIT OUTDOOR TIME |
| high | ป้องกันทันที | PROTECT NOW |

**Dust-season override** (replaces flood-season override): national metric
`dustLoadPct` = % of provinces whose worst PM2.5 ≥ 25 µg/m³. When the date is
inside 1 Dec–30 Apr AND dustLoadPct ≥ 30, a `dustSeason:true` flag ships and a
"normal" national band renders as pseudo-band `low` ("LOW — STAY INFORMED").
Risk payload keys renamed: `soilSaturationPct→dustLoadPct`,
`wetSaturatedCount→dustyProvinceCount`, `soilSampledCount→dustSampledCount`,
`floodSeason→dustSeason`.

## Rain-Washout engine (server/washout.js) — the signature feature

Wet deposition: rain scavenges airborne particles. Per province:

Inputs: `pm25` now (worst fresh station), `precip_prob_24h/48h`,
`precip_fc_d0/48h`, observed `rain_24h` (max gauge).

- `relief_if_rain_pct` from precip_fc_d0 (mm): <1→0 · 1–5→8 · 5–15→20 · 15–35→30 · >35→40
- `expected_relief_pct = relief_if_rain_pct × precip_prob_24h/100`
- `projected_pm25 = round(pm25 × (1 − relief_if_rain_pct/100))`
- band: `strong` fc≥15 ∧ prob≥60 · `moderate` fc≥5 ∧ prob≥40 · `light` fc≥1 ∧ prob≥25 · else `none`
- `helps_dust` = pm25>25 ∧ band ∈ {moderate,strong}

WASHOUT_LABELS: strong ฝนล้างฝุ่นได้มาก/Strong washout expected ·
moderate ฝนช่วยลดฝุ่นได้/Moderate washout likely ·
light ฝนช่วยได้เล็กน้อย/Slight washout possible ·
none ไม่มีฝนช่วยล้างฝุ่น/No rain relief expected

Interface mirrors old wetness.js: `createWashout(db)` → `{ all(): Map<province_code, entry>, forProvince(code) }`.
Entry: `{ province_code, province_th, province_en, pm25, prob24, prob48, rain_fc_24, rain_fc_48, rain_obs_24, band, relief_if_rain_pct, expected_relief_pct, projected_pm25, helps_dust }`

## API surface changes

| Endpoint | Change |
|---|---|
| `GET /api/washout` | NEW — all provinces sorted by helps_dust/expected relief |
| `GET /api/wetness` | alias → washout payload (back-compat) |
| `GET /api/rivers` | REMOVED |
| `GET /api/shelters*` | REMOVED — citizen panel uses `GET /api/stations/nearest?lat&lng&limit` (nearest AQ stations with latest pm25/aqi) |
| `GET /api/whatif?rain=X` | now: "if X mm rain falls in 24 h" → per-province projected PM2.5 via washout curve |
| `GET /api/forecast` | horizons p24/p48/p72 recomputed with CAMS pm25_fc_* + rain washout relief |
| `GET /api/snapshot` | pivots: `air` (air4thai pm25/pm10/o3/aqi…), `rain`, `forecast` (openmeteo), `aqForecast` (openmeteo_aq) |
| everything else | same shape, flood strings → air strings |

## Frontend mapping

- Panel `waterways` → **washout** panel ("ฝนช่วยล้างฝุ่น · Rain washout"), table of provinces: chance of rain, expected relief, projected PM2.5
- `whatif` → "ถ้าฝนตก X มม. ฝุ่นจะลดเท่าไร" rain-washout simulator
- `citizen` → hotlines 1650/1422/1669, health advice per band (N95, close windows, purifier, sensitive groups), 3 nearest AQ stations, share/LINE
- `forecast` → 48 h rain probability + CAMS PM2.5 forecast strip
- map: AQ stations = primary markers (PM2.5-colored), RainViewer radar + GIBS stay, river/flood layers removed
- Design language: see **"Design language — the 2026 rebrand"** below. The FloodDash palette this line once described (paper ground `#F6F4EF`, navy chrome `#241E4E`, Thai-flag red `#A51931`, IBM Plex Mono) is gone — kept here only as history.

## Design language — the 2026 rebrand (current truth)

The FloodDash palette is gone. Current tokens:

- Ground: light sky paper `#F4F8FB` · ink: deep teal `#0E4A5E`
- Accents: sage `#3A8A6E` · ochre `#D8893A` · brick `#C8453A` (danger
  only, never decorative) · purple `#6B2D5C`
- Severity: the Thai-AQI 5-band palette
- Type: Sarabun (Thai / UI) · Manrope (display) · JetBrains Mono (every
  number that changes)
- Shape: sharp corners, no shadows
- Full automatic dark mode; `prefers-reduced-motion` stills the
  breathing hero and count-ups

**Two surfaces:**

1. **Air Story (`public/index.html` + `css/story.css` + `js/story.js`)**
   — the new front door and the design statement. A scroll-based
   bilingual narrative for smart kids and curious adults: a
   full-viewport breathing hero circle tinted by the live Thai AQI band
   with a giant cigarette-equivalents number (22 µg/m³·day ≈ 1
   cigarette, Berkeley Earth rule); a 7-persona selector (kid / teen /
   adult / athlete / senior / pregnant / asthma, kid default) driving
   personalized dose / play-budget / guidance from
   `/api/science/personal`; a body-journey SVG; **The Wallet** (daily
   national haze bill via VSL, per-person haze tax, 3 freakonomics
   cards); **The Sky** (Koschmieder visibility + stagnation + cause
   chips); **The Forest** (AOT40-style ozone crop stress); a **Science
   Receipts** formula wall rendered from `/api/science`
   `meta.formulas`; and an **ACT** chapter (band-aware checklist, LINE
   OA / LINE Notify / Telegram signup, link to Mission Control).
2. **Mission Control (`public/ops.html`)** — the former index.html,
   preserved whole: header + ranking rail + Leaflet map + 11-tab right
   rail + ticker, charts and analytics re-paletted from FloodDash to
   the AirDash tokens, with a หน้าแรก/Home chip back to `/`.

The flood→air transformation notes above are kept as honest
archaeology — they describe how the system was born, not how it looks
today.

## Score disclaimer (both languages, everywhere the score shows)

ดัชนีเฝ้าระวังจากข้อมูลจริง (PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ 15%) — ไม่ใช่การพยากรณ์ / Watch indicator from live data (PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15%) — heuristic, not a forecast. Always follow official PCD / TMD guidance.
