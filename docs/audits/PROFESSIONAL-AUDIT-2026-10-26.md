# Frontend/backend audit — 26 October 2026

Releases: **2.4.126**, **2.4.127** (regional refresh resilience), **2.4.128** (real map hit-testing). Audit baseline: **db9216a**, frontend 2.4.125.

## Design brief

- Audience: people comparing local air conditions and watching regional haze sources.
- Job: find the place, read current evidence and its age, inspect the model scenario, choose a precaution.
- Priority: map/current reading, then the relevant action, then methods and provenance.
- Constraints: preserve Thai/English, Palette semantic colours, full province names, keyboard access, uncertainty and usable targets. No decorative replacement system.
- Direction: the existing utilitarian/Bauhaus instrument and editorial research desk in STYLE.md. Content earns geometry.

## Interrupted work reviewed

MiniMax's committed work comprised the disk guard and transaction error preservation (553bba8), separation of operator disk notices from public subscriber alerts (f7422e0), and a refreshed ranking font measurement (db9216a). The guard and transaction changes passed their behavioural suites. The operator/subscriber correction is retained. A disk guard that sheds a few megabytes of optional previews is useful protection, **not a guarantee against another process filling the shared host**.

Uncommitted at entry: an empty `data/.metadata_never_index` marker and `scripts/ops/probe-province-card.mjs`. The marker is preserved and versioned. The probe now refuses failed live readiness, verifies the province against popup heading/subheading rather than accepting any popup, keeps scrollbars visible, and discloses a layer-open fallback when a real map click missed. Its syntax and source were checked; its standalone Chrome driver was **not executed** in this audit. Browser verification used the supported CUA interface.

## Found → changed

1. **Regional control/data disagreement.** Restored selectors showed Sumatra/850 hPa while the route still used Myanmar/10 m. The controller now reads the restored origin, level and release-hour values before drawing newly received evidence. A custom map origin survives refresh; an unavailable reading clears its accessible label.
2. **Map without its receipt on the first screen.** At 390×844 the map ended at y844 and its source/coverage receipt started at y844. The receipt now precedes the map inside one viewport-sized operating group. No smaller text, clipping, hidden data or additional scroll panel was used.
3. **Landing hero reserved another viewport.** A `100svh` minimum and wrapping breathing illustration orphaned the graphic from its value; a short status stretched across the reading column. Removed the minimum, paired graphic/value, fitted the status to content, kept the two supporting figures together, and compacted navigation. Existing illustration, live numbers, guidance and narrative remain. The sticky header uses a solid surface; reduced-motion preferences disable decorative animation.
4. **English popup lost its heading/score.** Callers already supplied localized heading/subtitle; the formatter swapped them again in English. It now preserves that contract, including news markers. Unknown scores display an em dash; upstream text remains escaped.
5. **Cremation counted as haze news/burning evidence.** The general-news filter and cause engine used bare `เผา`. Replaced it with shared explicit fire/agricultural-burning terms. Included sugarcane, rice, corn and crop-residue forms after independent review caught their omission. Genuine pollution reporting remains eligible; pollution itself does not establish an open-burning source. Public readers filter affected archived general-news rows without deleting originals.
6. **Disk protection began after writers.** The first disk measurement was delayed five seconds and ingestion began before it. Startup now awaits the first measurement before scheduled ingestion. Operator notices and source cooldowns are retained.
7. **Research contents looked like a heading.** The mobile chapter summary lost the native disclosure marker through `display:block`. Restored list-item marker and retained the existing chapter/read split.

## Render evidence

Evidence directory during audit: `/tmp/airdash-audit-20261026`. Populated regional, national dashboard, research, installation and Air Story pages were captured at 390, 1024 and 1440 pixels; narrow English header was also checked at 320. A proxy failure initially produced the story's explicit missing-data state; it was traced to the temporary audit proxy buffering SSE, fixed, and live captures replaced placeholder captures. This was not attributed to production.

