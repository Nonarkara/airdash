# Changelog

All notable changes to AirDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its purpose and the problem
> it solved. If a feature is in the code but not in this log, it is in the
> wrong place.

---

---

## [2.4.108] — 2026-10-21 — the wind you can see

The bearing existed for all 77 provinces and no screen showed it to the reader who needed it. `/api/risk` published a wind **speed** with no direction; the direction lived only in `/api/smoke`, and the map's arrow layer was wired to that payload — which the snapshot fills only for provinces with something burning upwind. So the wind layer was empty on exactly the days the wind matters most: a still, dusty, no-fire day. The citizen panel, the one screen a resident actually reads, printed a wind direction only as a clause inside that same fire-gated line, so on a quiet day it said nothing at all about which way the air was moving — and in the dry season that is the first question: is this wind bringing dust in, or clearing it out?

**One renderer, one contract.** `public/js/wind.js` is now the only place a wind is drawn. The server owns the compass (`server/wind.js`) and now labels **both ends** of the bearing — `wind_from_*` and `wind_towards_*`, in Thai and English — so the browser never keeps its own compass table and never recomputes a bearing. `server/smoke.js` publishes the same contract as `/api/risk` (its `from_deg`/`from_th`/`from_en` stay as the aliases they always were), so one renderer reads either API. The browser-side `windTowards` formula is gone: two formulas in two runtimes disagree by half a degree eventually, and nobody can tell which one a reader was shown.

**What a reader now sees.** The arrow points **downwind** — the way the air moves — and the words beside it say so ("From N, blowing towards S"), so a misread arrow is caught by the sentence. The arrow is drawn as a shape, not as a character a reader must interpret. The citizen panel states the wind on **every** province, fire or no fire, and names which day the wind is for. The map's province field is painted from the risk payload, so it and the score can never disagree about the same province. The province popup and the comparison cards carry the same line.

**The limits are still published.** A dominant daily direction is a steering hint, not a flight path: it cannot resolve valleys, plume rise or arrival time. Every surface that shows the wind says so, in the reader's language, and an absent wind reads as absent — never as north.

Verified live: **77 of 77** provinces carry a bearing, **0** towards-label mismatches, and the smoke and risk payloads agree on every province. The new guard (48 checks) executes the renderer, the citizen panel, the comparison card and the map's wind field against a DOM and Leaflet stub; it was mutation-tested by planting the bug it exists for — the citizen wind gated on a fire, the arrow reversed, the browser recomputing the bearing, the map drawing the wrong province, the English label leaking Thai, the server dropping the far-end labels. Each one turns it red. A source check for the map was replaced after the mutation test proved it stayed green through a broken map.

## [2.4.107] — 2026-10-21 — research visual hierarchy

Gave Research a concise opening, warm editorial heading accent and a responsive evidence-flow diagram: observations, checks/interpretation, public watch. The diagram explains measured versus forecast evidence, transport uncertainty and research-score limits. Prose remains neutral and readable; diagrams carry meaning rather than decoration. Preserved chapter navigation, source detail and scientific qualifiers.

## [2.4.106] — 2026-10-20 — research reading desk

Rebuilt Research as an aligned chapter index and a measured reading column, with collapsible phone contents, stable bilingual anchors and contained charts/tables. Removed decorative card nesting and folded legacy version history. Replaced the miniature score formula with wrapping text. Corrected stale source counts, gauge/radar terminology, source credential assumptions and rain-relief explanations; the fine-mode chart now follows backend thresholds. Preserved measured-PM floors and unknown states in the explanation. Added chart/engine parity checks.

## [2.4.105] — 2026-10-20 — one-line province names

Removed condition subtitles beneath province names. The semantic urgency stripe carries the visible level; full labels remain in screen-reader descriptions and hover titles. Missing primary measurements use a neutral stripe, never a green all-clear. Metric columns,44px touch targets and expandable details are preserved.

## [2.4.104] — 2026-10-20 — compact province comparison list

Replaced spread-out province tiles with five aligned columns: province, PM2.5/effective harm, Watch, Social and research Index. Removed repeated badge boxes, duplicated English province names, clean-row fading and unnecessary multi-row spacing. Labels and units are shared above the list; complete source notes and action guidance remain in native-button disclosures. Unknown values remain unknown, including missing effective harm when that sort is selected. Moved the below-viewport footer into About so focusing list controls cannot scroll the entire fixed dashboard and hide its header. Direction follows the supplied UX Planet article’s Utilitarian/Bauhaus vocabulary, applied through Palette typography and semantic air-quality colours.

## [2.4.103] — 2026-10-20 — Palette instrument header

Replaced the permanent multi-row toolbar with one aligned52px status/score/location row and44px Find/Menu actions. Search and secondary tools open explicit drawers with Escape/outside-click dismissal and focus return. Preserved language, view mode, camera, compare, home, FloodDash and About controls. Removed ornamental header plates, duplicated translations, emoji icons and rounded boxes. Shared UI typography now uses the existing Jost/Prompt families. Air-quality colours retain their data meaning.

## [2.4.102] — 2026-10-20 — repair expanded province ranking layout

Province explanations now occupy their own full-width grid row below the name and metrics. Previously they were appended to a non-wrapping flex row: a long explanation shrank to a narrow column and vertically centered the summary inside a nearly screen-high empty slab. Supplementary metrics wrap separately; explanation text is larger, measured and unboxed. Ranking typography uses Jost/Prompt. Desktop ranking now reserves usable height while forecast and rain scenario panels yield; previously they could squeeze it to less than one pixel. Verified expanded and collapsed rows against populated data at phone, tablet and desktop widths.

## [2.4.101] — 2026-10-19 — Southeast Asia air and flood watch

Added GDACS flood-episode collection and map locations across the 11 Southeast Asian countries. Explicitly requests all alert levels (omitting the filter excluded Green reports in live tests), bounds pagination and preserves event periods. Thirty-minute collection, six-hour retrieval freshness and rolling 14-day reports; empty or stale coverage never means safe. FL symbols represent event locations, not inundation footprints or depths. Thailand warnings reuse the existing FloodDash cache and require both source and retrieval timestamps within one hour, preserving prepare/protect/evacuate distinctions. Air and flood scores are not blended.

Updated the regional evidence directory, source/data-chain catalog, API documentation and bilingual research section. Removed hard-coded sensor/alert totals from the research introduction. Reused the Palette/Jost/Prompt layout with functional controls and disclosures, no new cards or decorative severity badges. Research contents now use a compact native disclosure; prose and figures use readable measures and the shared Jost/Prompt typography.

## [2.4.100] — 2026-10-19 — remove regional interface clutter

Replaced the regional page's layered CSS overrides with one coherent layout. Jost and Prompt replace the mixed microtype; body labels, captions and source status are readable at14–16px. Navigation and reset use content-sized links instead of empty button boxes. The PM legend sits beside its explanation below the map, leaving geography unobstructed. Method and wind limitations are grouped under named disclosures; reporting-location counts no longer masquerade as headline KPIs. Palette colours and map/data semantics remain consistent with AirDash.

Checked desktop1440, tablet1024 and phone390 layouts with live data; independent review covered layout and touch targets. Fonts are self-hosted with OFL licences. Frontend syntax, regional wiring, consistency and release checks pass.

## [2.4.99] — 2026-10-19 — retain maritime fire evidence alongside the mainland

The regional map now retains VIIRS detections across 11°S–29°N, 92–142°E, including Myanmar and Indonesia, from the same three global downloads. Added watch-area navigation and first/last acquisition times per 0.25° cell. Fire evidence uses geographically sized density cells rather than oversized overlapping circles. Ingestion yields between 500-row transactions and polygon-derived bounding boxes reject impossible Thai matches. Cache warming is serialized/coalesced to reduce cold-start contention. Mainland Thailand comparisons keep their original bounds; maritime detections cannot alter their denominator. Fresh regional coverage requires a successful expanded collector run, and publishes how many satellite feeds succeeded. Malformed/empty successful HTTP responses cannot certify coverage.

Daily Thailand winds remain labelled as daily forecasts, not regional smoke trajectories or arrival predictions. ASMC's operational regional interpretation is linked; its image endpoint is not represented as a wind-vector API. Hotspots do not establish farming, ignition time, burned area or causation. Added SQLite/parser tests and removed live-weather dependence from the washout behaviour test.

## [2.4.98] — 2026-10-17 — the risk payload published a wind speed and no direction

Ops + API only; no file under `public/` changed, so the asset token stays at 2.4.96.

**A wind speed with no bearing answers none of the questions people actually ask about wind.**

`/api/risk` fetched `wind_fc_kmh` for all 77 provinces and never asked Open-Meteo for `wind_dir_d0` / `wind_dir_d1` — columns AirDash already ingests, for all 77 provinces, in a valid 0–360 range, 4 hours stale at most. Meanwhile `/api/smoke` was already reading those same columns and publishing a labelled "from" bearing. So two endpoints answered the same question with one of them silent, and the silent one is the one the map and every consumer read.

In the dry season this is the difference between "wind 12 km/h" and "wind from the north-east, carrying air off the northern plain". The second is the actionable one.

**One compass, not two.** `server/smoke.js` kept its own private compass table. Copying that table into the risk engine would have been the same duplicate-partial-copy mistake already paid for in 2.4.74, so the table, the bearing maths and the labelling now live in `server/wind.js` and both engines import them. `smoke.js` had **no imports at all** before this, so the refactor is what let the shared module be used at all.

**What the payload gained,** per province: `wind_dir_deg`, `wind_from_th`, `wind_from_en`, `wind_towards_deg`, `wind_basis` and `wind_updated_at`. Tomorrow's bearing wins when present, because tomorrow is the day a reader is preparing for — and when it is absent the payload **says so** (`today-forecast`) rather than quietly falling back. Verified live: **77 of 77 provinces** carry a bearing, and **77 of 77 agree with `/api/smoke`** on the compass label, with zero disagreements.

**An absent wind reads as absent.** `describeWind` returns *every* field null for a missing, non-numeric, negative or >360 bearing, rather than defaulting to north. A missing wind that renders as "N" is a fabricated direction, and north is the one bearing a Thai reader would act on hardest. `pickWindDir` also treats a garbage tomorrow bearing as absent and falls back to today instead of rendering north.

The private per-province temporaries (`_wind_d0`, `_wind_d1`, …) are deleted before publishing, and a test asserts no `_wind*` key reaches the API.

`scripts/test-wind-direction.mjs` — 32 checks, including a live coherence check that compares `/api/risk` against `/api/smoke` province by province. Five mutations caught: removing the out-of-range guard (9 failures), defaulting a missing bearing to north (9), preferring today's forecast over tomorrow's (1), leaking the `_wind` temporaries (1), and re-introducing a private compass copy into `smoke.js` (2).

Full suite: **1405 passed, 0 failed** across 59 groups.

---
---

