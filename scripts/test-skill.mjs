// Skill scorers (server/skill.js) — pure, on synthetic ledgers.
import { scoreForecast, scoreHistory, EVENT_UG, WATCH_UG } from '../server/skill.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`) }

// ── forecast ──
{
  const events = new Set(['50|2026-09-10', '50|2026-09-11', '10|2026-09-12'])
  const forecasts = [
    { province_code: '50', issued_day: '2026-09-09', target_day: '2026-09-10', value: 30 }, // hit
    { province_code: '50', issued_day: '2026-09-10', target_day: '2026-09-11', value: 12 }, // miss
    { province_code: '10', issued_day: '2026-09-11', target_day: '2026-09-12', value: 26 }, // hit
    { province_code: '10', issued_day: '2026-09-12', target_day: '2026-09-13', value: 40 }, // false alarm
    { province_code: '20', issued_day: '2026-09-12', target_day: '2026-09-13', value: 5 },  // correct negative
    { province_code: '20', issued_day: '2026-09-12', target_day: '2026-09-13', value: 'x' }, // ignored
  ]
  const s = scoreForecast(events, forecasts)
  check('counts: 2 hits, 1 miss, 1 false alarm, 1 correct negative', s.hits === 2 && s.misses === 1 && s.false_alarms === 1 && s.correct_negatives === 1, JSON.stringify(s))
  check('POD 66.7 %, FAR 33.3 %', s.pod_pct === 66.7 && s.far_pct === 33.3)
  check('thresholds published', s.threshold_ug === WATCH_UG && s.event_ug === EVENT_UG)
  check('fewer than 5 events → not measurable, rates still reported', s.measurable === false && s.pod_pct !== null)
  const none = scoreForecast(new Set(), forecasts)
  check('no events → POD null, never 0 or 100', none.pod_pct === null && none.events === 0)
  const multi = scoreForecast(events, [...forecasts, { province_code: '50', issued_day: '2026-09-09', target_day: '2026-09-10', value: 5 }])
  check('several issues for one target day: the max counts (alarm stands)', multi.hits === 2)
}

// ── score history ──
{
  const H = (hour, code, band) => ({ hour, province_code: code, band })
  const history = [
    H('2026-09-20T00:00', '50', 'watch'),    // crossing at 06:00 → hit
    H('2026-09-20T00:00', '10', 'normal'),   // crossing at 12:00 → miss
    H('2026-09-20T00:00', '20', 'elevated'), // no crossing → false alarm
    H('2026-09-20T00:00', '30', 'normal'),   // nothing → correct negative
    H('2026-09-18T00:00', '50', 'watch'),    // crossing 2 days later → outside 24 h → false alarm
    H('2026-09-20T00:00', '40', 'high'),     // only a 916 fault reading → not an event → false alarm
  ]
  const truth = [
    { province_code: '50', hour: '2026-09-20T06:00', max_pm25: 40 },
    { province_code: '10', hour: '2026-09-20T12:00', max_pm25: 38 },
    { province_code: '40', hour: '2026-09-20T03:00', max_pm25: 916 },
  ]
  const s = scoreHistory(history, truth)
  check('history: 1 hit, 1 miss, 3 false alarms, 1 correct negative', s.hits === 1 && s.misses === 1 && s.false_alarms === 3 && s.correct_negatives === 1, JSON.stringify(s))
  check('a lone 916 µg/m³ reading is a fault, not an event', !s.events || s.events === 2)
  check('not measurable with 6 province-hours', s.measurable === false)
  const strict = scoreHistory(history, truth, { bandAtLeast: 'elevated' })
  check('band threshold is configurable', strict.hits === 0 && strict.misses === 2)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
