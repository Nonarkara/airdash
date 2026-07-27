#!/usr/bin/env node
// Long-term archive for BOTH dashboards (AirDash + FloodDash) — the
// permanent research record on the 8 TB external volume.
//
// WHY THIS EXISTS
// Both live systems keep raw readings for 90 days (CONFIG.retention.rawDays),
// then roll them into hourly means and DELETE the raw rows. `events` and
// `ingest_runs` are deleted outright at 90 days with no rollup at all. That
// is the right policy for a live dashboard — the working DB stays small and
// fast, which is what keeps the life-safety path responsive — but it means
// the sub-hourly detail and the entire operational history are lost forever.
// Long-horizon questions ("how did the 2027 burning season compare with
// 2026?", "which sensors fail first during an episode?", "does washout-grade
// rain actually clear the air the way our model says?") need that detail.
//
// This archiver copies the append-only streams out to a separate database
// BEFORE retention destroys them, and never deletes anything.
//
// SAFETY CONTRACT — this runs alongside a life-safety system.
//   1. Live databases are opened READ-ONLY (file:...?mode=ro). The archiver
//      is physically incapable of writing to, locking-for-write, or
//      corrupting production data.
//   2. It runs as its OWN process on a schedule, never inside the server
//      event loop. A slow archive can never stall an alert.
//   3. Work is batched with a yield between batches so it cannot monopolise
//      disk I/O while an ingest is running.
//   4. If the external volume is not mounted, it logs and exits 0. A missing
//      archive is an inconvenience; a crash-looping launchd job that fills
//      the internal disk with logs is an outage. Never trade the second for
//      the first.
//   5. Idempotent: watermark-driven + INSERT OR IGNORE. Safe to run twice,
//      safe to interrupt, safe to re-run after a failure.
//
// Usage:
//   node ops/archive-longterm.mjs            # incremental (what cron runs)
//   node ops/archive-longterm.mjs --stats    # report only, copies nothing
//   node ops/archive-longterm.mjs --verify   # integrity + coverage check
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, statSync, appendFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

const ARCHIVE_DIR = '/Volumes/Data/dash-archive'
const ARCHIVE_DB = `${ARCHIVE_DIR}/dash-archive.db`
const LOG = `${ARCHIVE_DIR}/archive.log`

// The two live systems. `db` is opened read-only; `tables` lists what to
// pull. Tables absent from a given system are skipped silently (FloodDash
// has water quality and escalations; AirDash does not).
const SYSTEMS = [
  { name: 'airdash', db: '/Users/axiom/AirDash/data/airdash.db' },
  { name: 'flooddash', db: '/Users/axiom/Projects/FloodDash/data/flooddash.db' },
]

// Append-only streams, copied incrementally by integer id watermark.
// `cols` must exist in the source; the archive adds a `system` column.
const STREAMS = [
  { table: 'readings', cols: ['id', 'source', 'station_key', 'metric', 'value', 'obs_time', 'fetched_at'] },
  { table: 'alerts', cols: ['id', 'ts', 'rule', 'source', 'station_key', 'province_th', 'province_en', 'severity', 'value', 'prev_value', 'message_th', 'message_en'] },
  { table: 'events', cols: ['id', 'ts', 'kind', 'source', 'station_key', 'severity', 'title_th', 'title_en', 'payload_json'] },
  { table: 'ingest_runs', cols: ['id', 'source', 'started_at', 'dur_ms', 'ok', 'rows_seen', 'rows_new', 'error'] },
  { table: 'news_items', cols: ['id', 'feed', 'guid', 'title', 'link', 'published_at', 'fetched_at'] },
  { table: 'wq_readings', cols: ['id', 'station_id', 'sampled_at', 'ph', 'do_mg_l', 'ec_us_cm', 'temp_c', 'turbidity_ntu', 'bod_mg_l', 'cod_mg_l', 'nh3_mg_l', 'salinity_ppt', 'wqi_score'] },
  { table: 'escalations', cols: ['id', 'ts', 'province_code', 'province_th', 'province_en', 'kind', 'from_band', 'to_band', 'score', 'level'] },
]

const BATCH = 20_000          // rows per transaction — bounded WAL growth
const YIELD_MS = 25           // breathe between batches; keeps disk I/O polite