## [2.4.97] — 2026-10-17 — rain clears dust better than the curve said, because the curve only knew about PM2.5

Ops + API only; no file under `public/` changed, so the asset token stays at 2.4.96.

**The washout engine was sized for exactly one kind of particle, and AirDash now knows which kind it is.**

`server/washout-curve.js` is a published, cited curve for **accumulation-mode PM2.5**. That is the *worst* size for below-cloud removal. The **Greenfield gap** spans roughly 200–2000 nm, which is most of PM2.5, and capture efficiency inside it is low. Coarse particles sit outside that gap and are removed by inertial impaction and interception, which do not have the weakness:

- **ACP 23, 7521 (2023)**: below-cloud mechanisms are size-dependent; "weak below-cloud wet scavenging in the 200–2000 nm size range, which is the so-called Greenfield gap"; for coarse-mode aerosols, inertial impaction and interception are the **main** removal mechanism.
- **ACP 21, 16797 (2021)**: the scavenging coefficient "varies strongly with aerosol particle size, with the lowest values for aerosols in the accumulation mode".
- **Seoul, ~7 years of disdrometer data**: "PM2.5−10 is more effectively scavenged than PM2.5".
- **Zhang & Vet (2006)**, via Tellus B: the size influence on wet deposition "can reach up to several orders of magnitude".

So the 40% ceiling was **understating relief during a dust episode** — in exactly the season when relief is the whole question, and the season when a resident most wants to know whether the rain will clear the air.

**What changed, and what deliberately did not.**

- `reliefPct(mm, mode)` takes an optional aerosol size mode. With no mode it returns the published curve **byte-identically** — verified at 20 sampled inputs including `null`, `undefined`, `NaN`, `-5` and `Infinity`, and against an independently written copy of the old function. Every existing caller (`danger.js`, `/api/danger`, `/api/forecast`, `/api/whatif`) omits the mode and is numerically untouched. A guard that only counted checks would not have caught a drift here; this one runs both curves side by side.
- Only a **confident coarse** reading switches curves. `mixed`, `fine`, `null` and any unrecognised value all stay on the conservative published curve — an unknown particle size must never move a published number.
- Every washout entry now carries `aerosol_mode`, `curve_basis`, `relief_ceiling_pct`, `aerosol_alpha` and `aerosol_age_h`, so no reader has to guess which curve produced the number beside it.

**An honesty note, and it is not optional.** Unlike the fine curve, `COARSE_ASCENT = 60` is **not** a locally calibrated coefficient — AirDash has no PM10 instrument to fit against. It is an order-of-magnitude-informed, deliberately conservative adjustment of the same shape, and the source says so in capitals next to the constant. It must not be tightened without a real coarse-fraction measurement to fit.

**Two wiring defects the guard caught, both of which were mine.**

- The size was being resolved **once per province** — 77 SQL queries per cycle for one national reading, and one reading interpreted 77 separate ways. Hoisted to once per compute.
- The first lazy-resolution check was a **source pattern**, and the mutation it exists for satisfied it while still freezing the read at construction: the line was still there, the behaviour was gone. Replaced with an execution check — construct the engine with a counting resolver, assert it has been read **zero** times, then assert the first compute reads it exactly once.

`scripts/test-washout-size.mjs` — 32 checks. Six mutations caught: moving the published fine asymptote (6 failures), letting an unknown size fall through to coarse, freezing the read at construction, deleting the uncalibrated caveat, dropping the published ceiling, and returning to per-province resolution.

**Nothing changes today.** The national reading is `fine` (Bangkok α = 1.71, 28 h old), so the coarse branch is dormant and every published washout number is identical to 2.4.96. The test asserts that explicitly — a size-aware model that silently moved the live numbers on day one would be a regression, not a feature.

---
---

## [2.4.96] — 2026-10-15 — what the particles actually are, so the advice is the right advice

Asset token `2.4.96`. Adds an aerosol-size signal to the haze preparation plan,
and fixes a data bug that made the underlying measurement unsafe to use.

**The preparation advice was PM2.5 advice, applied to dust.**

`public/js/panels/hazePlan.js` is a good panel: pollution now, model outlook, upwind fire and wind, rain relief, and a cleaner-air room. But every precaution it gives is a **fine**-particle precaution — HEPA, a well-fitting N95/FFP2, close the windows. In the dry season the air is loaded with **coarse** mineral dust, and against dust those instructions are close to useless: coarse particles do not stay in the lungs, they irritate eyes, throat and nose, and **a PM2.5 respirator does not filter them**. A reader following the panel through a dust episode would have done the wrong things and skipped the right ones — laundry left outside, car windows open, watering cans in the street.

PM2.5 cannot resolve this. The same 80 µg/m³ can be mostly fine smoke or largely coarse dust, and the number looks identical either way.

**What was already there and never used.** AirDash ingests AERONET aerosol optical depth at **seven wavelengths** and stored all seven. It never derived the one summary that decides this: the **Ångström exponent**, the aerosol-size indicator since 1929. Low α means coarse. The data was sitting in the database.

`server/aerosol.js` now derives it, with bands taken from the literature rather than invented: coarse ≤ 0.8 (Gkikas et al. 2021a use AE(440–870) ≤ 0.75 for near-pure dust), mixed 0.8–1.5, fine > 1.5 (Eck et al. 1999 and NASA Deep Blue put the coarse/fine crossover at 1; Bond et al. 2013 associates ~1.5+ with biomass burning). The 440/675 baseline is preferred over 440/500 because it is **3.3× less sensitive** to error in the blue band — not because it reads higher, which is a common misconception this release had to get right.

Live today: Bangkok α = 1.71 (fine), Chiang Dao 1.53 (fine), Chiang Mai 1.43, Ubon 1.34, Silpakorn 1.30 (mixed). Consistent with October — combustion and biomass, before the dust season.

**A sign error worth recording, because it was silent.** The exponent is `−ln(τ₁/τ₂) / ln(λ₁/λ₂)`. Written with `ln(λ₂/λ₁)` in the denominator it returns a **negative** α for every real aerosol, and a negative α sorts into *coarse* — so the one visible sign slip in this file would have told Thailand it was breathing dust when it was breathing smoke. It is caught by a check that asserts only that **blue scatters more than red, so α must be positive**, which needs no reference data. `sizeMode` also refuses a negative α outright instead of bucketing it.

**158 stored rows carried a NEGATIVE optical depth.** `server/sources/aeronet.js` tested for the literal string `'-999.0'` and nothing else, so the numeric `-999` AERONET actually writes was stored as a measurement — 154 on the 1020 nm band, 4 on 500 nm. Optical depth is dimensionless and cannot be negative, which makes the Ångström log-ratio undefined and inverts the size reading: the entire basis of the new advice. The reader now validates **physical range** rather than enumerating sentinel spellings, which fixes today's sentinel and the next one. `ops/repair-aeronet-sentinels.mjs` cleaned the 159 affected cells in one transaction, reporting the corrupted shapes first; all 2,547 rows were retained, since each had one bad band and a valid spectrum.

**The endpoint's default view was usually empty.** `days` defaulted to **1**, and AERONET publishes daily aggregates one to two days late — measured on 2026-10-17 the newest stored reading was 27 h old, so `days=1` returned **zero rows** while `days=7` returned five stations. An endpoint whose default is blank is indistinguishable from a broken one. The default is now 7, and the response publishes `reading_age_h` plus an `empty_note`, so an absent reading explains itself instead of looking like good news.

**What the strip may claim, enforced by tests.** A qualitative particle size, never a concentration — `calibrated` is pinned false and the strip says so in the reader's language. It names the instruments it read, states the reading's age (and explains the lag past 48 h), and says it is a national signal from a few instruments, not a per-province measurement. Below the AOD floor it **withholds with a reason** rather than reporting a noisy α. It loads in its own cache and fills its slot *after* paint, so a slow or empty AERONET can never delay or blank the province plan above it, and an empty block renders a visible explanation rather than vanishing.

Two guards, both mutation-tested:

- `scripts/test-aerosol-size.mjs` — 45 checks. Executes the real functions. 4 mutations caught, including **planting the sign error above** (7 failures).
- `scripts/test-aerosol-strip.mjs` — 31 checks. Evaluates the whole panel in a `vm` with stubbed imports so the real `aerosolStrip` runs unmodified. 4 mutations caught.

Both guards earned their keep during construction rather than after. The strip test caught a real bug in the panel it tests: `tr(...[g?.act_en])` passed **one** argument to `tr(th, en)`, so with English selected the line rendered `undefined`. And the first version of the empty-state check could not fail — adding `hidden` to the unavailable block left every text assertion green, because they only ever read text. A guard that cannot fail is worse than none; there is now an assertion that the empty state stays visible.

**Not fixed, recorded:** `pm25FromHaze` (`hazeRead.js:610`) still returns 13.14 µg/m³ on a fit it labels `usable: false`. It has no caller and the product rule is that nothing in this pipeline emits a concentration, but it is the one function that could and it ignores the flag in its own return. Flagged, not deleted — removing a calibration affordance is a product decision. Full detail in `audit/camera-wall-vision.md`.

---

## [2.4.94] — 2026-10-15 — Catch staggered PCD reports and expose real coverage

Asset token 2.4.94, SW airdash-v114. Live audit found 42 Thai PM readings within 90 minutes in AirDash while PCD already published 142 latest-hour station reports. Hourly polling repeatedly missed staggered publication; Air4Thai now checks every 15 minutes. Station reporting cadence stays hourly. No extra model calls or cooldown bypass.

/api/health and /api/sources expose observation_coverage: per-source current/stale/invalid PM counts and newest observation, computed only from the small latest table. The Data panel distinguishes successful poll time from observation freshness and displays the coverage snapshot time. DustBoy is explicitly catalogued as optional community-sensor data.

Optional source configuration is checked before a run and after restart, preventing an old zero-row success from making a missing-key DustBoy/IMERG feed look healthy. Missing-key runs no longer advance lastOk; health hides lastOk while unconfigured. DustBoy rejects empty payloads and readings without provider observation times instead of substituting retrieval time and manufacturing freshness. No new credential or external account was created.

Behavioral regressions exercise coverage/timezones/nulls/futures, the PCD polling cadence, actual scheduler hydration/skip/recovery, and actual DustBoy ingestion with missing/valid timestamps. Full checks and measured production improvement are recorded in docs/OBSERVATION-RELIABILITY-2.4.94.md.

## [2.4.93] — 2026-10-15 — Compose the regional view around the map

Asset token 2.4.93, SW airdash-v113. Applies Palette's object-first composition rather than only its colours: removed the editorial hero, moved working controls into a compact instrument rail, made the map occupy the opening viewport, and grouped country/source/method detail behind a reachable native disclosure. Shared AirDash identity and signal colours retained. Quantitative legend sits on the map clear of zoom controls and is hidden when the PM field is off. Wind direction markers use smaller glyphs and one representative per 1.5° display cell to reduce overlap; input directions and tooltips unchanged. Popups and map attribution follow shared theme ink.

