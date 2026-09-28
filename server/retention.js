// Nightly maintenance: roll raw readings older than the retention window into
// permanent hourly aggregates, prune, and compact the WAL. Keeps years of
// pattern-analysis history at a fraction of the raw size.
//
// WHY IT YIELDS (2026-09-28 audit). node:sqlite is synchronous and the server
// is one thread, so this job must never hold the event loop for long. Until
// mid-July the table took ~1,850 raw rows a day, so the nightly roll-up was
// tiny. From 2026-07-17 it is 140k–225k rows a day (rain gauges at 10-minute
// cadence), and the 90-day window reaches that wave around 2026-10-15. The old
// loop did 50k-row batches back to back — each a GROUP BY roll-up plus a
// DELETE touching four indexes — then a TRUNCATE checkpoint, all without
// yielding: a 10–60 s freeze of every request, nightly, on a host that is
// already short of RAM. It also inlined up to 50k ids into the SQL text, and
// the statement cache kept each ~400 KB string forever.
//
// Now: 5k-row batches through a TEMP id table (static SQL, nothing new
// cached), a pause between batches so requests and ingest run, PASSIVE
// checkpoints per batch and one TRUNCATE at the end.
import { CONFIG } from './config.js'
import { log } from './util.js'
import { statSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const BATCH = 5_000
const PAUSE_MS = 25
// Hot-tier trims run hourly, live: smaller batches keep each event-loop
// block short (the first run clears a ~10M-row backlog).
const HOT_BATCH = 2_000
const HOT_FIRST_RUN_DELAY_MS = 10 * 60_000
const WAL_TRUNCATE_BYTES = 64 * 1024 * 1024

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** Pure: the retention cutoff (Bangkok-local ISO minute) for a given instant. */
export function retentionCutoff(nowMs, rawDays) {
  return new Date(nowMs + 7 * 3600_000 - rawDays * 86_400_000).toISOString().slice(0, 16)
}

// ── Hot tier: the SSD keeps only a recent window of high-volume sources ──
// The long-term archive on the external drive (ops/archive-longterm.mjs)
// writes a receipt after each successful run: the highest readings id it has
// committed. Rows are dropped here only if that receipt covers them, so a
// stalled archive or an unmounted drive means rows WAIT on the SSD — never
// that they are lost.

export const receiptPath = () => join(dirname(CONFIG.dbPath), '.archive-receipt.json')

/** The archive receipt, or null when missing/unreadable/implausible. */
export function readArchiveReceipt(path = receiptPath()) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'))
    return Number.isInteger(j?.readings_src_id) && j.readings_src_id > 0 ? j : null
  } catch { return null }
}

/** Delete archived rows of the hot-tier sources older than their window.
 *  Keyset-paginated over idx_readings_time so each old row is visited once. */
export async function trimArchivedHot(db, {
  nowMs = Date.now(), receipt = readArchiveReceipt(), hotDays = CONFIG.retention.hotDays,
  batch = HOT_BATCH, pauseMs = PAUSE_MS,
} = {}) {
  const sources = Object.entries(hotDays ?? {})
  if (!sources.length) return { deleted: 0, batches: 0, slowestBatchMs: 0 }
  if (!receipt) {
    log('warn', 'hot-tier trim skipped: no archive receipt — rows stay on the SSD until the archive confirms them', { path: receiptPath() })
    return { deleted: 0, batches: 0, slowestBatchMs: 0, skipped: 'no-receipt' }
  }
  const liveMax = db.get('SELECT MAX(id) AS m FROM readings')?.m ?? 0
  if (receipt.readings_src_id > liveMax) {
    // The live DB was replaced/restored: its ids no longer match the archive's.
    log('warn', 'hot-tier trim skipped: receipt is ahead of the live DB (ids do not line up)', { receipt: receipt.readings_src_id, liveMax })
    return { deleted: 0, batches: 0, slowestBatchMs: 0, skipped: 'receipt-ahead' }
  }
  let deleted = 0, batches = 0, slowestBatchMs = 0
  db.exec('CREATE TEMP TABLE IF NOT EXISTS retention_ids (id INTEGER PRIMARY KEY)')
  for (const [source, days] of sources) {
    const cutoff = retentionCutoff(nowMs, days)
    let cursor = ''
    for (;;) {
      const b0 = Date.now()
      let n = 0
      db.tx(() => {
        db.run('DELETE FROM retention_ids')
        n = db.run(
          `INSERT INTO retention_ids (id)
           SELECT id FROM readings INDEXED BY idx_readings_time
            WHERE obs_time >= ? AND obs_time < ? AND source = ? AND id <= ?
            ORDER BY obs_time LIMIT ?`, cursor, cutoff, source, receipt.readings_src_id, batch).changes
        if (n === 0) return
        cursor = db.get('SELECT MAX(obs_time) AS t FROM readings WHERE id IN (SELECT id FROM retention_ids)').t
        deleted += db.run('DELETE FROM readings WHERE id IN (SELECT id FROM retention_ids)').changes
      })
      if (n === 0) break
      batches++
      const ms = Date.now() - b0
      slowestBatchMs = Math.max(slowestBatchMs, ms)
      db.exec('PRAGMA wal_checkpoint(PASSIVE)')
      if (n < batch) break
      await pause(Math.max(pauseMs, ms)) // at most ~50% duty cycle on the event loop
    }
  }
  db.run('DELETE FROM retention_ids')
  return { deleted, batches, slowestBatchMs }
}