const now = () => new Date().toISOString()
function log(msg) {
  const line = `[${now()}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG, line + '\n') } catch { /* volume gone mid-run */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Archive schema ───────────────────────────────────────────────────────
// Mirrors the live tables plus a `system` discriminator. The natural key of
// each stream becomes the PRIMARY KEY so re-running can never duplicate.
// No DELETE path exists anywhere in this file — that is the point.
function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    -- KEY CHOICE: (system, src_id), NOT the natural key.
    -- The first cut used PRIMARY KEY (system, source, station_key, metric,
    -- obs_time) WITHOUT ROWID. Rows arrive ordered by source id, which does
    -- NOT match that sort order, so every insert landed in the middle of a
    -- wide TEXT B-tree and split pages. Throughput collapsed from ~100k to
    -- ~8k rows/min as the table grew — fatal for an archive meant to hold
    -- tens of millions of rows per year for years.
    -- src_id is monotonic per system, so inserts append to the end of the
    -- tree and the rate stays flat. Dedup is preserved: src_id uniquely
    -- identifies a source row, and the live DBs already enforce
    -- UNIQUE(source, station_key, metric, obs_time) upstream.
    CREATE TABLE IF NOT EXISTS readings (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      source TEXT NOT NULL, station_key TEXT NOT NULL, metric TEXT NOT NULL,
      value REAL NOT NULL, obs_time TEXT NOT NULL, fetched_at TEXT NOT NULL,
      PRIMARY KEY (system, src_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ar_readings_time ON readings(obs_time);
    -- NOTE: the wide per-series index is deliberately NOT created here.
    -- See ensureAnalysisIndexes() — maintaining it during a bulk load
    -- reintroduces exactly the random-insert page-splitting that the PK
    -- change above fixed (throughput fell off a cliff a second time when
    -- it lived here). SQLite builds it far faster in one sorted pass at
    -- the end, and incremental daily loads are small enough that
    -- maintaining it afterwards costs nothing.

    CREATE TABLE IF NOT EXISTS alerts (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      ts TEXT NOT NULL, rule TEXT NOT NULL, source TEXT, station_key TEXT,
      province_th TEXT, province_en TEXT, severity INTEGER,
      value REAL, prev_value REAL, message_th TEXT, message_en TEXT,
      PRIMARY KEY (system, src_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ar_alerts_ts ON alerts(ts);

    CREATE TABLE IF NOT EXISTS events (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      ts TEXT NOT NULL, kind TEXT, source TEXT, station_key TEXT,
      severity INTEGER, title_th TEXT, title_en TEXT, payload_json TEXT,
      PRIMARY KEY (system, src_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ar_events_ts ON events(ts);

    CREATE TABLE IF NOT EXISTS ingest_runs (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      source TEXT NOT NULL, started_at TEXT NOT NULL, dur_ms INTEGER,
      ok INTEGER, rows_seen INTEGER, rows_new INTEGER, error TEXT,
      PRIMARY KEY (system, src_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ar_ingest_time ON ingest_runs(started_at);

    CREATE TABLE IF NOT EXISTS news_items (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      feed TEXT, guid TEXT, title TEXT, link TEXT,
      published_at TEXT, fetched_at TEXT,
      PRIMARY KEY (system, src_id)
    );

    CREATE TABLE IF NOT EXISTS wq_readings (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      station_id TEXT, sampled_at TEXT, ph REAL, do_mg_l REAL, ec_us_cm REAL,
      temp_c REAL, turbidity_ntu REAL, bod_mg_l REAL, cod_mg_l REAL,
      nh3_mg_l REAL, salinity_ppt REAL, wqi_score REAL,
      PRIMARY KEY (system, src_id)
    );

    CREATE TABLE IF NOT EXISTS escalations (
      system TEXT NOT NULL, src_id INTEGER NOT NULL,
      ts TEXT NOT NULL, province_code TEXT, province_th TEXT, province_en TEXT,
      kind TEXT, from_band TEXT, to_band TEXT, score INTEGER, level TEXT,
      PRIMARY KEY (system, src_id)
    );

    -- Slowly-changing dimension: refreshed in full each run (small table).
    -- Keeps station metadata alongside the readings so an archive opened in
    -- five years is self-describing without the live DB.
    CREATE TABLE IF NOT EXISTS stations (
      system TEXT NOT NULL, source TEXT NOT NULL, station_key TEXT NOT NULL,
      name_th TEXT, name_en TEXT, province_th TEXT, province_en TEXT,
      province_code TEXT, lat REAL, lng REAL,
      first_seen TEXT, last_seen TEXT, archived_at TEXT,
      PRIMARY KEY (system, source, station_key)
    ) WITHOUT ROWID;

    -- Incremental watermarks: highest source id copied per (system, table).
    CREATE TABLE IF NOT EXISTS archive_meta (
      system TEXT NOT NULL, table_name TEXT NOT NULL,
      last_src_id INTEGER NOT NULL DEFAULT 0, last_run_at TEXT,
      PRIMARY KEY (system, table_name)
    );

    -- Audit trail: every run, what it copied, how long it took. This is the
    -- record that proves the archive is actually running.
    CREATE TABLE IF NOT EXISTS archive_runs (
      id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
      ok INTEGER, rows_copied INTEGER, detail TEXT, error TEXT
    );
  `)
}

