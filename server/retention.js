// Nightly maintenance: roll raw readings older than the retention window into
// permanent hourly aggregates, prune, and compact the WAL. Keeps years of
// pattern-analysis history at a fraction of the raw size.
import { CONFIG } from './config.js'
import { log } from './util.js'

export function runRetention(db) {
  const cutoff = new Date(Date.now() + 7 * 3600_000 - CONFIG.retention.rawDays * 86_400_000)
    .toISOString().slice(0, 16)

  const t0 = Date.now()
  let rolled = 0, deleted = 0

  // Roll up + delete in bounded batches, each in ONE transaction. Batching
  // (rather than a single month-wide DELETE) keeps each transaction's WAL
  // small so it can't exceed free space on a tight disk and fail. Doing the
  // rollup and delete of the SAME rows atomically per batch keeps it crash-
  // safe: a batch is either fully rolled-and-removed or rolled back — the
  // "n = n + excluded.n" aggregate can never double-count on a re-run.
  const BATCH = 50_000
  for (;;) {
    let n = 0
    db.tx(() => {
      const ids = db.all('SELECT id FROM readings WHERE obs_time < ? LIMIT ?', cutoff, BATCH)
      n = ids.length
      if (n === 0) return
      const idList = ids.map((r) => r.id).join(',')
      rolled += db.run(
        `INSERT INTO readings_hourly (source, station_key, metric, hour, v_min, v_max, v_avg, n)
         SELECT source, station_key, metric, substr(obs_time, 1, 13) AS hour,
                MIN(value), MAX(value), AVG(value), COUNT(*)
         FROM readings WHERE id IN (${idList})
         GROUP BY source, station_key, metric, hour
         ON CONFLICT(source, station_key, metric, hour) DO UPDATE SET
           v_min = MIN(v_min, excluded.v_min),
           v_max = MAX(v_max, excluded.v_max),
           v_avg = excluded.v_avg,
           n = n + excluded.n`).changes
      deleted += db.run(`DELETE FROM readings WHERE id IN (${idList})`).changes
    })
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    if (n < BATCH) break
  }
  db.tx(() => {
    db.run('DELETE FROM events WHERE ts < ?', new Date(Date.now() - CONFIG.retention.rawDays * 86_400_000).toISOString())
    db.run('DELETE FROM ingest_runs WHERE started_at < ?', new Date(Date.now() - CONFIG.retention.rawDays * 86_400_000).toISOString())
  })

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  log('info', 'retention done', { cutoff, rolled, deleted, durMs: Date.now() - t0 })
  return { rolled, deleted }
}

/** Schedule the job daily at the configured quiet hour (local time), plus an
 *  hourly WAL checkpoint. Continuous SSE/snapshot readers can perpetually
 *  block SQLite's auto-checkpoint, letting the -wal file grow to hundreds of
 *  MB — at which point every read has to merge the whole WAL and the event
 *  loop stalls (this took the site down once). An hourly TRUNCATE checkpoint
 *  keeps the WAL small regardless. */
export function scheduleRetention(db) {
  const tick = () => {
    const hourLocal = (new Date().getUTCHours() + 7) % 24
    if (hourLocal === CONFIG.retention.runAtHour) {
      try { runRetention(db) } catch (err) { log('error', 'retention failed', { error: String(err) }) }
    } else {
      // Off-hours: just keep the WAL compact.
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch (err) { log('warn', 'wal checkpoint failed', { error: String(err) }) }
    }
  }
  const timer = setInterval(tick, 3600_000)
  timer.unref()
}
