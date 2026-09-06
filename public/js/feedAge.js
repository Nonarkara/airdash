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

// Natural cadence of each snapshot feed, in minutes (server/config.js
// intervals). A feed is "blind" only relative to its OWN rhythm: the
// 6-hourly Open-Meteo weather/forecast rows are on time at 5 h, while
// hourly PM2.5 silent for 3 h is not. Without this, a flat bar re-trips
// "stale" every ~1.5 h after each weather poll — a banner that cries wolf
// on schedule teaches people to ignore it (FloodDash 2026-09-06, dams).
export const FEED_CADENCE_MIN = {
  aqi: 60, air: 60,        // air4thai, hourly
  rain: 10,                // thaiwater_rain
  weather: 360,            // openmeteo, 6-hourly
  aqForecast: 360,         // openmeteo_aq (CAMS), 6-hourly
}
export function feedThresholds(feed) {
  const c = FEED_CADENCE_MIN[feed] ?? 60
  return { stale: Math.max(FEED_STALE_MIN, 2 * c + 30), alarm: Math.max(FEED_ALARM_MIN, 3 * c + 30) }
}

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

/** The feed that most exceeds its OWN allowance, or null when all are within
 *  cadence. `{ feed, ageMin, stale, alarm }`. */
export function staleFeed(snap, now = Date.now()) {
  if (!snap || typeof snap !== 'object') return null
  let worst = null
  for (const feed of Object.keys(FEED_CADENCE_MIN)) {
    const ageMin = newestObservationAgeMin(snap[feed], now)
    if (ageMin == null) continue
    const { stale, alarm } = feedThresholds(feed)
    const ratio = ageMin / stale
    if (ratio < 1) continue
    if (!worst || ratio > worst.ratio) worst = { feed, ageMin, stale, alarm, ratio }
  }
  return worst
}

/** Scalar for the pill: the age of the feed that is actually stale (worst by
 *  ratio), else the primary PM2.5 age. Compared against feedBand(). */
export function newestObservationAgeMinAll(snap, now = Date.now()) {
  if (!snap || typeof snap !== 'object') return null
  const s = staleFeed(snap, now)
  if (s) return s.ageMin
  return newestObservationAgeMin(snap.aqi, now) ?? newestObservationAgeMin(snap.air, now)
    ?? newestObservationAgeMin(snap.rain, now) ?? null
}

/** 'ok' | 'warn' | 'stale' | 'unknown' — the single band definition. */
export function feedBand(ageMin) {
  if (ageMin == null || !Number.isFinite(ageMin)) return 'unknown'
  if (ageMin < FEED_STALE_MIN) return 'ok'
  if (ageMin < FEED_ALARM_MIN) return 'warn'
  return 'stale'
}
