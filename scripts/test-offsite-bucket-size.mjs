// The R2 cost guard's input, and why it read zero.
//
// ops/offsite-r2.sh uploads the nightly encrypted database and then records
// the bucket size in logs/.r2-bucket-bytes; ops/health-watchdog.sh alerts when
// that file exceeds 9 GB against Cloudflare's 10 GB free tier.
//
// On the first run — 2026-10-11, bucket created 17:24:54 local — the script
// pushed a 159 MB object at 17:27:24 and queried bucket_size at 17:27:26. R2
// answered "0 B". The guard faithfully recorded 0, and so a cost guard was
// watching a bucket that already held 159 MB, reporting no growth, forever.
//
// The fix is ordering: read the size BEFORE uploading. R2's bucket_size is
// eventually consistent, so a query issued in the same second as the PUT is
// measuring propagation, not storage.
//
// The second property matters as much: an unreadable size must NOT overwrite
// the last good reading. A wrangler upgrade that changes the field name would
// otherwise silently reset the guard to zero — the exact failure this whole
// exercise is about, arriving by a different route.
//
// Run: node scripts/test-offsite-bucket-size.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync as read } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const src = readFileSync(new URL('../ops/offsite-r2.sh', import.meta.url), 'utf8')

// ── The ordering property, asserted on the source ─────────────────────────
// A size query after the upload is the bug. This fails if anyone moves the
// call back below the `put` lines.
const qIdx = src.indexOf('record_bucket_size\nput ')
const fnIdx = src.indexOf('record_bucket_size()')
const lastPutIdx = src.lastIndexOf('put "monthly/')
check('record_bucket_size is defined', fnIdx !== -1)
check('the bucket size is read BEFORE any upload', qIdx !== -1,
  'expected a `record_bucket_size` call immediately before the first `put`; querying after the PUT races R2 propagation')
check('no bucket-size query survives after the upload block',
  !/^info=\$\(wrangler r2 bucket info/m.test(src),
  'the old same-second query must be gone, not merely superseded')

// ── The behaviour, executed ───────────────────────────────────────────────
// zsh function syntax (`name() {`) rather than `function name(`, so the lift
// accepts both forms.
function extract(name) {
  const m = new RegExp(`^(?:function\\s+)?${name}\\s*\\(\\s*\\)\\s*\\{`, 'm').exec(src)
  if (!m) return null
  let i = m.index + m[0].length - 1
  let depth = 0
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(m.index, i + 1)
    }
  }
  return null
}

const fn = extract('record_bucket_size')
check('record_bucket_size lifts out of the script', fn !== null)

const dir = mkdtempSync(join(tmpdir(), 'offsite-test-'))

function runWith(bucketInfoOutput, seedState = null) {
  const state = join(dir, 'state')
  const log = join(dir, 'log')
  if (seedState !== null) writeFileSync(state, seedState)
  else if (existsSync(state)) rmSync(state)
  const script = [
    'STATE=' + JSON.stringify(state),
    'LOG=' + JSON.stringify(log),
    'BUCKET=airdash-backups',
    // macOS ships /usr/bin/log, which takes one message and fails on more —
    // without this stub the harness dies inside the function under test.
    'log() { print -r -- "$*" >> "$LOG" }',
    'wrangler() {',
    bucketInfoOutput === null ? '  return 1' : '  cat <<\'WR\'\n' + bucketInfoOutput + '\nWR',
    '}',
    fn,
    'record_bucket_size',
  ].join('\n')
  const file = join(dir, 'harness.zsh')
  writeFileSync(file, script)
  execFileSync('zsh', [file], { encoding: 'utf8' })
  return {
    state: existsSync(state) ? read(state, 'utf8').trim() : null,
    log: existsSync(log) ? read(log, 'utf8') : '',
  }
}

if (fn) {
  const good = 'name: airdash-backups\nobject_count: 3\nbucket_size: 159 MB'
  const r1 = runWith(good)
  check('159 MB parses to bytes', r1.state === String(159 * 1024 ** 2), `got ${r1.state}`)

  const units = [
    ['512 B', 512], ['2 KB', 2 * 1024], ['4 MB', 4 * 1024 ** 2],
    ['1 GB', 1024 ** 3], ['2 TB', 2 * 1024 ** 4],
  ]
  for (const [label, want] of units) {
    const r = runWith(`bucket_size: ${label}\nobject_count: 1`)
    check(`${label} parses to ${want}`, r.state === String(want), `got ${r.state}`)
  }

  // The property that matters most: an unreadable size keeps the last good
  // reading instead of resetting the guard to zero.
  const rBad = runWith(null, String(166723584))
  check('an unreadable bucket size does NOT overwrite the last good reading',
    rBad.state === '166723584', `got ${rBad.state}`)
  check('an unreadable bucket size is logged as a warning',
    /WARN/.test(rBad.log), rBad.log.trim())

  // Field renamed by a future wrangler: parses to nothing, must also preserve.
  const rRenamed = runWith('name: airdash-backups\nobject_count: 3\nsize_total: 159 MB', String(42))
  check('a renamed size field does NOT reset the guard',
    rRenamed.state === '42', `got ${rRenamed.state}`)

  // A genuinely empty bucket IS zero and must be recorded as zero, not
  // treated as an error — otherwise a new bucket could never be recorded.
  const rEmpty = runWith('bucket_size: 0 B\nobject_count: 0')
  check('a real 0 B reading is recorded as 0', rEmpty.state === '0', `got ${rEmpty.state}`)
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)