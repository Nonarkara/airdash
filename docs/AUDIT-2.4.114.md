# Audit and MSH — 2.4.114, 2026-10-23

Task: compare provinces without losing names or spending the operating area on secondary navigation. Dominant content: province comparison beside the live map. MiniMax112/113 were already committed on main; no divergent branch needed merging. Initial checkout was clean.

## Found and changed

At1440×900, the national city grid consumed255.6px of the818px rail. Ranking was400px and showed five complete records. Replaced the grid with one labelled native selector (62px). Removing the ranking minimum alone made Forecast/What-if expand to245px each and reduced ranking to185px; rejected that intermediate result. Both tools now have44px native exclusive disclosure summaries and keep their functions on demand. Ranking receives587.95px and shows nine complete records;77 records are available instead of the old60-row cap. Expanded comparisons remain full-width and keyboard operable. Map width remains705px.

The width guard omitted the8px scrollbar and3px urgency stripe. At375px rail width, English Ayutthaya needed165px but had163px. Recovered12px from column gaps and horizontal padding; name column now175px. Actual DOM Range/font measurements of all77 names in both languages: longestThai106px, English165px, zero clipped names. Both languages' geometry and font family/size/weight are checked. Guard budget374px includes stripe/scrollbar. A family substitution mutation fails for both languages. This guard is not a guarantee against every future font-file or dataset change; rerender/reprobe remains required.

City selection lacked a language-change listener; added one and rejected obsolete asynchronous results. Behavioural test covers reverse completion order, translated labels and the canonical focus action. Browser selection reached?city=chiangmai, flew/scoped the map and rendered the city dashboard.

Optical coarse guidance incorrectly dismissed N95 protection, and tests required that claim. Corrected shared backend guidance and the preparation fallback; retained the national-signal/measurement distinction. Source: https://www.cdc.gov/niosh/ppe/php/community-respirators-masks/ and https://www.cdc.gov/niosh/ppe/respirators/ffr.html. Approved, well-fitting particulate respirators filter particles; they do not filter gases/vapours. Particle size alone does not establish personal exposure or respirator effectiveness. Tests now reject the unsupported claim.

Client snapshot deadline10s could expire before two possible8s edge attempts and fallback transfer. Increased to30s; the6s escape control remains. Added a cross-module request-budget test.

## Render evidence

Actual before/after screenshots at1440×900,1024×900 and390×844, including Thai/English, expanded ranking, expanded Forecast/What-if, keyboard focus and city selection. Files under /tmp/airdash114-*.png. Geometry: /tmp/airdash114-geometry.json. Browser font artifact: scripts/ops/rank-fit.json.

1440: global chrome52px top+30px ticker=82px/9.1%. National panel heading80px; comparison labels stay with values. Priorities are map, ranked values, optional tools. Both comparison/action visible; records earn scrolling. No new horizontal overflow; names fit.

1024: global chrome52px top+51.5px sheet navigation+30px ticker=133.5px/14.8%. Risk is an explicit full-width sheet, Map remains a separate action. Long names and all metrics fit. Records earn the sheet scroll; secondary tools remain available.

390: same133.5px global chrome=15.8% of844px. Comparison and record disclosure visible together; zero page horizontal overflow and zero cut names in both languages. Readable type,44px targets, map navigation, ticker and keyboard expansion preserved. No hidden-overflow fit was introduced.

Visual verification uses an unmodified real edge snapshot retrieved at2026-10-22T18:11:21.533Z, served by the temporary preview to avoid repeatedly querying the saturated origin. Other endpoints remained live. Its original timestamps were preserved. This proves composition with real data, not current origin health. Independent review accepted the scoped layout and fixes; an initially English selector in a Thai screenshot was recaptured after the language fix settled.

## Checks and remaining limits

Full npm test exited0 during this audit. After later changes, relevant frontend syntax, ranking, aerosol, preparation, rail-width, city-choice, snapshot-deadline and consistency checks passed; release/whitespace gates passed. Retested final changes rather than repeating archive-heavy tests on the saturated shared host.

Host load rose from62–79 to109; multiple local/public requests timed out, including a60s snapshot attempt. Sampling showed active JavaScript work; retention logged a37s batch and139s total trim, while other projects were building. No other agent's processes were killed. LINE logs report monthly quota exhausted and repeated429s; this audit does not certify push delivery. Right-side API panels intermittently failed to populate. Global launch readiness and physical-device coverage are not certified. Map remains705/1440px, below the skill's nominal60% target; this release preserves the existing operational layout and fixes the scoped ranking demand rather than declaring a global visual pass.

## Release receipt

209d8fd pushed and114 deployed through the guarded release script; both aliases' HTML and asset-content checks passed. Additional byte comparisons matched five changed runtime assets on both domains. A graceful SIGTERM was processed by the old backend; launchd started PID59981. Local ping returned pong; health returned ok:true, version114, uptime78s, archive fresh/storage available, watchdog fresh. Live AERONET returned five instruments without obsolete guidance. Fresh backend snapshot contained77 provinces and no obsolete protection sentence.

Public browser loaded114 and77 ranked records with zero clipped names. City/other auxiliary endpoints had not all populated at the public capture: do not treat this as a complete public interaction pass. The full interaction evidence above came from the development preview with the unmodified real edge snapshot and live auxiliary APIs. Public proof: /Users/axiom/.codex/visualizations/2026/10/23/airdash-2.4.114-live.png; reviewed composition: airdash-2.4.114-desktop.png in the same folder.

Host load subsequently reached189. Backend Open-Meteo is correctly parked under its existing daily quota breaker until2026-10-23T00:05Z (07:05Bangkok); no forced retry was made. LINE monthly quota exhaustion remains unresolved. These are operational limitations despite the successful release. The probe's old2px name-clipping tolerance was tightened to1px, matching the actual audit census.
