# AirDash away operations

Window: 2026-10-05 through 2026-10-12 23:59 Asia/Bangkok, ending earlier when the user returns. Governing instruction: /Users/axiom/.codex/away-operations/NOTICE.md.

Project continuation heartbeat: `airdash-away-operations`, every four hours in this chat. Shared two-hour machine checks belong to CNX. Do not duplicate ingestion, backup or watchdog schedules. Preserve services and other agents' edits; respect quotas and existing release gates.

## Initial check — 2026-10-05

- Production 2.4.70: local and public API health HTTP 200; server uptime approximately 19 hours; launchd server/tunnel running, last exit 0. Working tree clean before this note.
- Public freshness recovered from a transient warning to ok, 21/21 sources current; no source failures or last errors. No restart or forced ingestion justified.
- Archive storage available, receipt 3.3 hours old and not stale, archived through reading 16633675.
- Watchdog heartbeat 26 minutes old and not stale. Its launchd calendar runs hourly at minute 0; idle PID is expected between runs.
- Daily backup scheduled 03:17; today's completed at 03:19:56 Bangkok, mode offdevice with staging. Backup location /Volumes/Data/DBBackups/airdash is a local external volume, not an offsite copy.
- Existing application ingestion and daily knowledge indexing remain scheduled; no new model training or paid workload started.

On each continuation inspect actual health and source observations, archive receipt/storage, service jobs, backup completion and git state. Record only durable findings/actions. Stay quiet when unchanged; notify meaningful failures, completed deliverables or decisions needing input. Pause the project heartbeat at window expiry or user return.

## Check — 2026-10-05 22:30 Asia/Bangkok

Local and public health HTTP 200, 2.4.70, 21/21 sources current, no source failures. Server/tunnel remain running; hourly watchdog receipt 30 minutes old. Archive storage available and receipt 7.3 hours old, not stale; latest scheduled backup remains today's successful 03:19 run. No restart or forced provider fetch justified. Working tree was clean. Bounded alert/reliability regression audit: 23 + 23 behavioral checks passed using isolated tests, no live notification delivery. No code or schedule changes.

## Check — 2026-10-06 02:30 Asia/Bangkok

Local/public health HTTP 200, 21/21 sources current, no source failures. Server/tunnel stable; watchdog receipt 31 minutes old. Archive advanced to 16733508 (99,833 additional readings since the preceding check), receipt 0.3 hours old, external storage available. Daily backup next due 03:17; prior run completed normally. Working tree clean. Bounded audit: isolated operations-sentinel and public-export privacy checks passed (see test outputs); no live provider calls, restart, deployment or schedule changes needed.

## Check — 2026-10-06 06:30 Asia/Bangkok

Local/public health HTTP 200, 21/21 sources current, no source failures. Server/tunnel stable; watchdog 31 minutes old. Archive advanced to 16759533, receipt 1.3 hours old, external storage available. Today's scheduled backup completed at 03:19:54, offdevice/staged, compressed copy 148,660,556 bytes. Working tree clean. Bounded audit: feed-age and data-honesty tests completed successfully; no live provider fetches or notifications. No repair, restart, release or schedule change justified.

## Check — 2026-10-06 10:31 Asia/Bangkok

Local/public health HTTP 200, 2.4.70, 21/21 sources current, no failures. Server/tunnel running; watchdog 32 minutes old. Archive receipt 5.3 hours old, not stale, external storage available; today's 03:19:54 backup remains successful. Working tree clean. Bounded camera audit: camera-haze 17/17 and METAR visibility 59/59 isolated checks passed, including withheld low-light/blank/frozen/changed-view frames, distinct baseline samples, exposure-only rejection and instrument parsing. These checks do not certify live camera reachability or calibrated PM2.5 estimation. No repair, restart, forced fetch, release or schedule changes.

## Check — 2026-10-06 14:32 Asia/Bangkok

Local/public health HTTP 200, 2.4.70, 21/21 sources current, no source failures. Server/tunnel stable; watchdog 33 minutes old. Archive advanced to 16808826 (49,293 readings since the preceding check), receipt 3.4 hours old, storage available. Today's backup remains completed. Working tree clean. Bounded frontend audit: interaction and header-layout regression checks completed successfully; these are isolated behavior/CSS checks, not a new live browser width sweep. No repair, restart, provider fetch, deployment or schedule changes justified.

