// The server must know how much disk is left, and must stop optional writes
// BEFORE the disk is full.
//
// WHY THIS GUARD EXISTS
// On 2026-10-24 the internal disk filled up: 132 camera-preview writes
// failed with ENOSPC in thirteen seconds, and the laptop died half an hour
// later and stayed down for 30.9 hours. The hourly watchdog can report a
// full disk; only the server itself can keep one from happening.
//
// This guard EXECUTES the disk guard — it does not read it. A check that
// only greps the source cannot see whether the shedding decision is made
// on the number that actually predicts ENOSPC.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  diskState, readDiskState, setDiskState, diskStatus, shouldShedWrites,
  saveGuarded, DISK_THRESHOLDS,
} from '../server/diskGuard.js'

const ROOT = join(import.meta.dirname, '..')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}
const GB = 1073741824

// ── 1 · the pure level function ──────────────────────────────────────────
{
  const full = diskState({ freeBytes: 0, totalBytes: 228 * GB })
  check('a completely full disk is critical', full.level === 'critical', JSON.stringify(full))

  const nearly = diskState({ freeBytes: 2 * GB, totalBytes: 228 * GB })
  check('2 GB free is critical', nearly.level === 'critical', JSON.stringify(nearly))

  const tight = diskState({ freeBytes: 16 * GB, totalBytes: 228 * GB })
  check('16 GB free on a 228 GB volume is a warning, not an emergency',
    tight.level === 'warn', JSON.stringify(tight))

  const roomy = diskState({ freeBytes: 100 * GB, totalBytes: 228 * GB })
  check('100 GB free is ok', roomy.level === 'ok', JSON.stringify(roomy))

  const unreadable = diskState({})
  check('an unreadable disk is NOT reported as ok', unreadable.level === 'unknown', JSON.stringify(unreadable))
  check('an unreadable disk has no free-space number', unreadable.freeGb === null, JSON.stringify(unreadable))

  const zeroTotal = diskState({ freeBytes: 10 * GB, totalBytes: 0 })
  check('a zero-sized volume is not ok', zeroTotal.level === 'unknown', JSON.stringify(zeroTotal))
}

// ── 2 · the thresholds are about free space, not a shared-container % ────
{
  check('the emergency threshold is a real amount of free space',
    DISK_THRESHOLDS.criticalFreeGb > 0 && DISK_THRESHOLDS.criticalFreeGb < DISK_THRESHOLDS.warnFreeGb,
    JSON.stringify(DISK_THRESHOLDS))

  // The free-space trigger on its own: with the percentage trigger pushed
  // out of reach, 2 GB free must still be critical. Without this check the
  // percentage trigger would mask a broken free-space rule (the two are
  // mathematically near-equivalent on a 228 GB volume, so mutating one
  // alone changes nothing).
  const onlyFree = diskState({ freeBytes: 2 * GB, totalBytes: 228 * GB },
    { ...DISK_THRESHOLDS, criticalUsedPct: 99.99, warnUsedPct: 99.99 })
  check('the free-space trigger works on its own',
    onlyFree.level === 'critical', JSON.stringify(onlyFree))

  const onlyPct = diskState({ freeBytes: 4.5 * GB, totalBytes: 228 * GB },
    { ...DISK_THRESHOLDS, criticalFreeGb: 0.001, warnFreeGb: 0.002 })
  check('the used-percentage trigger works on its own',
    onlyPct.level === 'critical', JSON.stringify(onlyPct))
}

// ── 3 · shedding follows the state ───────────────────────────────────────
{
  setDiskState({ level: 'critical', freeGb: 1.2, usedPct: 99.5 })
  check('a critical disk sheds optional writes', shouldShedWrites() === true)
  const writes = []
  const written = await saveGuarded('/tmp/should-not-exist.jpg', 'bytes', async (p, d) => { writes.push([p, d]) })
  check('a shed write does NOT touch the disk', written === false && writes.length === 0,
    `written=${written} writes=${writes.length}`)

  setDiskState({ level: 'warn', freeGb: 6, usedPct: 94 })
  check('a warning-level disk does NOT shed writes', shouldShedWrites() === false)
  const writes2 = []
  const written2 = await saveGuarded('/tmp/should-be-written.jpg', 'bytes', async (p, d) => { writes2.push([p, d]) })
  check('a normal write still goes through', written2 === true && writes2.length === 1,
    `written=${written2} writes=${writes2.length}`)

  setDiskState({ level: 'unknown', freeGb: null, usedPct: null })
  check('an unknown disk does not shed writes (it is not known to be full)',
    shouldShedWrites() === false)
}

// ── 4 · a real measurement of this machine ───────────────────────────────
{
  const real = await readDiskState(ROOT)
  check('the real disk state is readable', real.level !== 'unknown', JSON.stringify(real))
  check('the real disk has a free-space number', typeof real.freeGb === 'number' && real.freeGb > 0,
    JSON.stringify(real))
  check('the real disk reading is not critical on this host',
    real.level !== 'critical', JSON.stringify(real))
}

// ── 5 · the camera preview path is actually wired to the guard ───────────
// A wiring check, not a behaviour check: the behaviour above is proved by
// executing saveGuarded; this proves the frame writer goes through it.
{
  const src = readFileSync(join(ROOT, 'server/vision/frameStore.js'), 'utf8')
  check('the preview writer goes through the disk guard', /saveGuarded/.test(src))
  check('the preview writer no longer writes the frame file directly',
    !/writeFile\(path/.test(src), 'frameStore still writes the frame directly')
  const vision = readFileSync(join(ROOT, 'server/vision/hazeVision.js'), 'utf8')
  check('the vision loop counts a shed frame as "no preview"',
    /savePreview\(key, buf\)\) \? 1 : 0/.test(vision))
  const api = readFileSync(join(ROOT, 'server/api.js'), 'utf8')
  check('the health endpoint reports the disk level', /disk: diskStatus\(\)/.test(api))
}

// ── 6 · the operator is told; the subscribers are NOT ───────────────────
// The first version raised a normal alert, which fanned out to every
// Telegram subscriber as if the disk were a haze episode. Subscribers
// follow AirDash for air quality; free space is the operator's business.
{
  const { startDiskGuard } = await import('../server/diskGuard.js')
  const notices = []
  let level = 'warn'
  const guard = startDiskGuard({
    notify: (t) => notices.push(t),
    readState: async () => ({ level, freeGb: level === 'critical' ? 1.5 : 12, usedPct: 95, reason: null }),
    intervalMs: 3600_000,
  })
  await guard.checkNow()
  check('a warning-level disk does NOT disturb the operator', notices.length === 0,
    notices.join(' | '))
  level = 'critical'
  await guard.checkNow()
  check('a critical disk tells the operator once', notices.length === 1,
    notices.join(' | '))
  await guard.checkNow()
  check('a still-critical disk does not notify again', notices.length === 1,
    notices.join(' | '))
  level = 'ok'
  await guard.checkNow()
  check('a recovered disk does not notify', notices.length === 1, notices.join(' | '))
  guard.stop()

  const guardSrc = readFileSync(join(ROOT, 'server/diskGuard.js'), 'utf8')
  check('the disk guard never raises a subscriber alert',
    !/alerts\.raise/.test(guardSrc) && !/telegramBroadcaster/.test(guardSrc),
    'the disk guard still fans out to subscribers')
  const indexSrc = readFileSync(join(ROOT, 'server/index.js'), 'utf8')
  check('the server starts the disk guard without an alert engine',
    /startDiskGuard\(\)/.test(indexSrc))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
