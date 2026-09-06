// Feed liveness — one definition, used by the freshness pill and the ticker.
//
// Ported from FloodDash (2026-09-05 postmortem) on 2026-09-06. The pill here
// used to answer "when did an ingest last SUCCEED?" (max source.lastOk).
// That is transport liveness. It stays green while the backend keeps
// polling an upstream that has stopped publishing new readings — the
// dashboard then says LIVE over PM2.5 values hours old. Any surface that
// claims currency must derive it from the newest OBSERVATION.
//
// Pure on purpose: no DOM, no store, testable in node
// (scripts/test-feed-age.mjs), and it cannot drift between its callers.

// Air4Thai publishes hourly; a healthy snapshot's newest reading sits
// ~10–70 min old. 90 min = at least one full missed hour beyond the normal
// lag, never a single hiccup. 180 min = the feed is broken.
export const FEED_STALE_MIN = 90
export const FEED_ALARM_MIN = 180

// Sources stamp obs_time as naive Bangkok-local "YYYY-MM-DDTHH:MM". A naive
// ISO string parses as the BROWSER's local zone, which is only right for a
// reader in Thailand. Pin it to +07:00 so the age is correct everywhere.
export function parseObsTime(s) {
  if (typeof s !== 'string' || !s) return NaN
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s)
  return Date.parse(hasZone ? s : `${s}${s.length === 16 ? ':00' : ''}+07:00`)
}

/** Minutes since the newest reading in one feed array; null when none parse.
 *  Never negative — a station clock ahead of the browser is a sensor fault,
 *  not evidence of freshness. */
export function newestObservationAgeMin(items, now = Date.now()) {
  if (!Array.isArray(items) || items.length === 0) return null
  let newest = 0
  for (const it of items) {
    const t = parseObsTime(it?.obs_time)
    if (Number.isFinite(t) && t > newest) newest = t
  }
  if (!newest) return null
  return Math.max(0, Math.round((now - newest) / 60_000))
}

/** Minutes since the newest reading across ALL feeds — the WORST feed wins.
 *  If any feed is blind, the system is degraded. null when nothing parses. */
export function newestObservationAgeMinAll(snap, now = Date.now()) {
  if (!snap || typeof snap !== 'object') return null
  let worst = null
  for (const k of ['aqi', 'air', 'rain', 'weather']) {
    const age = newestObservationAgeMin(snap[k], now)
    if (age == null) continue
    if (worst == null || age > worst) worst = age
  }
  return worst
}

/** 'ok' | 'warn' | 'stale' | 'unknown' — the single band definition. */
export function feedBand(ageMin) {
  if (ageMin == null || !Number.isFinite(ageMin)) return 'unknown'
  if (ageMin < FEED_STALE_MIN) return 'ok'
  if (ageMin < FEED_ALARM_MIN) return 'warn'
  return 'stale'
}
