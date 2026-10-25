// Disk headroom for the volume AirDash writes to.
//
// WHY THIS EXISTS (2026-10-24 incident)
// The internal disk filled up. Between 15:46 and 15:47 Bangkok the camera
// pipeline wrote 132 preview JPEGs into data/cctv-frames and every one of
// them failed with ENOSPC. Thirty minutes later the laptop was dead and
// stayed down for 30.9 hours.
//
// The existing watchdog (ops/health-watchdog.sh) DOES check the disk — it
// alerts at 85 % used and counts a problem at 92 %. That is a DETECTOR, and
// a detector that runs once an hour cannot stop a disk that fills in ten
// minutes: between two runs there is nothing between the full disk and a
// machine that cannot write its own log file. This module is the missing
// half — the SERVER knows how much room is left and sheds optional writes
// BEFORE the disk is full, so the readings, the database and the log keep
// working while the cosmetic writes (camera preview frames) are dropped.
//
// Two rules, both learned the hard way:
//   1. A level of "unknown" is NOT "ok". A guard that cannot read its input
//      must never report success about it.
//   2. Shed only what is optional. The database, the log and the readings
//      are the product; a preview JPEG is a picture of it. When the disk is
//      nearly full we keep the product and drop the pictures.
import { statfs } from 'node:fs/promises'
import { CONFIG } from './config.js'
import { log } from './util.js'

const GB = 1073741824

// Thresholds are deliberately about FREE SPACE, not about a percentage of a
// container that several volumes share. On this host the internal volume
// reports 228 GiB total but shares the APFS container with the system
// volume, so a percentage moves for reasons that have nothing to do with
// AirDash (a macOS update, another user's project). Free space on the
// volume we actually write to is the number that predicts ENOSPC.
//
// 92 % of a 228 GiB container is ~18 GiB free — that is a WARNING (tell the
// operator), not an emergency. The emergency is under 3 GiB, which is where
// a multi-gigabyte WAL, a backup snapshot and a preview sweep start to
// collide. The 2026-10-24 crash had 0 bytes free.
export const DISK_THRESHOLDS = {
  warnFreeGb: 8,
  criticalFreeGb: 3,
  warnUsedPct: 92,
  criticalUsedPct: 98,
}

/**
 * Pure: the disk's level from its raw numbers.
 * Returns { level, freeGb, usedPct, reason }.
 * level ∈ 'ok' | 'warn' | 'critical' | 'unknown'
 */