Native Chrome verified the opening composition and source-directory navigation. Syntax/consistency plus existing region and field fixtures passed. Responsive CSS stacks the rail below the map on phones; automated device viewport verification was blocked by the browser service's request-policy network dependency, so no complete mobile matrix or uninstructed human test is claimed.

## [2.4.92] — 2026-10-15 — Preserve Palette control contrast

Asset token 2.4.92, SW airdash-v112. Regional pale hover backgrounds explicitly retain normal ink; the shared token core otherwise supplies inverse hover ink intended for filled primary controls. This keeps country-row buttons and map controls readable in both light and dark modes. No data changes.

## [2.4.91] — 2026-10-15 — Bring Southeast Asia back to AirDash’s Palette core

Asset token 2.4.91, SW airdash-v111. Regional page now imports the shared design tokens and brand assets: sky paper, teal ink, Manrope headings, Sarabun text and JetBrains Mono data. Removed the separate hardcoded dark theme, large rounded panels and repeated country-card grid. Coverage/source directories are compact ruled rows, map controls use shared colours and radii, and responsive rows stack on phones. Existing light/dark preference follows the same token core as the rest of AirDash. Data and transport semantics unchanged.

Validated frontend syntax, consistency, regional normalization/navigation and pollution-field model/interpolation fixtures. Release follows 2.4.90’s full passing suite; only presentation and asset tokens changed here.

## [2.4.90] — 2026-10-15 — Show pollution as a bounded field and real model timeline

Asset token 2.4.90, SW airdash-v110. Replaced additive colour blobs with numerical inverse-distance PM interpolation, blending up to four nearby points. Observed fields require three reports within 60 km and a report within 30 km; unsupported areas are transparent. Palette represents PM2.5 concentration, not AQI. Snapshot now retains the PM-specific observation time so a newer gas reading cannot make old PM look fresh; operator surface uses a 90-minute gate.

Regional view gains a continuous reported-PM surface, an hourly Thailand CAMS timeline from already-stored model output, and daily forecast wind arrows pointing towards flow. Model interpolation uses province centroids (three within 160 km and one within 80 km), explicitly not a native model grid. Source age >13 hours disables the model rather than inventing future frames. Wind is daily direction, not particle speed, trajectory or smoke arrival prediction. Satellite imagery and concentration surfaces are mutually exclusive to avoid mixing colour meanings. No extra upstream model calls.

Tests exercise scalar interpolation (including unsupported gaps), palette, actual hourly time indexing, bias adjustment/nulls and stale rejection. Remaining science/data requirements for smoke ETA and predicted exposure are documented in docs/POLLUTION-FIELD-2.4.90.md.

## [2.4.89] — 2026-10-15 — Open a transparent Southeast Asia overview

Asset token 2.4.89, SW airdash-v109. Added /region with Thailand↔Southeast Asia navigation from the front page and operator map. Regional map shows existing Thai station PM, new official Singapore one-hour regional PM, the existing mainland-only fire archive, and selectable NASA GIBS AOD/true-colour/satellite rain context with dates, legends and limits. All 11 Southeast Asian countries have source/coverage cards, including Timor-Leste. Unconnected countries remain unknown; national indices are never blended or concentration-converted.

/api/region reuses existing Thai data and fire aggregates. NEA/data.gov.sg is demand-cached/coalesced 15 minutes, with a five-minute failure cooldown; no new schedule. Observation ages are separate from retrieval times; readings older than 90 minutes are gray/stale, invalid/future times and nonnumeric values excluded. Singapore regions are not individual station positions. Cross-country averaging-window differences are disclosed.

Regression checks cover real payload normalization, timezone/age, null and wrong-index rejection, concurrent coalescing and recovery/cooldown. Source audit and access limits: docs/SOUTHEAST-ASIA-2.4.89.md.

## [2.4.88] — 2026-10-15 — Make raw-to-cooked evidence inspectable

Asset token 2.4.88, SW airdash-v108. Data panel now shows a bilingual source → checked → cooked → action guide, also exposed as data_chain on /api/sources with product inputs, methods and limitations. Forecast cards expose source CAMS values beside the adjusted outlook and bias multiplier. These source values are model output, not raw sensor measurements.

Reference portals are separated from map layers and explicitly marked not ingested. Added PCD historical catalog, BMA, AirGradient, ERA5 and HYSPLIT references plus existing GISTDA/FIRMS pipeline provenance. OpenAQ v3/key and mirror identity are explicit; WAQI caching/redistribution restrictions are surfaced. Corrected claims that observed rain proves washout or satellite AOD predicts a surface spike. Export descriptions now distinguish normalized stored rows from original payloads. No new upstream polling or quota use.

Regression checks exercise the real source-panel renderer in Thai and English and verify every declared product input resolves to a catalog entry. Research/access limits and remaining ingestion work are recorded in docs/RAW-TO-COOKED-2.4.88.md.

## [2.4.87] — 2026-10-15 — Join fire, wind, rain and PM into preparation evidence

Asset token 2.4.87, SW airdash-v107. Overview gains a bilingual province preparation selector: current PM/source, three daily CAMS model values, upwind VIIRS detections, rain amount/chance and protective actions. Missing evidence remains unknown; rain never clears measured pollution. No smoke arrival time or cleaner relocation destination is invented.

Map presets show pollution/stations, gridded VIIRS detections plus forecast wind arrows, or rain radar. Wind arrows point towards flow (meteorological from + 180°); counts are upwind detections at province markers. Fire markers are 0.25° grid centroids, not burn footprints. Radar timestamps distinguish observed frames and nowcasts. Research explains the evidence chain and limits of AOD, hot spots and daily wind.

/api/smoke now includes fire_cells and fire_grid_degrees, reusing its existing aggregate without extra upstream requests. Its calendar-day query was incorrectly called 48 hours; acquisition date+time now enforce a rolling 48-hour window and exclude future detections. The preparation fetch cache has a strict five-minute expiry and does not silently reuse old evidence after refresh failures.

Tests cover wind reversal, preparation rules, missing inputs and the actual SQLite fire time-window/grid counts. CNX's hourly two-height trajectory model was inspected but not copied onto AirDash's daily dominant wind inputs. Browser verification currently blocked by the browser tool's request-policy network service; do not claim a completed visual audit.

## [2.4.86] — 2026-10-15 — the camera button claimed it had found no smoke, and had stopped looking

Asset token `2.4.86`. Result of an audit of the camera-wall computer-vision path.

> Numbered 2.4.86, not 2.4.85: the bumper skips versions already claimed by a
> changelog heading, and 2.4.84 and 2.4.85 were both headings when this ran.
> Nothing ever carried those tokens. The deploy guard caught the mismatch rather
> than shipping assets against the wrong note, which is the second time this
> month it has refused a release that the log did not describe.

**The dashboard's camera button read "144 scored · none smoky", and that was a fiction with a number attached.**

- `/api/haze-vision` published `tint: {smoke_like, fog_like}`, counted from the `tint_hint` column. Commit `18444ed` had replaced the `tint_hint` write with a literal `null` in the same change that moved the verdict onto a per-camera daylight baseline. So both counts had been **structurally zero ever since** — while still being published as though they were measured.
- `public/js/cctvEntry.js` computed `flagged = smoke + fog`, which was therefore always `0`, and fell through to the string **"none smoky"**. The button was asserting, beside a live frame count, that it had looked at the cameras and found no smoke. It had stopped looking. The comment directly above that function said the goal was "the fewest words that stay true", so the code was contradicting its own stated contract.
- This is the failure mode this project exists to avoid, in the one place a person reads it: a retired measurement published as a current one. An always-zero field is worse than an absent one, because absent is honest.

Fixed in three parts, each narrower than it looks:

1. **The claim is gone.** The button now reads `N scored · M possible haze`, where `M` is counted from the same rows as `N` (`haze_status = 'possible-haze'`), so both numbers describe the same window. When nothing is flagged it says *"none hazier than their reference"* — a statement about the comparison that was actually performed, rather than about smoke that was never looked for.
2. **The dead block is not republished.** `/api/haze-vision` no longer emits `tint`. It emits `appearance_split: null` instead, so a consumer can see the split is *unavailable* rather than infer it from a missing field.
3. **The stored evidence is back.** `hazeVision.js` writes `r.tintHint` again. This does **not** restore the retired judgement: the verdict still comes from `assessHaze`, and `describeVision` still derives `look` from `haze_status`, so the absolute-threshold tint stays out of every public readout. It only stops the stored series from being silently truncated at the changeover — 2,574 rows written before `18444ed` were unreproducible, and the research page's warm-bias material simply stopped with no marker.

NB for the next reader: the value is `r.tintHint` at the **top level** of the `readFrame` result. There is no `features.tintHint`, so reading it there yields `undefined` and writes a bare `null` again — which passes every check except the one that looks.

`scripts/test-cv-honesty.mjs` — 15 checks. It **executes** the real `readoutText` rather than grepping for strings, so a rewrite that keeps the claim but changes the wording is still caught. Three mutations caught: restoring the "none smoky" wording, republishing the `tint` block, and reading the absent `features.tintHint`.

**Also in this release: `/api/health` reported a high-water mark wearing the name of a row count.**

`db.readings` was `MAX(id)`, sitting in a block whose other six fields are all exact `COUNT(*)`. Ids are never reused, so it read **18,720,908 against an actual 4,777,758 rows** — a 3.9× over-count that climbs forever while retention holds the table flat. The old comment called that "a harmless over-count"; it was not harmless, because it is exactly the number a reader uses to judge whether the hot tier needs attention. It nearly had me approve a 5-minute-outage database shrink that would have reclaimed 1.6 MB (see below). Now published as `readings_max_id`, with `scripts/test-health-row-count.mjs` — 10 checks that run the real divergence in SQL (insert 10, prune 3–7, observe `MAX(id)=10 ≠ COUNT(*)=5`) so the reason for the name is demonstrated rather than asserted. 3 mutations caught.

**Two documented remedies turned out to be wrong, and are recorded here rather than left to be re-derived.**

- **The "1.2 GB hot tier over its ~1 GB cap" is not a problem.** `ops/inspect-db.mjs` shows retention working exactly as designed: every non-hot source starts at precisely 2026-07-17 (the 90-day `rawDays` cutoff) and `thaiwater_rain` holds exactly 14 days. The database is at its designed steady state, not over budget. `freelist_count` is 406 pages — **~1.6 MB** — so `ops/shrink-hot-db.mjs` would stop the server for ~5 minutes to reclaim essentially nothing. The remedy is worse than the condition.
- **The camera wall's one lever on a verdict is nearly inert, and that is a property, not a bug.** `shouldFloorToWatch` is the only thing this pipeline can do to a risk band, and it requires a province at `widespread`. Replaying the real `provinceLevel()` over 30 days of recorded frames: **3 of 4,437 province-windows** (0.068%) ever reach it, because 72% of windows have fewer than the 2 judged cameras `MIN_VALID` requires. Loosening the threshold would convert an honest silence into false alarms, which is the worse failure. Recorded so nobody "fixes" it by lowering a number.

