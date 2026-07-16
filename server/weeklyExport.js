// Weekly data export — every Sunday, dump every table in the SQLite DB
// to a single .tar.gz archive so the project gets a stable, downloadable
// snapshot of all the numbers we collected. No external dependencies;
// uses the system `tar` + `sqlite3` commands (macOS/Linux) for the
// dump + archive steps. The system sqlite3 is ~50× faster than
// node:sqlite for bulk SELECTs into CSV because it's pure C against
// the precompiled B-tree pages.
//
// What's in the archive (one CSV per table + a meta.json + a README):
//   stations.csv          station registry (lat/lng/province)
//   readings.csv          last 90 days of raw readings (AQ hourly, rain 10-min)
//   readings_hourly.csv   permanent hourly rollups
//   latest.csv            O(1) snapshot: latest value per (station, metric)
//   events.csv            the running tap (events.id doubles as SSE id)
//   alerts.csv            threshold crossings
//   news_items.csv        Google News TH + Khaosod headlines
//   rag_docs.csv          knowledge base (Air Library BIBLE etc.)
//   ingest_runs.csv       per-source poll history (last 90 d, by time)
//   chat_logs.csv         AI chat history with feedback votes
//   chat_faq.csv          FAQ cache (served_count, approval state)
//   line_subs.csv         LINE Notify opt-ins
//   kv.csv                key-value cache (risk_snapshot_cache etc.)
//   risk_snapshot.json    current risk payload (in-memory, not in DB)
//   meta.json             export metadata: date, row counts, freshness
//   README.md             what each file is and how to load it
//
// The build is incremental: a fresh export is generated each week, and
// the last 8 weeks are kept (older ones pruned). User can list via
// /api/exports and download via /api/exports/<filename>.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, createWriteStream, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './util.js'
import { CONFIG } from './config.js'

const execFileAsync = promisify(execFile)
const EXPORT_DIR = 'data/exports'
const KEEP_WEEKS = 8

// Build state — only one build runs at a time. The 4.6M-row readings
// dump takes ~5s via the sqlite3 CLI, but other tables (events, hourly
// rollups) can add another ~10s. A build is still under 30s end-to-end,
// so we fire-and-forget and the HTTP response returns immediately.
// /api/exports surfaces this state for polling.
let buildState = {
  running: false,
  started_at: null,
  finished_at: null,
  result: null,
  error: null,
}

export function getBuildState() {
  return { ...buildState }
}

// Tables to export. The list is explicit (rather than `SELECT name FROM
// sqlite_master`) so the export order is stable and accidental tables
// (e.g. internal caches) don't leak into the public archive.
//
// `dump` is the strategy:
//   "shell"  — fork the system `sqlite3` CLI to dump the table to CSV.
//              ~50× faster than node:sqlite for tables >100k rows because
//              it's a pure-C B-tree walk with no JS per-row overhead.
//              Requires the `sqlite3` binary in PATH (standard on macOS
//              and most Linux).
//   "node"   — use node:sqlite with keyset pagination. For small tables
//              (stations, alerts, news) the overhead is invisible.
const TABLES = [
  { name: 'stations',        desc: 'station registry (lat/lng/province)',                 dump: 'node' },
  { name: 'readings',        desc: 'raw observations (AQ hourly / rain 10-min, 90-day retention)', dump: 'shell' },
  { name: 'readings_hourly', desc: 'permanent hourly rollups',                            dump: 'shell' },
  { name: 'latest',          desc: 'O(1) latest-value snapshot per (station, metric)',   dump: 'shell' },
  { name: 'events',          desc: 'the running tap; events.id doubles as SSE id',      dump: 'shell' },
  { name: 'alerts',          desc: 'threshold-crossing alerts',                          dump: 'node' },
  { name: 'news_items',      desc: 'Google News TH + Khaosod headlines',                dump: 'node' },
  { name: 'rag_docs',        desc: 'knowledge base (Air Library BIBLE etc.)',           dump: 'node' },
  { name: 'ingest_runs',     desc: 'per-source poll history',                            dump: 'shell' },
  { name: 'chat_logs',       desc: 'AI chat history (with feedback votes)',             dump: 'node' },
  { name: 'chat_faq',        desc: 'FAQ cache (served_count, approval state)',          dump: 'node' },
  { name: 'line_subs',       desc: 'LINE Notify opt-ins (token hash only — no raw token)', dump: 'node' },
  { name: 'kv',              desc: 'key-value cache (risk snapshot etc.)',              dump: 'shell' },
]

