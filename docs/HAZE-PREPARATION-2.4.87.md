# Haze preparation evidence — 2026-10-15

Purpose: turn separate raw fire, wind, rain and PM feeds into a province preparation view without claiming a validated smoke dispersion forecast or safe relocation destination.

## What shipped

Overview: a bilingual province selector ranked by preparation signals. Current provincial maximum PM/source, three daily bias-adjusted CAMS values, upwind VIIRS count/dominant wind and rain amount/probability stay distinct. Current PM at/above 37.5 leads to exposure-reduction advice; modelled daily PM at/above that reference prompts preparation; upwind detections prompt monitoring. This is a screening reference, not an hourly test of 24-hour compliance. Missing observations/forecasts cannot produce a safety clearance.

Map shortcuts: stations/PM heat map; forecast wind towards-flow arrows plus recent VIIRS grid centroids; observed/nowcast rain. Province arrow counts mean detections upwind, not fire location or transport probability. Fire points are 0.25-degree grid centroids, not burned area. Existing historical agricultural burn scars remain separately labelled seasonal context. Rain frame labels include date/time and distinguish observed from nowcast.

Research now explains the chain: surface conditions → possible sources → transport clue/model outlook → rain context → preparation. Advice includes cleaner-air rooms, HEPA filtration, fitted particulate respirators for unavoidable exposure, and checking destination observations/forecasts before travel. Wind arrows alone cannot identify a cleaner destination.

## Scientific basis and limits

Inspected CNX src/lib/cnx/wind-field-core.ts and wind-arrow.test.ts. CNX integrates an hourly wind grid at 10 m and 850 hPa with an RK2 parcel centreline; even that explicitly omits diffusion, deposition and vertical motion. AirDash's current source is daily dominant 10-m wind. It supports direction/upwind context, not CNX-style hourly trajectories, plume arrival times or predicted street-level exposure. No new paid providers or ingestion schedules were added.

NASA distinguishes active fire pixels from burned area; the two cannot be interchanged. Aerosol optical depth is atmospheric-column context; plume imagery need not imply surface exposure. Full smoke concentration forecasting requires emissions, plume rise, meteorology and atmospheric dispersion. These limits are carried into the interface.

Primary references:
- NASA FIRMS active fire FAQ: https://forum.earthdata.nasa.gov/viewtopic.php?sid=a0e6378403ec12398ce3e0c11fdf7c14&t=5191
- EPA/USFS Fire and Smoke Map: https://www.airnow.gov/fasm-v4/about/
- Wildfire smoke guide: https://www.airnow.gov/sites/default/files/2021-09/wildfire-smoke-guide.pdf

## Data and reliability fixes

/api/smoke now returns the existing gridded detections as fire_cells, with fire_grid_degrees=0.25. The old date-only lookback could exceed 48 hours while being described as 48h; the query now combines UTC acquisition date/time and excludes older/future detections. A real SQLite regression exercises this boundary and reconciles grid counts.

Planning fetches coalesce and cache for five minutes, with no stale-on-error fallback. Each optional endpoint can fail independently; unavailable evidence remains visible. Panel renders are discarded when disconnected or superseded by a language change.

Tests caught an unrelated false failure in the existing host-starvation observer test: the production watchdog deliberately skips page-in sampling when CPU load alone proves saturation, but the test demanded numeric page-in rates. The test now accepts that branch only when measured load exceeds its limit and STARVED=yes. The watchdog itself and machine schedules are unchanged. The host was observed at load ~139 during validation; restarting AirDash does not cure shared-host saturation.

## Verification

Focused tests exercise wind-from→towards conversion, missing inputs, preparation ordering, actual panel rendering/map button events and SQLite fire windows. Full test/release evidence and live activation are recorded below after completion.

The DOM browser tool was blocked by its policy-service network request. Native Chrome computer-use access succeeded: the Thai panel rendered real values, and the transport shortcut displayed wind-arrow markers. No location access was granted. This does not constitute full phone/device or screen-reader certification.

Final checks: full npm test exit 0 (/tmp/airdash-haze-plan-final-tests.log), plus focused checks rerun after the final timestamp and UI-copy changes. Deployment gates verified 2.4.87 HTML and asset content on air.nonarkara.org and airdash.pages.dev; asset hash ffc366d7431e. Existing launchd backend activated once for the response/query change. Local and public health subsequently returned HTTP 200 in ~289–294 ms, uptime 81s; public /api/smoke returned 200 in 338 ms with 787 detections, 305 cells, and reconciled cell totals.

Operational limitation observed after activation: Open-Meteo is in its existing daily-quota cooldown (~546 minutes at inspection), so health reports 20/21 source states current and overall freshness unknown while data_ok remains true. No cooldown bypass or extra upstream fetch was attempted. Existing forecast rows still pass the backend's age gate; they will become unavailable when that gate expires if the provider has not recovered. Do not report all pipelines healthy.

Native browser verification succeeded despite the DOM tool outage: selected province rendered PM 28.6, daily model values 25.7→33.4→30.1, 26 upwind detections, daily wind 4°→184° and forecast rain 3.1 mm/86%, clearly separated. Transport shortcut produced wind-arrow markers. Phone and screen-reader checks remain unverified for this release.

Final native production check: the deployed public /ops page rendered the preparation panel and transport preset with wind arrows plus red fire-grid centroids. Rain preset switched to observed radar (label: 15 Oct, 21:20) and the forecast-rain overlay. Screenshot saved at /tmp/airdash-haze-preparation-2.4.87.png. This supersedes the earlier DOM-tool limitation for the desktop paths actually exercised, but not the unverified phone/screen-reader checks.