**Audit hypotheses tested and refuted** (recorded so they are not re-chased): baseline contamination from hazy frames entering the reference pool — 0 of 207 cameras are majority-hazy, because the reference is the median of the *sharpest* third, which self-limits it; `province_code` coverage — 100% over 72h, the 33% overall figure was pre-version-6; `haze_index`/`contrast_loss` disagreement — 0 mismatches in 24h; METAR `HZ` misclassified as fog — `HZ` correctly maps to `aerosol` while only `FG`/`BR` map to `obscure`, so a haze report can never suppress its own camera evidence; the humidity lookup joining two namespaces — openmeteo `station_key` *is* the province code, 77 of 77.

Two **latent** defects in the pixel math were demonstrated by execution but are deliberately **not** shipped here, because fixing either would invalidate every camera's 14-day baseline and force a mass re-baseline on a system about to meet real users. Both are recorded in full in `audit/`:

- `hazeRead.js:374` `skyRef = skyLuma > 20 ? skyLuma : 180` has an **8.57× discontinuity** at one luma unit (measured `darkChannelNorm` 4.504 at skyLuma 21 vs 0.5255 at 20). No verdict flip was demonstrated — the view-signature guard catches those frames — but it sits under the feature the verdict hinges on.
- `darkChannelNorm` is normalized by the frame's **own sky brightness**, so dimming only rows 0–49 by 10% — ground byte-for-byte identical, no haze at all — clears the `rise >= 0.05` gate on its own. The "second cue" is partly an exposure meter. A dark object does not raise it (a 120px black van *lowered* the value), so the exposure is entirely on the denominator.

Also found and left alone: `pm25FromHaze` (`hazeRead.js:610`) returns **13.14 µg/m³** on a fit it labels `usable: false`. It has no caller and the product rule is that nothing in this pipeline may emit a concentration — but it is the one function that could, and the guard it ignores is its own. Flagged rather than deleted, since removing a calibration affordance is a product decision.

---

## [2.4.84] — 2026-10-15 — the starvation guard had never once read the machine

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.83.

**The watchdog's saturation check was fail-open, and had been since it was written.**

- `sysctl` lives at `/usr/sbin/sysctl`. `com.airdash.watchdog.plist` sets `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` — **no `/usr/sbin`** — so a bare `sysctl` was never found. Both readings came back empty, `"" -ge 90` is false and `"" -ge 32` is false, and `host_starved()` answered **"not starved" for every host, always**.
- That is the worst possible direction for this function. Its entire job is to tell a starved host apart from a dead one so the restart is *suppressed*. Instead it read an empty value, decided the machine was fine, and would **restart the server in the middle of the very starvation it exists to survive** — adding boot cost to a host that already could not keep up. The symptom was in the log all along: `ok: host not saturated (swap , load )`, visibly empty, every hour.
- Now uses an absolute path, and says so when a reading comes back empty rather than reporting success about a check that did not happen.

**A swap percentage is not a saturation signal, and restoring the readings exposed that.** With real numbers back, this host sat at **97.6% of swap used, 345 MB free, load 3.6, CPU 70% idle** — completely healthy. macOS keeps swapped pages around; that figure measures cold pages, not pressure. A threshold on it fires on a normal machine, every hour, forever, and an alert that cries wolf is worse than none because it teaches you to ignore the line that would have mattered.

- The trigger is now the **rate of page-ins**, measured from `vm_stat`, because that is what thrashing means — plus CPU load at 5× core count, checked first so a busy host never waits for a sampling window it does not need.
- **Two consecutive elevated windows are required.** A single window on this host is noise: measured rates in one afternoon ranged 61/s → 1109/s → 4685/s (~73 MB/s) at unchanged load, driven by whatever else was running. One lucky window cries wolf; one unlucky window misses a real stall.
- The verdict is memoised, so the extra sampling costs a few seconds once per run rather than at each of its several call sites.

**What the readings actually said at the time of writing:** the box *is* under genuine memory pressure — sustained 1,858–4,685 page-ins/s (29–73 MB/s) and a swap file that grew from 13.3 GB to 14.3 GB. The guard now reports that instead of reporting "ok" over an empty string. **That is a property of the host, not of the code; reducing it is an operator decision.**

`scripts/test-host-starvation.mjs`, 31 checks. Beyond the alert behaviour it runs the **real** functions under the **real** launchd PATH — a stubbed predicate proves nothing about whether the real one can read the machine — and drives the decision logic with stubbed readings to pin properties that never fire on a well-behaved machine: the swap percentage is not a trigger, both windows must be elevated, and an unreadable load is announced. **Five planted bugs turn it red**, three of which passed the earlier, weaker version of this test.

Three of my own test bugs are recorded in the file because they cost real time: `extractFns` prepended a no-op `log()` that shadowed the harness's and swallowed every warning under test; zsh runs `$(...)` in a subshell, so a variable incremented inside a stub is lost and every read returned the same element, making every scenario look calm; and that stub's cursor then ran one past the end of its series.

## [2.4.83] — 2026-10-15 — three defects between a person and the advice

Frontend only (`public/js/story.js`, `public/index.html`). Asset token `2.4.83`, SW cache `airdash-v105`.

Found by reading the page rather than the code: what a person meets between landing and being told what to do.

**1. The alert strip sent civilians to the operator console.** `href="/ops.html"` was hard-coded in the markup and never updated by the script, so a banner reading *"🔴 Hazardous air in some areas"* dropped the reader into Mission Control — ~2,000 live points, layer toggles, province rankings. That is the right page for an air detective and the wrong one for someone who has just been told the air is bad. The strip now goes to the advice chapter directly (`#ch-persona`) and says what it will give you: *"🔴 Hazardous air in some areas — what to do now"*. Mission Control is untouched and still linked, labelled in the act chapter for the audience it is actually for.

**2. The subscribe block appeared twice.** The act chapter rendered LINE OA and Telegram once above the checklist and again below it under its own *"want a heads-up before the haze?"* heading — the same two destinations, two labels, seven lines apart. The copy above the checklist also carried an inline `margin-bottom:16px` that the block below did not, so the two were not even spaced the same. Only the second survives, because that is where the heading that introduces it lives; `#act-subscribe` — the anchor the alert strip's CTA jumps to — moved with it. Verified in the rendered DOM: one block, one LINE link, one Telegram link.

**3. Screen readers were re-announced every 60 seconds.** `refresh()` re-runs the entire render on a 60-second timer, and three of the nodes it rewrites sit inside `aria-live="polite"`: the hero cigarette figure, the life-minutes figure and the new verdict. Assigning identical HTML is still a mutation, so a screen-reader user was told the current verdict **once a minute, indefinitely, through hours of unchanged air** — which trains people to ignore the region, defeating the point of having it. Writes now go through `setHtml`/`setText`, which no-op on identical content. This also removed a steady drip of pointless DOM churn.

The guard is deliberately two-sided, because a write-guard that silences a real change is worse than the bug: identical renders write nothing, and a changed reading still writes exactly once. Both properties are asserted against a write-counting element in `scripts/test-frontend-ux.mjs`, and removing the equality check turns the suite red (**actual 3, expected 1**).

**Six regression checks** now cover the verdict and the guard, all mutation-tested.

## [2.4.82] — 2026-10-15 — the page answers the question it was opened with

Frontend only (`public/js/story.js`, `public/css/story.css`, `public/index.html`). Asset token `2.4.82`, SW cache `airdash-v104`.

> This entry was rewritten on 2026-10-15. The original text was lost when a scripted CHANGELOG reorder overwrote the working file before the release was committed, and git held nothing to recover it from. The code was never at risk — only this note. It is reconstructed from the author's report and from reading the diff, so the wording is not the original wording.

**The problem.** AIR STORY opens with a number — "your lungs smoked 0.7 cigarettes today" — and then scrolls through six chapters before reaching the only sentence anyone came for: chapter 1's *today's advice*. The hero answered a question nobody asked and buried the one everybody did. On a phone that is most of a screen before you learn whether to send the kid outside.

**What it does now.** A verdict block sits directly under the breathing circle and answers, for the selected persona at the selected place, before anything scrolls. It carries the persona's own name, the sentence, and the clock the reading was taken at (`as of 09:36 · updated 3 min ago`) — because a number nobody can date is a number nobody should trust.

**It adds no advice of its own.** The headline is the server's existing guidance sentence, selected by the same rule the API uses (first step whose ceiling the reading falls under, else the open-ended hazardous step). All seven personas share one ladder, so the hero and chapter 1 read from a single source and a wording change in `server/science.js` moves both at once.

That was not the first attempt, and the first attempt was wrong. The block originally paired the server sentence with a generic verb ladder of its own ("go outside as normal" → "stay indoors"), and a screenshot showed the result saying the same thing twice in adjacent lines. The ladder was deleted. It also could not have been right: at 100 µg/m³ the asthma profile escalates to *follow your emergency plan — call 1669*, which no generic phrase can say, and the calmer local line would have sat beside a hazardous-band border. **The calmer line is the dangerous one.**

**The border reads `--breath-now` from `:root`**, so the verdict cannot display a severity that disagrees with the circle above it.

**The honesty path.** With no reading the block says so — "Not answering yet — no live reading / We will not invent a number for you", greyed — and a test asserts that no guidance sentence can leak into that state.

**Four regression checks in `test-frontend-ux.mjs`**, mutation-tested: removing the unknown branch and swapping the server sentence for a local one both turn the suite red. Two further checks were added on 2026-10-15 to pin an invariant that had no test: `PERSONA_ORDER` and `PERSONA_FALLBACK_LABEL` must carry the same keys. Adding a persona to one and not the other throws on the *same* render — the chip builder and the verdict block both destructure that map unguarded — so the chips and the answer disappear together, and nothing catches it from either list alone.

**Checked, not assumed:** the server sentence and the persona name both pass through `escapeHtml`, so a hostile label in the science payload cannot inject markup.

## [2.4.81] — 2026-10-15 — Keep research navigation clear of the charts

Asset token 2.4.81. Browser verification of 2.4.80 found the sticky index covering section headings. Cap the index height, let its list scroll, and reserve more anchor clearance. Improve reference-label contrast. The automatic bumper now skips changelog numbers already consumed by operational releases; a disposable-checkout regression verifies this behavior without modifying production assets.

## [2.4.80] — 2026-10-15 — Audit the research figures against their inputs

Asset token 2.4.80. Preserves the overnight research/CV feature work and its endpoint additions.