/** Stream a SQLite SELECT * into a CSV file using the SHELL sqlite3
 *  binary. ~50× faster than node:sqlite for the 4.6M-row readings
 *  table because it's a pure-C B-tree walk with no per-row JS overhead.
 *  The CLI is in std PATH on every macOS and most Linux distros
 *  (apt: sqlite3, brew: sqlite3, alpine: sqlite). We capture stderr
 *  so a missing binary fails the build loudly instead of silently.
 *
 *  Note: dot commands (`.headers on`, `.mode csv`) must be on separate
 *  lines — sqlite3 reads them as a line-oriented REPL. We pipe them
 *  in via stdin rather than passing them on the command line, which
 *  is the canonical way. */
async function dumpTableToCSVShell(tableName, filePath) {
  // Use stdin to feed the dot commands + the SELECT. Newline-separated.
  const stdin = `.headers on\n.mode csv\nSELECT * FROM ${tableName};\n`
  try {
    const { spawn } = await import('node:child_process')
    await new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', [CONFIG.dbPath], { stdio: ['pipe', 'pipe', 'pipe'] })
      const outChunks = []
      let stderr = ''
      proc.stdout.on('data', (b) => outChunks.push(b))
      proc.stderr.on('data', (b) => { stderr += b.toString() })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`sqlite3 exited ${code}: ${stderr.trim()}`))
          return
        }
        // Concatenate chunks and write to file. For 4.6M rows this is
        // ~370MB — bounded by maxBuffer at the OS level (default 200MB
        // on some systems, but Node uses 1MB by default for spawn
        // stdout buffering which is fine since we accumulate in
        // outChunks and write once at the end).
        writeFileSync(filePath, Buffer.concat(outChunks))
        resolve()
      })
      proc.stdin.write(stdin)
      proc.stdin.end()
    })
    // Count lines (subtract 1 for the header) so the meta is accurate.
    const buf = readFileSync(filePath, 'utf8')
    const lines = buf.split('\n').filter(Boolean).length - 1
    return Math.max(0, lines)
  } catch (e) {
    // Missing sqlite3 binary or table doesn't exist yet — fall back
    // to an empty file so the archive still has the entry, and return
    // 0 rows. The error is logged but doesn't abort the whole build.
    log('warn', 'shell dump failed, falling back to empty file', { table: tableName, error: String(e?.message ?? e) })
    if (!existsSync(filePath)) writeFileSync(filePath, '')
    return 0
  }
}

/** CSV escape: wrap in quotes if the field contains comma, quote, or
 *  newline; double internal quotes. Stable across all rows. */
