# Priority: observation reliability — 2.4.94

## Plan and evidence

The next priority is timely, traceable observations before more detailed visual effects or smoke ETA. At 2026-10-15 22:47 ICT, local health showed working archive storage, archive receipt age 7.7 hours, watchdog heartbeat 47 minutes, available CAMS outlook, and weather API parked for its existing daily quota. Preserve those services and cooldowns.

The actionable defect: AirDash regional data had 42 current / 175 historical Air4Thai PM locations, while one direct read of the existing official endpoint showed 142 latest-hour station reports out of 173 provider entries. SQLite held 42 reports at 22:00 and 99 at 21:00. The last successful hourly poll at 22:09 ICT preceded staggered reports becoming available. A successful hourly HTTP fetch was not enough to provide current measurements.

Priorities:
1. Execute now: reduce avoidable primary-feed publication lag and make measurement coverage inspectable.
2. Execute now: distinguish optional unconfigured sources and reject fabricated observation freshness.
3. Next: held-out forecast validation by province/season before promising travel windows, smoke arrival or AQI arrival. Existing adjustment and spatial interpolation are not validation.
4. Then: add licensed, credentialed regional/community feeds as separate evidence classes, with real fixtures and preserved station identity. Do not claim all of Southeast Asia is monitored.

## Changes

- Air4Thai publication is still hourly, but checks now run every 15 minutes. Four lightweight checks/hour replace one; no model/rain API cadence increased. Existing scheduler retry/park behavior remains.
- `observation_coverage` on health and source catalog: total/current/stale/invalid PM rows, newest observation, 90-minute window and snapshot timestamp. Reads only the small `latest` table, never full historical `readings`.
- Data panel says “last successful poll,” separately from time-labelled PM coverage. Missing optional credentials are explicit. Catalog now includes DustBoy as optional low-cost/community data, not reference-grade monitoring.
- Source `isConfigured` capability lets scheduler health inspect DustBoy/IMERG configuration before the first post-restart run. Old zero-row successful log entries cannot make these feeds look live. Missing-key runs don't advance lastOk; health reports null while unconfigured. Credentials are never exposed.
- DustBoy missing/invalid provider observation times are rejected. Fetch time is no longer substituted for observation time. Empty or wholly untimed payloads fail visibly. A valid token is still needed; no account was created and no private credential requested or printed.

## Verification

`test-observation-reliability.mjs` exercises actual source/scheduler behavior: ICT/UTC times, zero vs null, stale/future/invalid records, table-read constraint, polling cadence, boot hydration, missing-key skip, configured recovery, and DustBoy empty/missing-time/valid-time ingestion. Existing regional/field tests also remain in the complete suite.

Post-release measurements and deployment evidence appended after completion. Any increase in current coverage is a timestamp-window measurement at that moment, not a permanent station count or accuracy claim.

Production result: full `npm test` exited 0 (`/tmp/airdash-reliability-tests.log`). Commit `ff44f96` pushed. Activated the existing launchd service once; uptime confirmed restart. First Air4Thai run at 2026-10-15 22:51:58 ICT recovered 99 current PM readings: **42 → 141 of 175 stored locations**, 34 stale, 0 invalid. One provider latest-hour entry did not yield a usable PM reading, so provider row counts are not advertised as measured-PM coverage.

Local and public `/api/health` verify 900000 ms Air4Thai polling, observation_coverage.air4thai current 141/stale 34, and sources_unconfigured containing both DustBoy and IMERG. Weather remains parked until 2026-10-16 00:05 UTC; no quota bypass. CAMS model calls unchanged. Deploy verified 2.4.94 on both domains, selected asset bytes and digest `ac55f858b28f`.

Native Chrome production Data panel also verified “hourly reports; checked every 15 minutes,” “last successful poll,” time-stamped **141 / 175** PM coverage, and missing-key labeling. Screenshot `/tmp/airdash-observation-reliability-2.4.94.png`. Thus the result is visible to operators, not only exposed in an API.
