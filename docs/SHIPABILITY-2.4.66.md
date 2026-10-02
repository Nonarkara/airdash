# Shipability audit — 2.4.66

Verified 2026-10-02. Release implementation: `1e087e4`; service-worker cache
`airdash-v84`. Both https://air.nonarkara.org and https://airdash.pages.dev
serve 2.4.66; deployment verified HTML routing and critical asset contents.

The release passes the checks below. Disaster recovery remains incomplete:
there is one live backend, and the external archive and backups remain at the
same site. This is a release verification, not clinical validation, proof of
uninterrupted availability or evidence of superiority over other products.

## Blockers repaired

1. Air Story's science failure path previously substituted sample PM, mortality,
   health and economic values. It now keeps those readings unknown, uses a
   neutral band, suppresses dependent personal estimates and retries. An explicit
   unavailable province cannot inherit national PM. Missing stagnation readings
   no longer count as zero risk in the national average.
2. Hot-tier pruning previously accepted an archive receipt even if the archive
   drive had disappeared. It now probes the archive file and external filesystem
   before deleting rows; unavailable storage leaves every hot-tier row intact.
   This verifies presence and device identity, not archive integrity. Ordinary
   retention with hourly aggregation remains separate.

## Verification

| Check | Result |
| --- | --- |
| Full automated suite | 899 custom checks in 38 scripts + 14 Node TAP tests = 913 passed; no failures |
| Public read API sweep | 56 endpoints returned HTTP 200; five fractional-limit requests also returned 200 |
| Current risk invariants | 77 provinces; zero missing-PM rows with numeric danger; zero scores below the measured PM floor |
| Local header gate | English, 19 widths, rendered numeric score and verdict; passed |
| Public header gates | Thai and English, 19 widths each; rendered live score and verdict, no geometry failures |
| Public browser routes | `/`, `/ops`, `/install`; eight widths from 320 to 1440; no overflow, JavaScript errors, failed same-origin requests, duplicate IDs or unnamed visible controls |
| Science outage and recovery | Local and public fault injection; unknown readings, no personal estimates without science data, no invented wind state; automatic return to measured data |
| Service-worker offline test | v84 shell loaded offline, danger remained unknown, no API responses in caches |
| Inference | Fresh capability probe confirmed chat and embeddings; actual chat returned HTTP 200 and a completed stream without fallback |
| Mutation proof | Isolated copies reintroduced sample PM and bypassed the archive gate; both regression tests failed as required |
| Archive | Health reported a present archive on a distinct external device and a non-stale receipt |

A post-restart inference probe initially timed out. A subsequent capability
probe and real chat both succeeded; the live backend then reported both
capabilities available. Factual fallback remains covered by behavioral tests.

Browser sampling measured LCP approximately 0.48 seconds for the story,
3.04 seconds for operations and 0.42 seconds for install; corresponding CLS
was 0.087, 0.044 and 0.005. These are single local-browser samples, not field
Core Web Vitals or an INP assessment. Operations loading still merits tuning.

## Remaining shipability limits

- No configured offsite recovery destination; machine/site loss can remove the
  live database, archive and backups together. No second live backend exists.
- Camera haze scores are relative visual heuristics, not PM concentrations.
  METAR visibility is an airport observation. Danger Score is a composite,
  not a clinical index; visible labels state these distinctions.
- The archive presence probe does not establish integrity or continuing
  availability throughout an entire prune job. Restore and integrity checks
  are separate from this release's availability gate.

## Reproduce

Run `npm test`. Optional real-browser checks require installed Playwright and
Chrome; `PLAYWRIGHT_PATH` can override module discovery:

```sh
QA_URL=https://air.nonarkara.org/ops QA_LANG=th node scripts/header-width-gate.mjs
QA_URL=https://air.nonarkara.org/ops QA_LANG=en node scripts/header-width-gate.mjs
QA_URL=https://air.nonarkara.org node scripts/test-story-outage-live.mjs
```

Deployment uses `npm run deploy`; it verifies canonical contents before probing
versioned custom-domain assets. Never certify a header sweep that measured
placeholders: the gate exits 2 when it cannot measure rendered data.