Corrects the diurnal reference to Thailand's 37.5 µg/m³ 24-hour value, explicitly not an hourly compliance test; uses a zero-based axis. Profiles combine Air4Thai and historical CAMS model rows, not exclusively observed measurements or independent samples. Removes the unsupported hot-tier-only description. Alert share and sensor fault counts now come from payloads. Zero-valued charts retain finite geometry and zero-width bars; missing/invalid network counts stay unknown. Monthly lines use calendar spacing and a separate legend; exact values have tooltips. Peak shading follows the actual three-hour window across midnight. Superseded language renders cannot overwrite new record figures.

Regression coverage: scripts/test-research-charts.mjs, included in npm test. Prior 2.4.79 narrative claims about 15 µg/m³ and observed-only data are superseded by this correction.

## [2.4.79] — 2026-10-14 — the research paper now shows the data it has been collecting

Frontend + two new read endpoints. Asset token `2.4.79`, SW cache `airdash-v96`.

The research tab was, until now, a paper *about* a system — architecture, formulas, citations — with almost no numbers drawn from the database the system has actually been filling since mid-July. This release makes the accumulated record visible, and it makes the camera-haze pipeline legible as a research artefact.

**§10, "What the Record Shows" (new).** Four figures pulled from live aggregates, not from prose:

- **The diurnal cycle.** National mean PM2.5 by hour of day, from **611,835** observations in `readings_hourly`. The peak window (21:00–00:00) is shaded and the PCD 24-hour standard (15 µg/m³) is drawn as a dashed reference. The y-axis deliberately does **not** start at zero — the caption says so, because the swing is ~11.5–13.9 µg/m³ and a zero-based axis would flatten the cycle to a straight line.
- **Monthly means by region.** Five regions, April–October. This is the chart that justifies the section: the North runs **42.6 µg/m³ in April** and collapses to 8.2 by August — the burning season and the monsoon, drawn from observed values rather than satellite estimates.
- **The alert ledger.** Every rule the system has ever raised. `washout_rain` accounts for **45,119 of 45,892 alerts (~98%)** and is deliberately left off the bars — on a true-count axis it would flatten every other rule to invisibility — so it is reported as a number in the caption instead. The axis is linear, not logarithmic, and the caption says both.
- **The sensor network.** **5,746** stations across every ingested source, **1,305** silent beyond the staleness window, overall health **70/100**. Point-in-time, and labelled as such.

**§11 (was §10), Computer Vision.** The camera-haze pipeline was written but never shown. Now rendered: the per-feature glossary (contrast loss, dark channel, edge decay, saturation, warm bias, mean luma), a live box fed by `/api/haze-vision` and `/api/haze-evidence`, a haze-index-vs-PM2.5 scatter with **no trend line fitted** (there is no statistical basis for one yet — the caption says this), the per-province evidence table, and three sample frames. The pipeline reports `calibrated: false`, so the UI leads with that and with the withheld-sample count; a frame without a baseline reads `baseline-needed`, never as a zero.

**A sticky contents index** for the paper, built from the rendered `<h2>`s so it cannot drift from the body. Smooth scroll honours `prefers-reduced-motion`; the active section is tracked by `IntersectionObserver`; the measured height drives a `scroll-margin` so the index never covers the heading it jumps to.

**Two new endpoints**, both required because the data was not otherwise reachable:

- `GET /api/alerts/summary` — the full alert history aggregated by rule and severity. `/api/alerts` returns only the newest N rows, which cannot support a ledger. The `GROUP BY` scans the whole table, so the result is cached in-memory for 10 minutes, off the hot path.
- `GET /api/sensors/health?summary=1` — the roll-up only. The full payload carries every flagged station in every province (~400 KB); the paper needs the counts and the score, not the list.

**Six third-party Tableau workbooks** catalogued in `knowledge/tableau-datasets.md`, kept on disk at `data/research/tableau/` (gitignored). Four non-Thai workbooks — China, Taiwan, Utah, Puget Sound — were downloaded, verified against their coordinates and date ranges, and deleted. `AirQualityinThailand_OverallMonthly` is retained but flagged: its column headers are coded (`50t`, `35t`, `F3`–`F7`) and undocumented, so no conclusion should be drawn from it until they are decoded.

**1150+ checks, 0 failures.**

## [2.4.77] — 2026-10-12 — the camera probe: what was measured, and what is still true

Backend-only; no file under `public/` changed, so the asset token stays at 2.4.74.

**Measured, not asserted.** Every number below came from `ingest_runs` and the source log on the live server.

- **The 464-second outage was already over, and this is why.** Passes since the 2.4.73 ceiling measure **27.7–29.5 s**, not 464 s. That fix worked. What follows is the attempt to remove the work rather than bound it.
- **The file's own comment was wrong.** `cctvHealth.js` claimed the probe "blocks the event loop". It never did — every fetch is awaited, so the loop stays free. The real cost was arithmetic: **456 of 561 cameras were dead (81 %)**, all re-probed every 30 minutes forever, each holding a slot until its 5-second timeout expired — **21,888 dead-camera probes a day**.
- **A camera known to be down now sits on a backoff ladder** — 1 h, 2 h, 4 h, 8 h, 12 h by streak — instead of being re-probed every 30 minutes. A live probe resets the streak, so a recovered camera returns to the normal cadence at once. Against the live map: **363 of 561 cameras deferred, 65 % less dead-camera work.** The first post-deploy pass returned byte-identical verdicts (105 live / 456 down), which is the property that mattered — see below.
- **`fail_streak` is now capped.** A camera dead 11 days had accumulated a streak of **555**, rewritten to the database every 30 minutes: a number that reads like a rate, means nothing, and grows without bound.
- **New instrumentation, because `dur_ms` could not answer the question.** The log now reports `compose_ms` (2.8 s) separately from `probe_ms` (25.0 s) and states `probe_budget_bound: true`.

**Why the probe is still budget-bound, and why that was left alone.** All 561 probeable cameras resolve to **five distinct hosts** (iTIC Foundation ×2, Nakhon City, Highwaytraffic ×2), so the per-host cap binds, not the overall cap: `sum(min(camerasPerHost, 3)) = 15` in flight, and `CONCURRENCY = 24` is unreachable. 96 due-but-dead cameras sit on one host; three at a time at a 5-second timeout is ~32 s of waiting by itself. Raising `PER_HOST` would fit the queue inside the budget and is the obvious lever — but those are third-party institutional servers, and increasing their concurrent load to chase our own latency is a decision for whoever owns them. The pass is deliberately left budget-bound and rotating.

**The safety property, which is why this is not simply "skip the dead ones."** The returned map *replaces* the previous one and a camera with no verdict is drawn, so a skipped camera that vanished would have **un-hidden 456 dead cameras at once**. `carryForward` iterates every camera with a stream, not only the due ones. Five planted bugs turn the guard red; the mutation that narrows `carryForward` back to the due set is the one that un-hides cameras.

**A second bug found while measuring: a first-time `version` field never triggers a boot run.** `scheduler.js` compared `(s.source.version ?? 1) !== Number(kvGet(...) ?? 1)`. `cctvHealth` declared `version: 1` for the first time, and with no stored row the right side was also `1` — so `1 !== 1` read as *unchanged* and the new backoff sat waiting out its full 30-minute interval, invisible. A source that declares a version but has none recorded is now treated as changed. It does **not** make version-less sources "changed" — that would recreate the 2026-09-27 thundering herd that spent the shared Open-Meteo quota. `scripts/test-boot-version-guard.mjs`, 13 checks, mutation-tested; the first version of that helper reproduced the original bug and its own test caught it.

`scripts/test-cctv-dead-backoff.mjs`, 26 checks, mutation-tested. **1150+ checks, 0 failures.**

**Still not addressed:** the probe remains deliberately budget-bound (see above). Fixing that means raising `PER_HOST` against third-party servers, which is not this project's call to make alone.

## [2.4.78] — 2026-10-12 — the watchdog could see a saturated host and chose to say nothing about it

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.74.

- `host_starved()` has been in the watchdog for a long time, and until now it was consulted for exactly one purpose: deciding whether to **suppress a restart**. It could reliably tell a starved host apart from a dead one, and then said nothing at all. On 2026-10-12 07:00 it logged `check complete — 0 unresolved problem(s)` — while the box was at **load average 82–141 on 8 cores with 87 % of swap in use and `/api/ping` taking 21 seconds**.
- Nothing in the watchdog could have *fixed* it; a restart would have added load to an already saturated machine, and suppressing one is the correct action. But "nothing we can do" is not the same as "nothing to say" — the operator is the only one positioned to notice a host being slowly ground down, and no other part of the system reports it.
- The watchdog now logs the saturation every check and notifies after **two consecutive saturated checks**, so a legitimate one-off spike — the nightly backup compressing a 1.2 GB database, an `npm install` — does not page anyone. The notification itself is **once a day**, matching the disk warning, because a host that stays saturated is a sustained condition and hourly repeats would be noise. Recovery resets the streak, so a later incident has to earn its alert again.
- `scripts/test-host-starvation.mjs`, 17 checks. The block is executed against a controllable `host_starved()` rather than pattern-matched, because what is being tested is behaviour over time — one check vs two, alerting vs silence, recovery resetting the streak. **Three planted bugs turn it red:** removing the consecutive-check requirement, not resetting the streak on recovery, and removing the daily cap.

**1180 checks, 0 failures.**

## [2.4.76] — 2026-10-12 — the encrypted offsite backup had never once run on its own, and nothing would have told you

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.74.

The 2026-10-11 entry said the first unattended offsite run was unobserved. It was worse than unobserved — **it had already failed.**

- **The 03:50 job died before uploading a byte.** `mkdir '/.wrangler/cache'`. launchd gives a LaunchAgent a working directory of `/` unless its plist declares `WorkingDirectory`, and wrangler puts its cache in `process.cwd()/.wrangler/cache`. Auth was fine — it had already fetched the account when it died. Fixed in both layers: the plist now declares `WorkingDirectory` (and explicit `HOME`/`PATH`), and the script `cd`s itself so it stays correct even if that key is lost again.
- **Verified by running the job the way launchd runs it**, not by hand: `launchctl kickstart` uploaded 165,362,854 bytes as `daily/airdash-2026-10-12.db.gz.age`, exit code 0. The object was then fetched back and its first bytes read — `age-encryption.org/v1`, an X25519 recipient stanza. The bucket holds ciphertext, never the database.
- **The failure was invisible, and that is the part that mattered.** The watchdog's 48-hour receipt guard covers the *local* archive — `data/.archive-receipt.json`, a file the offsite job never touches. So the offsite copy could stop entirely while every health number stayed green. A failed run raised only a desktop notification, at 03:50, which is exactly when nobody is at the machine. The watchdog now also checks that a successful upload is recorded in `logs/offsite.log` within 30 hours — one missed run is not alarming, two consecutive misses means the only surviving data sits on the SSD the copy existed to protect from. It treats "log exists but never recorded a success" and "timestamp unparseable" as failures, not passes.
- **The pre-upload bucket-size read, shipped yesterday, proved itself here.** On the failed run it logged `WARN: bucket size unreadable` and **kept the previous reading instead of writing a zero** — precisely the failure it was added to prevent, on the very next execution.
- `OLLAMA_KEEP_ALIVE` was `-1` — *never unload* — set globally by `org.nonarkara.setenv-ollama-keepalive` to keep `claude-mem-observer` warm. That is not "warm", it is "pinned for the life of the process": every model any client loads stays resident forever. On a 16 GB machine that is what held `gemma3:4b`'s 3.7 GB indefinitely, and the resulting swap pressure is what produced the intermittent 502/504s. Now `30m`, which gives the same warmth for an active session's gaps and still lets an idle model be evicted. The `LLM_TIMEOUT_MS` fix remains the real safety net, as that plist's own comment said.
- Two new guards, 31 checks, wired into `npm test`. The freshness block is **executed** against synthetic logs rather than pattern-matched, because the properties that matter are behavioural: a fresh upload is silent, a stale one is not, and a log that exists but never recorded a success is a failure. **Four planted bugs turn it red** — removing `WorkingDirectory`, removing the script's `cd`, widening the 30-hour limit to 720, and dropping the `problems` increment.

