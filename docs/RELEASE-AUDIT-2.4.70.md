# Release audit 2.4.70

Recovered baseline: 1e31031. Scope: recovered backend changes, notification delivery, public API privacy/rate limiting, Pages proxy deployment and live backend activation.

Reviewed the nine recovered files. Added a shared conditional notification claim to scheduled LINE/Telegram delivery, matching immediate fan-outs. Network failures restore the subscriber's prior timestamp; Telegram 401 restores the claim without deleting or penalizing subscribers. Added real in-memory SQLite regressions covering concurrent calls and recovery, plus gradual PM2.5 escalation with corroborating observations.

Existing limitations remain: local backend availability and offsite backup are separate operational risks. Camera haze and composite risk scores are heuristics. No live citizen notification was sent as a test; delivery regressions use mocked transport.

Release verification completed:

- Full `npm test`: exit 0, 1,017 custom checks plus 14 TAP tests (1,031 total); no failure lines. Transport tests send no real subscriber messages.
- Code release b49e35c pushed to main. Pages deployment https://3cd80d61.airdash.pages.dev completed; canonical/custom HTML identity and configured asset hashes matched. Asset token 2.4.70; service-worker cache airdash-v88.
- Existing launchd backend restarted; local health returned HTTP 200, version 2.4.70 and uptime 2 seconds, proving a new process loaded the changes. Version alone is insufficient because health reads the frontend token dynamically.
- Custom-domain health, Bangkok search, and export status returned HTTP 200 with AirDash service identity. Export build status exposes only running, started_at, finished_at, ok; no error/result/file fields.
- Post-restart freshness: 20/21 sources current; cctvHealth has no first successful run yet, no recorded error, and reports unknown honestly. Overall data_ok true. This is not a claim that every upstream camera is available.

