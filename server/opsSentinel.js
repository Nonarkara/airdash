// Ops sentinel — the server watching the things that are supposed to watch it.
//
// WHY THIS EXISTS. On 2026-09-26 the live DB and logs were offloaded to the
// USB spinning disk to free SSD space, and the hourly watchdog was unloaded
// during the move and never reloaded. From then on:
//   * node:sqlite is SYNCHRONOUS, so every page-cache miss against a
//     seek-bound disk froze the one thread that serves every request — the
//     server sat in uninterruptible I/O (`ps` state U) and even /api/ping hung;
//   * nothing noticed for ~32 hours, because the component whose job is to
//     notice was not running.
// A watchdog cannot report its own absence. The server can: it is KeepAlive'd
// by launchd, so if anything on this stack is running, it is. Two checks:
//   1. the live DB must be on internal storage (checked at boot);
//   2. the watchdog must have run recently (it stamps a heartbeat file each run);
//   3. the long-term archive on the external drive must be keeping up (its
//      receipt). The SSD holds only a hot window of rain data; while the
//      archive is stalled those rows wait on the SSD and it slowly fills.
// Both are alert-only — log an error and raise a macOS notification, at most
// once per 6 h per problem. Neither restarts or kills anything.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { stat as fsStat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CONFIG } from './config.js'
import { readArchiveReceipt } from './retention.js'
import { log } from './util.js'

const HEARTBEAT = process.env.AIRDASH_WATCHDOG_HEARTBEAT
  ?? resolve(CONFIG.root ?? '.', 'logs/.watchdog-heartbeat')
const WATCHDOG_STALE_S = 3 * 3600      // hourly job; 3 missed runs = gone
const ARCHIVE_STALE_H = 48             // archive runs several times a day
const CHECK_EVERY_MS = 30 * 60_000
const RENOTIFY_MS = 6 * 3600_000
const BOOT_GRACE_MS = 90 * 60_000      // a fresh install/restart gets time for the first run

const lastNotified = new Map()
function alert(key, message, detail) {
  log('error', message, detail)
  const now = Date.now()
  if (now - (lastNotified.get(key) ?? 0) < RENOTIFY_MS) return
  lastNotified.set(key, now)
  // Best effort: works when a user is logged in (launchd gui domain).
  const safe = message.replace(/["\\]/g, "'")
  execFile('osascript', ['-e', `display notification "${safe}" with title "AirDash" sound name "Basso"`], () => {})
}

/** Pure: is this DB path on an external/removable volume? (macOS mounts them under /Volumes) */
export function dbOnExternalVolume(dbPath) {
  return resolve(dbPath).startsWith('/Volumes/')
}

/** Pure: watchdog heartbeat age in seconds, or null if unreadable. */
export function heartbeatAgeS(text, nowS = Math.floor(Date.now() / 1000)) {
  const t = Number(String(text ?? '').trim())
  return Number.isFinite(t) && t > 0 ? nowS - t : null
}

export function watchdogStatus() {
  let age = null
  try { age = heartbeatAgeS(readFileSync(HEARTBEAT, 'utf8')) } catch { /* missing = null */ }
  return { heartbeat_age_min: age === null ? null : Math.round(age / 60), stale: age === null || age > WATCHDOG_STALE_S }
}

/** Pure: the archive receipt's age in hours, or null when there is none. */
export function receiptAgeH(receipt, nowMs = Date.now()) {
  const t = Date.parse(receipt?.written_at ?? '')
  return Number.isFinite(t) ? Math.round(((nowMs - t) / 3600_000) * 10) / 10 : null
}

let storageStatus = { available: null, checked_at: null, reason: 'not-checked' }

// Probe asynchronously: a stalled external drive must not block the API thread.
export async function probeArchiveStorage({
  volumePath = process.env.AIRDASH_ARCHIVE_VOLUME ?? '/Volumes/Data',
  archivePath = readArchiveReceipt()?.archive_db ?? `${volumePath}/dash-archive/dash-archive.db`,
  internalPath = CONFIG.dbPath, stat = fsStat, timeoutMs = 3000,
} = {}) {
  let timer
  try {
    const [volume, archive, internal] = await Promise.race([
      Promise.all([stat(volumePath), stat(archivePath), stat(internalPath)]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe-timeout')), timeoutMs) }),
    ])
    if (!volume.isDirectory() || volume.dev === internal.dev) return { available: false, reason: 'external-volume-not-mounted' }
    if (!archive.isFile() || archive.dev !== volume.dev) return { available: false, reason: 'archive-not-on-external-volume' }
    return { available: true, reason: 'external-archive-present' }
  } catch (error) {
    return { available: false, reason: error.code ?? error.message }
  } finally { clearTimeout(timer) }
}

export function archiveStatus() {
  const r = readArchiveReceipt()
  const age = receiptAgeH(r)
  return { archived_through_id: r?.readings_src_id ?? null, receipt_age_h: age, stale: age === null || age > ARCHIVE_STALE_H, storage: { ...storageStatus } }
}

export function startOpsSentinel({ startedAt = Date.now() } = {}) {
  if (dbOnExternalVolume(CONFIG.dbPath)) {
    alert('db-external',
      'Live DB is on an EXTERNAL volume — the synchronous server will freeze on every slow disk read. Move it back to internal storage.',
      { dbPath: CONFIG.dbPath })
  }
  let probing = false
  const checkStorage = async () => {
    if (probing) return
    probing = true
    try {
      storageStatus = { ...await probeArchiveStorage(), checked_at: new Date().toISOString() }
      if (!storageStatus.available) alert('archive-storage', 'AirDash external archive is unavailable — a recent receipt does not prove the drive is still present.', storageStatus)
    } finally { probing = false }
  }
  checkStorage()
  setInterval(checkStorage, 5 * 60_000).unref()
  const check = () => {
    if (Date.now() - startedAt < BOOT_GRACE_MS) return
    const s = watchdogStatus()
    if (s.stale) {
      alert('watchdog-stale',
        s.heartbeat_age_min === null
          ? 'AirDash watchdog has no heartbeat — it may be unloaded. Nothing is monitoring the site.'
          : `AirDash watchdog last ran ${s.heartbeat_age_min} min ago — it may be unloaded. Nothing is monitoring the site.`,
        { heartbeat: HEARTBEAT, ...s, fix: 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.airdash.watchdog.plist' })
    }
    const a = archiveStatus()
    if (a.stale) {
      alert('archive-stale',
        a.receipt_age_h === null
          ? 'AirDash long-term archive has never confirmed a run — rain data is piling up on the SSD. Is the external drive mounted?'
          : `AirDash long-term archive last confirmed ${a.receipt_age_h} h ago — rain data is piling up on the SSD. Is the external drive mounted?`,
        { ...a, log: '/Volumes/Data/dash-archive/archive.log' })
    }
  }
  setInterval(check, CHECK_EVERY_MS).unref()
  setTimeout(check, BOOT_GRACE_MS + 60_000).unref()
}