## [2.4.75] — 2026-10-11 — the R2 cost guard was watching a bucket that already held 159 MB

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.74.

`ops/offsite-r2.sh` records the R2 bucket size into `logs/.r2-bucket-bytes`, and `ops/health-watchdog.sh` alerts when that exceeds 9 GB against Cloudflare's 10 GB free tier. The guard was structurally incapable of firing.

- On its first run — bucket created 17:24:54 local — the script pushed a 159 MB object at 17:27:24 and queried `bucket_size` at 17:27:26. **R2 answered `0 B`.** That zero was recorded faithfully, so the cost guard watched a bucket that already held 159 MB and would have reported no growth indefinitely.
- The parsing was never wrong. R2's `bucket_size` is eventually consistent, so a query issued in the same second as the PUT measures *propagation*, not storage. The same command run minutes later answers `159 MB`. The size is now read **before** the upload, which also measures what the guard is actually for — the bucket as it stood — rather than racing the object the run just added. Lagging by one run costs nothing against a 9 GB ceiling; reading zero costs everything.
- A size that cannot be parsed no longer overwrites the last good reading, and is logged as a WARN. A future wrangler that renames the field would otherwise reset the guard to zero — the same silent failure arriving by a different route. A genuinely empty bucket still records `0`, because that is a real reading, not an error.
- `logs/.r2-bucket-bytes` refreshed from the stale `0` to the true `166723584`.
- `scripts/test-offsite-bucket-size.mjs`, 14 checks, wired into `npm test`. Unit parsing is executed by lifting the zsh function out of the script and running it against a stubbed `wrangler`; the ordering property is asserted on the source, since it is a fact about where a line sits. **Four planted bugs turn it red**: moving the query back after the upload, removing the unreadable guard, and corrupting the GB and TB multipliers.

**Still unobserved, and honestly so:** the offsite job has only ever run by hand. The log contains exactly one entry, at 17:27 on 2026-10-11 — a manual run — and no 03:50 entry, because the whole R2 setup is less than a day old and the 03:50 slot had already passed when the bucket was created. The first genuinely unattended run is tomorrow morning. That is the honest limit of the restore evidence so far.

## [2.4.74] — 2026-10-11 — two features that were built but never switched on, and 17 dead exports

Front-end and backend. Asset token 2.4.74 (the service-worker cache moves with it, `airdash-v92`).

**Two features were 90% built and had no edge into them. Both are now live.**

- **The RECENT places strip could never populate.** `public/js/panels/search.js` rendered a RECENT list, read it out of local storage, and shipped an empty state promising *"recent opens appear here after your first search"* — but `rememberRecent()` had no caller, so nothing was ever written. Every visitor saw that empty state forever. The fix is one line in `selectResult()`, which is the single funnel every path into a place goes through: a search hit, a RECENT button, a `?city=` boot link, and the saved-city boot. Recorded there deliberately — putting it on any one of those four paths would leave the other three unrecorded.
- **The share button's ✓ flash was a partial copy.** `shareFeedback()` existed and was correct, so `citizen.js` inlined a worse version of it that handled only `copied`, never reported a failure (so a failed copy left the button looking untouched), and hardcoded a Thai label in a bilingual panel. The inline copy is gone; `citizen.js` now calls the helper with `tr()`-supplied labels, so a failure says so.
- `scripts/test-deadcode-wiring.mjs`, 26 checks, wired into `npm test`. The recorder's dedup, its cap, its newest-first ordering and its private-mode safety are *executed* — the two module-private functions are lifted out of the source and run against a stub preference layer, because the module itself touches `document` at import time and cannot be imported in node. Only the wiring itself is pattern-matched. **Eleven planted bugs turn it red**, including dropping the `rememberRecent` call, disabling dedup, removing the cap, removing the no-coordinates guard, removing the private-mode `try`, reverting to the inline flash, dropping the import, and reversing the ordering.

**Removed — 17 exports referenced nowhere in the repository, verified one at a time:**

`__clearAirStationsCache`, `resolveName`, `slugFor`, `purgeRejected`, `provinceQuality`, `__resetForTests`, `nearestCams`, `__clearCacheForTests`, `_resetProvinceIndex`, `prefetch`, `forecastCi`, `pm25Ci`, `riseCi`, `fmtUg`, `initCitizenPersona`, `focusAreas`, `KOSCHMIEDER_C`. Four of them (`__clear*`, `_reset*`) were test-reset hooks that no test ever called.

Seven private symbols went with them, having been left orphaned: `trName` (only `resolveName` called it), `REJECTED_RETENTION_DAYS`, `resetProvinceIndex` (only its own dead alias called it), the write-only `_slugByRef` map, the three now-unused sigma constants behind `forecastCi`/`pm25Ci`/`riseCi`, and the `on` import in `citizenLife.js`.

**Three comments that were simply wrong:**

- `purgeRejected()` claimed rejected LINE reports were auto-deleted after 7 days. Nothing has ever called it — and there is no delete route either, so rejected reports were permanent while the comment said otherwise. Removed, because `pruneReports()` already caps the report *directory* on disk and the only thing left ungoverned was a few hundred bytes per rejected row. (The table held **1 row in total, 0 rejected**, at audit time.)
- `nearestCams()` was documented as "used by `/api/decision?` and the citizen card". **`/api/decision` does not exist**, and the citizen card's "nearest" logic is about AQ stations, not cameras. Removed.
- `KOSCHMIEDER_C = 0.05` sat above `darkChannel()` with a comment explaining it as the constant in Koschmieder's equation. The code implements `t = 1 − ω(dark/I)` with `ω = 0.95`, averaged in log space — a dark-channel/log-ATM formulation, not the classical `I = J₀·e^(−c·d)`. The two are not interchangeable, so the constant and its comment are gone and a note says so, to stop someone reintroducing `c=0.05` expecting the same numbers.

**Kept deliberately:** the Telegram province index stays memoized for the life of the process. It is built from the same risk snapshot the dashboard renders, so freezing it is what guarantees `/province` answers with the province list the user is actually looking at. Its reset function was vestigial and is gone; the comment now explains that there is deliberately no reset.

Also: a stale 34 MB copy of the whole repo was living at `.claude/worktrees/nifty-curran-b1d3e5` as a registered git worktree pinned to an August commit — fully superseded by `main`, holding no unique file, and silently corrupting repository-wide greps. Removed and pruned. `.claude/` was listed twice in `.gitignore`; now once.

**How this was checked.** A repository-wide scan of 476 exported symbols across 149 modules now reports **0 referenced nowhere else**, and 1093 checks pass with 0 failures. The scan itself was wrong three times before it was right — it resolved import paths without a base, mixed relative and absolute entry paths, ignored `?v=` cache-busting tokens, and finally iterated a joined string character-by-character so live exports looked dead. Every finding was confirmed by hand before anything was deleted; seven of the eight it last reported were in fact referenced by tests and were left alone.

## [2.4.73] — 2026-10-11 — the camera health probe can no longer take the site down for nine minutes

Backend-only; no file under `public/` changed, so the asset token stays at 2.4.72.

- `cctvHealth` measured **410–497 seconds per pass** on four consecutive runs. 806 cameras, 12 in flight, an 8-second per-probe timeout, and roughly 457 of them already dead — so most of the pass was spent waiting on sockets that would never answer. The probe runs inside the HTTP event loop, and for those nine minutes the server could not answer `/api/ping` and the public site returned **504**.
- The pass now has a wall-clock ceiling of **25 seconds**, deliberately below Cloudflare's 30-second origin timeout — a 90-second ceiling would still hand every visitor a 504, only a shorter one. A camera the pass never reaches keeps the verdict it already had. It is not marked failing, because that would hide a working camera, and not marked passing, because that would un-hide a dead one: both are silent lies about a camera on a public map.
- Because the queue is cut short, it now starts at a **rotating offset** each pass. Without that the same prefix would be probed every cycle and the tail of the catalog never examined at all.
- Per-probe timeout 8 s → 5 s and overall concurrency 12 → 24. An HLS `#EXTM3U` header that has not arrived in five seconds is not going to.
- `scripts/test-cctv-probe-budget.mjs`, 24 checks, wired into `npm test`. All five planted bugs turn it red, including a 90-second budget, a removed ceiling, a skipped camera marked live, a skipped camera marked dead, and rotation removed.

**Not fixed, and worth knowing:** the probe still runs on the event loop. The ceiling bounds the damage; it does not remove the cause. Moving the pass to a worker thread, or not re-probing cameras already known dead, is the real fix and is a larger change than a ceiling.

## [2.4.72] — 2026-10-11 — flood-wall cameras as haze eyes, and a repaired airport-visibility feed

Shipped as the frontend asset bump alongside the backend work below. This entry was missing until 2026-10-11: the `?v=` token had already reached 2.4.72 and been deployed, which is the second time a release has shipped undocumented. `scripts/check-bump.mjs` now refuses to deploy a token the changelog does not name.