## Check — 2026-10-06 18:32 Asia/Bangkok

Local/public health HTTP 200, 2.4.70, all 21 sources current without failures. Server/tunnel stable; watchdog 32 minutes old. Archive advanced to 16838077, receipt 3.4 hours old and not stale; storage available, today's backup completed. Working tree clean. Bounded quota audit: 10/10 isolated breaker checks passed, covering daily-quota detection, host-scoped cooldowns, bounded duration and distinguishing ordinary rate limits. No real provider calls or live-process quota state changes. No repair, restart, deployment or schedule changes justified.

## Check — 2026-10-06 22:34 Asia/Bangkok

Local/public health HTTP 200, 2.4.70, 21/21 sources current without failures. Server/tunnel stable; watchdog 34 minutes old. Archive receipt 7.4 hours old, not stale, storage available; daily backup remains successful. Working tree clean. Bounded knowledge audit: reviewed content-hash skipping of unchanged embedded chunks and model-identity invalidation; isolated knowledge-chunking regression checks passed. Existing daily indexing retained; no embedding calls, new training workload, forced ingestion, repair or release initiated.

## Check — 2026-10-07 02:34 Asia/Bangkok

Local/public health HTTP 200, now 2.4.71 after the user-requested outage-integrity release (see RELEASE-AUDIT-2.4.71.md). All 21 sources current without failures. Server/tunnel stable; watchdog 35 minutes old. Archive advanced to 16934076, receipt 0.4 hours old, storage available. Backup next due today 03:17; yesterday's run completed normally. Working tree clean. Bounded continuation inspected the production edge-mirror diagnostic following namespace migration, without forced ingestion, fault injection or redundant regression reruns. Operational limits remain one live backend and no verified offsite recovery.

## Check — 2026-10-07 06:34 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, all 21 sources current, no failures. Server/tunnel stable; watchdog 34 minutes old. Archive advanced to 16960905, receipt 1.5 hours old, storage available. Today's backup completed 03:20:13 Bangkok, offdevice/staged, compressed copy 150,498,071 bytes. Bounded backup audit: gzip integrity check of data/backups/airdash-latest.db.gz exited 0; this verifies compressed-stream integrity, not a SQLite restore or offsite survivability. Working tree initially clean. No repair, restart, duplicate backup or deployment justified.

## Check — 2026-10-07 10:34 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, all 21 pipelines current without recorded failures. Server/tunnel stable; watchdog 35 minutes old. Archive receipt 5.5 hours old, not stale, storage available; today's backup remains completed. Public snapshot HTTP 200, marked live. Working tree initially clean. Bounded security audit: isolated webhook-auth regression completed successfully, preserving fail-closed verification before subscription writes; no production webhook or citizen messages sent. No fault repair, restart, forced ingestion, deployment or schedule changes justified.

## Check — 2026-10-07 14:34 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 34 minutes old. Archive advanced to 17015327 (54,422 readings since the prior check), receipt 3.4 hours old, storage available; today's backup completed. Working tree initially clean. Bounded inter-dashboard audit: public risk endpoint returned all 77 provinces and no null-score/non-unknown-band violations; isolated Twin API regression 26/26 passed. No provider ingestion, citizen messages, repair, restart, release or schedule changes.

## Check — 2026-10-07 18:35 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 36 minutes old. Archive advanced to 17043733, receipt 3.5 hours old, storage available; today's backup completed. Working tree initially clean. Bounded read-only audit reviewed weekly export scheduling and single-build guard: existing Sunday 02:00 host-local timer retained, with background build state; no duplicate export triggered. No repeated regression suite, provider fetch, repair, restart, deployment or schedule changes justified.

## Check — 2026-10-07 22:35 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, all 21 pipelines current without failures. Server/tunnel stable; watchdog 36 minutes old. Archive receipt 7.5 hours old, not stale, storage available; today's backup completed. Working tree initially clean. Bounded retention review confirmed hot-tier deletion is gated on receipt presence, receipt/live-id consistency and accessible external archive storage, then limited to archived IDs inside the retention window. No live deletion or duplicate retention run initiated. No repair, restart, repeated tests, release or schedule changes justified.

