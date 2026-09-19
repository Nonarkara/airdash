# Changelog

All notable changes to AirDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its purpose and the problem
> it solved. If a feature is in the code but not in this log, it is in the
> wrong place.

---

## [3.3.0] — 2026-09-20 · token 2.4.32 · **Cameras that show the air**

**The idea.** A PM2.5 number is abstract; a camera looking at the same place is not. AirDash now carries FloodDash's
national CCTV catalog (GISTDA + iTIC + NST, 1,380 cameras) and pairs every camera with the nearest fresh PM2.5 reading.

**Only cameras that work.** A sample of the catalog found ~28 % of GISTDA and ~44 % of iTIC streams serving a
playlist while all were flagged "online". `cctvHealth` (copied from FloodDash 4.34) probes all 561 HLS streams every
30 min (12 in flight, 3 per server, 8 s): a 404 hides a stream at once, a timeout needs two strikes. First cycle: **137
live · 177 dead · 247 awaiting a second look.** The map shows proven-live streams and NST embeds only (348 pins).
One-at-a-time tests confirm the live ones deliver video; 40 at once time out — these are small municipal servers.

**Added**
- **CCTV layer** (Ground observations → "CCTV"): pin ring colour = PM2.5 at the nearest station (Thai AQI 2023
  bands), pulsing above 75; popup = the reading first, then the picture, then attribution and "not an official
  announcement".
- **Haze eyes** (layers panel → 👁): the working cameras facing the worst air right now, ranked by PM2.5. When nothing
  is above 25 µg/m³ (most of the wet season) it shows the cameras near the highest readings instead and says so.
  Only 4 streams autoplay; the rest have a play button.
- `GET /api/cctv/all` (each camera carries `air`; `?live=1`, `?near=lat,lng`) and `GET /api/cctv/haze-eyes`.
  Both rate-limited (30/min).
- `server/airCctv.js` (pure: `pm25Band`, `pairAir`, `hazeEyes`) + `scripts/test-cctv-air.mjs` (16 checks, in `npm test`).

**Found while building it**
- Chrome now reports native HLS support, but its demuxer failed on these streams (`DEMUXER_ERROR_COULD_NOT_PARSE`).
  The player uses **hls.js first**, native HLS only where hls.js cannot run (iPhone).
- AirDash's global `article` / `header` CSS turned the wall cards into a 2-column grid. The cards are plain `div`s.

## [3.2.1] — 2026-09-19 · **Port hijack: a 20-hour API outage behind a healthy-looking site, and the watchdog that made it worse**

**What broke.** From 02:49 to ~23:05 (ICT) every `/api/*` request returned a plain-text 404 while the static
shell loaded fine. A second launchd service (the Sikhio CCTV relay) defaulted to port 8341 and bound
`127.0.0.1:8341`; AirDash was bound to `*:8341`. On macOS a specific-address bind beats a wildcard bind for loopback
traffic and both binds succeed, so the Cloudflare tunnel's `localhost:8341` silently reached the wrong process.

**Two components turned it into a 20-hour outage instead of a blip:**
- The edge proxy called any non-5xx a healthy backend (`status >= 500`), so it passed the stranger's 404 through for
  `/api/snapshot` and never used the stale mirror that exists precisely for outages.
- The watchdog read "unreachable", blamed our own healthy server, and killed + restarted it **every hour (22 times)**,
  never noticing the real cause. It also located "our" PID with `pgrep -f "node server/index.js"`, which matches
  FloodDash and DND too — a latent way to kill the wrong project.

**Fixed.**
- AirDash moved to **28341** (outside the 83xx/87xx/88xx dev-default cluster, below the ephemeral range).
- Every response carries `x-service: airdash` (set once at the top of the request handler, so raw `writeHead`
  paths — SSE tap, chat, exports — are covered). The edge proxy treats any response without it as backend-down: serves
  the stale mirror, else an honest 502; never caches or relays a stranger's body.
- Watchdog: probes require the identity header; PID comes from launchd; if another process holds our port it
  **reports who** (pid, start time, command) and refuses to kill or restart anything; a circuit breaker stops
  restart loops after two consecutive failed recoveries.
- The server self-probes its own port at boot and every 5 min and logs `PORT HIJACK` to the error log if the answer
  isn't ours.
- `scripts/test-port-hijack.mjs` (13 checks; the 6 incident cases fail against the pre-fix proxy).

**Found in the same health sweep — backups had silently stopped for 3+ days.** No nightly backup completed after
2026-09-16 and nothing said so. The backup destination is a USB *spinning* drive (~2 MB/s under load, shared with your other
jobs). `PRAGMA integrity_check` on the 3.7 GB snapshot *on that drive* took 7 h on 09-16 and never finished on 09-18 (44 h in
uninterruptible I/O); launchd won't start a second instance of a job that is still running, so every later night was skipped.
- `ops/backup-db.sh` redesigned: **VACUUM INTO the SSD → `quick_check` on the SSD (34 s) → `cp` to the USB drive as `.partial` →
  `cmp` against the verified SSD file → atomic rename → gzip from the SSD.** Only big sequential streams touch the HDD. Every stage has a hard
  ceiling; a failed or timed-out run publishes nothing and prunes nothing. Falls back (loudly) to direct-to-USB if the SSD lacks room.
  Superseded internal fallback snapshots are removed once a newer verified off-device one exists.