- **Optical haze evidence, cooked into the verdict.** `server/vision/floodWall.js` builds a deterministic, health-checked panel from FloodDash's camera wall — up to 2 cameras per province across all 77, daylight only, hourly, at most 2 requests in flight per host, with failing cameras benched for a day. `server/vision/hazeEvidence.js` rolls each camera's own clear-day baseline up per province, adds humidity and airport visibility, and names fog as the likelier cause when the air is saturated. Exposed at `/api/haze-evidence`.
- **Cameras never produce a PM2.5 number.** They can raise a province to at least WATCH in exactly one case: no ground station is reporting there and widespread non-fog haze is seen. At audit time that condition was reachable by only the 6 provinces whose PM2.5 comes from the GISTDA satellite estimate, and 72 of 75 provinces with camera frames were still below the two-judged-camera minimum, so the path was inert.
- **METAR airport visibility was unreadable for two weeks.** Its timestamps were stored as raw epoch seconds, which SQLite sorts below every date string, so every freshness-filtered reader saw the feed as stale. Existing rows were converted, all 28 stations now carry a province, and `insertReading` rejects any non-date `obs_time` from any source. The rejection counter is surfaced in `/api/health`, and callers already branch on the return value, so a repeat is visible in three places rather than silent for a fortnight.
- **DustBoy and IMERG no longer report healthy while doing nothing.** Neither has an API key; both are now listed under `unconfigured` and excluded from the fresh-data count.
- A daily-series query parameter could force a full database scan on every request; fixed. The hourly watchdog now refreshes the Cloudflare edge mirror and reports swap pressure above 80%, naming the largest memory users.
- **Encrypted offsite backup to Cloudflare R2.** `ops/offsite-r2.sh` age-encrypts the nightly database on this Mac before upload, so the bucket only ever holds ciphertext, refuses files over 500 MB and refuses a backup older than 26 hours. Retention is enforced by bucket lifecycle rules. No credential is committed: the API token is read from `~/.zshrc` and the age key lives outside the repo. The watchdog alerts above 9 GB against the 10 GB free-tier ceiling.


## [2.4.71] — 2026-10-07

- Outage mirrors now accept only canonical requests without query parameters. Filtered requests cannot overwrite or consume a different selection's cached data.
- New mirror namespace discards older entries that may have mixed filtered and canonical responses. Parameterized reads return explicit unavailability during an outage rather than unrelated data.
- Behavioral regression verifies canonical fallback, filtered cache isolation, bounded entry count and rejection of legacy entries.

## [2.4.69] — 2026-10-04 — frontend interaction recovery

Entry recovered 2026-10-11 from `docs/FRONTEND-AUDIT-2.4.69.md`; the release was deployed and audited but never added here. That is the third undocumented release, and it is why `scripts/check-bump.mjs` now refuses to deploy a token the changelog does not name.

- Search results existed but the dropdown was three pixels tall — its top and bottom consumed the entire viewport. Bounds now provide usable width and height against the visual viewport, request generations stop a stale search from replacing a newer one or reopening after Escape, and failures offer recovery.
- Choosing a search result on a phone raised `Invalid LatLng (NaN, NaN)` in Leaflet while the map sheet was hidden. Movement now stops any running animation, rejects non-finite coordinates, uses an immediate view for a zero-size map and respects reduced-motion.
- Direct `localStorage` access could interrupt module initialisation and user actions; a shared preference adapter now catches unavailable or full storage and preserves choices for the current visit.
- Camera dialogs gained a keyboard Tab boundary, focus return on close and Escape support; a response can no longer dereference an overlay removed while a window request was in flight.
- Chat and JSON requests have bounded deadlines, send is disabled while busy and restored on failure, and example questions follow the language. Phone inputs use 16px text with 44px touch targets.
- 1,010 custom checks plus 14 TAP tests, no failures. Full evidence, including the interrupted browser runs that were not counted as passes, is in `docs/FRONTEND-AUDIT-2.4.69.md`.

No Lighthouse, Core Web Vitals or screen-reader certification is claimed.

## [2.4.70] — 2026-10-04

- Recovered backend hardening: PM2.5 warnings escalate when readings gradually cross 75; Telegram `/start` restores stopped subscriptions; bot authentication failures preserve subscribers.
- Scheduled and immediate LINE/Telegram pushes reserve the same notification slot before sending, preventing concurrent duplicates. Failed sends restore the prior cooldown timestamp for retry.
- Restrict forwarded visitor identities to signed requests or local tunnel connections; canonicalize outage mirror cache keys; limit archive downloads and omit internal export build errors/paths from public status.
- Added behavioral checks for gradual alert escalation, concurrent delivery, direct-client forwarding forgery, and failed-send eligibility. Full release tests and deployment verification are recorded in the release audit.

## 2.4.69 — frontend usability and recovery (2026-10-04)

- Repaired the place-search dropdown collapsing to three pixels. It now fits the visual viewport, including keyboard space, and stale queries cannot overwrite new results or reopen dismissed search. Failures explain how to retry.
- Province/city selection no longer animates a zero-sized hidden phone map. Invalid coordinates are rejected and reduced-motion preferences respected. Late city details and refreshes cannot replace a newer selection.
- Browser storage failures no longer stop startup, language, mode, basemap, area or persona choices. Session choices work without persistent storage; invalid saved story profiles recover.
- Camera and information dialogs contain keyboard focus and restore their opener. Closed/replaced camera requests cannot paint into another dialog. More navigation closes with Escape and exposes the current destination accessibly.
- Chat requests and general JSON fetching have deadlines. Send disables while busy and recovers; example chips update with the language; connection errors use plain guidance. Phone inputs use readable text and search has one clear button with a full touch target.
- Added 13 behavioral UX checks. Full test command passed 1,024 checks; follow-up header and consistency checks passed after final phone styles. The archive interruption fixture now waits for its actual readiness lock rather than signalling during startup after 15 seconds.
- Deployment probes verify the changed search/chat/dialog/preference modules on canonical and custom hosts before completing.

## [2.4.68] — 2026-10-03 — local fire briefings, honest burn comparisons and reference-grounded retrieval
- Replaced the fixed 2025/26 agricultural-burning calendar with selectable province and season briefings. Current reported maximum PM and upwind fire context are separate from historical Sentinel-2 agricultural scars. All 77 provinces are selectable even when a province has no published scars. A footer entry works on phones, and the dialog supports Escape, focus return and keyboard containment. CSV briefings include source dates, coverage and comparison exclusions.
- Season comparisons use only matching province/month cells with complete crop observations; absent crops remain unknown rather than zero. Source coverage is explicit: the current national publication has 62 provinces (372 of 462 possible province-month cells), not full Thailand coverage. Both DOPA and TH-prefixed codes are accepted, and malformed/nonconsecutive seasons are rejected. Upstream monthly download failures now surface as source failures while preserving successfully ingested months.
- Smoke transport requires a successful regional fire-feed ingest within 12 hours; missing/stale input no longer looks like zero fire potential. The API exposes source-check time and whether the wind is today's or tomorrow's forecast. It remains an upwind indicator, not a terrain-resolved trajectory or measured concentration.
- Deployment verifies both new briefing modules' contents. Behavioral regressions cover unmatched coverage, missing crop values, real zero, province aliases, source outages, satellite-source labelling and CSV formula safety.

- New `knowledge/gov-citizen-apps.md` catalogues Thai government- and university-operated public monitoring dashboards that citizens open without a login — currently **ตามรอยเผา** (HII + Kasetsart, NRCT-funded) and **WARROOM ชุมชน** (warroom.pro). Each entry records who operates it *and the evidence for that claim*, what it measures, whether anything is machine-readable, its licence, its refresh cadence, and where it is honest about its limits and where it is not. The file is an open registry with a fixed entry template, built to be appended to. It carries three findings with immediate product consequences: ตามรอยเผา republishes GISTDA MODIS hotspots and provincial PM2.5 as plain CSVs and added a 7-day burn-monitoring product whose second band counts satellite overpasses, which bounds how many separate burns a cell saw; its SAVI L2 layer publishes monthly fuel load, the only forward-looking input in the Thai open burn picture; and warroom.pro publishes a versioned, licensed, leave-one-out validated 24-hour rainfall manifest under CC BY 4.0.
- **ตามรอยเผa's forest products are now recorded as self-declared defective and formally unvalidated.** The site states that processing errors persist under closed canopy and that no formal accuracy assessment exists for forest areas, while the agricultural products carry one. The two must not be presented as equivalent, and the warning is quoted with its date rather than paraphrased.
- Corrected a stale claim: the note that no GeoTIFF download URL could be found is false after the site's 2026 rebuild. `/product/*` is an open directory listing and the files download. `knowledge/README.md` now lists all sixteen notes rather than eleven.
- **The RAG indexer no longer stores a chunk the embedder only partly reads.** `chunkMarkdown` emitted whole H2 sections regardless of size while the embedder cut at 4000 characters, so any section over that limit was stored in full, embedded in part, and could be returned to a reader as a citation whose text the retrieval had never matched. Chunks are now capped at the embedder's limit and split at heading, blank-line and list boundaries instead of truncated, and the two sides share one exported constant rather than two literals. Oversized sections in `agri-burning.md`, `burning-hotspots.md` and `paper.md` had the same defect and are fixed with it.
- Chunking is now lossless. A size floor was deleting a 34-character fragment that held the only copy of a section's heading, taking three words with it; the filter now drops only pure markdown scaffolding. Break points are recomputed at each split rather than cached, because a stale index cut list items in half.
- Re-chunking leaves orphans behind: `rag.js` ranks every embedded row and nothing removed stale ones, so an old chunking of a file kept competing with the current text forever. Rows for a file that the current chunking no longer produces are now pruned, scoped to that file's own prefix so Air Library chunks are untouched.
- `scripts/test-knowledge-chunking.mjs` (72 checks) asserts the cap, losslessness, unique keys, structural break quality, the single-limit constant and the prune behaviourally. All eight bugs it exists for were re-planted and each one turns it red; two of its own checks were corrected first, one of which was passing over a fixture small enough never to split.

No third-party product is endorsed, and no independent verification of either operator's stated accuracy was performed. warroom.pro's Chiang Mai University association comes from the owner and appears on the site only as a logo image.

## [2.4.67] — 2026-10-03 — the header stopped quietly crushing its own text

- The Danger chip's scope line — the text naming which province the 0–100 score belongs to — was being compressed to 40% of its height with Thai vowel marks shaved off. Nothing overflowed and nothing clipped, so no check saw it: a column flex box with the default `flex-shrink: 1` makes every row shorter and stays silent, because a shrunken box is legal CSS. Five pieces of content wanted about 70px in a 64px box. The number and its band now share a row inside one `.danger-main` element, and the chip is a grid whose rows size to content, so a future overflow is visible instead of silent. The wrapper was load-bearing: as siblings, the label and scope spanned the chip and distributed width across the tracks they spanned, inflating the number's track and pushing number and band to opposite sides.
- Four more defects found by a corrected browser audit. The search field was 88px wide from 1100px all the way down to a 390px phone, because a width ladder built to budget one field inside the desktop row was still applying after that field left the row — three leftover rules that were already dead on desktop were the only thing governing the phone. The magnifier icon sat on the placeholder's first letters at every phone width, and the same rule was duplicated in a stylesheet that loads later and silently overrode the corrected one. 44px touch targets sat inside 32px grid rows. At wide viewports the national headline verb received 84px of the 124px it needed.
- A browser gate now asks each chip what height it *would* need with nothing constraining it and fails if that differs from what it is given, plus a static layout check. The first version of the compression probe was wrong twice — computed `height` is never `"auto"`, and summing children's `scrollHeight` double-counts a shared row. Re-planting the original defect fails both checks. Verified at nineteen widths, in both themes and both languages, on localhost and live.