/**
 * Build the analysis indexes AFTER the copy pass. On an empty/backfilling
 * archive this is a one-off sorted build; on every later run the index
 * already exists and this is a no-op. Kept out of ensureSchema() on
 * purpose — see the note in the readings DDL.
 */
function ensureAnalysisIndexes(db) {
  const t0 = Date.now()
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ar_readings_series
             ON readings(system, source, station_key, metric, obs_time);`)
  const ms = Date.now() - t0
  if (ms > 1000) log(`built analysis index in ${(ms / 1000).toFixed(1)}s`)
}

const getWatermark = (db, system, table) =>
  db.prepare('SELECT last_src_id FROM archive_meta WHERE system = ? AND table_name = ?')
    .get(system, table)?.last_src_id ?? 0

function setWatermark(db, system, table, id) {
  db.prepare(`INSERT INTO archive_meta (system, table_name, last_src_id, last_run_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(system, table_name) DO UPDATE SET
                last_src_id = excluded.last_src_id, last_run_at = excluded.last_run_at`)
    .run(system, table, id, now())
}

const tableExists = (db, name) =>
  !!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?").get(name)

/** Copy one append-only stream incrementally. Returns rows copied. */
async function copyStream(archive, live, system, { table, cols }) {
  if (!tableExists(live, table)) return 0
  let watermark = getWatermark(archive, system, table)
  // Destination columns are: system, src_id (from source `id`), then every
  // remaining source column. Placeholder count MUST equal that list length —
  // deriving both from the same array avoids the off-by-one that previously
  // produced "12 values for 13 columns" and aborted the run.
  const destCols = ['system', 'src_id', ...cols.slice(1)]
  const dest = `INSERT OR IGNORE INTO ${table} (${destCols.join(', ')}) `
    + `VALUES (${destCols.map(() => '?').join(',')})`
  const insert = archive.prepare(dest)
  const select = live.prepare(
    `SELECT ${cols.join(', ')} FROM ${table} WHERE id > ? ORDER BY id LIMIT ${BATCH}`)

  let total = 0
  for (;;) {
    const rows = select.all(watermark)
    if (!rows.length) break
    archive.exec('BEGIN')
    try {
      for (const r of rows) insert.run(system, ...cols.map((c) => r[c] ?? null))
      archive.exec('COMMIT')
    } catch (err) {
      archive.exec('ROLLBACK')
      throw err
    }
    watermark = rows[rows.length - 1].id
    total += rows.length
    setWatermark(archive, system, table, watermark)
    if (rows.length < BATCH) break
    await sleep(YIELD_MS)   // let the live system have the disk
  }
  return total
}

/** Refresh the station dimension (small, mutable — full upsert). */
function copyStations(archive, live, system) {
  if (!tableExists(live, 'stations')) return 0
  const rows = live.prepare(
    `SELECT source, station_key, name_th, name_en, province_th, province_en,
            province_code, lat, lng, first_seen, last_seen FROM stations`).all()
  const up = archive.prepare(
    `INSERT INTO stations (system, source, station_key, name_th, name_en, province_th,
       province_en, province_code, lat, lng, first_seen, last_seen, archived_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(system, source, station_key) DO UPDATE SET
       name_th=excluded.name_th, name_en=excluded.name_en,
       province_th=excluded.province_th, province_en=excluded.province_en,
       province_code=excluded.province_code, lat=excluded.lat, lng=excluded.lng,
       last_seen=excluded.last_seen, archived_at=excluded.archived_at`)
  const stamp = now()
  archive.exec('BEGIN')
  try {
    for (const r of rows) {
      up.run(system, r.source, r.station_key, r.name_th, r.name_en, r.province_th,
        r.province_en, r.province_code, r.lat, r.lng, r.first_seen, r.last_seen, stamp)
    }
    archive.exec('COMMIT')
  } catch (err) { archive.exec('ROLLBACK'); throw err }
  return rows.length
}

function openLiveReadOnly(path) {
  // mode=ro is the whole safety story: SQLite refuses any write on this
  // handle, so a bug here cannot damage a production database.
  return new DatabaseSync(`file:${path}?mode=ro`, { readOnly: true })
}

function reportStats(archive) {
  const tables = ['readings', 'alerts', 'events', 'ingest_runs', 'news_items',
    'wq_readings', 'escalations', 'stations']
  log('archive contents:')
  for (const t of tables) {
    const rows = archive.prepare(
      `SELECT system, COUNT(*) AS n FROM ${t} GROUP BY system ORDER BY system`).all()
    const summary = rows.length ? rows.map((r) => `${r.system}=${r.n.toLocaleString()}`).join('  ') : '(empty)'
    log(`  ${t.padEnd(14)} ${summary}`)
  }
  const span = archive.prepare(
    'SELECT system, MIN(obs_time) AS a, MAX(obs_time) AS b FROM readings GROUP BY system').all()
  for (const s of span) log(`  span ${s.system}: ${s.a} → ${s.b}`)
  if (existsSync(ARCHIVE_DB)) {
    log(`  archive size: ${(statSync(ARCHIVE_DB).size / 1e9).toFixed(2)} GB`)
  }
}

async function main() {
  const mode = process.argv.includes('--stats') ? 'stats'
    : process.argv.includes('--verify') ? 'verify' : 'run'

  // Volume gone (USB unplugged / not yet mounted) → log, exit 0. Never
  // crash-loop: a failing archive must not become an operational incident.
  if (!existsSync('/Volumes/Data')) {
    console.log(`[${now()}] archive volume /Volumes/Data not mounted — skipping this run`)
    process.exit(0)
  }

  // REAL WRITE PROBE — not just existsSync/-w. On macOS, a launchd agent
  // can pass a directory-writability test and still be blocked by TCC when
  // it actually creates a file on an external volume. FloodDash's backup
  // script hit exactly this: it selected "offdevice" mode on the strength
  // of a -w check, then died on the first real write, leaving the system
  // with NO backup at all. A probe that only checks the directory is worse
  // than no probe, because it converts a safe fallback into a hard failure.
  try {
    mkdirSync(ARCHIVE_DIR, { recursive: true })
    const probe = `${ARCHIVE_DIR}/.write-probe`
    writeFileSync(probe, String(Date.now()))
    unlinkSync(probe)
  } catch (err) {
    console.log(`[${now()}] cannot WRITE to ${ARCHIVE_DIR} (${String(err?.message ?? err)})`)
    console.log(`[${now()}] if this is a scheduled run, grant Full Disk Access to /opt/homebrew/bin/node`)
    console.log(`[${now()}] (System Settings → Privacy & Security → Full Disk Access). Skipping — no data lost.`)
    process.exit(0)   // exit 0: a blocked archive is not a crash
  }

  const archive = new DatabaseSync(ARCHIVE_DB)
  ensureSchema(archive)

  if (mode === 'stats') { reportStats(archive); archive.close(); return }

  if (mode === 'verify') {
    const res = archive.prepare('PRAGMA integrity_check').get()
    const ok = Object.values(res)[0] === 'ok'
    log(`integrity_check: ${Object.values(res)[0]}`)
    reportStats(archive)
    archive.close()
    process.exit(ok ? 0 : 1)
  }

  const startedAt = now()
  const runRow = archive.prepare(
    'INSERT INTO archive_runs (started_at, ok) VALUES (?, 0)').run(startedAt)
  const runId = Number(runRow.lastInsertRowid)
  const detail = []
  let grandTotal = 0

  try {
    for (const sys of SYSTEMS) {
      if (!existsSync(sys.db)) { log(`${sys.name}: live DB missing — skipped`); continue }
      const live = openLiveReadOnly(sys.db)
      try {
        for (const stream of STREAMS) {
          const n = await copyStream(archive, live, sys.name, stream)
          if (n > 0) { detail.push(`${sys.name}.${stream.table}=${n}`); grandTotal += n }
        }
        const st = copyStations(archive, live, sys.name)
        if (st > 0) detail.push(`${sys.name}.stations=${st}`)
      } finally {
        live.close()
      }
      log(`${sys.name}: done`)
    }

    ensureAnalysisIndexes(archive)

    archive.prepare(
      'UPDATE archive_runs SET finished_at = ?, ok = 1, rows_copied = ?, detail = ? WHERE id = ?')
      .run(now(), grandTotal, detail.join(' '), runId)
    log(`archive run complete — ${grandTotal.toLocaleString()} new rows [${detail.join(' ') || 'nothing new'}]`)
    reportStats(archive)
  } catch (err) {
    const msg = String(err?.message ?? err)
    archive.prepare('UPDATE archive_runs SET finished_at = ?, ok = 0, error = ? WHERE id = ?')
      .run(now(), msg, runId)
    log(`ARCHIVE FAILED: ${msg}`)
    archive.close()
    process.exit(1)
  }
  archive.close()
}

main().catch((err) => { log(`fatal: ${String(err?.message ?? err)}`); process.exit(1) })
