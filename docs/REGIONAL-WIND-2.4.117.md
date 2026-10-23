# Regional wind workspace — 2.4.117

User task: see where air moves, at what speed and over what hours, alongside fires and measured pollution. The 116 visual pass was insufficient: it certified fitting controls but left stacked status bands and no regional transport information.

## Found and changed

The map began at y=239 on desktop and y=354 on a Thai phone. Identity, title, scope, source link, status, selector and fire count occupied separate bands. A long equally weighted sidebar displayed Thailand daily wind arrows while Indonesia had none. Replaced these demands with one 52 px identity row and one compact area/wind row. Moved source receipts below the map; secondary imagery/field controls collapse. Wind speed and direction take the numeric emphasis. Desktop keeps the release/level/hour controls beside the map; phone opens the same instrument by tapping the wind reading. Native dialog supports close/Escape and returns controls to the sidebar. Existing PM/imagery/flood/research content remains.

## Data and interpretation

Existing ingestion scheduler now collects Open-Meteo hourly forecast values for 63 fixed 6° samples across mainland and maritime Southeast Asia, every six hours. One bounded multi-coordinate request, no browser upstream polling. Uses the shared host quota breaker and existing scheduler backoff. Retains 10 m and 850 hPa speed/direction, precipitation and 850 hPa geopotential height; units, coordinate identity and hourly slots are checked. 850 hPa below model terrain plus a 100 m margin is masked. A valid current hour and at least 80% current spatial coverage are required before replacing the receipt. Retrieval freshness expires at nine hours; absent valid hours cannot produce paths.

Client spatial interpolation averages east/north vectors, not compass degrees. Paths integrate through actual hourly slots in steps no greater than 15 minutes, also stopping at exact elapsed-hour markers and final partial hours. They stop at missing data or regional bounds. Calm winds show no invented north bearing. Map labels avoid overlapping hourly markers; the path-focus action changes geographic zoom, not physical distance. The currently selected release can be a preset or a clicked map/fire cell. Hour slider is release time, not smoke arrival time. Rain is hourly forecast accumulation at the release point; it does not subtract a claimed amount of PM.

This is a horizontal fixed-level air-movement scenario. It does not model emissions, plume rise, vertical mixing, terrain flow, deposition, rain scavenging, concentration or AQI. A 6° sample grid cannot resolve valleys or local exposure. 850 hPa is pressure level, not fixed height above ground. No source attribution, dispersion envelope, health exposure forecast or confirmed arrival time is claimed.

Method references: https://open-meteo.com/en/docs (hourly, pressure-level units, UTC unixtime, forecast_hours); https://www.ready.noaa.gov/HYSPLIT.php (distinction between trajectories and dispersion). Method is also exposed in the regional research disclosure and API/source catalog.

## Verification

Live scheduler ingested all 63 points at 08:13:22 UTC on 2026-10-23, in 42.9 seconds. Source receipt remains separate from hourly valid times. Shan State surface scenario at 08:24 UTC: about 4 km/h towards NE, about 16 km over six hours; no exaggerated plume is drawn to make weak wind look dramatic.

Full `npm test` exited 0, log `/tmp/airdash117-tests.log`. Follow-up relevant suites run after final UI changes. New tests cover direction convention, 359°/1° vector wrap, calm, missing hours, partial-hour displacement and marker time slots, grid bounds, stale/future receipts, unexpected units, model-time coverage, response order/coordinates and below-terrain pressure levels. Independent scientific review confirmed vector integration and caught calm/bounds issues, which were repaired.

Cold regional requests under host load above 130 exceeded the original 20-second client budget. Removed the no-longer-used daily smoke computation from `/api/region`; the wind visualization now uses regional hourly values. Client deadline is 30 seconds, matching its edge budget. A subsequent measured local regional request completed in 13.8 seconds. This is not a guarantee under machine saturation. Other services/processes were preserved.

## Final spatial checks

The first-screen map now begins at y=104 (52 px identity + 52 px control row), versus y=239 desktop / y=354 Thai phone in 116. No fixed bottom chrome. At 1440×900 and 1024×900 the map is 796 px tall; at 390×844 it is 740 px tall. Top chrome costs 11.6% of desktop/tablet height or 12.3% of phone height, with selected wind speed and area choice in that space. No horizontal overflow in measured viewports. Map first, selected wind second, scenario controls third; receipts and secondary layer explanations follow their tasks.

Real-content keyboard testing advanced the release by one hour; phone dialog close restores focus to the wind button, and path-focus closes the dialog to expose the map. Preset Sumatra changes the geographic selection to Indonesia and centers the release. Surface/850 hPa choices produce different speed/direction/path. Scenario caveat and retrieved forecast time remain visible in the instrument. Optional imagery/flood/field controls are retained.

Independent visual review rejected early desktop captures because tile fading concealed geography and a deferred resize re-fit could overwrite a user's path-focus. Removed Leaflet fade/zoom animations, opted the basemap out of browser auto-darkening, and made resize fit synchronous. The subsequent final1440-th.png shows country labels, coastlines and high-contrast arrows; empty/pre-settle captures are excluded. Final review receipt follows below.

Optional PM calibration is now cache-only on the regional request. Cold historical scans are not required to show current evidence; raw CAMS remains available and labelled unadjusted when the station calibration cache is absent. Tests prove cached-only lookup issues no historical query and raw output retains nulls/units. Profiling measured historical calibration at ~2.2 s and fire aggregation at ~2.8 s in one run; host contention remains a contributor to the longer timeouts, so no sole-cause or uninterrupted-availability claim is made. Bearing inversion and full-hour overshoot mutations both failed the new integration tests.

Independent reviewer confirmed the corrected 1024/1440 px geography and wind contrast, focused Sumatra path/hour markers and phone path/dialog: no remaining scoped UI blocker. Final assets are named final1440-th.png, final1440-th-sumatra.png, final1024-th.png, final390-th-path.png and final390-dialog-th.png under `/Users/axiom/.codex/visualizations/2026/10/23/airdash117/`. Earlier unlabelled/pre-transition exports are not pass evidence. Map legend has a separate line stating orange cells are 48-hour fire counts, not smoke or burned area; its public verification follows deployment.

## 2.4.118 narrow-screen follow-up

117 deployed and asset-verified on both domains at 08:40 UTC. The additional 320 px populated check found a real two-digit wind-reading overflow: right edge 341 px on a 320 px viewport, despite the document scroll-width check appearing clean. Corrected the selector's spatial demand below 360 px; bearing degrees remain in the accessible name and dialog while speed and compass direction stay visible. Re-tested Sumatra's 14 km/h NW value: reading ends at x=302 inside the 312 px content width. At 770 px the compact selector/reset and wind reading end at x=456 inside the 472 px map track. Screenshots final320-th.png and final770-th.png supplement the main matrix. This demonstrates why document overflow alone cannot certify controls fitting their track.

Health at 08:40 UTC: regional-wind failures 0 with a persisted successful receipt; external archive present, receipt 12.5 hours old, watchdog 40 minutes old and not stale. Host load remains extreme. Existing LINE monthly quota exhaustion was observed in logs; no messages were sent or quota settings changed in this task. These operational limitations remain outside the visual pass.