| Surface | Measured geometry / task visibility |
| --- | --- |
| Regional 390×844 | Header 52px + toolbar 52px = 12.3% chrome. Receipt y104–227; map y227–844, 617px (73.1% screen height). Receipt previously began below viewport. Wind button remains beside the scope selector. |
| Regional 1024×900 | Header/toolbar 104px (11.6%); receipt 62.5px; map y166.5–900, 733.5px high, 726px wide. No document horizontal overflow. |
| Regional 1440×900 | Same 104px chrome; map 1128×733.5px, about 63.8% viewport area. Right instrument remains tied to the map task. |
| National 1440×900 | Header 52px + ticker 30px = 9.1% chrome. All 77 rank rows retained; map 705×818px between the existing comparison/interpretation rails. The map is the largest column but is not 60% of total area; this audit preserves the established simultaneous ranking task rather than declaring that numerical map-share target met. |
| National 390×844 | Header 52px, bottom section navigation 51.5px, ticker 30px = 15.8% chrome. Populated ranking and shared metric columns visible, no horizontal document overflow. |
| Air Story 390×844 | Initial repair moved Thai verdict from y687 to y464; supporting PM reading is visible on the first screen. Header reduced from 79.3px to 53px. Final compact scope navigation further reduces chrome. Both scripts retain full text. |
| Air Story 320 English | Final measured header 53px; zero clipped header links/buttons and no document overflow. Wordmark/version and both 44px language targets retained; redundant logo mark yields only at this narrow size. |
| Research | Existing chapter index + bounded reading column retained on desktop; contents collapse above the article on phone. Warm method accent remains distinct from operational severity. Charts/tables keep their earned local scrolling. |
| Installation | Platform instructions reflow at all three widths; primary app link and Android/iPhone sections retained. No document horizontal overflow observed. |

Keyboard verification: Enter opens the regional mobile wind dialog, origin/altitude changes update the route/key, Escape closes it and restores focus to `wind-reading`. The dialog fits the viewport. Menus, research navigation, Thai/English switching and populated rankings were exercised. This is not a fluent-reader review of every paragraph or an exhaustive screen-reader/OS installation test.

Independent review: a separate agent reviewed the rendered before/after hierarchy, restored controls, popup contract, startup ordering and news filter. It found the omitted crop-burning compounds; these were fixed and tested. Unloaded basemap tiles in an early desktop capture were flagged rather than certified as a pass; final captures are recorded after release verification.

Source scanner: regional CSS scored OK (one legacy type-scale review); story CSS scored REVIEW (three P2 findings: legacy tracked chapter labels, stylesheet-wide size count, accent-border cards). No P0/P1 after removing header blur and providing reduced motion. The semantic verdict stripe is retained with a textual state. The existing multi-chapter type/eyebrow inventory remains a follow-up, not a claimed clean source scan.

## Validation

Full `npm test` exited **0**, **1,754 PASS lines**, no FAIL/not-ok lines. This is a count of printed checks, not a claim of 1,754 suites. Final source-specific tests cover restored controls, unavailable accessible labels, Thai/English popup headings, news relevance and disk startup; final syntax, consistency and frontend-UX checks are rerun after final CSS edits. The control-restoration test rejects a mutation removing the synchronization. No live follower test messages sent, upstream quotas bypassed, or duplicate ingestion jobs created.

## Operations

At entry configured sources had no consecutive failures; regional evidence reported **3/3 current fire feeds**, **63 wind samples**, **77 outlook points**, and Singapore was available. During heavy shared-host load a rain ingest hit its existing hung-run reset and a twin fetch used retries. This is recorded as operational degradation, not hidden by a successful HTTP probe. Backend health latency varied from milliseconds to 6.6 seconds.

Disk headroom fell from 16.7 to 12.4 GiB during the audit (warning level); host load exceeded 200 at one point. Other agents' processes were not stopped. The archive receipt remained current (about five hours) and external storage present. The scheduled 03:17 backup completed at 03:20 with SQLite quick_check and byte-verified publication. The scheduled encrypted R2 copy completed at 03:50 (194,004,100 bytes), closing the pending backup item from the earlier recovery.