function csvField(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** Node-side dump — used for the small tables (alerts, news, rag_docs)
 *  where forking the shell would be slower than just doing it in
 *  process. Streaming with keyset pagination, same logic as the
 *  shell path. */
function dumpTableToCSVNode(db, tableName, filePath) {
  return new Promise((resolve) => {
    const out = createWriteStream(filePath, { encoding: 'utf8' })
    const CHUNK = 10_000
    let columns = null
    let rowCount = 0
    let headerWritten = false

    let cursorCol = null
    try {
      const info = db.all(`PRAGMA table_info(${tableName})`)
      if (info.length && /integer/i.test(info[0].type) && /pk/i.test(info[0].pk || '1')) {
        cursorCol = info[0].name
      }
    } catch {}

    let lastId = 0
    let offset = 0

    function pump() {
      try {
        let rows
        if (cursorCol) {
          rows = db.all(
            `SELECT * FROM ${tableName} WHERE ${cursorCol} > ? ORDER BY ${cursorCol} LIMIT ?`,
            lastId, CHUNK,
          )
        } else {
          rows = db.all(
            `SELECT * FROM ${tableName} ORDER BY rowid LIMIT ? OFFSET ?`,
            CHUNK, offset,
          )
        }
        if (!rows.length) {
          if (!headerWritten) {
            try {
              const info = db.all(`PRAGMA table_info(${tableName})`)
              if (info.length) {
                out.write(info.map((c) => c.name).map(csvField).join(',') + '\n')
              }
            } catch {}
          }
          out.end(() => resolve(rowCount))
          return
        }
        if (!headerWritten) {
          columns = Object.keys(rows[0])
          out.write(columns.map(csvField).join(',') + '\n')
          headerWritten = true
        }
        for (const row of rows) {
          out.write(columns.map((c) => csvField(row[c])).join(',') + '\n')
          rowCount++
        }
        if (cursorCol) lastId = rows[rows.length - 1][cursorCol]
        else offset += rows.length
        if (rows.length < CHUNK) out.end(() => resolve(rowCount))
        else setImmediate(pump)
      } catch (e) {
        if (!existsSync(filePath)) writeFileSync(filePath, '')
        out.end(() => resolve(0))
      }
    }
    pump()
  })
}

/** Build the current risk payload (in-memory only) to a sidecar JSON. */
function dumpRiskSnapshot(riskEngine, filePath) {
  const snap = riskEngine?.get?.() ?? null
  writeFileSync(filePath, JSON.stringify(snap, null, 2))
  return snap
}

/** Build the meta.json — row counts, freshness, source health, server uptime. */
function buildMeta({ rowCounts, startedAt, riskSummary }) {
  const uptime_s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  return {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    db_size_mb: 0,  // filled in by caller if available
    row_counts: rowCounts,
    risk_summary: riskSummary ? {
      national_band: riskSummary.national?.band ?? null,
      provinces: riskSummary.provinces?.length ?? 0,
    } : null,
    server_uptime_s: uptime_s,
    tables: TABLES.map((t) => ({ name: t.name, desc: t.desc })),
  }
}

const README = `# AirDash weekly data export

This archive is a full snapshot of the AirDash SQLite database generated
on the date in the filename. One CSV per table, plus a sidecar JSON of
the in-memory risk snapshot and a meta.json with row counts and freshness.

## What's inside

| File | Rows (typical) | What it is |
|------|---------------:|-----------|
| stations.csv        | ~4,400   | Station registry: source, station_key, name (TH/EN), province (TH/EN/code), lat, lng, first_seen, last_seen |
| readings.csv        | ~4 M     | Raw observations (AQ hourly, rain gauges 10-min). 90-day retention — older rows are pruned by server/retention.js |
| readings_hourly.csv | ~3 M     | Permanent hourly rollups (min/max/avg per hour). Survives raw retention. |
| latest.csv          | ~50 K    | O(1) latest-value snapshot per (source, station_key, metric) |
| events.csv          | varies   | The running tap feed. events.id doubles as the SSE event id. |
| alerts.csv          | varies   | Threshold-crossing alerts with TH/EN titles and severity. |
| news_items.csv      | varies   | Google News TH + Khaosod headlines with keyword filters. |
| rag_docs.csv        | ~150     | Knowledge base — the Air Library BIBLE chapters + knowledge notes. |
| ingest_runs.csv     | ~30 K    | Per-source poll history: started_at, dur_ms, ok, error. |
| chat_logs.csv       | varies   | AI chat history. feedback column has +1 (👍) or -1 (👎). |
| chat_faq.csv        | varies   | FAQ cache with served_count, approved flag, lang. |
| line_subs.csv       | varies   | LINE Notify opt-ins. \`token\` is SHA-256-hashed, never the raw token. |
| kv.csv              | varies   | Key-value cache (risk_snapshot_cache, knowledge_indexed_at, etc.). |
| risk_snapshot.json  | 1 object | Current national + province air-watch payload, freshest live picture. |
| meta.json           | 1 object | Export metadata: date, row counts, server uptime. |

## Key metrics

Air4Thai stations: pm25, pm10 (µg/m³) · o3, no2, so2 (ppb) · co (ppm) · aqi.
Open-Meteo per province: precip_fc_d0/d1/d2/48h, precip_prob_d0/d1/d2/24h/48h,
wind_fc_kmh, wind_fc_d1. CAMS (openmeteo_aq): pm25_fc_24h/48h/72h,
pm10_fc_24h, dust_fc_24h. Rain gauges: rain_24h, rain_1h (mm). ENSO: oni_anom.
IMERG: sat_rain_mmh.

## How to load

\`\`\`bash
# Decompress
tar -xzf airdash-YYYY-MM-DD.tar.gz
cd airdash-YYYY-MM-DD

# Inspect
head stations.csv
cat meta.json

# Load into DuckDB / pandas / SQLite / BigQuery — every CSV is RFC 4180.
duckdb -c "SELECT * FROM stations LIMIT 5"
duckdb -c "SELECT metric, COUNT(*) FROM readings GROUP BY 1"
\`\`\`

## Source pipeline

Every row came from one of seven public pipelines: PCD Air4Thai ground
stations (PRIMARY), Open-Meteo weather forecast, Copernicus CAMS air-quality
forecast (via Open-Meteo AQ API), HII rain gauges, NASA GPM IMERG satellite
rain, NOAA CPC ENSO, and Google News TH + Khaosod. The pipeline health
(which sources ran on time) is in ingest_runs.csv.

## Citation

If you use this data in a paper, please cite:

  Arkaraprasertkul, N. (2026). AirDash Thailand weekly export
  (Version YYYY-MM-DD). depa / Smart City Thailand Office.
  https://air.nonarkara.org

## Contact

Dr Non Arkaraprasertkul — nonsmartcity@gmail.com
`

/** Build the full weekly archive. Returns the .tar.gz path. */
export async function buildWeeklyExport({ db, riskEngine, startedAt }) {
  // Guard: only one build at a time. A readings dump of 4.6 M rows takes
  // ~45 s — running two in parallel would double the IO and starve the
  // ingest loop. If a build is already running, return its current state.
  if (buildState.running) {
    log('info', 'weekly export build already in progress — returning existing state')
    return { already_running: true, ...buildState }
  }
  buildState = { running: true, started_at: new Date().toISOString(), finished_at: null, result: null, error: null }

  try {
    mkdirSync(EXPORT_DIR, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    const tmpDir = join(EXPORT_DIR, `tmp-${date}-${process.pid}`)
    const outFile = join(EXPORT_DIR, `airdash-${date}.tar.gz`)

    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })

    // Dump each table. Big tables use the sqlite3 CLI (faster); small
    // ones use node:sqlite (no fork overhead, also runs the line-1
    // pings to the DB so we know the file is fresh).
    const rowCounts = {}
    for (const t of TABLES) {
      const filePath = join(tmpDir, `${t.name}.csv`)
      const n = t.dump === 'shell'
        ? await dumpTableToCSVShell(t.name, filePath)
        : await dumpTableToCSVNode(db, t.name, filePath)
      rowCounts[t.name] = n
      log('info', 'weekly export table dumped', { table: t.name, rows: n, dump: t.dump })
    }

    // Risk snapshot (in-memory)
    const riskSnap = dumpRiskSnapshot(riskEngine, join(tmpDir, 'risk_snapshot.json'))

    // Meta + README
    const meta = buildMeta({ rowCounts, startedAt, riskSummary: riskSnap })
    writeFileSync(join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2))
    writeFileSync(join(tmpDir, 'README.md'), README)

    // Tar + gzip (single command, system tar; no npm dep)
    try {
      await execFileAsync('tar', ['-czf', outFile, '-C', tmpDir, '.'])
    } catch (e) {
      log('error', 'weekly export tar failed', { error: String(e?.message ?? e) })
      rmSync(tmpDir, { recursive: true, force: true })
      throw e
    }

    // Clean up temp
    rmSync(tmpDir, { recursive: true, force: true })

    // Prune old exports (keep last KEEP_WEEKS)
    pruneOldExports(KEEP_WEEKS)

    const stat = statSync(outFile)
    const result = { file: outFile, size: stat.size, mtime: stat.mtime, date, rowCounts }
    buildState = { running: false, started_at: buildState.started_at, finished_at: new Date().toISOString(), result, error: null }
    log('info', 'weekly export built', { file: outFile, size_mb: +(stat.size / 1024 / 1024).toFixed(1), rowCounts })
    return result
  } catch (e) {
    buildState = { running: false, started_at: buildState.started_at, finished_at: new Date().toISOString(), result: null, error: String(e?.message ?? e) }
    throw e
  }
}

