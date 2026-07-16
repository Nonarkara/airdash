# FLOODDASH

## เฝ้าระวังน้ำท่วมประเทศไทย · Thailand Flood Watch

> **An operating system for flood-decision making — for mayors, city
> administrators, district officials, and citizens.** Not a demo. Not a
> dashboard. Every figure is real-time from Thai government sources, every
> number carries a confidence interval, and the first thing on screen is
> always the action the user should take.

**Live:** [flood.nonarkara.org](https://flood.nonarkara.org) · **Mirror:** [flood-ami.pages.dev](https://flood-ami.pages.dev)

---

## 🎯 The Mission

When the rain comes, ordinary people make decisions that determine whether
they and their families are safe. Most of those people are not hydrologists.
Most have never read a water-level chart. They live in Trat, in Nakhon Sawan,
in the Bangkok suburbs — and the dashboard that tells them what to do has to
work in five seconds, in Thai, on a phone, for someone whose hands are
shaking.

**The thesis behind every design decision:**

> *"Data is not a decision. A number on a screen is not an action. FloodDash
> exists to close the gap between 'we know the water is rising' and 'we know
> what to do about it.'"*

This is what every JMA-style action verb, every confidence interval, every
hotline button, every shelter pin, and every LINE push serves.

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
ads. Everything ships from real Thai government sources. The boot screen
displays the full credit list so a first-time visitor immediately knows
"is this real?" and "who's behind it?".

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

* **DDPM** (ปภ.) — Department of Disaster Prevention and Mitigation
* **HII / สสน.** — Hydro-Informatics Institute
* **RID** (กรมชลฯ) — Royal Irrigation Department
* **TMD** (อุตุฯ) — Thai Meteorological Department
* **PCD** (คพ.) — Pollution Control Department

### External reference data (free / open)

* **NOAA CPC** — ENSO / Oceanic Niño Index
* **Copernicus / ECMWF GloFAS** — River discharge
* **Open-Meteo** — Rain forecast
* **NASA GIBS** — MODIS satellite imagery
* **RainViewer** — Radar tile mosaic
* **JAXA GSMaP** — Satellite precipitation
* **GISTDA** — Thai river network vector data

---

## 🌊 What FloodDash Does

**For the citizen in Trat right now:** opens the page, sees "ACT NOW" in
red at the top, reads the one-line reason, finds the three nearest
shelters with one-tap Google Maps directions, shares the status with
family on LINE, and taps 1784 to call DDPM. Total time: under a minute.

**For the Bangkok commuter:** checks the 24-hour rain forecast for their
commute route, sees the confidence interval on the prediction, and decides
whether to leave 30 minutes earlier.

**For the district official in Khon Kaen:** opens the dashboard on the
wall TV, sees the JMA-style national action card with a checklist of what
to do this hour, and the WHAT-IF slider to ask "what if 200mm more rain
falls in the next 48 hours?".

**For the news reporter:** grabs a confidence-bounded number ("province
X is at 60/100 ±5") and a screenshot of the citizen panel to embed in
the story, with a direct link to the live data behind it.

**For the KMITL researcher:** downloads the full historical dataset as
CSV, follows the methodology in the in-app Flood Library, and cites the
public Blueprint to reproduce the system.

---

## 🧭 The Action Framework

The single most important design choice in the system: **no one is shown a
passive label**. Every band ships with exactly one verb, in both Thai and
English, sized to dominate the page. Pattern-match in under 500 ms
(Klein's recognition-primed decision model).

| Band | Score | Thai verb | English verb | Color |
|------|------:|-----------|--------------|-------|
| `normal` | 0–19 | **ปกติ** | **ALL CLEAR** | 🟢 Green |
| `watch` | 20–44 | **ติดตาม** | **STAY INFORMED** | 🟡 Yellow |
| `prepare` | 45–69 | **เตรียมพร้อม** | **PREPARE** | 🟠 Orange |
| `act` | 70+ | **ปฏิบัติการทันที** | **ACT NOW** | 🔴 Thai-flag red |

FloodDash deliberately does **not** issue an evacuation order from its
heuristic score. Evacuation is shown only as conditional guidance tied to
official DDPM or local-authority instructions. At national scale, the hero
uses area-scoped language such as **CHECK YOUR AREA NOW**, never an order for
the whole country.

**The "flood season override":** even when the score says "NORMAL", during
the official monsoon window (May–October) the hero always reads "ALL CLEAR
· STAY INFORMED" so the citizen never assumes the season is over.

**Flood-season trigger:** the override fires when soil saturation is
≥ 80% of saturated state AND the date falls within the monsoon window.
The dashboard is honest about the trigger in the hero subtitle.

---

## 👥 Two Ways to Use the Dashboard

### 🟢 Citizen mode (ง่าย / EASY)

For non-technical readers. Auto-selected on first visit with a `?city=X`
link (e.g. `https://flood.nonarkara.org/?city=Trat`).

Shows: **just the essentials.**
* JMA verb at the top (one tap to read aloud)
* 1784 hotline button
* My province's risk + 3 nearest shelters + share buttons
* LINE push opt-in
* The map

Hides: forecast strip, what-if widget, pipeline health, signal details,
insights panel, library, history — anything that needs context to read.

### 🟦 Operator mode (เต็ม / FULL)

For mayors, district officials, researchers, journalists. Default mode.

Shows: **everything.** The full right-rail: analytics, rivers cascade,
live tap, sources, signals, history, library, alerts, news, chat, citizen.

Toggle at the top-right of the header. The choice persists in
`localStorage`.

---

## 📊 Ten Data Sources, One Truth

FloodDash unifies **ten** open public data pipelines into a single bilingual
dashboard with a real-time "tap" of every pipeline event:

| # | Source | Agency | Cadence | Coverage |
|---|--------|--------|---------|----------|
| 1 | Water level telemetry | HII (สสน.) | 10 min | ~776 stations, situation levels 1–5 |
| 2 | Rainfall accumulation | Multi-agency via HII | 10 min | ~4,200 rain gauges |
| 3 | Major dams | HII / EGAT / RID | 1 hour | ~35–50 dams |
| 4 | Medium reservoirs | RID (กรมชลประทาน) | 6 hours | 461 reservoirs |
| 5 | Air quality (PM2.5) | PCD (คพ.) | 1 hour | ~174 AQI stations |
| 6 | Rain forecast | Open-Meteo | 3 hours | 77 provinces, 48-h forecast |
| 7 | River discharge | Copernicus GloFAS | 3 hours | ~15 river reaches (m³/s) |
| 8 | ENSO / Oceanic Niño Index | NOAA CPC | 12 hours | Seasonal modulator |
| 9 | Flood news | Google News TH + Khaosod | 30 min | Keyword-filtered headlines |
| 10 | **Emergency shelters** | **DDPM** | **24 h** | **10,399 shelters nationwide** |

**Map layers** (rendered client-side, not stored): RainViewer radar
animation, NASA GIBS MODIS Terra satellite, JAXA GSMaP precipitation,
the real Thai river network from GISTDA, and a historical-floods archive.

---

## 🧮 The Watch Score

**Province Watch Score** — `score = 0.40·water + 0.25·rain + 0.15·forecast + 0.10·wetness + 0.10·riseRate`

| Band | Score | Color | Meaning |
|------|-------|-------|---------|
| NORMAL | 0–19 | 🟢 Green | All clear · low risk |
| WATCH | 20–44 | 🟡 Yellow | Stay informed |
| ELEVATED | 45–69 | 🟠 Orange | Prepare · multiple signals aligning |
| CRITICAL | 70+ | 🔴 Thai-flag red | Act now · follow official warnings |

> **This is a heuristic indicator, not a flood forecast.** The UI and the AI
> assistant both say so, repeatedly. Always follow official DDPM / TMD / ONWR
> warnings.

### Confidence intervals

Every number that changes ships with a confidence interval — the hero shows
"60/100 ±5" instead of just "60". The CI is derived from:
* data freshness (how stale is the latest reading?)
* sensor coverage (how many stations back the score?)
* score stability (how much has the score moved in the last 6 hours?)

A number without a confidence interval is a guess. A number with a
confidence interval is a measurement.

---

## 🏕️ The DDPM Shelter Layer

The latest source added: **10,399 emergency shelters** from
[DDPM's open dataset](https://catalog.disaster.go.th/dataset/4fa4748c-8cdc-4a81-975f-947bffbd89e0).
Ingested daily, queried with bbox-cached nearest-neighbor search, rendered
on the map with capacity-colored markers, and surfaced in the citizen
panel as the 3 nearest shelters to "My Province" — each with a one-tap
Google Maps navigate button.

```
GET /api/shelters
GET /api/shelters/nearest?lat=12.24&lng=102.51&limit=3
GET /api/shelters/ingest   ← admin
```

---

## 💬 Ask-AI · The "moat" feature

The chat is the dashboard's only true moat. It answers questions about the
flood situation using **only** the live data the system holds — no web
search, no hallucination, no historical training. If the model is offline,
it gracefully degrades to a structured live-data summary.

The chat is now surfaced in three places:
1. **The hero ASK bar** — always visible, sticky below the header
2. **The right-rail ASK tab** — full chat with history and feedback
3. **The Flood Library** — natural-language Q&A against 11 background
   methodology chapters

Example questions a citizen can ask:
* "จังหวัดไหนเสี่ยงสุดตอนนี้" — "Which province is at highest risk right now?"
* "น้ำที่เชียงใหม่ตอนนี้เป็นอย่างไร" — "How is the water level in Chiang Mai?"
* "ฝนจะตกหนักที่ไหนใน 24 ชม." — "Where will it rain hardest in 24 hours?"
* "อธิบายวิธีคำนวณคะแนนเสี่ยง" — "Explain how the risk score is calculated"

---

## 📲 LINE Official Account

The citizen panel links directly to the FloodDash LINE Official Account:
**[@flooddash](https://line.me/R/ti/p/@flooddash)**. Severe system alerts can
be broadcast through the LINE Messaging API when the operator configures the
channel token.

The retired LINE Notify personal-token flow was removed in v2.0. FloodDash
never asks a citizen to paste a messaging token into the dashboard.

---

## 🔀 Compare Places (the redesigned split view)

Click `⊟` in the header to open the **Compare Places** overlay — up
to **4 mini maps side-by-side**, each with a search bar that finds any
of **70k+ places** (provinces, districts, tambons, stations) by Thai
name, English name, or 5-digit postal code.

The data bar on the left is the customized left rail for this view:
each selected place gets a compact card with its JMA verb (the action
the user should take), score with confidence interval, water level +
station count, rain 24h max, forecast 48h, soil saturation, and 6h
rise. Color-coded by band so a glance tells you who is hottest.

```
Use case 1: Upstream vs downstream
  · Open compare, pick 2 panes
  · Type "นครสวรรค์" then "อยุธยา" — the cascade lag becomes legible

Use case 2: Provincial comparison
  · Open compare, switch to 4 panes
  · Type "ตราด", "เชียงใหม่", "ภูเก็ต", "กรุงเทพ"
  · The data bar shows the four JMA verbs and scores at a glance

Use case 3: Postal-code deep link
  · Type "10200" — finds the tambon served by that zip
  · The map flies to the tambon's lat/lng
```

Layout:
* Header: title + 2/3/4 pane count selector + close
* Body: 320px data bar (left) + 1fr grid of panes (right)
* Grid: 2 cols (2-pane), 3 cols (3-pane), 2x2 (4-pane)
* On viewports <1100px the data bar shrinks; on <860px (mobile) the
  whole overlay and the button are hidden

The data bar IS the customized left rail: when this overlay opens,
the regular left rail (ranking/analytics) is hidden behind it.
Closing the overlay restores everything.

---

## 🏗️ Build Your Own

The full methodology, architecture, data-source catalog, and step-by-step
build-your-own roadmap are **publicly available** — no source code, just
everything you need to reproduce the system:

➡️ **[FloodDash-Blueprint](https://github.com/Nonarkara/FloodDash-Blueprint)**

The Blueprint includes:
* Complete system architecture and data flow
* Every data source URL, API endpoint, and fetch pattern
* The watch-score derivation formula with weights explained
* The connected-waterways cascade model (reach graph, lag times, thresholds)
* The Antecedent Precipitation Index (API) soil-wetness model
* The ENSO seasonal modulator integration
* The data retention policy (raw 90 days → permanent hourly rollups)
* Deployment guide (single machine, Cloudflare Tunnel, Pages)
* Academic citations and references

Any Thai provincial office, municipal EOC, or researcher can build an
identical system from the Blueprint alone. Open invitation.

---

## 📊 Research Paper

The full bilingual research paper — methodology, data sources, indicator
derivation, cascade graph, retention policy, and honest limitations — is
available in two places:

1. **In-app:** Click the `ⓘ About` button → `Research Paper` tab (includes
   infographics, data dictionary, and CSV dataset download)
2. **Markdown:** [`knowledge/paper.md`](knowledge/paper.md)

**Dataset download:** The `GET /api/export/full` endpoint streams every
permanent hourly aggregate as CSV. Available via the download button in
the Research Paper tab.

---

## 💻 Technical Stack

* **Backend:** Single Node.js process, zero npm dependencies (Node ≥ 22.5
  built-ins only: `fetch`, `node:http`, `node:sqlite`)
* **Database:** SQLite in WAL mode — a single file you can back up by copying
* **Frontend:** Vanilla ES modules, vendored Leaflet, no build step
* **AI Chat:** Cloud-routed (`qwen/qwen3-next-80b-a3b-instruct` + `llama-nemotron-embed`);
  gracefully degrades to structured live-data summary when offline
* **Push:** LINE Official Account broadcast via the Messaging API
* **Deployment:** Cloudflare Pages (frontend) + Cloudflare Tunnel (backend)

---

## 🎨 Design Language

**"Rams × NYC transit × Thai command"**

Warm paper ground (`#F6F4EF`), Thai-flag navy chrome (`#241E4E`) with the
pentaband signature (red-white-navy-white-red). Square severity badges —
FloodDash's "subway bullet" is a square, not a circle. Sarabun for Thai,
IBM Plex Mono for every number that changes. Radius 0. No shadows.

Thai-flag red (`#A51931`) appears **only** when something is genuinely
overflowing — it is never decorative.

---

## ♿ Accessibility (a11y)

* **WAI-ARIA Tabs pattern** with full keyboard navigation
* `role="status"` + `aria-live="polite"` on the boot screen
* Separate `aria-live` region announces "Dashboard ready · current
  situation: <JMA verb>" when boot goes away
* `aria-label` on the citizen pin, shelters, share buttons
* Color is never the only signal — every band has a verb and an icon
* Focus-visible outlines on every interactive element
* Thai font set to 11px minimum; numbers always in IBM Plex Mono
* Hotlines are `tel:` links — one-tap dial on mobile

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/snapshot` | Current live data (risk, water, rain, dams, alerts, news) |
| `GET /api/risk` | Province watch scores (with CI per metric) |
| `GET /api/rivers` | Connected waterways cascade |
| `GET /api/wetness` | Antecedent Precipitation Index per province |
| `GET /api/enso` | ENSO / ONI ocean state |
| `GET /api/series?source&station&metric&hours` | Time series for one station |
| `GET /api/stations?q=…` | Station search |
| `GET /api/alerts` | Threshold-crossing alerts |
| `GET /api/news` | Flood news headlines |
| `GET /api/tap` | Live event stream (SSE) |
| `GET /api/sensors/health` | Per-station liveness (6,148 stations) |
| `GET /api/sensors/dead.csv` | CSV of dead / stuck / abnormal sensors |
| `GET /api/shelters` | All DDPM shelters (10,399) |
| `GET /api/shelters/nearest?lat&lng&limit` | N nearest shelters to a point |
| `POST /api/chat` | AI chat (streams; falls back to data summary) |
| `GET /api/library/toc?lang=th\|en` | Flood Library table of contents |
| `GET /api/insights` | Real-time signals (sensor health + thresholds) |
| `GET /api/export/full` | **Full dataset CSV** (all permanent hourly aggregates) |
| `GET /api/export/daily?date=YYYY-MM-DD` | One-day export (JSON or CSV) |
| `GET /api/sources` | Data-source catalog |
| `GET /api/health` | Service + DB + pipeline status |

---

## 🧪 Project Status

| Metric | Count |
|--------|------:|
| Stations ingested | **6,148** |
| Historical readings | **4.6 M** |
| Permanent hourly rollups | **1+** (and growing daily) |
| DDPM shelters | **10,399** |
| Active data sources | **10** |
| Right-rail panels | **11** |
| Hero languages | **2 (TH / EN)** |

DB size ~1.4 GB and growing 10–30 MB/day with active ingest. WAL mode
ensures a single-file backup (`data/flooddash.db`).

---

## 🆘 Always Follow Official Warnings

FloodDash is a **decision-prioritisation system**, not an alert issuer.

* **DDPM hotline 1784** (24/7, toll-free)
* **EMS 1669**
* **Tourist police 191**
* **TMD forecast** at [tmd.go.th](https://www.tmd.go.th)
* **DDPM alerts** at [disaster.go.th](https://www.disaster.go.th)

If the dashboard is wrong, follow the official channel. If the dashboard
is right, share it.

---

## 📜 License & Attribution

© 2026 Dr Non Arkaraprasertkul. All rights reserved.

Data sourced from each respective Thai government agency (HII, RID, PCD,
NOAA, Copernicus/ECMWF, Open-Meteo, RainViewer, NASA GIBS, GISTDA, JAXA,
DDPM). Produced under the Digital Economy Promotion Agency (depa) and the
Smart City Thailand Office.

**Always follow official DDPM / TMD / ONWR warnings.** This system is for
prioritisation, not for issuing alerts.

---

## 📧 Contact

**Dr Non Arkaraprasertkul**
`non.ar@depa.or.th`
[smartcitythailand.or.th](https://smartcitythailand.or.th)
[nonarkara.org](https://nonarkara.org)
