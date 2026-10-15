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

// ── The PATH trap that made every reading empty ──────────────────────────
// The saturation checks above run against a STUBBED host_starved, which proves
// the alerting behaviour but says nothing about whether the real one can read
// the machine. It could not. These lift the real functions out so they can be
// run under the real launchd PATH.
function extractFns() {
  const from = dog.indexOf('SYSCTL=/usr/sbin/sysctl')
  if (from === -1) return null
  // through the end of starve_detail()
  const endMarker = 'starve_detail() {'
  const s = dog.indexOf(endMarker, from)
  if (s === -1) return null
  const close = dog.indexOf('\n}', s)
  if (close === -1) return null
  // No log() stub here on purpose: a no-op one defined BEFORE the real block
  // would shadow the harness log() and swallow every warning the test asserts on.
  return dog.slice(from, close + 2)
}

const fns = extractFns()
check('host_starved/starve_detail are extractable from health-watchdog.sh', fns !== null)

if (fns) {
  const probe = (PATH_VALUE) => {
    const file = join(dir, 'probe.zsh')
    // host_starved FIRST: it is what populates the page-in rate that
    // starve_detail then reports. The other order prints "page-in ?p/s" and
    // the reading under test is not the one being asserted on.
    writeFileSync(file, [
      `log() { print -r -- "LOG: $*" }`,
      fns,
      'if host_starved; then print -r -- "STARVED=yes"; else print -r -- "STARVED=no"; fi',
      `print -r -- "DETAIL=$(starve_detail)"`,
    ].join('\n'))
    try {
      return execFileSync('zsh', [file], {
        encoding: 'utf8',
        env: { PATH: PATH_VALUE },
        stdio: 'pipe',
      })
    } catch (e) {
      return `ERROR ${e.message}`
    }
  }

  // Exactly what com.airdash.watchdog.plist sets.
  const LAUNCHD_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
  const out = probe(LAUNCHD_PATH)
  // The detail reports load, the page-in rate and swap — swap for CONTEXT only,
  // since a percentage of swap on macOS measures cold pages, not pressure.
  check('starve_detail reads real values under the launchd PATH',
    /DETAIL=load [\d.]+ \(limit \d+\), page-in \d+p\/s/.test(out), out.trim().replace(/\n/g, ' | '))
  check('the detail is NOT the empty "swap , load " failure',
    !/DETAIL=swap ,/.test(out) && !/DETAIL= ,/.test(out), out.trim().replace(/\n/g, ' | '))
  check('host_starved returns a verdict rather than erroring',
    /STARVED=(yes|no)/.test(out), out.trim().replace(/\n/g, ' | '))

  // And prove the trap: with sysctl NOT on PATH and no absolute path used,
  // the old form really does produce nothing. If this ever stops failing, the
  // regression note above is wrong.
  const naive = (() => {
    const file = join(dir, 'naive.zsh')
    writeFileSync(file, `print -r -- "swap $(sysctl -n vm.swapusage 2>/dev/null | awk '{print $6}')"`)
    try { return execFileSync('zsh', [file], { encoding: 'utf8', env: { PATH: LAUNCHD_PATH }, stdio: 'pipe' }).trim() }
    catch { return '' }
  })()
  check('a bare `sysctl` under that PATH really is empty (the original bug)',
    naive === '' || !/\d/.test(naive), `got "${naive}"`)

  // The verdict must follow the two signals it is defined on — CPU load and a
  // SUSTAINED page-in rate — and must NOT follow the swap percentage. Asserting
  // against the observed reading rather than a fixed expectation, because this
  // host's paging rate moves by an order of magnitude minute to minute and a
  // test pinned to a number would fail for reasons that have nothing to do with
  // the code. What must hold is the rule: starved iff (load >= limit) or
  // (every sampled page-in window was at or over the limit).
  const detail = /DETAIL=(.*)/.exec(out)?.[1] ?? ''
  const load = Number(/load ([\d.]+)/.exec(detail)?.[1] ?? NaN)
  const limit = Number(/limit (\d+)/.exec(detail)?.[1] ?? NaN)
  const rate = Number(/page-in (\d+)p\/s/.exec(detail)?.[1] ?? NaN)
  check('the reported load and limits are numeric',
    Number.isFinite(load) && Number.isFinite(limit) && Number.isFinite(rate),
    `load=${load} limit=${limit} rate=${rate} from "${detail}"`)
  if (Number.isFinite(load) && Number.isFinite(rate)) {
    const expected = load >= limit || rate >= 400
    check('the verdict follows load-or-page-rate, never the swap percentage',
      /STARVED=(yes|no)/.test(out) && (out.includes('STARVED=yes')) === expected,
      `load=${load} (limit ${limit}) rate=${rate} -> ${out.includes('STARVED=yes') ? 'starved' : 'ok'}`)
  }
}

