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
//   2. the watchdog must have run recently (it stamps a heartbeat file each run).
// Both are alert-only — log an error and raise a macOS notification, at most
// once per 6 h per problem. Neither restarts or kills anything.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'

const HEARTBEAT = process.env.AIRDASH_WATCHDOG_HEARTBEAT
  ?? resolve(CONFIG.root ?? '.', 'logs/.watchdog-heartbeat')
const WATCHDOG_STALE_S = 3 * 3600      // hourly job; 3 missed runs = gone
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

export function startOpsSentinel({ startedAt = Date.now() } = {}) {
  if (dbOnExternalVolume(CONFIG.dbPath)) {
    alert('db-external',
      'Live DB is on an EXTERNAL volume — the synchronous server will freeze on every slow disk read. Move it back to internal storage.',
      { dbPath: CONFIG.dbPath })
  }
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
  }
  setInterval(check, CHECK_EVERY_MS).unref()
  setTimeout(check, BOOT_GRACE_MS + 60_000).unref()
}