LINE remains provider-quota parked until **31 October 22:05 Bangkok**. This is a messaging limitation, not a claim that broadcasts are currently delivering. Camera haze remains an uncalibrated heuristic; air paths are fixed-level coarse-grid scenarios, not smoke arrival or AQI predictions. PM observations remain connected for only two of eleven regional countries. Those limitations remain visible.

Monitoring: updated the existing paused four-hour heartbeat to the current AirDash health/design audit scope. It stays quiet when unchanged, preserves source cooldowns and existing machine schedules, and requires real render evidence and independent review before UI shipping.

## Release verification

2.4.126 was committed/pushed as **b7a7e1a**. Backend PID 65071 logs the first disk read before scheduler startup. The deploy gate verified HTML and asset contents on both canonical and custom domains; asset fingerprint **c197b49e3607**. Public health returned version 2.4.126/ok:true (12.6s under host pressure), public news returned 27 headlines and excluded the observed unrelated cremation headline (4.6s). The archived original was not deleted.

**The final browser did not pass:** public `/api/region` returned HTTP 504 at **30.06s** on an expired cache, while the backend remained responsive; a subsequent local request served the newly built result in 0.27s. No loading/error screenshot was certified as a live visual pass. This exposed the need for the bounded follow-up below.

2.4.127 adds an explicitly labelled last-known overview between the 5-minute fresh cache and a **20-minute absolute maximum cache age**. One deferred rebuild runs in the background; the old response resolves before CPU/SQLite work starts, and failures back off one minute. Original generated_at and all observation/provider timestamps are preserved. Existing client age checks still govern PM, wind, fire, model and flood evidence. Outside the window, future/corrupt or absent cache is not shown as valid evidence. Deterministic tests exercise stalled rebuild, coalescing, preserved timestamp, success, failure cooldown and expiry.

Independent review caught a client-side follow-up issue: a last-known response would otherwise remain on the open page after the rebuild completed. The client now makes at most three 5-second follow-up reads only while the server reports refreshing; it stops on refresh_failed. A visible Refresh button sits with the receipt, and the caption does not promise perpetual progress. Both controls use 44px targets. A separate real-load-function test proves replacement, bounded requests and failure stop. Independent source review found no remaining regression in that fix.

The full suite was rerun for the follow-up and exited 0; the final bounded-client test was added/executed separately after that run. Final 2.4.127 live receipts are appended below.

### 2.4.127 live receipt

Committed/pushed as **eaebfca**, selector-width follow-up **a50ddfb**. Canonical/custom HTML and asset contents verified under 2.4.127; asset fingerprint **f764d6431206**. Public regional request returned HTTP 200 in **1.24s**, generated 10:38:14 Bangkok with 180 observations and 3/3 fire feeds. Public health returned ok:true/version 2.4.127 in 3.21s. A subsequent request to an existing fresh cache still took 25.7s during host pressure: the bounded refresh repair cannot guarantee event-loop latency on a saturated machine. One Air4Thai fetch failed upstream; retained observations and their actual ages remained visible. No forced source retry bypassed its cadence.

Production screenshots at `2026-10-26/region-390.png`, `region-390-en.png`, `region-1024.png`, `region-1440.png` have populated data and zero pending tiles. Final 44px recovery actions increased the mobile receipt to 139px: map y243–844, **601px / 71.2% screen height**. At 1024 the map is 726×671.5; at 1440 it is 1128×717.5 (**62.4% viewport area**). These supersede the earlier intermediate geometry table. No document horizontal overflow observed. The full Myanmar/Burma selector is 176px at 390 and still fits beside the wind reading.

### 2.4.128 real map interaction follow-up

