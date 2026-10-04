# Release audit 2.4.70

Recovered baseline: 1e31031. Scope: recovered backend changes, notification delivery, public API privacy/rate limiting, Pages proxy deployment and live backend activation.

Reviewed the nine recovered files. Added a shared conditional notification claim to scheduled LINE/Telegram delivery, matching immediate fan-outs. Network failures restore the subscriber's prior timestamp; Telegram 401 restores the claim without deleting or penalizing subscribers. Added real in-memory SQLite regressions covering concurrent calls and recovery, plus gradual PM2.5 escalation with corroborating observations.

Existing limitations remain: local backend availability and offsite backup are separate operational risks. Camera haze and composite risk scores are heuristics. No live citizen notification was sent as a test; delivery regressions use mocked transport.

Release verification pending.
