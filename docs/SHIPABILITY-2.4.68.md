# AirDash 2.4.68 shipability audit

2026-10-03. Baseline: main 701efe2 / production 2.4.67.

## Changes and findings

- Added a bilingual fire/burning briefing with all 77 province choices, selectable published seasons, current PM and upwind-fire context, monthly agricultural burn history, and a scoped CSV download. Accessible from the dashboard footer on phones.
- Historical publication currently covers 62 provinces. National coverage is explicitly 372/462 province-month cells. Missing provinces/crops remain unknown; legacy false-zero totals are recomputed from valid crop components.
- Season comparisons include only matching province/month observations with complete crop totals on both sides. Chiang Mai 2025/26: 168,328 versus 124,356 rai, +35.4%, six matched cells. These are agricultural scars, not active-fire detections.
- Smoke context requires a successful FIRMS regional ingest within 12 hours. Missing/stale ingest returns unavailable, not zero fires. Forecast-wind basis and source timestamps are exposed.
- Partial monthly publication failures retain successful rows but fail source ingestion health instead of reporting complete success.
- Fixed a mobile dialog header overflow that focusing Close exposed. Controls retain 44px height; the wide history table scrolls independently and is keyboard focusable. Escape restores the opening control's focus.
- Deployment verification now checks both burning-panel JavaScript assets, alongside existing HTML/CSS/JS probes.

## Validation

- `npm test`: exit 0; 994 custom checks across 40 result groups plus 14 TAP tests; zero failures. Includes 12 new behavioral checks for matching coverage, province aliases, missing/zero data, source freshness, source labels and CSV formula safety.
- Targeted briefing checks passed again after treating whitespace-only CSV values as missing.
- Browser: controls fit 320, 360, 390, 414, 480, 768, 1024 and 1440px; dialog horizontal scroll remains zero. Thai/English, province changes, unpublished Songkhla history and Escape focus restoration verified; no captured console errors.
- Actual browser CSV download inspected: Chiang Mai scope, selected season, UTC provenance and explicit model limitations present.

## Remaining operational and scientific limits

One live backend; same-machine USB archive, with no offsite backup or verified standby. Archive stall/drive probes reduce detection time but do not remove this failure domain. Camera haze and composite danger remain heuristics. Upwind-fire context is not terrain-resolved transport, measured PM, or causal attribution. This release does not establish comparative superiority or introduce district-level smoke modelling.