- Fixed a `set -e` bug in the earlier VACUUM INTO change: `cmd; RC=$?` exits before `RC=$?` runs, so the FATAL log and partial-file cleanup were unreachable.
- Watchdog: new **backup-freshness** alarm — no *completed* backup for ≥ 36 h → notification (once/day).

## [3.2.0] — 2026-09-17 · **Weather a person plans a day on, the first skill measurement, and an honesty pass**

> Asset token `?v=2.4.31` · service-worker cache `airdash-v49`.

### Added

* **TMD weather everywhere a place is shown** (`d7c4819`) — `sources/tmd-relay.js`
  copies FloodDash's `/api/weather` (TMD's 7-day forecast for 77 provinces +
  Pattaya, Hua Hin, Ko Samui, Hat Yai; 125 synoptic stations 3-hourly) into
  kv every 15 min: one ingestion, two dashboards. `server/weather.js` joins a
  point to five upcoming days and the nearest station ≤ 80 km / ≤ 6 h old with
  name, distance and age. `GET /api/weather` (edge-mirrored), `GET /api/weather/at`,
  `weather` on `/api/place`; `weatherStrip.js` renders the strip on the place
  card and the citizen page. Landmarks (12,854 OSM places) in search, with the
  same destination rule as FloodDash — **"Khao Yai" now means the national
  park**, not the Cha-Am tambon.
* **The promise, measured** (`0df920f`) — `risk_history` records every
  province's score hourly (from 2026-09-16 17:00 UTC); `GET /api/skill` replays
  the CAMS 24-h forecast and the score band against real ≥ 37.5 µg/m³ station
  crossings, with POD / FAR and an honest "not measurable yet" state. **First
  replay, 60 days: 18 events, 0 caught; 81 alarms, none verified.** The wet
  season's crossings are single-station industrial spikes (Rayong ×9,
  Chonburi, Ayutthaya) that a 0.4° CAMS field cannot see. Published as-is,
  with the per-province breakdown; the dust season is the real test and the
  ledger now exists to run it.

### Fixed (honesty audit, 25 findings across both twins)

* The Wallet chapter printed "0.0 million school lunches … every kid gets 0
  each" when national PM2.5 sat below the WHO line; it now says what ฿0 means.
  "Damaged crops" removed from a caption whose formula never computed crops.
* "The live map, 4,400+ stations" plotted 174 — copy now says ~170 AQ stations
  + ~1,900 rain gauges live (5,300+ registered), in both pages.
* "What's driving it right now" was a permanent heading over "no data" for
  71 % of provinces on a clean day — hidden when there is nothing to say.
* LINE copy said "national-level severe haze episode"; the trigger is any
  station over 37.5 µg/m³ — copy now says so.
* `/api/danger` carries `method_*` / `disclaimer_*` and states that the heat
  amplifier is 0 outside the hot season and noise covers 9 provinces.

### Known and not fixed today

* `top_stations` is `[]` and `region_th/en` null for all 77 provinces in
  `/api/risk` (air4thai.js never fills region); the burn-area panel shows
  off-season data without a "last published month" header; washout relief
  is a four-step literature lookup, not locally calibrated.

## [3.1.0] — 2026-09-16 · **The twins finally speak — CORS, the Twin API, explainable bands**

> Asset token `?v=2.4.30` · service-worker cache `airdash-v48`. Audit of both twin systems with FloodDash the same day; five commits, each one shippable on its own.

### Fixed

* **No CORS at all** — AirDash sent no `Access-Control-*` header on any
  route, so no browser on another origin (the user's other dashboards,
  the FloodDash twin) could read a byte of `/api/`. Ports the FloodDash
  public-read policy: read-only `/api/` answers `*`, preflight → 204
  before the rate limiter; `/api/admin/`, `/api/telegram/`, `/api/line/`,
  chat logs + FAQ moderation and export builds never get CORS from any
  origin. (`564a013`)
* **Bands with no reasons** — 60 % of the Air Watch Score (pollutants,
  trend, forecast, stagnation) could move a province to `watch` while
  `provinceVerdict()` returned zero reasons, because each component only
  spoke at its ALARM threshold while the score ladder starts far lower.
  Every component now has a mid-tier line keyed to the ladder; moderate
  PM2.5 (25–37.5) is named; the cap is 5 and `risk.js` no longer trims
  the list to 2. (`594b357`)
* **Citizen page discarded the server card** — it rendered band + score +
  a client-side advice table. A "why this band · evidence" block now
  shows the card's reasons, action and disclaimer.
