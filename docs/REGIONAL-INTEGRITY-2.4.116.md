# Regional evidence audit — 2.4.116

2026-10-23. Scope: regional fire ingestion, map usability and optical fallback provenance. This is not a blanket launch-clear or a smoke-transport validation.

## Found

- Rounding VIIRS coordinates to two decimals merged distinct 375 m pixels into approximately 1 km keys. A successful download could certify stale acquisitions.
- The client could continue painting old fire aggregates after refresh failures.
- Phone watch-area selection was below the map (y=1022 at 390×844), making country selection require scrolling past the main instrument.
- Optical fallback mixed the selected instrument's reading with other instruments' names and national freshness. National scope appeared after the verdict; both languages consumed space.
- In the actual darkened browser, loaded basemap tiles computed `mix-blend-mode: plus-lighter`, hiding geography. Explicit normal blending restores labels and coastlines.

## Changed

Native-coordinate keys, bounded resumable migration, per-feed acquisition receipts and an all-stale ingestion rejection. Current retrieval and acquisition evidence are separately required. Aggregates expire after 30 minutes in the client; source evidence expires after 12 hours. A 48-hour partial window acknowledges historical precision loss.

Country selector and reset precede the map. Regional count is explicitly regional, timestamped and marked partial. Four count bins match opacity. Existing ASMC regional wind reference is visible beside the Thailand wind control. No additional ingestion schedule was created.

Optical fallback selects one valid dated instrument, reports its name/time/age, leads with national scope and renders only the selected language. Province measurement retains precedence. Failed optical requests retry after five minutes rather than six hours.

## Verified

Full `npm test` exited 0 (`/tmp/airdash116-tests.log`). Targeted aerosol, regional view, parser, migration and ingestion checks pass. Isolated coordinate-rounding and freshness-gate mutations both failed as intended. Syntax, consistency, API docs and version gates passed. Tests use SQLite migration/idempotency and stale/future/current upstream fixtures, not only source-string assertions.

Graceful backend reload completed. Existing collector finished at 07:08:01 UTC, received 48,250 regional rows and added 22,926 observations; these include newly acquired and recovered native pixels, not 22,926 proven historic losses. Receipt at 07:07:34 UTC reports current acquisitions from all three satellites (04:51, 04:29, 04:29 UTC). Partial flag remains intentionally set during precision-window recovery.

Actual API-backed preview, English and Thai, checked at 1440×900, 1024×900 and 390×844. Header 61 px (6.8%, 6.8%, 7.2%); no fixed bottom chrome. Map widths 1112, 726 and 382 px. Map heights 648, 648 and 473 px. Phone selector moved to y=198 English/y=227 Thai, before map; map bottom y=797/826. No control clipping, horizontal overflow or overlap found. Map dominates; selector/status then layers establish reading order. Layer explanations and sources earn subsequent scroll. Keyboard focus moved from selector to reset with visible outline. Real unavailable-receipt state rendered an explicit warning rather than zero fires. Independent regional reviewer passed controls at all three widths and the restored dark-map geography.

Exact clipped final screenshots: `/Users/axiom/.codex/visualizations/2026/10/23/airdash116/`. Early baseline exports were scaled by the browser screenshot exporter; their CSS viewport geometry was measured separately. Live `/ops` DOM confirmed Samut Sakhon's optical fallback cites Chiang Mai Met Sta, its acquisition timestamp and 46-hour age, with national scope first. Expanded fallback viewport appearance was not separately certified in this scope; behavioural rendering checks cover both languages.

## Remaining

Fire detections do not establish agricultural origin, burned area, source-attributed ground PM, plume trajectory or arrival time. Regional numerical wind transport is not implemented: displayed arrows remain Thailand-only daily forecast context, with the regional ASMC reference exposed. PM observations remain connected for Thailand/Singapore, not all eleven countries. Cloud/overpass gaps remain. Machine load and provider quotas are operational constraints; this release does not establish failover or uninterrupted availability. Province-list equal-weight repetition remains outside this bounded regional repair.
