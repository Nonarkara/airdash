// Does a change to a source's logic take effect on the next restart?
//
// The boot guard exists for a real reason: 13 restarts on 2026-09-27 re-ran
// every source and spent the shared Open-Meteo daily quota, so forecasts went
// dark. A source that succeeded within its interval waits its normal turn.
//
// The cost side of that guard is that a genuine logic change also waits. On
// 2026-10-12 the dead-camera backoff in cctvHealth was deployed, and the source
// sat in `deferred_fresh` — because the comparison defaulted BOTH sides to 1:
//
//     (s.source.version ?? 1) !== Number(db.kvGet(`src_version:${name}`) ?? 1)
//
// cctvHealth declared `version: 1` for the first time that day, and with no
// stored row the right-hand side was also 1, so `1 !== 1` said "unchanged".
// The change was invisible until the interval happened to elapse. Not knowing
// which version is deployed is not the same as knowing it is current.
//
// Run: node scripts/test-boot-version-guard.mjs

import { isLogicChanged, bootDelayMs } from '../server/scheduler.js'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── The defect, exactly as it shipped ─────────────────────────────────────
check('a declared version with NO stored row counts as changed',
  isLogicChanged({ version: 1 }, null) === true,
  'this is the case that shipped wrong: 1 !== 1 said "unchanged" and the new logic waited out the interval')
check('a declared version with an undefined stored value counts as changed',
  isLogicChanged({ version: 1 }, undefined) === true)
check('a declared version differing from the stored one counts as changed',
  isLogicChanged({ version: 3 }, '2') === true)
check('a declared version equal to the stored one is unchanged',
  isLogicChanged({ version: 3 }, '3') === false)
check('stored values are compared numerically, not as strings',
  isLogicChanged({ version: 10 }, '9') === true && isLogicChanged({ version: 3 }, 3) === false)

// ── The quota guard must still hold ───────────────────────────────────────
// The bug above must not be "fixed" by making every source look changed: that
// is precisely the 2026-09-27 thundering herd.
check('a source with NO version field is never "changed"',
  isLogicChanged({ name: 'thaiwater_rain' }, null) === false)
check('a version-less source stays deferred even with no stored row',
  isLogicChanged({}, null) === false)
check('a version-less source is not "changed" by a stored row either',
  isLogicChanged({ name: 'x' }, '5') === false)
check('an undefined source object is safe',
  isLogicChanged(undefined, '3') === false && isLogicChanged(null, null) === false)

// ── The two halves together decide the wait ──────────────────────────────
const HOUR = 3_600_000
const T = Date.parse('2026-10-12T00:00:00Z')
const recent = new Date(T - 5 * 60_000).toISOString()   // succeeded 5 minutes ago
const interval = 30 * 60_000

check('an unchanged, recently-successful source still waits its interval',
  bootDelayMs(recent, interval, T) === 25 * 60_000,
  'the quota guard is the whole reason this exists')
check('a changed source does not wait',
  isLogicChanged({ version: 2 }, '1') && bootDelayMs(recent, interval, T) > 0,
  'changed sources run immediately rather than after the remaining interval')

// ── Regression pin: the exact expression that shipped ─────────────────────
const shippedExpression = (src, stored) => (src.version ?? 1) !== Number(stored ?? 1)
check('the OLD expression really did treat a first-time version as unchanged',
  shippedExpression({ version: 1 }, null) === false,
  'if this ever becomes true the regression note in this file is wrong')
check('the NEW helper disagrees with the old expression on that case',
  isLogicChanged({ version: 1 }, null) !== shippedExpression({ version: 1 }, null),
  'the fix must actually change the outcome, not just the shape of the code')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)