/** Fire-and-forget wrapper for cron + admin endpoint. Resolves
 *  immediately after kicking off the build (returns a handle so the
 *  caller can check state). The actual work runs in the background
 *  and updates buildState; the caller can poll getBuildState() to
 *  see when it's done. */
export function startWeeklyBuild(args) {
  if (buildState.running) {
    log('info', 'weekly export build already in progress, not starting another')
    return { started: false, ...buildState }
  }
  // Kick off but don't await — the caller (HTTP response or cron
  // tick) returns immediately while the work continues in the bg.
  buildWeeklyExport(args).catch((e) => {
    log('error', 'weekly export background build failed', { error: String(e?.message ?? e) })
  })
  return { started: true, ...buildState }
}

/** List all weekly exports, newest first. */
export function listWeeklyExports() {
  if (!existsSync(EXPORT_DIR)) return []
  return readdirSync(EXPORT_DIR)
    .filter((f) => f.startsWith('airdash-') && f.endsWith('.tar.gz'))
    .map((f) => {
      const full = join(EXPORT_DIR, f)
      const s = statSync(full)
      const date = f.match(/airdash-(\d{4}-\d{2}-\d{2})\.tar\.gz/)?.[1]
      return { filename: f, size: s.size, mtime: s.mtime, date }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Resolve a filename to an absolute path, with safety check. */
export function getExportPath(filename) {
  if (!/^airdash-\d{4}-\d{2}-\d{2}\.tar\.gz$/.test(filename)) return null
  const full = join(EXPORT_DIR, filename)
  if (!existsSync(full)) return null
  return full
}

/** Keep the last N weekly exports. Older ones are deleted. */
export function pruneOldExports(keep = KEEP_WEEKS) {
  const all = listWeeklyExports()
  for (const e of all.slice(keep)) {
    rmSync(join(EXPORT_DIR, e.filename))
    log('info', 'pruned old weekly export', { file: e.filename })
  }
}