## [2.4.66] — 2026-10-02 — honest outages and archive-gated pruning

- Air Story no longer substitutes sample pollution, health, mortality, population or economic figures when `/api/science` fails. It shows unknown readings with a neutral band and retries automatically. Personal estimates wait for measured science data; an unavailable selected province cannot inherit national PM. Missing stagnation observations are excluded rather than counted as zero wind risk.
- Hot-tier raw-data pruning now checks that the archive exists on the external device before deleting archived rows. A fresh receipt cannot authorize deletion while the drive is unavailable. Existing hourly aggregation and ordinary retention remain unchanged.
- Regression checks cover the outage shell, missing provincial PM and preservation of all hot-tier rows when archive storage is unavailable. An optional browser gate exercises science failure and automatic recovery using live data.

Offsite recovery and a second live backend remain unresolved infrastructure gaps.

## [2.4.65] — 2026-10-02 — fail-closed verification and visible score meaning

- Audited MiniMax's `6bbd98a` gate fix. Missing Playwright and navigation failures now exit 2 as unmeasurable, and the data wait uses Playwright's actual timeout argument. Both numeric danger and a rendered verdict are required. An optional real-browser regression script verifies that placeholders and a missing dependency cannot print success.
- Deployment verifies the layout stylesheet, story script and camera-wall script contents in addition to the existing asset checks. Thai and English header geometry is verified separately; small phones use a two-line score, and the desktop data zone uses a bounded flex basis so translated text cannot push controls onto a second row. Unknown scores use neutral colours. Danger Score carries a visible non-clinical label in the header, rankings, city card and formula breakdown. Camera scores are explicitly relative visual triage, never PM2.5 concentrations. A camera-count fallback no longer claims that the air is broadly fine. METAR pins identify airport visibility observations, and unreported/non-aerosol causes no longer prove that dust is absent.
- The ops sentinel checks external archive storage at boot and every five minutes, independently of the 48-hour receipt-age alarm. It exposes a timestamped storage result in `/api/health` and flags missing storage, a same-disk mount directory, a misplaced archive file and a stalled probe. This verifies availability, not integrity or offsite recovery.
- Nightly backup mode checks device identity before treating a writable directory as off-device storage. A same-disk directory falls back to the verified local compressed backup.
- Test counts include Node TAP assertions: the prior release had 886 custom checks plus 14 TAP tests = 900. This release adds five storage checks and five visibility-marker checks; the optional browser gate, sparse-camera UI check and backup fixture are reported separately.

Offsite storage and a second live backend are still unprovisioned. No superiority or clinical-validation claim is established by these changes.

---

## [2.4.60] — 2026-10-02 — release audit and repairs

- Missing observations now remain unknown in Danger Score, harm ranking, personal guidance and AI facts. Current measured PM is the minimum Danger Score baseline; past or forecast rain cannot erase it. Missing CAMS stays unknown, while a genuine zero forecast remains valid.
- Replaced two retired NVIDIA inference models and verify chat and embeddings independently with inference requests. Invalid/reordered vectors are checked, model changes invalidate old embeddings, and chat transport failure returns a factual fallback.
- Corrected the Pages root rewrite: `/` must serve the Air Story, not silently fall through to the operator dashboard. Repaired library retries, keyboard reading/focus, stale async results, mobile citizen-persona API wiring and reserved search routes. Story data refreshes on visibility and every minute; its fallback uses one-hour exposure. Outdoor time is explicitly dose equivalence, not a medically validated safe duration. Display ranges are explicitly assumed, not calibrated confidence intervals.
- Public exports write bulk CSV directly to disk, count rows within each table's read transaction, fail on dump errors, and publish the compressed archive atomically. Failed rebuilds preserve the previous archive. The edge proxy limits download header wait without aborting a large streamed body at the JSON deadline. File streaming handles client disconnects and file-removal races.
- Validation: automated regression suite; live chat; 57 API read routes; browser retries, keyboard access, mobile persona and story refresh; production desktop/mobile rendering and header width checks; a read-only SQLite restore drill. A real public export produced 4.35 million raw observations in 22 seconds. See DEPLOY.md for backup and deployment procedures.

Remaining operational limits: one live backend, no automatic live failover and no offsite backup. The external-disk backup is recoverable but shares the physical location. Camera haze and composite scores remain screening heuristics; these checks do not establish clinical accuracy or superiority over competing products.

---

## [Unreleased] — webhook authenticity: the two inbound endpoints now prove who is speaking

Both webhooks take commands from the internet and neither proved who was speaking. Fixed fail-closed:

- **`POST /api/telegram/webhook` authenticated NOBODY** — the route parsed the body and called `processTelegramUpdate` directly: no secret token, no HMAC. A forged `/start` (or plain province message) inserted an arbitrary `chat_id` into `telegram_subs` — a third party subscribed to alert pushes. The webhook is now registered with Telegram's `secret_token` (`server/telegram.js` `registerWebhook` generates + stores `telegram_webhook_secret` in kv, never printed), and the route validates `X-Telegram-Bot-Api-Secret-Token` timing-safe: 503 while unprovisioned, 401 on mismatch, 200 only with the registered secret. **After deploying, run `node scripts/set-telegram-token.mjs --reregister` once** (reads the token from the DB; generates + registers the secret) or a webhook that works will start 503ing.
- **`POST /api/line/webhook` failed open when unconfigured** — `if (secret && !verifySignature(...))` processed unauthenticated bodies whenever `line_channel_secret` was unset. Now 503 (fail closed), and auth runs BEFORE any DB write. Admin GET `/api/admin/telegram-config` exposes `has_webhook_secret` (boolean only, never the secret).
- **`/api/health` no longer reports a stale version** — the version was read from ops.html once at boot into a const, so frontend-only deploys left the health endpoint reporting the old number forever; `currentAppVersion()` (twin.js) re-reads with a 60s TTL.

Pin: `scripts/test-webhook-auth.mjs` (23 assertions, in-memory DB, no network).

---

## [Unreleased] — **Vision coverage: which cameras we can actually see**

The ask was to run computer vision over *all* the cameras. Measured against the live catalogue of 1,369, that turns out to mean 362 — and the difference is worth writing down rather than hiding behind the word "embed".

**Two URL bugs were marking live cameras dead.** `resolveHls` prefixed an already-absolute iTIC URL a second time (`…/hls/https://camerai1…/ccs22.m3u8`), which 404s — 115 cameras. Repaired and re-probed with ffmpeg, **57 came back genuinely live**. Separately, relative HLS paths resolved against `camera1.iticfoundation.org`, but the feed actually serves `camerai1` (with the "i"); the host recogniser asked for `camera\d`, which `camerai1` does not match, so every relative path fell through to a 404 default. Verified: `camera1/…/ccs30.m3u8` → 404, `camerai1/…/ccs30.m3u8` → 200. A 404 is indistinguishable from dead hardware to the health probe, so this read as a catalogue of broken cameras.

**`stream_kind` replaces the single `embed` bucket** with five measured classes. 572 BMA cameras serve a real image endpoint, but it measures mean 255 / stddev 0.000 — a pure white placeholder, no scene. 208 NST embeds are MediaMTX WHEP (WebRTC): RTSP 8554 refused, SRT absent, no HLS on the web port, so a browser plays them but ffmpeg cannot. iTIC's 27 `mjpeg2.php` streams *are* readable by ffmpeg, and 6 answered. `grab_url` now points the sampler at whichever URL actually works.

**The collector samples everything reachable**, not a 40-camera prefix: all live HLS plus a rotating MJPEG probe (for MJPEG the grab *is* the probe — an endless multipart body has no HEAD to check). `server/vision/coverage.js` publishes the per-class accounting with a bilingual reason per class, and `/api/haze-vision` returns it. A blank frame still yields a *withheld* score, never 0 — the corridor detector refuses a frame with no line-of-sight structure, which is what stops 572 white rectangles from being reported as "clear air".

## [Unreleased] — **The Window**

Cameras, credited reports, and headlines already existed as three separate FloodDash-shaped layers. They now answer one question together. **หน้าต่างฟ้า / The Window** (header, and the map’s layer menu) shows the camera facing the worst air, the credited reports for that province, approved LINE notes, and the headlines that name the place. One picture plays. On a clean day it says the air is broadly fine and shows the cameras nearest the highest readings.

News geotagging is FloodDash’s matcher: every place in a headline, with the Thai words that only look like provinces (เลย, ตาก, พล) refused unless the headline says จังหวัด. District dots use real centroids. A story about three provinces pins three places. The citizen layer also draws approved LINE notes that carry a location; the photo and the sender stay private.

## [3.3.2] — 2026-09-27 · backend only · **AirDash on the external disk: a real page cache, and the archive off the evening peak**

**What was wrong.** The live DB moved to the external USB disk on 26 Sep (it is a spinning drive, a Seagate One Touch). With SQLite's default ~2 MB page cache every request went back to the disk head, and the shared archive job (`com.dash.archive`) ran at 20:00 — Thai evening peak — copying into its 11 GB archive on the same disk. On 27 Sep the server sat in uninterruptible I/O from ~20:00 for over an hour; `api-air` answered nothing. The archive was also still reading the old `~/AirDash/data/airdash.db` path ("live DB missing — skipped").

**Fixed.** `openDb` sets a 192 MB page cache (`AIRDASH_DB_CACHE_MB`), `mmap_size = 0` (a page fault on a busy USB disk is the same uninterruptible wait) and in-memory temp tables. The archive runs at 02/05/11/15 (never 17–23 or 06–09) and reads AirDash's DB from `DASH_ARCHIVE_AIRDASH_DB` on the external disk. The data stays on the external disk.

## [3.3.1] — 2026-09-20 · token 2.4.33 · **Camera video was blocked by the page's own security policy**

**What was wrong.** 3.3.0 shipped camera video that played in local tests and could not play on the live site.
AirDash's Content-Security-Policy lives only in `public/_headers` (Cloudflare Pages) — the local server sets none — so a
local test cannot see it. The live policy did not allow hls.js to load (`script-src` lacked `cdn.jsdelivr.net`), the
camera servers (`connect-src`), MSE playback from a `blob:` URL (`media-src` was absent, so `default-src 'self'`
blocked it) or the NST iframes (`frame-src`). The same gap had silently broken FloodDash's cameras since they were
added (FloodDash 4.34.2).

**Fixed.** `script-src` += `https://cdn.jsdelivr.net`; `connect-src` and `media-src` += `*.iticfoundation.org`,
`*.nakhoncity.org`, `*.highwaytraffic.go.th`; `media-src` += `blob:`; `frame-src https://nstcctv.nakhoncity.org`.
`scripts/test-csp-cctv.mjs` (15 checks, in `npm test`) reads `_headers` and fails if any of them goes missing.

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