export function diskState({ freeBytes, totalBytes } = {}, thresholds = DISK_THRESHOLDS) {
  if (!Number.isFinite(freeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    // Unreadable is not healthy. It is also not an emergency — but it must
    // never be reported as "ok", because that is how a guard lies.
    return { level: 'unknown', freeGb: null, usedPct: null, reason: 'unreadable' }
  }
  const freeGb = freeBytes / GB
  const usedPct = Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10
  let level = 'ok'
  if (freeGb <= thresholds.criticalFreeGb || usedPct >= thresholds.criticalUsedPct) level = 'critical'
  else if (freeGb <= thresholds.warnFreeGb || usedPct >= thresholds.warnUsedPct) level = 'warn'
  return { level, freeGb: Math.round(freeGb * 10) / 10, usedPct, reason: null }
}

/** Read the volume that holds `path`. Never throws. */
export async function readDiskState(path = CONFIG.root, thresholds = DISK_THRESHOLDS) {
  try {
    const s = await statfs(path)
    const bsize = Number(s.bsize) || 4096
    const freeBytes = Number(s.bavail) * bsize
    const totalBytes = Number(s.blocks) * bsize
    return { ...diskState({ freeBytes, totalBytes }, thresholds), path }
  } catch (err) {
    return { level: 'unknown', freeGb: null, usedPct: null, reason: String(err?.code ?? err?.message ?? err), path }
  }
}

// ── Shared state (one process, one disk) ─────────────────────────────────
let current = { level: 'unknown', freeGb: null, usedPct: null, reason: 'not measured yet', at: 0 }

export function setDiskState(state) {
  current = { ...state, at: Date.now() }
  return current
}

export function diskStatus() { return current }

/** True only when the disk is genuinely critical — optional writes stop. */
export function shouldShedWrites() { return current.level === 'critical' }

/**
 * Write a file only when there is room to write it.
 * Returns true when the file was written, false when the write was shed.
 *
 * The writer is injected so a guard can EXECUTE this decision instead of
 * reading it: a check that cannot make the disk full cannot prove that the
 * shedding works.
 */
export async function saveGuarded(path, data, writeFn) {
  if (shouldShedWrites()) return false
  await writeFn(path, data)
  return true
}

// ── The watcher ──────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS = 5 * 60_000
const ALERT_COOLDOWN_MS = 6 * 3600_000

/**
 * Watch the disk and act: shed optional writes when it is critical, and
 * tell the operator (alert → Telegram, LINE when its quota allows) when the
 * level changes. The alert is a SYSTEM alert about the machine, not about a
 * province, so it carries a synthetic station.
 */
export function startDiskGuard({ alerts = null, intervalMs = CHECK_INTERVAL_MS, path = CONFIG.root } = {}) {
  let lastLevel = null
  let timer = null

  const check = async () => {
    const state = await readDiskState(path)
    const prev = current
    setDiskState(state)
    if (state.level === lastLevel) return
    lastLevel = state.level
    if (state.level === 'unknown') {
      log('warn', 'disk headroom unknown — cannot read the free space of the data volume', { path, reason: state.reason })
      return
    }
    if (state.level === 'ok') {
      log('info', 'disk headroom restored', { free_gb: state.freeGb, used_pct: state.usedPct })
      return
    }
    log(state.level === 'critical' ? 'error' : 'warn',
      state.level === 'critical'
        ? 'disk headroom CRITICAL — optional writes are being shed (camera preview frames); readings and the database keep running'
        : 'disk headroom low',
      { free_gb: state.freeGb, used_pct: state.usedPct, level: state.level })
    if (!alerts) return
    const critical = state.level === 'critical'
    try {
      alerts.raise({
        rule: 'server_disk_headroom',
        source: 'server',
        station: {
          station_key: 'system:disk', name_th: 'พื้นที่จัดเก็บข้อมูลเซิร์ฟเวอร์', name_en: 'Server disk',
          province_th: 'ระบบ', province_en: 'System',
        },
        metric: 'disk_free_gb',
        value: state.freeGb,
        severity: critical ? 3 : 2,
        message_th: critical
          ? `พื้นที่จัดเก็บข้อมูลของเซิร์ฟเวอร์เหลือ ${state.freeGb} GB — ระบบพักการบันทึกภาพกล้องชั่วคราว (ข้อมูลฝุ่นและฐานข้อมูลยังทำงานปกติ)`
          : `พื้นที่จัดเก็บข้อมูลของเซิร์ฟเวอร์เหลือ ${state.freeGb} GB — ควรตรวจสอบพื้นที่ว่าง`,
        message_en: critical
          ? `Server disk has ${state.freeGb} GB left — camera preview writes are paused (air-quality data and the database keep running)`
          : `Server disk has ${state.freeGb} GB left — check free space`,
        cooldownMs: ALERT_COOLDOWN_MS,
        cooldownScope: 'system',
      })
    } catch (err) {
      log('warn', 'disk headroom alert failed', { error: String(err?.message ?? err) })
    }
  }

  const tick = () => {
    check().catch((err) => log('warn', 'disk headroom check failed', { error: String(err?.message ?? err) }))
  }
  timer = setInterval(tick, intervalMs)
  timer.unref?.()
  // Measure once at boot: the server must know its disk state before the
  // first camera cycle writes a frame.
  setTimeout(tick, 5_000).unref?.()
  return { stop: () => { if (timer) clearInterval(timer) }, checkNow: tick, lastState: () => current }
}
