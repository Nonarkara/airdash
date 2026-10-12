// The first unattended offsite run failed, and nothing noticed.
//
// ops/offsite-r2.sh runs at 03:50 as com.airdash.offsite. On 2026-10-12 that
// run died on `mkdir '/.wrangler/cache'` before uploading a byte: launchd
// gives a LaunchAgent a working directory of / unless the plist declares
// WorkingDirectory, and wrangler puts its cache in process.cwd()/.wrangler.
//
// Two things were wrong, and the second is the one that mattered longer:
//
//   1. The job failed. Fixed by declaring WorkingDirectory in the plist and
//      having the script cd itself, so it is correct however it is invoked.
//
//   2. NOTHING ALERTED. The watchdog's 48-hour receipt guard covers the LOCAL
//      archive (data/.archive-receipt.json) — a file the offsite job never
//      touches. So the offsite copy could stop entirely while every health
//      number stayed green, and the only signal was a desktop notification
//      fired at 03:50, which is precisely when nobody is at the machine.
//
// The freshness guard below is executed here against synthetic logs rather
// than pattern-matched, because the properties that matter — a fresh upload
// is silent, a stale one is not, and a log that exists but never recorded a
// success is a failure, not a pass — are behavioural.
//
// Run: node scripts/test-offsite-launchd.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const repo = new URL('../', import.meta.url).pathname
const scriptSrc = readFileSync(join(repo, 'ops/offsite-r2.sh'), 'utf8')
const dogSrc = readFileSync(join(repo, 'ops/health-watchdog.sh'), 'utf8')
const plist = readFileSync(join(repo, 'ops/com.airdash.offsite.plist'), 'utf8')

// ── 1. The plist must survive losing WorkingDirectory ────────────────────
// Both layers are asserted because either alone is enough to keep the job
// working, and a future edit that removes both must fail here.
check('plist declares WorkingDirectory', /<key>WorkingDirectory<\/key>\s*<string>\/Users\/axiom\/AirDash<\/string>/.test(plist),
  'launchd sets CWD to / without this key; wrangler then fails on /.wrangler/cache')
check('offsite-r2.sh cd\'s to the repo itself', /^cd \/Users\/axiom\/AirDash \|\| fail/m.test(scriptSrc),
  'the script must be correct even if the plist key is lost again')
check('plist declares HOME and PATH explicitly', /<key>HOME<\/key>/.test(plist) && /<key>PATH<\/key>/.test(plist))

// ── 2. The freshness guard, executed ─────────────────────────────────────
// Sliced between its own banner comments: shell `if`/`fi` nesting cannot be
// located by brace balance, and a wrong slice would silently test nothing.
const start = dogSrc.indexOf('# ── Offsite R2 freshness')
const end = dogSrc.indexOf('# ── Offsite R2 cost guard')
check('the offsite freshness block is locatable in health-watchdog.sh', start !== -1 && end > start,
  'the two banner comments the slice depends on must both exist')
const block = start !== -1 && end > start ? dogSrc.slice(start, end) : ''

check('the freshness guard exists at all', block.includes('ok: uploaded'),
  'without this the offsite copy can stop silently')
// Comments are stripped first: the block deliberately NAMES the archive
// receipt, in prose, to explain why this guard does not read it. Testing the
// raw text would fail on the very comment that documents the distinction.
const blockCode = block.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
check('the freshness guard does not read the local archive receipt',
  !blockCode.includes('archive-receipt'),
  'that receipt is written by the archive job and says nothing about R2')
check('the freshness guard reads the offsite log instead',
  /WATCHDOG_OFFSITE_LOG/.test(blockCode) && /offsite\.log/.test(blockCode))

const dir = mkdtempSync(join(tmpdir(), 'offsite-launchd-'))

function runBlock(contents) {
  const logFile = join(dir, 'offsite.log')
  const out = join(dir, 'out.log')
  if (contents === null) { if (existsSync(logFile)) rmSync(logFile) } else writeFileSync(logFile, contents)
  writeFileSync(out, '')
  const harness = [
    'problems=0',
    `log() { print -r -- "$*" >> ${JSON.stringify(out)} }`,
    `WATCHDOG_OFFSITE_LOG=${JSON.stringify(logFile)}`,
    block,
    'print -r -- "PROBLEMS=$problems"',
  ].join('\n')
  const f = join(dir, 'h.zsh')
  writeFileSync(f, harness)
  const stdout = execFileSync('zsh', [f], { encoding: 'utf8' })
  const problems = Number(/PROBLEMS=(\d+)/.exec(stdout)?.[1] ?? -1)
  return { problems, log: readFileSync(out, 'utf8') }
}

// macOS date(1): -v-<n>H shifts by hours.
const stamp = (hoursAgo) => execFileSync('date', ['-v', `-${hoursAgo}H`, '+%Y-%m-%dT%H:%M:%S%z'], { encoding: 'utf8' }).trim()

const okLine = (h) => `[${stamp(h)}] ok: uploaded 165362854 bytes as daily/airdash-2026-10-12.db.gz.age\n`
const failLine = (h) => `[${stamp(h)}] FAIL: upload daily/airdash-2026-10-12.db.gz.age failed\n`

if (block) {
  const fresh = runBlock(okLine(2))
  check('a 2h-old successful upload raises no problem', fresh.problems === 0, `got ${fresh.problems}`)
  check('a fresh offsite copy is logged as ok', /offsite R2 copy fresh/.test(fresh.log))

  const edge = runBlock(okLine(26))
  check('a 26h-old upload is still inside the 30h window', edge.problems === 0, `got ${edge.problems}`)

  const stale = runBlock(okLine(31))
  check('a 31h-old upload IS a problem', stale.problems > 0, `got ${stale.problems}`)
  check('a stale offsite copy names itself STALE in the log', /STALE/.test(stale.log))

  // The exact shape of the real failure: a log that exists, records activity,
  // and contains no successful upload at all.
  const onlyFail = runBlock(failLine(4))
  check('a log containing only a FAIL raises a problem', onlyFail.problems > 0, `got ${onlyFail.problems}`)
  check('a never-successful log says so explicitly', /NO successful offsite R2 upload/.test(onlyFail.log),
    onlyFail.log.trim())

  const missing = runBlock(null)
  check('a missing offsite log raises a problem', missing.problems > 0, `got ${missing.problems}`)

  // A renamed or truncated timestamp must not read as "fresh".
  const malformed = runBlock('[not-a-timestamp] ok: uploaded 1 bytes\n')
  check('an unparseable timestamp is treated as stale, not fresh', malformed.problems > 0, `got ${malformed.problems}`)

  // A FAIL line must never be mistaken for a success.
  const mixed = runBlock(okLine(40) + failLine(1))
  check('the newest SUCCESS is what counts, not the newest line', mixed.problems > 0, `got ${mixed.problems}`)
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)