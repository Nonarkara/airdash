<p align="center">
  <img src="docs/hero-banner.png" alt="AirDash civic illustration: Thai city haze on one side, clearer air and a public-health AQI/PM2.5 gauge on the other. Decorative — not a data product." width="100%">
</p>

# AIRDASH 3.0

## เฝ้าระวังฝุ่น PM2.5 และคุณภาพอากาศประเทศไทย · Thailand Air Quality & Dust Watch

A **one-Mac civic system**: bilingual Thai/English, honest about where every number comes from, useful in five seconds on a phone. The manga banner above is illustration, not a claim that software defeats haze.

> An operating system for air-quality **decision making** — with two front
> doors. **Air Story** (`/`) is a scroll-based bilingual narrative for
> smart kids and curious adults: a breathing hero tinted by the live Thai
> AQI band, your day in cigarette-equivalents, the national haze bill,
> and every formula with its receipt. **Mission Control** (`/ops.html`)
> is the preserved operator dashboard for mayors, district officials,
> researchers, journalists, and air detectives. Every figure is real-time
> from Thai government and open scientific sources, every number carries a
> confidence interval, and the first thing on screen is always the action
> the user should take.

<p align="center">
  <strong>🇹🇭 Live:</strong> <a href="https://air.nonarkara.org">air.nonarkara.org</a> ·
  <strong>🔀 Fork it:</strong> <a href="https://github.com/Nonarkara/airdash/fork">github.com/Nonarkara/airdash</a> ·
  <strong>📐 System architecture:</strong> <a href="ARCHITECTURE.md">ARCHITECTURE.md</a> ·
  <strong>🇹🇭 ฉบับภาษาไทย:</strong> <a href="README.th.md">README.th.md</a>
</p>

<p align="center">
  <img alt="9 live data sources" src="https://img.shields.io/badge/data_sources-9-3A8A6E?style=flat-square">
  <img alt="4,887 stations" src="https://img.shields.io/badge/stations-4,887-3A8A6E?style=flat-square">
  <img alt="77 provinces" src="https://img.shields.io/badge/provinces-77-3A8A6E?style=flat-square">
  <img alt="130,830 readings" src="https://img.shields.io/badge/readings-130,830-3A8A6E?style=flat-square">
  <img alt="$0/mo cloud" src="https://img.shields.io/badge/cloud-$0%2Fmo-0E4A5E?style=flat-square">
  <img alt="copyright 2026" src="https://img.shields.io/badge/copyright-2026-0E4A5E?style=flat-square">
</p>

---

## Contents