* **Undefined CSS tokens** — `--lv1..5`, `--bg-soft`, `--card`,
  `--font-en`, `--r-sm/md/lg` were used 26× and defined nowhere; the
  UNHEALTHY / VERY UNHEALTHY station badges rendered with no colour.
* `max_province_score` was `list[0]` of a list sorted by PM2.5; LINE
  cancel-alerts line was in the wrong language.

### Added

* **`GET /api/twin`** — one compact, keyless per-province summary
  (`code`, `score`, `band`, `level`, bilingual headline + top reason,
  `pm25`, `aqi`, `pm25_fc_24h`, `washout_*`, `danger_*`) in the shape
  FloodDash publishes too. Contract in `docs/TWIN-API.md`; 30 s prebuilt
  cache; edge-mirrored with `x-airdash-stale-seconds`.
* **`version` in `/api/health`**, read once at boot from the `ops.html`
  asset token — the one source of truth `scripts/bump-version.mjs` keeps.
* **API reference tab** ("API · FOR DEVELOPERS" in About) — 7 groups, 59
  endpoints, every parameter one the handler reads, hotlines 1650 / 1422
  / 1669 and the PCD / MoPH duty block. `scripts/check-api-docs.mjs`
  fails the build on a documented route that is not served and on a
  public route that is not documented. (`92ba6d5`)
* **FloodDash twin relay** — `server/sources/twin-flood.js` polls
  FloodDash `/api/twin` every 10 min; `p.flood` on every province (never
  scored); two verdict reasons: the flood verdict when FloodDash has the
  province at prepare/danger, and *"the rain that may clear the dust may
  also raise the rivers here"* when `washout_helps` and the flood side is
  at watch or above. (`5e22ff8`)
* Four new test scripts in `npm test` (explainability 18, twin/CORS 26,
  API-docs coverage 61, twin-flood 21); the older scripts now import
  relatively instead of via `/Users/axiom/AirDash/…`.

## [3.0.0] — 2026-07-24

### AirDash 3.0 — communication facelift + overlap-free layout

The same 2.0 instrument, restyled to communicate better. No science or
data-layer changes.

#### Fixed

* **Header verdict crush** — on 1101–1560px viewports the national
  verdict block (the header's headline message) was squeezed to 29px
  wide and the data-freshness pill to 14px, both unreadable, because
  they were the only flexible items in the header row. Both now hold
  min-widths, and a **shed ladder** at the end of layout.css releases
  space instead: partner marks → partner plate + focus dropdown →
  compare button → nav-button labels (icon-only), decorations before
  functions. Nothing clips off-screen at any width.
* **Phone freshness pill overlap** — the pill's fixed offset used
  `--header-h` (64px), but the phone header's px-fixed rows deliberately
  overflow to y≈125 and the map's layers control sits right under them;
  the pill was covering the search box and the ไทย/EN toggle (measured
  79×17px overlap). Now anchored at 174px, clear of the whole stack.

#### Changed

* **3.0 surface language** — removed tokens.css's universal
  `border-radius: 0 !important; box-shadow: none !important` reset,
  which had silently killed every authored radius and shadow in the
  codebase. Added radius/elevation/motion tokens (`--r-ctl`, `--r-card`,
  `--elev-1/2`, `--motion`) and a surface layer at the end of
  components.css: rounded header controls and nav, elevated map-floating
  controls (legend, radar, layer picker), rounded rail/overlay cards and
  search dropdown, smooth hover transitions, and a consistent
  `:focus-visible` ring. Dense data tables stay square.
* Product generation 2.0 → **3.0** across the brand badge, boot screen,
  titles / OG cards, PWA manifest, READMEs, and the research-paper
  masthead (with an honest one-paragraph 3.0 note in the "What Changed"
  section). SW shell `airdash-v24` → `airdash-v25`.

---

## [2.0.0] — 2026-07-24

### Generation release — the product is now "AirDash 2.0"

Marks the accumulated 1.x work (science engine, Air Story front door,
life-safety alert pipeline, data-honesty layer, ops hardening) as the
second product generation, and makes the generation visible in the UI.

#### Added

* **"2.0" version badge** on the Mission Control brand (`AIR·DASH 2.0`),
  the Air Story chrome, the boot screen, page titles / OG cards, the
  PWA manifest, and both READMEs — the visible answer to "am I on the
  new version?".
* **Header partner-logo plate** on Mission Control — the same mark set
  FloodDash carries (depa · Smart City Thailand Office · Axiom+ReTL ·
  SLIC · RCAD) on one solid white plate, shedding progressively on
  narrow viewports (full credits remain on the boot screen and About
  panel at every width).
* **Research paper: "AirDash 2.0 — What Changed Since 1.0"** — an
  unnumbered generation section between the hero and §1 with a
  six-axis v1.0 → v2.0 comparison table (science layer, two-audience
  architecture, alert pipeline, data honesty, operational resilience,
  decision ergonomics); paper masthead now reads v2.0.

#### Changed

* Service-worker shell bumped `airdash-v23` → `airdash-v24` so
  returning visitors flush the old-brand shell cleanly.

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
