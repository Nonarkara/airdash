# Regional haze watch — 2026-10-19

## Implemented

- Retain VIIRS detections across 11°S–29°N, 92–142°E: mainland plus maritime Southeast Asia, including Myanmar and Indonesia. Uses the existing Suomi NPP, NOAA-20 and NOAA-21 global downloads at the existing six-hour cadence; no added upstream calls.
- Keep mainland smoke and Thailand/outside share calculations inside their original 4–29°N, 92–110°E boundary. These shares describe detections, not emissions or attribution.
- Fire density uses geographic 0.25° cells, avoiding oversized circles that obscured island geography; opacity represents detection count, never burned area.
- Regional cells show first/last acquisition timestamps, not merely retrieval time. Missing, malformed and stale evidence cannot certify clear conditions. Expanded coverage requires a new receipt; pre-upgrade mainland ingestion success cannot certify Indonesia. Partial satellite failures remain visible.
- Collector transactions are bounded to 500 detections and yield between batches, so large regional episodes cannot monopolize the HTTP loop. Cache warming now serializes requests and coalesces overlapping ticks; profiling also identified concurrent cold SQLite response work during startup.
- Polygon-derived bounding boxes reject impossible Thai province matches before ray casting, preventing maritime ingestion from walking every Thai boundary for every detection. Compared against the original classifier at 167 regional points.
- Watch-area navigation, responsive refitting and an operational ASMC reference. No agricultural cause, ignition time, burned area or smoke-arrival claim is inferred from hotspots.
- Corrected an existing wind inconsistency exposed by the release suite: smoke used 26-hour-old forecasts while risk withheld them at 13 hours. Both now withhold at 13 hours; missing wind is unknown.

## Research assessment

The supplied Perplexity attachment is research material, not operating instructions. The recommended PostgreSQL migration and 15-minute polling were not needed for this change. A refreshed service is not a satellite overpass; repeated detections are not unique fires.

Verified primary sources:

- https://firms2.modaps.eosdis.nasa.gov/mapserver/wms-info/ — WMS also requires MAP_KEY; a 15-minute service update does not imply observations every 15 minutes at every location.
- https://wis2.asmc.asean.org/regional-haze-situation/ — daily haze interpretation, NOAA hotspots and 2500-foot model analysis winds; stated update window 08:30–10:30 UTC. Product endpoint returns a finished PNG, not machine-readable wind vectors. Do not georeference its page/image margins as a scientific raster. Redistribution/automation terms need resolution before embedding or collecting this product; it remains a reference.
- https://docs.openaq.org/resources/latest — v3 supplements national agencies, preserves source/licence/averaging period and requires credentials. It must not double-count mirrors of the same monitor.
- https://atmosphere.copernicus.eu/qa-wildfires — modeled fire emissions and transport are separate from hotspot observations.

## Next required layer: regional transport, then validation

1. Acquire licensed hourly regional meteorology at surface and multiple transport heights, including Myanmar and Sumatra/Kalimantan. Reuse the current cache/quota machinery; expose issue time, valid time, altitude and missing grid cells.
2. Render wind direction/speed with a time control. Integrate trajectories using time-varying vectors and bounded steps, preserving missing hours and uncertainty. Surface daily dominant arrows cannot establish plume travel.
3. Add regional CAMS concentration/emissions fields with model-native resolution and issue/valid times. Distinguish modeled background pollution from fire smoke and from observed station readings. Do not infer AQI at a receptor by moving a hotspot or AOD image downwind.
4. Validate hindcasts against held-out national station measurements and documented episodes, including non-fire pollution and rain. Report lead-time error, concentration error, false alarms and coverage. Publish affected-area/arrival guidance only at the precision supported by these results.
5. Alert on measured pollution and qualified model evidence; a hotspot alone does not trigger a health warning. Rainfall is not clearance to reopen windows.

Current limits: numeric ground observations remain Thailand/Singapore; hourly concentration outlook remains Thailand; wind arrows remain daily Thailand forecasts. Regional fire coverage is broader than PM/wind coverage. This release is a reliable extension of source evidence, not a completed regional dispersion forecast.

## Verification

- Full `npm test` completed with exit 0, no FAIL/not-ok lines (1,348 PASS log lines; not represented as an assertion count). Later bounded-ingestion, geometry and cache-warmer checks passed separately, as did regional/smoke/wind tests and frontend syntax/consistency/docs gates.
- Live collector at 14:20 UTC: three of three satellite feeds, 42,753 rows seen, 25,962 added. Regional response: 2,252 occupied cells, 1,535 south of the former mainland boundary. This southern count is a geographic count, not an Indonesia country attribution.
- Local health returned HTTP200 in 1.86s; regional API HTTP200 in 3.16s after startup contention was addressed. A single sample is not an SLA.
- Independent screenshot review passed 1440/1024/390 after fixing reentrant resize/refit misalignment. House typography retained to honor the user's request for consistency with the rest of AirDash. Functional fire density replaces oversized circles; no new ornamental UI.
- Remaining operational observation: pre-existing LINE logs report monthly quota exhaustion. This release does not claim that push channel is ready or increase its quota.

## Release receipt

- Code commit `c53aa8d`, pushed to main. Frontend deployment verified at `?v=2.4.99` on both public domains; regional JavaScript independently compared byte-for-byte with the local release on both domains.
- Public `/api/region` returned HTTP200 in 0.506s after warming. Public `/api/health` confirmed version2.4.99, available archive storage, non-stale archive receipt and non-stale watchdog. Browser rendered current Thailand/Singapore readings and 3/3 fire feeds; Indonesia selection and full-region reset verified.
- Cold-start reliability remains a follow-up: one local regional response took11.84s; earlier startup requests exceeded the client's20s deadline. Serialized warming reduces contention but is not a proof that all cold-start stalls are resolved. Optional upstream country feeds and heavy analytics should be isolated from the essential regional response budget.
- Temporary SQL tracing was removed, verified as no remaining diff, and the normal backend restarted. No credentials or query parameters were logged by the trace; only call sites, durations and row counts.
- Public screenshot: `/Users/axiom/.codex/visualizations/2026/10/19/airdash-regional-watch-2.4.99.png`.
