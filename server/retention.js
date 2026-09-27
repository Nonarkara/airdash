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
import { statSync } from 'node:fs'

const BATCH = 5_000
const PAUSE_MS = 25
const WAL_TRUNCATE_BYTES = 64 * 1024 * 1024

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** Pure: the retention cutoff (Bangkok-local ISO minute) for a given instant. */
export function retentionCutoff(nowMs, rawDays) {
  return new Date(nowMs + 7 * 3600_000 - rawDays * 86_400_000).toISOString().slice(0, 16)
}

export async function runRetention(db, { nowMs = Date.now(), batch = BATCH, pauseMs = PAUSE_MS } = {}) {
  const cutoff = retentionCutoff(nowMs, CONFIG.retention.rawDays)
  const t0 = Date.now()
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
      n = db.run('INSERT INTO retention_ids (id) SELECT id FROM readings WHERE obs_time < ? LIMIT ?', cutoff, batch).changes
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
  log('info', 'retention done', { cutoff, rolled, deleted, batches, slowestBatchMs, durMs: Date.now() - t0 })
  return { rolled, deleted, batches, slowestBatchMs }
}

/** Schedule the job daily at the configured quiet hour (local time), plus an
 *  hourly WAL checkpoint. Continuous SSE/snapshot readers can perpetually
 *  block SQLite's auto-checkpoint, letting the -wal file grow to hundreds of
 *  MB — at which point every read has to merge the whole WAL and the event
 *  loop stalls (this took the site down once). An hourly checkpoint keeps the
 *  WAL small. */
export function scheduleRetention(db) {
  let running = false
  const tick = () => {
    const hourLocal = (new Date().getUTCHours() + 7) % 24
    if (hourLocal === CONFIG.retention.runAtHour) {
      if (running) return
      running = true
      runRetention(db)
        .catch((err) => log('error', 'retention failed', { error: String(err) }))
        .finally(() => { running = false })
    } else {
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
