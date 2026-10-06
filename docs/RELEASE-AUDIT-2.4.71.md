# Outage integrity audit — 2.4.71

2026-10-07, Asia/Bangkok. Code commit 4dd0487.

Confirmed defect: canonical pathname-only outage mirrors also accepted query-bearing responses. A filtered series request could overwrite the canonical mirror; subsequent canonical or differently filtered requests could receive unrelated data during a backend outage.

Fix: only query-free requests can populate/consume bounded canonical mirrors. Filtered requests remain live and explicitly unavailable on outage. New namespace /__mirror_v2__ discards legacy entries whose identity cannot be trusted. Existing stale metadata and non-replay of write requests remain intact.

Regression uses isolated transport/cache: canonical write then filtered write cannot grow/overwrite cache, canonical outage fallback returns the original data, filtered outage returns 502, and legacy entries are rejected. Existing port-hijack recovery fixture updated for the namespace. Full npm test exit 0: 1,032 checks, no failure lines. No real citizen notifications sent.

Deployment verified: https://4b2a756e.airdash.pages.dev; canonical/custom HTML and configured asset hashes matched 2.4.71. Ten canonical public API reads returned HTTP 200 with AirDash identity. Bangkok mirror report confirmed all ten populated in the new namespace, ages 0–14 seconds. /api/series and /api/stations remain absent. No backend restart was needed: the functional change runs in the Pages proxy.

Operational limits remain: one live backend, no verified offsite backup/independent standby. Edge mirrors are per-colo best-effort fallback, not live redundancy. Query-bearing requests deliberately have no mirror until a bounded, identity-preserving design is justified.
