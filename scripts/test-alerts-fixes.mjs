// Scratch test for the alert-engine fixes (P1). In-memory DB, no network.
import { openDb } from '/Users/axiom/AirDash/server/db.js'
import { createAlerts } from '/Users/axiom/AirDash/server/alerts.js'

const db = openDb(':memory:')
const bus = { publish() {} }
const alerts = createAlerts(db, bus, {})

const st = (key, code) => ({
  station_key: key, name_th: `สถานี${key}`, name_en: `Station ${key}`,
  province_th: 'จังหวัดทดสอบ', province_en: 'Test Province', province_code: code,
})
const now = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19)
const hoursAgo = (h) => new Date(Date.now() + 7 * 3600_000 - h * 3600_000).toISOString().slice(0, 19)

function addReading(source, key, metric, value, obsTime) {
  db.insertReading({ source, station_key: key, metric, value, obs_time: obsTime, fetched_at: now })
}
function register(key, code) {
  const s = st(key, code)
  db.upsertStation({ source: 'air4thai', ...s, now })
  return s
}

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

// ── 1. Severity-aware cooldown (direct raise(), isolated from corroboration) ──
{
  const s = register('sev1', '20')
  const base = { rule: 'pm25_level', source: 'air4thai', station: s, metric: 'pm25', message_th: 'x', message_en: 'x' }
  check('sev-2 raise fires', alerts.raise({ ...base, value: 40, prev: 20, severity: 2 }) === true)
  check('same-severity raise inside cooldown suppressed', alerts.raise({ ...base, value: 50, prev: 30, severity: 2 }) === false)
  check('sev-3 escalation bypasses cooldown', alerts.raise({ ...base, value: 160, prev: 30, severity: 3 }) === true)
  check('lower severity after sev-3 still respects cooldown', alerts.raise({ ...base, value: 45, prev: 30, severity: 2 }) === false)
}

// ── 2. Sev-3 spike suppression (Chonburi 33t incident replay, isolated province) ──
{
  const glitch = register('33t', '80')
  register('calm1', '80')
  register('calm2', '80')
  // Province baseline: neighbours steady ~12 over 6h (median delta ≈ 0)
  addReading('air4thai', 'calm1', 'pm25', 12, hoursAgo(6))
  addReading('air4thai', 'calm1', 'pm25', 13, now)
  addReading('air4thai', 'calm2', 'pm25', 11, hoursAgo(6))
  addReading('air4thai', 'calm2', 'pm25', 12, now)
  addReading('air4thai', '33t', 'pm25', 10.0, hoursAgo(1))
  addReading('air4thai', '33t', 'pm25', 426.1, now)
  const r = alerts.considerReading({ source: 'air4thai', station: glitch, metric: 'pm25', value: 426.1, prev: 10.0 })
  check('uncorroborated 10→426 spike does NOT alert', r === false)
  const dq = db.get(`SELECT severity, rule FROM alerts WHERE station_key = '33t' AND rule = 'pm25_spike_suppressed'`)
  check('suppression recorded as sev-0 pm25_spike_suppressed', dq?.severity === 0)
}

// ── 3. Sev-3 with neighbour corroboration DOES alert ──
{
  const hot1 = register('hot1', '90')
  register('hot2', '90')
  addReading('air4thai', 'hot2', 'pm25', 90, now) // neighbour already ≥75
  addReading('air4thai', 'hot1', 'pm25', 20, hoursAgo(1))
  addReading('air4thai', 'hot1', 'pm25', 120, now)
  const r = alerts.considerReading({ source: 'air4thai', station: hot1, metric: 'pm25', value: 120, prev: 20 })
  check('sev-3 corroborated by neighbour raises', r === true)
}

// ── 4. All-clear after a REAL danger alert: 60 → 30 → 22 → 20 ──
{
  const s = register('clear1', '10')
  // Danger first: 20 → 60 crossing (sev 2; rise 40 < 60 so no spike gate anyway)
  addReading('air4thai', 'clear1', 'pm25', 60, hoursAgo(4))
  const r0 = alerts.considerReading({ source: 'air4thai', station: s, metric: 'pm25', value: 60, prev: 20 })
  check('danger crossing fires first', r0 === true)
  // Gradual decline; everything inside the last 2h is below 25
  addReading('air4thai', 'clear1', 'pm25', 30, hoursAgo(3))
  addReading('air4thai', 'clear1', 'pm25', 22, hoursAgo(1))
  addReading('air4thai', 'clear1', 'pm25', 20, now)
  const r = alerts.considerReading({ source: 'air4thai', station: s, metric: 'pm25', value: 20, prev: 22 })
  check('sustained drop below 25 after danger alert fires all_clear', r === true)
  const row = db.get(`SELECT rule, severity FROM alerts WHERE station_key = 'clear1' AND rule = 'pm25_all_clear'`)
  check('all-clear row has rule pm25_all_clear sev 1', row?.rule === 'pm25_all_clear' && row?.severity === 1)
  // Immediate re-fire blocked by 12h cooldown
  addReading('air4thai', 'clear1', 'pm25', 19, now)
  const r2 = alerts.considerReading({ source: 'air4thai', station: s, metric: 'pm25', value: 19, prev: 20 })
  check('all-clear repeat within 12h suppressed', r2 === false)
}

// ── 5. No all-clear when no danger alert was ever sent (glitch tail) ──
{
  const s = register('flap1', '11')
  addReading('air4thai', 'flap1', 'pm25', 426, hoursAgo(3))
  addReading('air4thai', 'flap1', 'pm25', 10, hoursAgo(1))
  addReading('air4thai', 'flap1', 'pm25', 9, now)
  const r = alerts.considerReading({ source: 'air4thai', station: s, metric: 'pm25', value: 9, prev: 10 })
  check('all-clear NOT fired without a prior danger alert', r === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
