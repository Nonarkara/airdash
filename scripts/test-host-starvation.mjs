// Sustained host saturation was invisible.
//
// host_starved() has existed for a long time, but until 2026-10-12 it was
// consulted for exactly one thing: deciding whether to SUPPRESS a restart. It
// could tell a starved host apart from a dead one, and then said nothing about
// it. This watchdog logged "check complete — 0 unresolved problem(s)" on an
// hour when the machine was at load average 82–141 on 8 cores with 87 % of its
// swap in use and /api/ping was taking 21 seconds.
//
// Nothing the watchdog could do about it — a restart would not have helped,
// and suppressing one is the correct action. But "nothing we can do" is not the
// same as "nothing to say": the operator is the only one who can notice a host
// that is slowly being ground down, and nothing else in the system reports it.
//
// The guard requires two consecutive checks, so a legitimate one-off spike (the
// nightly backup compressing a 1.2 GB database, an npm install) does not page
// anyone, and it notifies once a day, because a host that stays saturated is a
// sustained condition and hourly repeats would be noise.
//
// The block is lifted out of health-watchdog.sh and executed against a
// controllable host_starved(), because what is being tested is behaviour over
// time — one check vs two, alerting vs staying quiet, recovery resetting the
// streak — and none of that is visible in the shape of the code.
//
// Run: node scripts/test-host-starvation.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const dog = readFileSync(new URL('../ops/health-watchdog.sh', import.meta.url), 'utf8')

// Slice between the block's banner and the next section banner. Shell if/fi
// nesting cannot be located by brace balance.
const start = dog.indexOf('# ── Host saturation')
const end = dog.indexOf('# ── 5. LLM chat API')
check('the host-saturation block is locatable in health-watchdog.sh', start !== -1 && end > start,
  'the two banner comments this slice depends on must both exist')
const block = start !== -1 && end > start ? dog.slice(start, end) : ''

check('the block exists at all', block.length > 0)
check('it reuses the existing host_starved predicate', /host_starved/.test(block),
  'a second, subtly different saturation test would drift from the one that guards restarts')
check('it reports what is saturated', /starve_detail/.test(block))

const dir = mkdtempSync(join(tmpdir(), 'starve-'))

/** Run the block once with host_starved forced to `starved`. */
function runOnce(starved) {
  const harness = [
    'log() { print -r -- "LOG: $*" >> "$LOGF" }',
    'notify() { print -r -- "NOTIFY: $*" >> "$LOGF" }',
    'starve_detail() { print -r -- "swap 6000M/7168M, load 40.00" }',
    `host_starved() { ${starved ? 'return 0' : 'return 1'} }`,
    block,
  ].join('\n')
  const f = join(dir, 'h.zsh')
  writeFileSync(f, harness)
  execFileSync('zsh', [f], {
    encoding: 'utf8',
    env: { ...process.env, STATE_DIR: dir, LOGF: join(dir, 'out.log'), PATH: process.env.PATH },
  })
}
const readOut = () => { try { return readFileSync(join(dir, 'out.log'), 'utf8') } catch { return '' } }
const reset = () => { try { rmSync(join(dir, 'out.log')) } catch {} ; try { rmSync(join(dir, '.watchdog-starve-count')) } catch {}; try { rmSync(join(dir, '.watchdog-starve-notify')) } catch {} }

if (block) {
  reset()
  runOnce(true)
  const first = readOut()
  check('a single saturated check does NOT alert', !/NOTIFY/.test(first), first.trim())
  check('a single saturated check says why it is holding off', /first consecutive check/.test(first), first.trim())

  runOnce(true)
  const second = readOut()
  check('a SECOND consecutive saturated check alerts', /NOTIFY/.test(second), second.trim())
  check('the alert names the load', /load 40\.00/.test(second), second.trim())
  check('the alert says a restart will not help', /Restarting will not help/.test(second))

  runOnce(true)
  const third = readOut()
  const notifies = (s) => (s.match(/NOTIFY:/g) || []).length
  check('it does not re-alert every hour on the same day', notifies(third) === 1,
    `got ${notifies(third)} notifications after three saturated checks`)
  check('but it keeps logging the condition', /warn: host saturated/.test(third))

  // Recovery must clear the STREAK, so a new incident has to earn its alert
  // again rather than firing instantly on its first check. It does NOT re-alert
  // on the same calendar day: the once-a-day cap is deliberate, so the second
  // incident waits for tomorrow. Asserting a second same-day notification would
  // be asserting against the design.
  runOnce(false)
  const recovered = readOut()
  check('an unsaturated host logs ok', /ok: host not saturated/.test(recovered), recovered.trim())

  writeFileSync(join(dir, 'out.log'), '')
  runOnce(true)
  const newFirst = readOut()
  check('after recovery the streak resets (first check holds off again)',
    /first consecutive check/.test(newFirst) && !/NOTIFY/.test(newFirst), newFirst.trim())

  runOnce(true)
  const newSecond = readOut()
  check('the new incident does reach the alert path (warn logged)', /warn: host saturated/.test(newSecond), newSecond.trim())
  check('but the once-a-day cap keeps a same-day repeat quiet',
    notifies(newSecond) === 0,
    `got ${notifies(newSecond)} notifications; the daily cap is deliberate`)

  // And a host that was never saturated must be silent.
  reset()
  runOnce(false)
  runOnce(false)
  const quiet = readOut()
  check('a healthy host never notifies', !/NOTIFY/.test(quiet), quiet.trim())
  check('a healthy host is logged as ok', /ok: host not saturated/.test(quiet))
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)