## Check — 2026-10-08 02:36 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 37 minutes old. Archive advanced to 17147452 (103,719 readings since the prior check), receipt 0.3 hours old, storage available. Backup next due 03:17; previous daily run completed. Working tree initially clean. Bounded scheduler review confirmed expired ingestion runs cannot overwrite replacement-run state and quota failures park rather than trigger a retry storm. No source run, test rerun, repair, restart, release or duplicate schedule initiated.

## Check — 2026-10-08 11:07 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 7 minutes old. Archive advanced to 17173706, receipt 6 hours old, not stale, storage available. Today's scheduled backup completed 03:19:14 Bangkok, compressed copy 152,470,199 bytes. Working tree initially clean. Bounded frontend recovery review confirmed SSE reconnection closes the previous socket, requests state resync after reconnect, and restores a silent connection when the page becomes visible. No fault repair, restart, repeat test suite, provider fetch, deployment or schedule changes justified.

## Check — 2026-10-08 15:08 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, all 21 pipelines current without failures. Server/tunnel stable; watchdog 8 minutes old. Archive advanced to 17264497 (90,791 readings since the prior check), receipt age rounded to 0 hours, storage available. Today's backup remains completed. Working tree initially clean. Bounded streaming review confirmed server event replay ring is limited by configured tapRingSize and disconnected clients are removed on close/write exceptions; no claim of a new slow-client load test. No fault repair, restart, regression rerun, provider fetch, release or schedule changes justified.

## Check — 2026-10-08 19:10 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 10 minutes old. Archive receipt 4.1 hours old, not stale, external storage available; today's backup completed. Working tree initially clean. Bounded camera-resource review confirmed the existing 240-camera cycle ceiling, rotating fallback batches, URL deduplication and 15-second frame-grab timeout. No camera probes or model work added. No repair, restart, repeated tests, release or schedule changes justified.

## Check — 2026-10-08 23:10 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 11 minutes old. Archive receipt 8.1 hours old, not stale, external storage available; today's backup completed. Working tree initially clean. Bounded rate-limit review confirmed per-route/per-client buckets reset at window expiry and stale entries are swept every five minutes with an unreferenced timer. This is source review, not distributed traffic/load certification. No repair, restart, repeated tests, new provider calls, deployment or schedule changes justified.

## Check — 2026-10-09 03:11 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, data_ok true; 20/21 source status current after one twin_flood timeout at 03:04. A single diagnostic GET to the local FloodDash twin returned HTTP 200, correct identity, 77 provinces and a current update timestamp. Leave the existing scheduler's bounded backoff to recover; no forced ingest or service restart justified. Server/tunnel stable; watchdog 14 minutes old. Archive advanced to 17365275, receipt 0.9 hours old, external storage available. Last completed backup is October 8 03:19; today's 03:17 job is not yet due. Working tree initially clean. Bounded scheduler review confirmed transient failures schedule exponential backoff and successful runs reset failure state. No deployment, provider/model calls or schedule changes.

## Check — 2026-10-09 07:11 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures; the prior twin_flood timeout recovered through normal scheduling (latest successful ingest 07:03, 77 provinces). Server/tunnel stable; watchdog 12 minutes old. Archive advanced to 17391701, receipt 2 hours old, external storage available. Today's backup completed 03:19:35, compressed copy 154209670 bytes. Working tree initially clean. Bounded fetch-policy review confirmed per-attempt abort deadlines, at most three retries, capped Retry-After waits and terminal daily-quota exhaustion handling. No repair, restart, repeated tests, extra provider calls, deployment or schedule changes justified.

## Check — 2026-10-09 11:11 Asia/Bangkok

Local/public health HTTP 200, 2.4.71, 21/21 pipelines current without failures. Server/tunnel stable; watchdog 13 minutes old. Archive advanced to 17447197, receipt 0.1 hours old, external storage available; today's backup completed 03:19:35. Working tree initially clean. Bounded process-lifecycle review confirmed fatal exceptions/rejections exit for launchd recovery. Signal handling calls server.close then exits immediately; this is crash-only operation, not a verified graceful drain of in-flight requests. No observed service fault or restart justified; no deployment, repeated tests, extra provider calls or schedule changes.
