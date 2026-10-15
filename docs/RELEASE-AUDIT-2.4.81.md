# Audit of the overnight research release — 2026-10-15

Scope: inspect the uncommitted 2.4.79 research/CV implementation, its two endpoints, release guards and chart behavior; preserve prior agents' work. This is not certification of every screen or the scientific validity of a composite index.

## Confirmed and repaired

- Diurnal reference falsely named 15 µg/m³ as PCD's 24-hour standard. Thailand's reference is 37.5 µg/m³. Plot now starts at zero and explicitly says this hourly profile cannot establish 24-hour compliance. Official reference: https://epo03.pcd.go.th/th/news/detail/154265
- Patterns SQL unions Air4Thai monitor rows with historical CAMS model rows, including raw and hourly aggregates. The previous observed-only claim and hot-tier-only explanation were false. Captions now name the mixed input and warn that row counts are not independent samples or population weights. Aggregation methodology itself is unchanged; profiles remain exploratory.
- Alert share (~98%) was frozen in text; it now uses current counts. Ledger describes retained database alerts rather than promising a complete lifetime record.
- Sensor fault counts were literal `0 · 0 · 0`; they now read summary.flatline/outlier/mismatch. Missing or inconsistent reporting totals do not produce a healthy-looking chart.
- All-zero monthly means and all-zero alert counts produced invalid geometry. Axis denominators have nonzero floors; zero-count bars have zero width. Zero silent stations no longer creates a one-pixel silent segment.
- Peak shading now follows the three-hour API window, including midnight wrap. Regional month spacing follows calendar distance; a separate legend avoids collisions between endpoint labels. Point titles expose exact values.
- Phone charts retain readable minimum width inside their own scrollable figures rather than squeezing labels. Page remains contained at 390px.
- Superseded record requests cannot write into a newly painted language view.
- Browser inspection found sticky contents obscuring the destination heading. Its height is capped with internal scrolling and increased anchor clearance.
- Automatic version bump skips changelog versions consumed by backend/operational releases. Preserved and tested the previous agent's uncommitted check-bump disclaimer guard rather than discarding it.

## Validation

Full npm test passed (exit 0; log /tmp/airdash-audit80-tests.log). Ten focused regression checks cover zero/unknown chart payloads, live sensor counts, Thai reference value and the actual version scripts in a disposable checkout. Included in npm test. Final deploy runs frontend syntax, consistency and release guards again.

Both new endpoints returned HTTP 200 locally; summary total 45,920 alerts and 5,746 stations at inspection. Local health reported data_ok true, 19 configured pipelines healthy, IMERG and DustBoy unconfigured; these are not claimed as working feeds. Browser rendered live diurnal, alert and sensor figures in English; 390px check confirmed no document overflow and a 600px chart inside a 348px figure.

Deploy 2.4.80 corrected chart semantics; 2.4.81 adds the navigation fix found by browser testing. Verify final deployed bytes through the normal poison-proof deployment gates. Keep statistical-model calibration, complete screen-reader/device certification and full-codebase certification outside these claims.

The expired away heartbeat was paused. Existing production and shared-machine schedules were not altered.

Final verification: deployment gates confirmed 2.4.81 HTML and selected asset content on both air.nonarkara.org and airdash.pages.dev (deployment https://8a1c9ba1.airdash.pages.dev). Browser anchor check measured destination section top 231.9px, sticky index bottom 216px. Thai and English diurnal explanations both rendered the corrected reference and provenance; no console errors recorded. At 390px the chart was 600px within a 348px horizontally scrollable figure, with no document overflow. Screenshot: /tmp/airdash-2.4.81-research.png. This checks resizing an open research overlay; mobile entry into that overlay was not established by this test. Footer fire briefing navigated to the mobile dashboard pane instead.