export async function runRetention(db, { nowMs = Date.now(), batch = BATCH, pauseMs = PAUSE_MS, receipt } = {}) {
  const cutoff = retentionCutoff(nowMs, CONFIG.retention.rawDays)
  const t0 = Date.now()
  const hot = await trimArchivedHot(db, { nowMs, pauseMs, ...(receipt !== undefined ? { receipt } : {}) })
  // Hot-tier sources are never rolled up: they live in the archive.
  const hotSources = Object.keys(CONFIG.retention.hotDays ?? {})
  const notHot = hotSources.length ? `AND source NOT IN (${hotSources.map(() => '?').join(',')})` : ''
  let rolled = 0, deleted = 0, batches = 0, slowestBatchMs = 0

  db.exec('CREATE TEMP TABLE IF NOT EXISTS retention_ids (id INTEGER PRIMARY KEY)')
  for (;;) {
    const b0 = Date.now()
    let n = 0
    // One transaction per batch: the roll-up and the delete of the SAME rows
    // land together or not at all, so the "n = n + excluded.n" aggregate can
    // never double-count on a re-run after a crash.
    db.tx(() => {
      db.run('DELETE FROM retention_ids')
      n = db.run(`INSERT INTO retention_ids (id) SELECT id FROM readings WHERE obs_time < ? ${notHot} LIMIT ?`, cutoff, ...hotSources, batch).changes
      if (n === 0) return
      rolled += db.run(
        `INSERT INTO readings_hourly (source, station_key, metric, hour, v_min, v_max, v_avg, n)
         SELECT source, station_key, metric, substr(obs_time, 1, 13) AS hour,
                MIN(value), MAX(value), AVG(value), COUNT(*)
         FROM readings WHERE id IN (SELECT id FROM retention_ids)
         GROUP BY source, station_key, metric, hour
         ON CONFLICT(source, station_key, metric, hour) DO UPDATE SET
           v_min = MIN(v_min, excluded.v_min),
           v_max = MAX(v_max, excluded.v_max),
           v_avg = (v_avg * n + excluded.v_avg * excluded.n) / (n + excluded.n),
           n = n + excluded.n`).changes
      deleted += db.run('DELETE FROM readings WHERE id IN (SELECT id FROM retention_ids)').changes
    })
    if (n === 0) break
    batches++
    slowestBatchMs = Math.max(slowestBatchMs, Date.now() - b0)
    // PASSIVE never waits on readers (TRUNCATE can sit in busy_timeout while a
    // long read — the nightly VACUUM INTO backup — is open).
    db.exec('PRAGMA wal_checkpoint(PASSIVE)')
    if (n < batch) break
    await pause(pauseMs)
  }
  db.run('DELETE FROM retention_ids')

  const horizon = new Date(nowMs - CONFIG.retention.rawDays * 86_400_000).toISOString()
  db.tx(() => {
    db.run('DELETE FROM events WHERE ts < ?', horizon)
    db.run('DELETE FROM ingest_runs WHERE started_at < ?', horizon)
  })

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  log('info', 'retention done', { cutoff, rolled, deleted, batches, slowestBatchMs, hot, durMs: Date.now() - t0 })
  return { rolled, deleted, batches, slowestBatchMs, hot }
}

/** Schedule the job daily at the configured quiet hour (local time), plus an
 *  hourly WAL checkpoint. Continuous SSE/snapshot readers can perpetually
 *  block SQLite's auto-checkpoint, letting the -wal file grow to hundreds of
 *  MB — at which point every read has to merge the whole WAL and the event
 *  loop stalls (this took the site down once). An hourly checkpoint keeps the
 *  WAL small. */
export function scheduleRetention(db) {
  let running = false
  const exclusive = (name, job) => {
    if (running) return
    running = true
    job()
      .catch((err) => log('error', `${name} failed`, { error: String(err) }))
      .finally(() => { running = false })
  }
  // Hourly, the hot tier sheds whatever the archive has confirmed and has
  // aged past its window — a couple of small batches in steady state.
  const trimHot = () => exclusive('hot-tier trim', async () => {
    const t0 = Date.now()
    const r = await trimArchivedHot(db)
    if (r.deleted) log('info', 'hot-tier trim done', { ...r, durMs: Date.now() - t0 })
  })
  setTimeout(trimHot, HOT_FIRST_RUN_DELAY_MS).unref()
  const tick = () => {
    const hourLocal = (new Date().getUTCHours() + 7) % 24
    if (hourLocal === CONFIG.retention.runAtHour) {
      exclusive('retention', () => runRetention(db))
    } else {
      trimHot()
      // PASSIVE normally; TRUNCATE when the WAL has actually grown. Growth is
      // the failure we have seen take the site down; a TRUNCATE that waits on
      // a long reader is only a theoretical cost, so pay it when it matters.
      let walBytes = 0
      try { walBytes = statSync(`${CONFIG.dbPath}-wal`).size } catch { /* no WAL yet */ }
      const mode = walBytes > WAL_TRUNCATE_BYTES ? 'TRUNCATE' : 'PASSIVE'
      try { db.exec(`PRAGMA wal_checkpoint(${mode})`) } catch (err) { log('warn', 'wal checkpoint failed', { mode, error: String(err) }) }
    }
  }
  const timer = setInterval(tick, 3600_000)
  timer.unref()
}
