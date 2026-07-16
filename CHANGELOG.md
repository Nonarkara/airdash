# Changelog

All notable changes to FloodDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its commit, its purpose,
> and the problem it solved. If a feature is in the code but not in this
> log, it is in the wrong place.

---

## [2.0.0] — 2026-07-16

### Human restraint audit + Compare Places redesign

The v2.0 release fixes the safety meaning and human reachability of the
dashboard before adding more features. The complete audit and resolution
matrix lives in `docs/HUMAN-AUDIT-V2.md`.

#### Safety and clarity
* A heuristic score no longer tells the public to evacuate. The strongest
  score action is **ACT NOW**; the national roll-up says **CHECK YOUR AREA
  NOW** and points to named provinces and official instructions.
* Fixed the English-language switch replacing a live critical status with
  the static loading/all-clear placeholder.
* Corrected 191 from “tourist police” to “police emergency.”

#### Responsive and navigation
* Rebuilt the ≤1100px header as two constrained rows and exposed place
  search on phones.
* Added a mobile **MY AREA** sheet and made it the Easy-mode default.
* Easy desktop mode now removes the national ranking rail; Full mode resets
  to Overview. Operator tabs use two readable rows in priority order.

#### Removed
* Removed the discontinued LINE Notify personal-token UI, API, cron, schema,
  and module. Kept the LINE Official Account link and Messaging API broadcast.
* Removed the 15-stream TV wall and the external HLS dependency.

#### Map and accessibility
* Reduced default map layers to radar, water level, and province risk; layer
  controls and legend now start collapsed.
* Made search results keyboard-correct semantic controls, added focus-visible
  and reduced-motion behavior, and added core metadata and landmarks.

A comprehensive human audit + production polish run against the live
system, focused on the thesis *"data is not a decision"*. The audit
walked through five real personas (elderly Trat resident, Bangkok
commuter, district official, news reporter, KMITL researcher), found
three real loose ends, and shipped the fixes plus a sponsor-loaded boot
screen plus a documentation rewrite.

