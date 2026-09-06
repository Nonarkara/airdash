// The freshness a reader sees must trace to a MEASUREMENT (newest obs_time),
// not to when an ingest last succeeded. Ported from FloodDash 2026-09-05.
import { newestObservationAgeMin, newestObservationAgeMinAll, parseObsTime, feedBand, FEED_STALE_MIN, FEED_ALARM_MIN } from '/Users/axiom/AirDash/public/js/feedAge.js'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

const NOW = Date.parse('2026-09-06T12:00:00+07:00')
const bkk = (m) => new Date(NOW - m * 60_000 + 7 * 3600_000).toISOString().slice(0, 16) // naive BKK-local, like the sources

check('naive obs_time is pinned to +07:00, not the browser zone', parseObsTime('2026-09-06T12:00') === NOW)
check('zoned obs_time is respected', parseObsTime('2026-09-06T05:00:00Z') === NOW)
check('reports the NEWEST reading, not oldest/average', newestObservationAgeMin([{ obs_time: bkk(240) }, { obs_time: bkk(18) }, { obs_time: bkk(600) }], NOW) === 18)
check('empty/missing feed yields null, never a fake age', newestObservationAgeMin([], NOW) === null && newestObservationAgeMin(null, NOW) === null)
check('a clock running ahead is clamped to 0, not negative', newestObservationAgeMin([{ obs_time: bkk(-30) }], NOW) === 0)
check('worst feed wins: fresh AQI + blind rain = degraded', newestObservationAgeMinAll({ aqi: [{ obs_time: bkk(20) }], rain: [{ obs_time: bkk(200) }] }, NOW) === 200)
check('healthy hourly feed is well clear of stale', feedBand(newestObservationAgeMin([{ obs_time: bkk(55) }], NOW)) === 'ok')
check(`${FEED_STALE_MIN} min is warn, ${FEED_ALARM_MIN} min is stale`, feedBand(FEED_STALE_MIN) === 'warn' && feedBand(FEED_ALARM_MIN) === 'stale')
check('unknown age is its own band, not ok', feedBand(null) === 'unknown')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