1. [What this is](#what-this-is)
2. [Philosophy](#philosophy)
3. [Ethical use](#ethical-use)
4. [How it works](#how-it-works)
5. [Live site](#live-site)
6. [How to run it](#how-to-run-it)
7. [The rest of the system](#the-mission) (mission, surfaces, sources, scores, API)
8. [License](#license--attribution)

---

## What this is

AirDash is a **public-interest PM2.5 / air-quality watch for Thailand**. It
does not replace the Pollution Control Department (PCD / คพ.), Air4Thai, the
Thai Meteorological Department (TMD / อุตุฯ), or the Department of Health.
It sits on top of the numbers those agencies and open scientific feeds
already publish, and tries to answer one operational question:

> Should my child play outside today — and if not, what do I do in the
> next five minutes?

It is the air sibling of [FloodDash](https://flood.nonarkara.org): same
one-Mac, SQLite, bilingual, $0-cloud pattern. Where floods arrive as
events, bad air arrives as a **season** (roughly 1 December – 30 April).
The signature extra for air is **Rain-Washout** — rain is the only fast
natural relief from dust, so a forecast rain event is treated as a
forecast *relief* event, labelled as a heuristic, never as a promise.

Two surfaces, one engine:

| Surface | URL | Who it is for |
|---------|-----|----------------|
| **Air Story** | [`/`](https://air.nonarkara.org/) | Families, students, anyone who needs a verb before a chart |
| **Mission Control** | [`/ops.html`](https://air.nonarkara.org/ops.html) | Mayors, district officers, researchers, journalists |

No login. No ads. No data sold. The boot screen lists who is behind it
and which sensors/APIs the numbers came from.

---

## Philosophy

Four tenets, on purpose:

**One Mac civic systems.** The live backend is a Mac that was already in
the house: Node.js, one SQLite file, three `launchd` services (server,
Cloudflare Tunnel, watchdog). Cloudflare Pages is only the static shell
and a same-origin `/api/*` proxy. No managed database, no Docker, no
cloud bill for the engine. A provincial office should be able to run a
fork from this repo on a laptop.

**Bilingual TH/EN.** Thai is the primary language. English mirrors it.
Every user-facing string, error, and methodology note is supposed to
exist in both. See [README.th.md](README.th.md) and
[SYSTEM.th.md](SYSTEM.th.md).

**Honest data sources.** Every figure on screen traces to a named agency
or open feed. Stale readings are dropped, not reused. Scores carry
confidence intervals. Heuristics (watch score, washout, cigarette
equivalents) are labelled as heuristics. Mock data is a bug.

**Useful, not theatrical.** The banner is civic illustration. Brick red
appears only when the air is actually hazardous. The page leads with a
JMA-style **verb** (อากาศดี / GOOD AIR … ป้องกันทันที / PROTECT NOW), not
a dashboard aesthetic. If a panel does not help someone decide, it
does not earn its place.

The working thesis:

> Data is not a decision. A number on a screen is not an action. AirDash
> exists to close the gap between “we know the air is bad” and “we know
> what to do about it.”

Longer intent: [`knowledge/project-vision.md`](knowledge/project-vision.md).

---

## Ethical use

This is a **public-health decision aid**, not an alert authority and not
a substitute for clinical or official advice.

**Do not invent AQI.** Official Thai AQI and the 2023 PM2.5 breakpoints
(15 / 25 / 37.5 / 75 µg/m³) belong to PCD. AirDash **displays** station
AQI as published by Air4Thai. The **Air Watch Score** (0–100) is a
separate heuristic — weighted PM2.5, other pollutants, 6-hour trend,
CAMS forecast, and a ventilation proxy. The UI and the chat both say so.
Never present the watch score as “the AQI,” never round a missing station
into a fake index, and never interpolate a province that has no fresh
reading into a confident number.

**Credit sensors and APIs.** Ground truth is people and instruments:
Air4Thai stations, HII rain gauges, PCD noise monitors, GISTDA fusion,
CAMS / Open-Meteo, NOAA CPC, NASA IMERG / GIBS, RainViewer, JAXA. Name
them. Link them. The in-app Data tab and `GET /api/sources` are the
catalog. If a feed is down, say it is down.

**Health measures are conditional.** AirDash does **not** issue health
orders from its heuristic. Checklists (N95, windows, clean rooms,
sensitive groups) are tied to official PCD / Department of Health
advisories. Follow those first.

**Hotlines, not hype.**

* PCD pollution — **1650** · [pcd.go.th](https://www.pcd.go.th)
* DDC health — **1422**
* EMS — **1669**
* Official AQI — [air4thai.pcd.go.th](https://air4thai.pcd.go.th)

If the dashboard disagrees with the official channel, the official
channel wins.

**No secrets in git.** Optional LINE / Telegram / NVIDIA NIM / NASA
Earthdata tokens live in the SQLite `kv` table via `scripts/set-*-token.mjs`.
They are never committed. Core pipelines are keyless so a fork still
runs without them.

---

## How it works

Public feeds land on **one Mac**. The Mac stores readings in SQLite,
computes watch / danger / washout / science, and serves JSON + SSE.
Cloudflare Pages serves the HTML/JS; a Pages Function proxies `/api/*`
to a named tunnel (`api-air.nonarkara.org`) so the browser stays
same-origin.

```mermaid
flowchart LR
  subgraph sources["Public sensors and APIs"]
    PCD["PCD Air4Thai · AQI / PM"]
    HII["HII · rain gauges"]
    OM["Open-Meteo + CAMS"]
    OTHER["GISTDA · NOAA · NASA · news"]
  end

  subgraph mac["One Mac · Node + SQLite"]
    IN["Adapters on a timer"]
    DB[("data/airdash.db")]
    ENG["Watch · Danger · Washout · Science"]
    API["HTTP :8341 · /api/*"]
  end

  subgraph edge["Cloudflare · $0"]
    TUN["Tunnel api-air.nonarkara.org"]
    PG["Pages air.nonarkara.org"]
  end

  subgraph people["Phone / laptop"]
    STORY["Air Story /"]
    OPS["Mission Control /ops.html"]
  end

  sources --> IN --> DB --> ENG --> API
  API --> TUN
  PG --> people
  TUN --> STORY
  TUN --> OPS
```

Full topology, ER diagram, and score formulas:
[ARCHITECTURE.md](ARCHITECTURE.md) · diagrams in [`docs/diagrams/`](docs/diagrams/).

---

## Live site

The production URL in this tree is **[https://air.nonarkara.org](https://air.nonarkara.org)**
(`public/index.html` canonical, Cloudflare Pages custom domain in
[DEPLOY.md](DEPLOY.md), tunnel host `api-air.nonarkara.org` in
`functions/api/[[path]].js`).

Sister system: [flood.nonarkara.org](https://flood.nonarkara.org).

---

## How to run it

Instructions below are taken from `package.json`, `setup.sh`,
[CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md) §16,
[DEPLOY.md](DEPLOY.md), and `ops/*`. No API keys are required for the
core watch.

### Prerequisites

* **Node.js ≥ 22.5** (`package.json` `engines` — the server uses the
  built-in `node:sqlite`, `fetch`, and `node:http`. There are **zero
  npm runtime dependencies**.)
* Git, curl, bash
* macOS is the intended 24/7 host (`launchd` plists under `ops/`).
  Linux/WSL can run the Node process; the plist installers will not.

### 1. Clone and vendor frontend assets

`public/vendor/` and `public/fonts/` are gitignored and regenerated by
`setup.sh` (Leaflet 1.9.4 + Sarabun / IBM Plex Mono). Without this
step the map shell is empty.

```bash
git clone https://github.com/Nonarkara/airdash.git
cd airdash
bash setup.sh
# npm install is a no-op for runtime deps; keep it if your habit expects it
```

### 2. Run the one-process backend (API + static UI)

```bash
node server/index.js
# listens on 0.0.0.0:8341  (override with PORT)
# SQLite file: data/airdash.db  (override with AIRDASH_DB_PATH)
```

Open **http://localhost:8341** — the Node process serves `public/` and
`/api/*` on the same origin. First ingest of Air4Thai / Open-Meteo /
HII / etc. fills the database; the boot screen waits on
`GET /api/snapshot`.

Health check: `curl -s http://localhost:8341/api/health`

### 3. Optional: Cloudflare Pages frontend locally

```bash
npx wrangler pages dev public --port 8788
# → http://localhost:8788
```

**Honest caveat:** `functions/api/[[path]].js` proxies `/api/*` to the
**live** tunnel `https://api-air.nonarkara.org`, not to your laptop.
Use this to preview static UI against production data. For a fully
local stack, use port **8341** from step 2.

### 4. Tests (no network secrets)

```bash
npm test
# scripts/check-consistency.mjs
# scripts/test-alerts-fixes.mjs
# scripts/test-telegram-bind.mjs
```

### 5. 24/7 on the steward Mac (production pattern)

Edit the hardcoded `WorkingDirectory` / log paths in
`ops/com.airdash.server.plist` (and the tunnel / watchdog plists) to
**your** checkout, then:

```bash
bash ops/install-service.sh          # launchd com.airdash.server → :8341
cloudflared tunnel login             # one-time, browser, nonarkara.org zone
bash ops/setup-tunnel.sh             # api-air.nonarkara.org → localhost:8341
bash scripts/deploy-frontend.sh      # Cloudflare Pages direct-upload
```

`git push` does **not** deploy the frontend. This is a Pages
direct-upload project. Details and poison-window verification:
[DEPLOY.md](DEPLOY.md).

Keep the Mac awake on power. Optional tokens (never commit them):

| Feature | Script | If absent |
|---------|--------|-----------|
| Ask-AI (NVIDIA NIM) | `node scripts/set-llm-key.mjs nvapi-…` | Chat falls back to a live-data summary |
| NASA IMERG rain | `node scripts/set-earthdata-token.mjs …` | Source skips quietly |
| LINE OA broadcasts | `node scripts/set-line-token.mjs …` | Push is a no-op |
| Telegram bot | `node scripts/set-telegram-token.mjs …` | Push is a no-op |

Nightly DB snapshot: `ops/backup-db.sh` via `ops/com.airdash.backup.plist`.

---

## 🎯 The Mission

Every dust season, ordinary people make decisions that determine what their
families breathe. Most of those people are not atmospheric scientists. Most
have never read a µg/m³ chart. They live in Chiang Mai, in Khon Kaen, in
the Bangkok suburbs — and the dashboard that tells them what to do has to
work in five seconds, in Thai, on a phone, during the worst air week of
the year.

**The thesis behind every design decision:**

> *"Data is not a decision. A number on a screen is not an action. AirDash
> exists to close the gap between 'we know the air is bad' and 'we know
> what to do about it.'"*

This is what every JMA-style action verb, every confidence interval, every
hotline button, every nearest-station card, and every washout figure serves.

---

## 🚪 Two Experiences, One Engine

### 📖 Air Story — the front door (`/`)

A scroll-based bilingual narrative, not a dashboard — built for smart
kids and curious adults. One question per chapter:

* **The hero** — a full-viewport breathing circle tinted by the live
  Thai AQI band, carrying the number everyone understands: today's
  national PM2.5 in **cigarette-equivalents** (22 µg/m³·day ≈ 1
  cigarette, the Berkeley Earth rule).
* **The persona picker** — kid / teen / adult / athlete / senior /
  pregnant / asthma (kid first — parents look for their kids). Each
  persona gets a personalized dose, play budget, and guidance from
  `GET /api/science/personal`.
* **The body** — a body-journey SVG of where the particles go.
* **The Wallet** — the daily national haze bill (value of statistical
  life), your per-person "haze tax", and three freakonomics cards: the
  externality of field burning, the information asymmetry of invisible
  PM2.5, and present bias.
* **The Sky** — a Koschmieder visibility estimate, a stagnation
  explainer, and cause chips.
* **The Forest** — AOT40-style ozone crop stress.
* **Science Receipts** — every formula on the wall with its constants
  and citation, rendered live from `/api/science` `meta.formulas`.
* **ACT** — a band-aware checklist, alert signup (LINE OA / LINE
  Notify / Telegram), and the bridge to Mission Control.

### 🛰️ Mission Control — the operator dashboard (`/ops.html`)

The original dashboard, preserved in full: header + ranking rail +
Leaflet map + 11-tab right rail + ticker, re-paletted to the AirDash
tokens. For mayors, district officials, researchers, journalists — and
every air detective who wants the raw truth. A "หน้าแรก/Home" chip
takes you back to Air Story.

---

## 🏛️ Project Of

**Dr Non Arkaraprasertkul** — Senior Expert, Smart City Promotion Department,
**Digital Economy Promotion Agency (depa)**, Kingdom of Thailand.

Produced under the **Smart City Thailand Office** (สำนักงานเมืองอัจฉริยะประเทศไทย),
Ministry of Digital Economy and Society.

**ดร.นน อัครประเสริฐกุล** — ผู้เชี่ยวชาญอาวุโส ฝ่ายส่งเสริมเมืองอัจฉริยะ
สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) ภายใต้สำนักงานเมืองอัจฉริยะประเทศไทย

---

## 🤝 Sponsors, Partners & Data Sources

The dashboard is a public-interest system. No fee to use, no data sold, no
ads. Everything ships from real Thai government and open scientific sources.
The boot screen displays the full credit list so a first-time visitor
immediately knows "is this real?" and "who's behind it?".

### Steward

* **depa** — Digital Economy Promotion Agency (สำนักงานส่งเสริมเศรษฐกิจดิจิทัล)
  — the agency under whom the project lives

### Partners

* **Smart City Thailand Office** (สำนักงานเมืองอัจฉริยะประเทศไทย)
* **Axiom + ReTL** — *The Reason To Live Company* (engineering partner)

### Standards bodies

* **SLIC** — Smart Living Industry Cluster
* **RCAD** — Research and Innovation Acceleration Agency

### Data providers (the public-interest feed)

* **PCD** (คพ.) — Pollution Control Department · Air4Thai network
* **TMD** (อุตุฯ) — Thai Meteorological Department
* **HII / สสน.** — Hydro-Informatics Institute · rain gauges

### External reference data (free / open)

* **Open-Meteo** — weather + CAMS air-quality forecast delivery
* **Copernicus / CAMS** — PM2.5 forecast model
* **NOAA CPC** — ENSO / Oceanic Niño Index
* **NASA GIBS / GPM** — satellite imagery + IMERG precipitation
* **RainViewer** — radar tile mosaic
* **JAXA** — satellite precipitation products

Field-level cadence and units: [`knowledge/data-sources.md`](knowledge/data-sources.md).

---

## 🌬️ What AirDash Does

**For the Chiang Mai resident in burning season:** opens the page, sees
"PROTECT NOW" in red at the top, reads the one-line reason, checks the
washout panel — 60% chance of 12 mm rain tomorrow, expected relief ~12% —
finds the 3 nearest AQ stations, shares the status with family on LINE,
and taps 1650 to reach PCD. Total time: under a minute.

**For the Bangkok commuter:** checks the 48-hour PM2.5 forecast strip for
the week's worst mornings, sees the confidence interval, and decides
whether tomorrow is a mask day or a work-from-home day.

**For the district official:** opens the dashboard on the wall TV, sees
the JMA-style national action card with a checklist of what to do this
hour, and the WHAT-IF slider to ask "if 20 mm of rain falls tonight, what
does my province's PM2.5 project to?".

**For the news reporter:** grabs a confidence-bounded number ("province X
is at 60/100 ±5") and a screenshot of the citizen panel to embed in the
story, with a direct link to the live data behind it.

**For the researcher:** downloads the full historical dataset as CSV,
follows the methodology in the in-app Air Library, and reproduces every
number from the bilingual research paper.

---

## 🧭 The Action Framework

The single most important design choice in the system: **no one is shown a
passive label**. Every band ships with exactly one verb, in both Thai and
English, sized to dominate the page. Pattern-match in under 500 ms
(Klein's recognition-primed decision model).

| Band | Score | Thai verb | English verb | Color |
|------|------:|-----------|--------------|-------|
| `normal` | 0–19 | **อากาศดี** | **GOOD AIR** | 🟢 Green |
| `watch` | 20–44 | **ติดตามสถานการณ์** | **STAY INFORMED** | 🟡 Yellow |
| `elevated` | 45–69 | **ลดกิจกรรมกลางแจ้ง** | **LIMIT OUTDOOR TIME** | 🟠 Orange |
| `high` | 70+ | **ป้องกันทันที** | **PROTECT NOW** | 🔴 Brick red |

AirDash deliberately does **not** issue health orders from its heuristic
score. Health measures are shown as conditional guidance tied to official
PCD / Department of Health advisories.

**The "dust season override":** even when the score says "NORMAL", during
the dust-season window (1 December – 30 April) with the national dust load
elevated, the hero reads "LOW · STAY INFORMED" so the citizen never assumes
the season is over.

**Dust-season trigger:** the override fires when at least 30% of sampled
provinces have a worst PM2.5 of 25 µg/m³ or more AND the date falls within
the season window. The dashboard is honest about the trigger in the hero
subtitle.

---

## 👥 Two Ways to Use the Dashboard

*These two modes live in Mission Control (`/ops.html`) — Air Story (`/`)
needs no mode switch, because it is the citizen experience.*

### 🟢 Citizen mode (ง่าย / EASY)

For non-technical readers. Auto-selected on first visit with a `?city=X`
link (e.g. `https://air.nonarkara.org/?city=Chiang%20Mai`).

Shows: **just the essentials.**
* JMA verb at the top (one tap to read aloud)
* 1650 / 1422 / 1669 hotline buttons
* My province's air + 3 nearest AQ stations + share buttons
* Per-band health checklist (N95, windows, clean room, sensitive groups)
* LINE push opt-in
* The map

Hides: forecast strip, what-if widget, pipeline health, signal details,
insights panel, library, history — anything that needs context to read.

### 🟦 Operator mode (เต็ม / FULL)

For mayors, district officials, researchers, journalists. Default mode.

Shows: **everything.** The full right-rail: analytics, washout, live tap,
sources, signals, history, library, alerts, news, chat, citizen.

Toggle at the top-right of the header. The choice persists in
`localStorage`.

---

## 📊 Seven Data Pipelines, One Truth

AirDash unifies **seven** open public data pipelines into a single bilingual
dashboard with a real-time "tap" of every pipeline event:

| # | Source | Agency | Cadence | Coverage |
|---|--------|--------|---------|----------|
| 1 | Ground AQI network (PM2.5/PM10/O3/NO2/SO2/CO) | PCD Air4Thai (คพ.) | 1 hour | ~200 stations — PRIMARY |
| 2 | Weather forecast (rain amount/probability, wind) | Open-Meteo | 3 hours | 77 province centroids |
| 3 | Air-quality forecast (PM2.5 to 72 h) | Copernicus CAMS via Open-Meteo | 3 hours | 77 provinces |
| 4 | Rain gauges (observed washout verification) | Multi-agency via HII (สสน.) | 10 min | ~4,200 gauges |
| 5 | Satellite precipitation | NASA GPM IMERG | 30 min | token-gated, skips quietly |
| 6 | ENSO / Oceanic Niño Index | NOAA CPC | 12 hours | Seasonal modulator |
| 7 | Air-quality news | Google News TH + Khaosod | 30 min | Keyword-filtered headlines |

**Map layers** (rendered client-side, not stored): RainViewer radar
animation, NASA GIBS satellite imagery, JAXA precipitation, and the
province-boundaries choropleth.

Additional adapters in `server/sources/` (GISTDA PM2.5 fusion, PCD noise,
history) feed the same SQLite file. The architecture doc counts **nine**
live sources including those. The badge at the top matches that inventory.

---

## 🧮 The Air Watch Score

**Province Air Watch Score** — `score = 0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation`

| Band | Score | Color | Meaning |
|------|-------|-------|---------|
| NORMAL | 0–19 | 🟢 Green | Good air · live normally |
| WATCH | 20–44 | 🟡 Yellow | Stay informed |
| ELEVATED | 45–69 | 🟠 Orange | Limit outdoor time · signals aligning |
| CRITICAL | 70+ | 🔴 Brick red | Protect now · follow official advisories |

The PM2.5 sub-score is anchored to the **Thai AQI 2023 breakpoints
(15 / 25 / 37.5 / 75 µg/m³)**; trend reads the 6-hour rise; forecast folds
in CAMS; stagnation reads forecast wind + rain probability as a
ventilation proxy.

> **This is a heuristic indicator, not an air-quality forecast, and not
> official AQI.** The UI and the AI assistant both say so, repeatedly.
> Always follow official PCD / TMD / DOH advisories.

### Confidence intervals

Every number that changes ships with a confidence interval — the hero shows
"60/100 ±5" instead of just "60". The CI is derived from:
* data freshness (how stale is the latest reading?)
* sensor coverage (how many stations back the score?)
* score stability (how much has the score moved in the last 6 hours?)

A number without a confidence interval is a guess. A number with a
confidence interval is a measurement.

---

## 🌧️ Rain-Washout · The signature feature

Wet deposition: rain scavenges airborne particles, so **a forecast rain
event is a forecast dust-relief event**. For every province, AirDash
combines what the air holds now (worst fresh PM2.5), how likely rain is,
and how much is forecast:

* `relief_if_rain_pct` — expected PM2.5 reduction IF the forecast rain falls
  (1–5 mm ≈ 8% · 5–15 mm ≈ 20% · 15–35 mm ≈ 30% · ≥35 mm ≈ 40%)
* `expected_relief_pct` — probability-weighted relief (the honest number)
* `projected_pm25` — the after-rain level if it does rain
* band — `strong` / `moderate` / `light` / `none` (amount AND probability
  must both clear the bar)

One shared relief curve (`server/washout-curve.js`) feeds the washout,
danger, forecast, and what-if engines, so the numbers always agree.

The WASHOUT panel ranks provinces by who gets helped most; the WHAT-IF
slider asks "if X mm falls in 24 h, what does each province project to?";
and ~4,200 HII rain gauges verify whether a promised washout actually
arrived. Derived from published washout ratios — a heuristic, not
dispersion modelling, and labelled as such everywhere it appears.

```
GET /api/washout
GET /api/whatif?rain=20
```

---

## 🔬 The Science Engine

The layer that turns µg/m³ into meaning. `server/science.js` (a
`createScience` factory with a 60 s TTL cache) computes national and
per-province health translations from live PM2.5, 77-province DOPA
populations (`server/populations.js`), and constants in
`CONFIG.science`:

| Translation | Formula | Citation |
|---|---|---|
| Cigarette-equivalents | PM2.5 ÷ 22 | Müller & Müller, Berkeley Earth |
| Life-minutes lost | cigs × 11 min | Spiegelhalter microlives (BMJ 2012) |
| Excess daily mortality | +0.68% per +10 µg/m³ above the WHO 2021 24 h guideline | Liu et al. 2019 (NEJM, 652 cities); Burnett et al. 2018 (GEMM) |
| Life expectancy lost | sustained +10 µg/m³ ≈ −0.98 yr | AQLI / EPIC, U. Chicago |
| National haze bill + "haze tax" | VSL × attributable deaths ÷ population | value-of-statistical-life economics |
| Visibility | V ≈ K / β | Koschmieder 1924 |
| Ozone crop stress | AOT40-style weekly ppb·h | WHO 2021 |

Every constant, formula, and citation ships to the browser as **Science
Receipts** via `meta.formulas`, and the full documentation lives in
[`knowledge/health-science.md`](knowledge/health-science.md) — which
also feeds the in-app Air Library through the `knowledge/*.md →
rag_docs` convention. On a typical good-air day the national readout is
roughly: PM2.5 ~18 µg/m³ → ~0.8 cigarettes/day, ~9 life-minutes/day, a
฿50M-class daily national bill, under ฿1/person haze tax, ~23 km
visibility, AOT40 ~34 ppb·h (low).

```
GET /api/science        # national + 77 provinces + persona profiles + formula receipts
GET /api/science/personal?province=50&profile=kid&outdoorMin=90&activity=moderate
```

---

## 💬 Ask-AI · The "moat" feature

The chat answers questions about the air situation using **only** the live
data the system holds — no web search, no hallucination, no historical
training. If the model is offline, it gracefully degrades to a structured
live-data summary.

The chat lives in Mission Control in two places:
1. **The right-rail ASK tab** — full chat with history and feedback
2. **The Air Library** — natural-language Q&A against the background
   methodology chapters (now including the health-science receipts)

Example questions a citizen can ask:
* "จังหวัดไหนฝุ่นแย่สุดตอนนี้" — "Which province has the worst dust right now?"
* "ฝนจะช่วยลดฝุ่นที่เชียงใหม่ไหม" — "Will rain help the dust in Chiang Mai?"
* "พรุ่งนี้ PM2.5 กรุงเทพเป็นอย่างไร" — "What's Bangkok's PM2.5 outlook tomorrow?"
* "อธิบายวิธีคำนวณคะแนนเฝ้าระวัง" — "Explain how the watch score is calculated"

---

## 📲 Alerts — LINE & Telegram

Citizens can subscribe to AirDash alerts through three channels: the
**LINE Official Account**, **LINE Notify**, and the **Telegram bot**.
Severe system alerts can be broadcast through the LINE Messaging API
when the operator configures the channel token; Telegram broadcasts use
the bot token. AirDash never asks a citizen to paste a messaging token
into the dashboard. Sign-up links live in the ACT chapter of Air Story
and in Mission Control's citizen panel.

---

## 🔀 Compare Places

Click `⊟` in the header to open the **Compare Places** overlay — up
to **4 mini maps side-by-side**, each with a search bar that finds any
of **70k+ places** (provinces, districts, tambons, stations) by Thai
name, English name, or 5-digit postal code.

The data bar on the left shows a compact card per selected place: its JMA
verb, score with confidence interval, worst PM2.5 + station count, washout
band, forecast 48 h, and 6 h trend. Color-coded by band so a glance tells
you who is dustiest.

```
Use case 1: Basin vs plain
  · Open compare, pick 2 panes
  · Type "เชียงใหม่" then "กรุงเทพ" — the burning-season gap becomes legible

Use case 2: Northern comparison
  · Open compare, switch to 4 panes
  · Type "เชียงใหม่", "เชียงราย", "แม่ฮ่องสอน", "ลำปาง"
  · The data bar shows four verbs and washout bands at a glance

Use case 3: Postal-code deep link
  · Type "50200" — finds the tambon served by that zip
  · The map flies to the tambon's lat/lng
```

---

## 📊 Research Paper

The full bilingual research paper — methodology, data sources, indicator
derivation, washout model, retention policy, and honest limitations — is
available in two places:

1. **In-app:** Click the `ⓘ About` button → `Research Paper` tab (includes
   infographics, data dictionary, and CSV dataset download)
2. **Markdown:** [`knowledge/paper.md`](knowledge/paper.md)

**Dataset download:** The `GET /api/export/full` endpoint streams every
permanent hourly aggregate as CSV.

---

## 💻 Technical Stack

* **Backend:** Single Node.js process, zero npm dependencies (Node ≥ 22.5
  built-ins only: `fetch`, `node:http`, `node:sqlite`)
* **Database:** SQLite in WAL mode — a single file you can back up by copying
* **Frontend:** Vanilla ES modules, vendored Leaflet, no build step
* **AI Chat:** Cloud-routed; gracefully degrades to structured live-data
  summary when offline
* **Push:** LINE Official Account + LINE Notify + Telegram bot broadcasts
* **Deployment:** Cloudflare Pages (frontend) + Cloudflare Tunnel (backend)

---

## 🎨 Design Language

**"Rams × NYC transit × Thai command" — reborn in sky and teal.**

Light sky-paper ground (`#F4F8FB`), deep-teal ink (`#0E4A5E`), sage
(`#3A8A6E`), ochre (`#D8893A`), brick (`#C8453A`), and purple
(`#6B2D5C`) — with the Thai-AQI 5-band palette for severity. Sarabun
for Thai and UI, Manrope for display, JetBrains Mono for every number
that changes. Sharp corners. No shadows. Full automatic dark mode, and
`prefers-reduced-motion` stills the breathing hero.

Brick red appears **only** when the air is genuinely hazardous — it is
never decorative.

---

## ♿ Accessibility (a11y)

* **WAI-ARIA Tabs pattern** with full keyboard navigation
* `role="status"` + `aria-live="polite"` on the boot screen
* Separate `aria-live` region announces "Dashboard ready · current
  situation: <JMA verb>" when boot goes away
* `aria-label` on the citizen pin, station cards, share buttons
* Color is never the only signal — every band has a verb and an icon
* Focus-visible outlines on every interactive element
* Thai font set to 11px minimum; numbers always in JetBrains Mono
* Hotlines are `tel:` links — one-tap dial on mobile

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/snapshot` | Current live data (risk, air, rain, forecasts, alerts, news) |
| `GET /api/risk` | Province Air Watch Scores (with CI, verdict cards, washout join) |
| `GET /api/washout` | **Rain-Washout per province** — chance of rain, expected relief, projected PM2.5 |
| `GET /api/wetness` | Back-compat alias → washout payload |
| `GET /api/whatif?rain=X` | "If X mm falls in 24 h" — projected PM2.5 per province |
| `GET /api/science` | National + 77-province health translations, persona profiles, formula receipts (`meta.formulas`) |
| `GET /api/science/personal?pm25\|province&profile&outdoorMin&activity` | Personalized dose, play budget, and guidance per persona |
| `GET /api/forecast` | Score projections at +24/+48/+72 h (CAMS + washout relief) |
| `GET /api/enso` | ENSO / ONI ocean state |
| `GET /api/series?source&station&metric&hours` | Time series for one station |
| `GET /api/stations?q=…` | Station search |
| `GET /api/stations/nearest?lat&lng&limit` | N nearest AQ stations with latest PM2.5/AQI |
| `GET /api/alerts` | Threshold-crossing alerts |
| `GET /api/news` | Air-quality news headlines |
| `GET /api/tap` | Live event stream (SSE) |
| `GET /api/sensors/health` | Per-station liveness |
| `GET /api/sensors/dead.csv` | CSV of dead / stuck / abnormal sensors |
| `POST /api/chat` | AI chat (streams; falls back to data summary) |
| `GET /api/library/toc?lang=th\|en` | Air Library table of contents |
| `GET /api/insights` | Real-time signals (sensor health + thresholds) |
| `GET /api/export/full` | **Full dataset CSV** (all permanent hourly aggregates) |
| `GET /api/export/daily?date=YYYY-MM-DD` | One-day export (JSON or CSV) |
| `GET /api/sources` | Data-source catalog |
| `GET /api/health` | Service + DB + pipeline status |

---

## 📐 Further documentation

* [ARCHITECTURE.md](ARCHITECTURE.md) — system architecture, data flow, ER diagram, scores, 5-minute setup
* [SYSTEM.th.md](SYSTEM.th.md) — Thai technical edition
* [DEPLOY.md](DEPLOY.md) — Pages + tunnel + backup
* [CONTRIBUTING.md](CONTRIBUTING.md) — code, data, translation, and docs bar
* [CHANGELOG.md](CHANGELOG.md) — what shipped
* [DESIGN-AIRDASH.md](DESIGN-AIRDASH.md) — FloodDash → AirDash contract
* [`knowledge/`](knowledge/) — bilingual methodology (paper, AQI bands, washout, sources)

---

## 🆘 Always Follow Official Warnings

AirDash is a **decision-prioritisation system**, not an alert issuer.

* **PCD pollution hotline 1650**
* **DDC health hotline 1422**
* **EMS 1669**
* **PCD portal** at [pcd.go.th](https://www.pcd.go.th)
* **Official AQI** at [air4thai.pcd.go.th](https://air4thai.pcd.go.th)

If the dashboard is wrong, follow the official channel. If the dashboard
is right, share it.

---

## 📜 License & Attribution

© 2026 Dr Non Arkaraprasertkul. All rights reserved.

The in-app About overlay uses the same copyright line. Architecture notes
describe an MIT license; this repository does **not** currently contain a
`LICENSE` file. Treat the copyright notice above as the public statement
until a license file is added.

**Data is not ours to relicense.** Readings, AQI, forecasts, gauges, and
satellite tiles remain with PCD, TMD, HII, GISTDA, Copernicus/CAMS,
Open-Meteo, NOAA, NASA, JAXA, RainViewer, and the news publishers.
Credit the sensor and the API. Do not scrape this dashboard as a
substitute for those upstream terms.

Produced under the Digital Economy Promotion Agency (depa) and the
Smart City Thailand Office.

**Always follow official PCD / TMD / DOH advisories.** This system is for
prioritisation, not for issuing alerts.

The README banner (`docs/hero-banner.png`) is a civic illustration for
this project. It is not official government art and not a scientific
figure.

---

## 📧 Contact

**Dr Non Arkaraprasertkul**
`non.ar@depa.or.th`
[smartcitythailand.or.th](https://smartcitythailand.or.th)
[nonarkara.org](https://nonarkara.org)