Then the same `⊟` (split) button was redesigned from a side-by-side
clone of the main map (which wasn't useful) into a real comparison
tool — Compare Places.

### Added

#### Redesigned split view — "Compare Places" with search + data bar
* **Commits `5461b71`, `49e9be3`, `027f637`** — *feat(split): redesign
  split view as 'Compare Places' (searchable 2-4 panes + data bar)*
  + 2 follow-up bug fixes
* The old split view (side-by-side clone of the main map with
  independent layer toggles) wasn't useful: it showed the same area
  twice with different basemaps. The "is X higher than Y?" question
  that the button was inviting never had anywhere to go.
* This rewrite turns the same `⊟` button into a real comparison tool:
  * Up to 4 panes in a responsive grid (2/3/4 selector), same as the
    existing 'compare' overlay — but without the hardcoded focus areas.
  * Each pane has a SEARCH input that finds any of 70k+ places via
    `/api/search` (provinces, districts, tambons, stations) and
    `/api/postal` (5-digit postal code → tambon). Selecting a result
    flies the pane's map to the lat/lng and pins a marker.
  * The data bar on the left is the customized left rail: it shows a
    compact card per selected place. Each card carries the JMA verb
    (action), score + confidence interval, water component + station
    count, rain 24h max, forecast 48h, soil saturation, and 6h rise.
    Side-by-side, the user can scan for "who is hottest" at a glance.
  * Live numbers update from the shared snapshot — pick a province
    and the data card populates with that province's risk payload.
* Layout (desktop):
  - Header: title + pane count selector (2/3/4) + close button
  - Body: 320px data bar (left) + 1fr grid of panes (right)
  - Grid: 2 cols (2-pane), 3 cols (3-pane), 2x2 (4-pane)
  - On viewports <1100px the data bar shrinks to 280px and the
    explainer sub-line hides; on <860px (mobile) the whole overlay
    and the button are hidden — a 4-pane comparison doesn't fit a
    phone, and the main place-search + focus dropdown covers the
    one-place-at-a-time use case.
* Two follow-up bug fixes shipped in the same minute:
  - **`49e9be3`** — `.places-grid` had `flex: 1` but its parent was
    a grid container, so flex was inert and the grid collapsed to
    0px tall in 4-pane mode. Added `flex: 1 1 0` on `.places-body`
    and `grid-template-rows: minmax(0, 1fr)` so the grid has
    height to work with.
  - **`027f637`** — `grid.className = 'panes-N'` was stripping the
    base `places-grid` class, so when the count changed the grid
    collapsed to `display: block` (zero height, all panes stacked).
    Replaced with `classList.remove + add` to preserve the base class.

### Added

#### Sponsor / data-source logos on the loading screen
* **Commit `26c93d6`** — *feat(boot): sponsor / partner / data-source logos on loading screen*
* The boot screen is the first thing a visitor sees, so it now answers
  the two trust questions in one stop: *"is this real?"* and *"who's
  behind it?"*. Four tiers, in visual-weight order:
  1. **STEWARD** — depa
  2. **PARTNERS** — Smart City Thailand Office, Axiom + ReTL
  3. **STANDARDS** — SLIC, RCAD
  4. **DATA** — DDPM, HII/สสน., RID, TMD, PCD (bordered text pills;
     proper logos not yet available)
* Logos are real images where we have them; data providers get
  bilingual text pills (Thai abbreviation + English agency name) so an
  English-speaking operator can audit the source without speaking Thai.
* Mobile-aware: shrinks to 18px / 60px max-width under 600px.

#### Citizen mode actually shows the citizen panel
* **Commit `1827356`** — *fix(citizen): make citizen mode actually show the citizen panel*
* The audit found the most embarrassing loose end: citizen mode (the
  "ง่าย / EASY" toggle) was designed to strip the dashboard to a
  citizen-friendly minimum, but the right rail (where the citizen panel
  lives) was hidden entirely in that mode. So a citizen who toggled to
  EASY lost access to their province's JMA verb, 3 nearest shelters,
  share-via-LINE, hotline one-tap, and LINE push opt-in — exactly the
  features designed for them.
* Fix:
  * In citizen mode, hide only the operator-only tabs (analytics,
    waterways, tap, sources, insights, history, library, alerts, news);
    leave **citizen + chat** visible.
  * Auto-select the citizen tab on entering citizen mode.
  * Grid columns stay `left-rail + map + 320px citizen-rail`; mobile
    bottom sheet keeps the same two tabs.
* Closes the "shared `?city=X` link doesn't work for the recipient"
  finding in one shot.

#### URL `?city=X` deep link pre-selects province
* **Commit `1827356`** — same commit
* When a `?city=Trat` link is opened, the citizen panel auto-loads
  with JMA verb + 3 shelters + share + LINE — no clicks required.
  Matching is TH-name, EN-name, or 2-digit province code; substring
  fallback if no exact match.
* The map auto-flies to the province.

#### Chat panel: "Try asking" example chips
* **Commit `1827356`** — same commit
* First-time visitors hit "empty input paralysis" — they don't know
  what to ask the AI. Four clickable chips below the welcome message
  pre-fill and submit a representative question (4 questions covering
  the 4 most common intents). Sits under a "ลองถามแบบนี้ · TRY ASKING"
  header. One click submits.

#### Boot screen accessibility
* **Commit `1827356`** — same commit
* `role="status"` + `aria-live="polite"` + `aria-busy="true"` on `#boot`
  so screen readers announce loading progress.
* Separate sr-only live region fires "Dashboard ready · current
  situation: <JMA verb>" when the boot goes away, so a screen-reader
  user gets both "loaded" AND the current situation in one
  announcement. Visually hidden via `.aria-live-sr` recipe.

#### Comprehensive README rewrite
* Mission statement with the "data is not a decision" thesis.
* Sponsor / partner / data-source credit (4 tiers, matching the boot
  screen).
* JMA 5-level action framework table with one verb per band.
* Citizen vs Operator mode distinction explained.
* 10 data sources listed (was 9 — added DDPM shelters).
* New sections: confidence intervals, shelter layer, Ask-AI, LINE
  Notify push, accessibility.
* Updated API endpoint table (was 14 → now 25 endpoints).

### Fixed

* **Citizen mode hides right rail** — see above.
* **URL deep link broken** — see above.
* **`pane-news` was hidden by citizen mode even when citizen tab
  was selected** — fixed by the citizen-mode CSS.

### Verified

* All 25 API endpoints respond `200` (`/api/flood_forecast` returns
  404 by design — that endpoint is not shipped; the same data is
  served via `/api/insights`).
* All 11 right-rail tabs have content (smallest 377 chars for chat,
  largest 12,628 for tap).
* All local images load (5 partner logos, 2 header logos, 1 portrait).
* Zero console errors across the full citizen-mode + ASK + chat flow.
* Boot screen displays the sponsor grid correctly on both desktop
  and mobile viewports.
* `?city=Trat` deep link pins ตราด, opens citizen panel, flies map
  to Trat.
* `aria-live-ready` fires "โหลดข้อมูลเสร็จ · สถานการณ์ปัจจุบัน:
  ปฏิบัติการทันที" when the boot is removed.

---

## [2026-07-15] — "Decide, don't show" tier

The JMA-style action framework was the centrepiece of this day. Before
this work, the dashboard showed a passive 4-band label (NORMAL / WATCH /
ELEVATED / CRITICAL) and left the user to figure out what to do. After
this work, every band ships with exactly one verb, in both Thai and
English, sized to dominate the page.

### Added

#### JMA-style 5-level action verb on the hero
* **Commits `883d71f`, `6244415`, `5424049`, `c7b93bf`** —
  *feat(hero): JMA-style 5-level action verb + ASK AI hero bar + hotline*
  + 3 follow-up fixes
* The `BAND` constant in `public/js/i18n.js` was refactored from a string
  to `{th, en, noun_th, noun_en}`. Five bands, five verbs, one verb
  per band, no exceptions:
  * `normal` → **ปกติ** / **ALL CLEAR**
  * `watch` → **ติดตาม** / **STAY INFORMED**
  * `prepare` → **เตรียมพร้อม** / **PREPARE**
  * `act` → **ปฏิบัติการทันที** / **ACT NOW**
  * `evacuate` → **อพยพทันที** / **EVACUATE NOW**
* Hero redesign: 46×46 plate, 17px Thai verb, 9.5px English
  translation, one-line "why" so the user gets the cause without
  leaving the hero.
* 1784 hotline button lives next to the verb — one tap to dial.
* ASK AI hero bar promoted from right-rail tab #10 to a sticky bar
  inside the header — it's the only true moat, so it needs to be
  permanently visible.
* Header height locked at `--header-h: 110px` (brand row + ASK bar);
  `.national` constrained to 64px so hotline + ASK bar don't collide.

#### Citizen panel + shelter layer + flood forecast + dead-sensor CSV
* **Commit `6bf611f`** — *feat(ux): citizen panel + shelter layer + flood
  forecast + dead-sensor CSV*
* The citizen panel (`#pane-citizen`) is a new right-rail tab that
  answers the four questions that matter during a flood:
  1. *Am I safe right now?* — JMA verb at the top
  2. *What do I do?* — checklist surfaced from the action card
  3. *Where do I go?* — 3 nearest shelters + one-tap Google Maps
     navigate
  4. *How do I tell my family?* — share-status via LINE / SMS / Copy
* 10,399 DDPM emergency shelters ingested from
  `https://catalog.disaster.go.th/dataset/.../dpm-gd002_final2.csv`
  into a SQLite table. New API endpoints:
  * `GET /api/shelters` — full list
  * `GET /api/shelters/nearest?lat&lng&limit` — bbox-cached nearest
  * `GET /api/shelters/ingest` — admin (called by daily cron)
  * Map layer: capacity-coloured markers, click to navigate
* "My Province" pinned in `localStorage` so the dashboard defaults
  to the user's location on every visit. `✎` button opens a
  searchable province picker.
* `flood_forecast` insight pairs 48-hour rain forecast × soil
  saturation × L4/L5 station count.
* Dead-sensor CSV: `GET /api/sensors/dead.csv` lists every
  silent/stuck/abnormal/inconsistent sensor for field crews to
  inspect. Button at the top of the INSIGHTS panel.
* Cron set up: `shelter-ingest` daily re-download of the shelter
  CSV.

#### CI badges, TTS read-aloud, geolocation default, LINE push, mobile
* **Commit `e58aec6`** — *feat(ux): CI badges, TTS read-aloud,
  geolocation default, LINE push, mobile*
* **Confidence intervals** — `public/js/confidence.js` with
  `riskCi/forecastCi/waterCi/riseCi` helpers. Every metric that
  changes gets a `±N` badge. Hero shows "±5" on the national score,
  `max_province_score` added to the national risk payload.
* **TTS read-aloud** — `initTts()` reads the JMA verb + why line + 1784
  in Thai via `speechSynthesis.speak()`. Zero deps, zero network,
  works on any modern phone. Designed for elderly / low-literacy /
  panic cases where hearing a voice is easier than reading a screen.
* **Geolocation default** — `tryGeolocate()` in `citizen.js`. On first
  visit with no saved province, the browser asks for location,
  resolves to the nearest province from the risk snapshot, and pins
  it. Throttled via `sessionStorage.fd_geo_asked` so we don't re-prompt
  on every navigation.
* **Mobile layout** — header collapses to 56px, partner logos hidden,
  JMA verb only (why/hotline move to citizen panel).
* **LINE Notify push** — `server/linePush.js`, `line_subs` table, full
  API surface (`subscribe` / `unsubscribe` / `stats` / `preview` /
  `tick`). 5-minute cron tick. Opt-in card lives in the citizen
  panel. Pushes only on band transitions, not on every snapshot.
* **Risk engine mirrors cache to kv** (`risk_snapshot_cache`) so
  background jobs (line-push, future sensor scanners) read the same
  risk picture without an in-process reference.

### Fixed

#### Critical: `setMyProvince` was using the wrong event channel
* **Commit `98d1192`** — *fix(citizen): CRITICAL — use emit() not
  window.dispatchEvent for my-province-changed*
* `setMyProvince` was using `window.dispatchEvent(new CustomEvent(...))`
  but the listener was registered via `on('my-province-changed', ...)`
  from `state.js` — a different pub/sub channel entirely. So picking
  a province updated `localStorage` but did NOT repaint the citizen
  panel, leaving shelters / share / LINE / help sections in the empty
  state.
* Fix: use `emit('my-province-changed', p)` from `state.js`. Now the
  citizen panel sections render correctly after picking.

#### Chart `INK` undefined
* **Commit `13f32e7`** — same commit
* `chart.js` referenced `INK` but the variable was renamed to
  `--ink` in the tokens refactor. Fixed the spelling; the WHAT-IF chart
  now renders.

#### Hero layout collision
* **Commits `5424049`, `c7b93bf`** — *fix(hero): move ask bar inside
  header element* + *fix(hero): constrain .national to 64px so hotline
  + ASK bar don't collide*
* The ASK bar was previously `position: absolute`, which collided with
  the hotline button on smaller viewports. Moved inside the header
  element with `position: absolute; bottom: 0`.

### Verified

* All 11 right-rail tabs render with content.
* All 25 API endpoints respond 200.
* Zero console errors.
* Citizen panel sections (shelters, share, LINE, help) render
  correctly after picking a province (after the `emit` fix).
* Share buttons (LINE, SMS, Copy) work; help buttons (1784, 1669,
  191) dial correctly; LINE token input round-trips.

---

## [2026-07-14] — "Action-card tier" (commit `4ff0d27` and `13f32e7`)

The starting point for the "Decide, don't show" work. Before this
pass, the dashboard was data-rich but action-poor: it told you a
province was "ELEVATED" without telling you what to do about it.

### Added

#### National action card + flood-season "Normal" override
* **Commit `4ff0d27`** — *feat(risk-comm): national action card +
  flood-season 'Normal' override*
* The national verdict now ships with:
  * **head** — the band name in Thai and English
  * **action** — the verb the user should perform
  * **checklist** — 2–4 concrete steps ("pack documents", "check
    neighbour", "monitor 1784")
  * **window** — time window the action should happen in
  * **reasons** — why this band was assigned
* **Flood-season override**: even when the score says "NORMAL", during
  the official monsoon window (May–October) the hero always reads
  "ALL CLEAR · STAY INFORMED" so the citizen never assumes the season
  is over. The trigger fires when soil saturation is ≥ 80% of
  saturated state AND the date falls within the monsoon window. The
  dashboard is honest about the trigger in the hero subtitle.
* New risk payload fields: `national.effective_band`,
  `national.soilSaturationPct`, `national.wetSaturatedCount`,
  `national.soilSampledCount`, `national.floodSeason`.

#### Per-province action cards + WHAT-IF search
* **Commit `13f32e7`** — *feat(ux): per-province action cards + WHAT-IF
  search + chart INK fix*
* Every province in the risk payload now ships with its own verdict
  object (`provinces[].card`) containing head / action / checklist /
  window / disclaimer.
* The ranking rows expand on click to reveal the per-province card —
  the user can scan the leaderboard and drill into any province
  without leaving the page.
* WHAT-IF "Check your province" search filters the existing what-if
  payload client-side so the user can immediately see "what if
  200 mm of rain falls in the next 48 hours?" for their own area.

### Verified

* All 78 provinces in the risk payload ship with a `card` object.
* WHAT-IF chart renders correctly (the `INK` fix).
* Per-province cards expand and collapse on click.

---

## [2026-07-13] — City command board (commits `c288f4d`, `ff678dc`, `ea5cc54`, `6efe617`, `77cffe7`)

The "verdict-first municipal dashboard" + TV mode. The left rail was
rebuilt around a single question: *what should the operator do this
hour?*

### Added

* **City command board** — the left rail was rebuilt around a single
  JMA-style verdict card. The whole page is sub-second to scan.
* **TV mode** — full-screen war-room display for wall TVs that reboot.
  Triggered by `?tv=1` in the URL.
* **Bootstrap explainer** — the boot screen now carries a "every figure
  is real-time, no mock data" explainer that survives the boot.
* **Fine-print footer** — visible disclaimer at the bottom of the page
  reminding the user to follow official DDPM / TMD / ONWR warnings.
* **Visible "back to All Thailand" pill** — the way out of any city
  view is now visibly labelled, not just an icon.

### Fixed

* **Event-loop freezes on the page-load path** — multiple
  `INDEX` and cache changes to bring the page-load time back under
  2 seconds. The 1.3 MB snapshot response is pre-gzipped.
* **Right-rail ASK tab was squeezed unreadable** — flexbox min-width
  bug; the chat input was rendering at 0px wide. Fixed.
* **WAI-ARIA Tabs pattern** — full keyboard navigation, Thai font 11px
  minimum, mobile flex fix.

---

## [2026-07-04 and earlier] — Foundations

The work that got FloodDash from "an idea" to "a dashboard that
loads":

* The Node server (`server/index.js`, port 8340), running as a launchd
  service (`com.flooddash.server`).
* The data ingestion pipeline: 9 background jobs (later 10 with the
  DDPM shelter ingest) running on a loop, each with its own failure
  counter and lastOk timestamp.
* The SQLite schema: stations, readings (raw 90d → permanent hourly
  rollups), events, alerts, news, sensors_health, line_subs, shelters.
* The first Cloudflare Tunnel + Pages deployment.
* The first JSDoc-free server module split (`server/api.js`,
  `server/risk.js`, `server/verdict.js`, etc.) and the 6,148-station
  `readings` index that made `/api/snapshot` return in under 200 ms.
* The Flood Library (BIBLE): 11 background chapters on Thailand flood
  context, data sources, prediction models, ML for flood prediction,
  scoring formulas, open-source integration, citizen apps, research,
  and bibliography. Bilingual TH/EN, FTS5 trigram search, full-screen
  reader overlay.
* The PWA shell (`manifest.webmanifest` + `sw.js`).
* The Research Paper (in-app) with infographics, data dictionary, and
  the full dataset CSV download.
* The connected-waterways cascade model (Ping + Nan → Nakhon Sawan →
  Chai Nat → Ayutthaya → Bangkok, 5-day flood-wave travel time).
* The Antecedent Precipitation Index (API) soil-wetness model.
* The ENSO / ONI seasonal modulator.
* The RainViewer radar animation, NASA GIBS MODIS satellite layer,
  JAXA GSMaP precipitation, GISTDA river network, and the
  historical-floods archive.

---

## What we ship next

Open items in the queue (next audit pass):

* **Dead-sensor CSV → Telegram/email push** for field crews.
* **Provincial forecast band** (forecast-only band, separate from
  the current composite).
* **Multi-language support** — Vietnamese, Khmer, Burmese, Lao for
  border provinces.
* **Historical compare** — "what was the score here on this date in
  2011, 2017, 2024?".
* **Citizen mode tutorial overlay** — first-time visitor hint.
* **Open the public Telegram bot** for users who don't have LINE.

---

**Last audit pass:** 2026-07-16 (Sol 5.6)
**Live:** [flood.nonarkara.org](https://flood.nonarkara.org)
