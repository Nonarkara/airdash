// Unit tests for the archive helpers. No DB, no volume, no network.
import { parseMode, lockDecision, fmtRate, lagLine, staleHours } from '../ops/archive-lib.mjs'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

// ── mode parsing ──
check('no flag → run', parseMode(['node', 'x.mjs']) === 'run')
check('--stats', parseMode(['node', 'x.mjs', '--stats']) === 'stats')
check('--verify', parseMode(['node', 'x.mjs', '--verify']) === 'verify')
check('--stats wins over --verify when both given', parseMode(['node', 'x', '--verify', '--stats']) === 'stats')

// ── lock decisions ──
const alive42 = (pid) => pid === 42
check('no lock file → acquire', lockDecision({ existing: null, isAlive: alive42, selfPid: 1 }).action === 'acquire')
const skip = lockDecision({ existing: { pid: 42, startedAt: '2026-09-16T13:00:00Z' }, isAlive: alive42, selfPid: 1 })
check('live owner → skip', skip.action === 'skip' && skip.pid === 42 && skip.startedAt === '2026-09-16T13:00:00Z')
const stale = lockDecision({ existing: { pid: 99, startedAt: 'x' }, isAlive: alive42, selfPid: 1 })
check('dead owner → takeover', stale.action === 'takeover' && /stale/.test(stale.reason))
check('garbage pid → takeover', lockDecision({ existing: { pid: 'nope' }, isAlive: alive42, selfPid: 1 }).action === 'takeover')
check('own pid → acquire', lockDecision({ existing: { pid: 7 }, isAlive: () => true, selfPid: 7 }).action === 'acquire')

// ── formatting ──
check('fmtRate rows/min', fmtRate(30000, 60_000) === '30,000 rows in 1.0 min (30,000/min)')
check('fmtRate never divides by zero', /rows in 0\.0 min/.test(fmtRate(5, 0)))
check('lagLine behind', lagLine('flooddash', 'readings', 100, 150).endsWith('50 behind'))
check('lagLine caught up', lagLine('airdash', 'alerts', 5, 5).endsWith('caught up'))
check('lagLine tolerates null watermark', lagLine('airdash', 'events', null, 3).endsWith('3 behind'))

// ── staleness ──
check('never succeeded → null', staleHours(null, Date.now()) === null)
check('unparseable → null', staleHours('yesterday', Date.now()) === null)
check('24 h', staleHours('2026-09-15T00:00:00Z', Date.parse('2026-09-16T00:00:00Z')) === 24)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