// ── The decision logic, driven with STUBBED readings ─────────────────────
// Everything above about the real host is observational. These pin the actual
// rule, because the properties that matter — that the swap PERCENTAGE is not a
// trigger, that BOTH sampling windows must be elevated, that an unreadable
// reading is announced rather than treated as healthy — never fire on a
// machine that happens to be well behaved, which is exactly why the earlier
// version of this file let three mutations through unchallenged.
function logic(loadValue, pageinSeries, extraLoad2 = loadValue) {
  const file = join(dir, 'logic.zsh')
  // host_starved reads pageins FOUR times for two windows (a,b then a,b), so
  // the stub must advance through the series on each call — returning the same
  // number every time makes every delta zero and every scenario look calm.
  const arr = pageinSeries.join(' ')
  writeFileSync(file, [
    `log() { print -r -- "LOG: $*" >> "$LOGF" }`,
    fns,
    'sleep() { : }',                       // no real sampling delay in a test
    `_pi=(${arr})`,
    // Cursor starts at 0; _pageins bumps BEFORE printing, so the first read
    // returns element 1. zsh runs $(...) in a SUBSHELL, so a plain variable
    // incremented inside this stub would be discarded and every read would
    // return the same element — making every delta zero and every scenario look
    // calm. The cursor lives in a file to survive the fork. (The real _pageins
    // shells out to vm_stat, so it has no such problem.)
    'print -r -- 0 > "$PIFILE"',
    '_pageins() { local i=$(cat "$PIFILE"); i=$(( i + 1 )); print -r -- $i > "$PIFILE"; print -r -- ${_pi[i]}; }',
    `_sysctl() {`,
    `  [ "$1" = vm.loadavg ] && { [ -n "${loadValue}" ] && print -r -- "{ ${loadValue} ${extraLoad2} ${extraLoad2} }"; return 0; }`,
    '  [ "$1" = vm.swapusage ] && print -r -- "total = 14336.00M  used = 13990.56M  free = 345.44M  (encrypted)" && return 0',
    '  [ "$1" = hw.ncpu ] && print -r -- 8 && return 0',
    '  return 0',
    '}',
    'if host_starved; then print -r -- "V=starved"; else print -r -- "V=ok"; fi',
  ].join('\n'))
  try {
    const out = execFileSync('zsh', [file], {
      encoding: 'utf8',
      env: { LOGF: join(dir, 'logic.log'), PIFILE: join(dir, 'pi.cursor'), PATH: process.env.PATH },
      stdio: 'pipe',
    })
    let log = ''
    try { log = readFileSync(join(dir, 'logic.log'), 'utf8') } catch {}
    return { verdict: /V=(starved|ok)/.exec(out)?.[1], log }
  } catch (e) {
    return { verdict: 'ERROR', log: String(e.stderr ?? '') }
  }
}

if (fns) {
  try { rmSync(join(dir, 'logic.log')) } catch {}

  // swap is stubbed at 97.6% used throughout, so ANY verdict of "ok" here
  // proves the percentage is not being used as a trigger. Rates below are
  // (delta / 6 s); 3000 pageins over 6 s = 500/s, comfortably over 400.
  const calm = logic(3, ['0', '60', '60', '60'])
  check('97.6% swap alone does NOT count as starved',
    calm.verdict === 'ok', `got ${calm.verdict}`)

  const cpuBound = logic(40, ['0', '0', '0', '0'])
  check('load at 5x core count is starved without sampling windows',
    cpuBound.verdict === 'starved', `got ${cpuBound.verdict}`)

  const bothHigh = logic(3, ['0', '3000', '3000', '6000'])
  check('every page-in window over the limit is starved',
    bothHigh.verdict === 'starved', `got ${bothHigh.verdict}`)

  const firstHighOnly = logic(3, ['0', '3000', '3000', '3000'])
  check('one elevated window is NOT enough (high then calm)',
    firstHighOnly.verdict === 'ok', `got ${firstHighOnly.verdict}`)

  const secondHighOnly = logic(3, ['0', '100', '100', '3100'])
  check('one elevated window is NOT enough (calm then high)',
    secondHighOnly.verdict === 'ok', `got ${secondHighOnly.verdict}`)

  const unreadable = logic('', ['0', '0', '0', '0'])
  check('an unreadable load is announced, not silently treated as healthy',
    /could not read vm\.loadavg/.test(unreadable.log),
    `log was "${String(unreadable.log).trim()}"`)
  check('an unreadable load does not declare starvation it cannot prove',
    unreadable.verdict === 'ok', `got ${unreadable.verdict}`)
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)