The final native map click exposed a defect the source-only popup check could not prove: a full-size station-data canvas in pane450 intercepted the province canvas in pane350, including transparent pixels. Repeated actual clicks on a visible province produced no popup. Sharing the interactive data canvas fixes the hit-test stack without switching thousands of markers to SVG. Province fills restore backdrop order on each **attachment**, not just draw, so off/on toggles and detached redraws cannot put them above station targets. Optional interactive fire/rain/building paths use the same canvas.

Real browser before/after: the same click at (645,235) changed from no popup to **“Prov. Lampang — 6/100 ALL CLEAR”**. After province OFF→ON it still opened that card. After closing the popup and hiding the overlapping wind annotation, a real click on the station at its tile-derived position (659,221) opened **“Meteorological stations, Lampang”**, PM2.5 17, AQI30, 10:00 observation. This proves station targets remain above province fills. The English popup is fully opaque/readable (dark background, light text), not an opening-transition screenshot. Its proof is `2026-10-26/province-popup-english.png`.

A separate reviewer caught the first ordering patch's off/on lifecycle gap; it was fixed and independently re-reviewed. `test-map-hit-pane.mjs` executes the real layer with controlled Leaflet wiring and checks initial draw, redraw, reattachment, detached draw then attach, station hit priority and popup binding. Separate-pane and lost-order mutations fail. Actual Leaflet hit-testing is proved by the native browser interactions above, not by this wiring fixture alone.

The full 2.4.128 gate caught a randomized hour-chip collision, **not a successful run**: 45.1px separation was less than the widened labels' combined half-width. Reproduced with fixed points (0,0), (0,40), (44,20), then fixed by iteratively merging groups after their displayed footprint changes. Also fixed closest-pair measurement to include non-adjacent hours on returning paths. Replaced non-reproducible geometry sampling with a seeded generator; added fixed fixtures and mutations for both defects. Independent review then rejected a circular approximation: labels are rectangular. The final predicate checks both axis-aligned bounds using a shared 24px height also used by Leaflet icons, including diagonal collisions. The seeded tests check actual rectangles. The focused hour-mark suite passes 47 checks, including 12 caught mutations. A fresh full gate is required below; the failed run is not relabelled as success.

### Final gate

Fresh full `npm test` on the completed changes exited **0**, **1,762 PASS lines**, **zero FAIL/not-ok lines**. The earlier failed randomized geometry run remains recorded above. The final suite includes the bounded refresh test, pane attachment/order test, deterministic rectangular chip tests and popup language checks. Syntax/consistency/release guards are also run by the deployment command.

2.4.128 is a frontend-only follow-up. The running backend remains the verified 2.4.127 code; no additional backend restart is required for these renderer/label changes. A matching frontend/backend token is not substituted for process/code provenance.

### Published receipt and monitoring

2.4.128 deployed successfully to both production domains; the deploy gate verified HTML and asset content, fingerprint `6eba441e27c3`, source commit `97916a4`. A freshly navigated public `/ops?v=2.4.128` loaded `boot.js?v=2.4.128`, rendered all 77 ranking rows at 390×844 and had no document horizontal overflow. The final attempt to repeat the desktop native click was **unverified**: the browser viewport capability left this tab at 390px, so the desktop coordinate was rejected. Earlier real local-preview province/station interactions and the three-width rendered evidence remain the interaction proof; asset convergence does not replace a post-deploy native-click test.

Observed the slow-refresh recovery in production: HTTP200 in 1.057235s with `overview_status: refreshing`, preserving `generated_at: 2026-10-26T04:04:51.341Z` and 175 observations. The last-known response does not pretend the data is newly measured.

Reactivated the existing four-hour AirDash monitor with current instructions, replacing the expired away-window prompt. It stays quiet on unchanged/non-actionable state and preserves existing ingestion, watchdog and backup schedules. Shared-host CPU saturation, roughly 10GiB internal disk headroom, parked LINE quota and PM coverage in only 2/11 regional countries remain operational/coverage limits. No smoke-arrival or AQI-arrival prediction is claimed.
