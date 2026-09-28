#!/usr/bin/env node
// One-time (and occasional) compaction of the SSD working set.
//
// The live DB on the internal SSD is a HOT TIER: the permanent record lives in
// the long-term archive on the 8 TB external drive (ops/archive-longterm.mjs).
// The server trims archived rain rows hourly (server/retention.js), but SQLite
// never gives freed pages back to the filesystem on its own. This script:
//   1. drops idx_readings_lookup (1.4 GB; duplicates the UNIQUE index),
//   2. trims archived hot-tier rows (no-op if the server already did),
//   3. VACUUMs, so the file actually shrinks, and
//   4. runs quick_check.
//
// It needs exclusive access: STOP THE SERVER FIRST for the live DB. It refuses
// to touch the live DB while the server answers /api/ping.
//
//   node ops/shrink-hot-db.mjs                       # live DB (server stopped)
//   node ops/shrink-hot-db.mjs --db /tmp/copy.db --receipt-id 123   # rehearsal
import { statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

const { CONFIG } = await import('../server/config.js')
const { openDb } = await import('../server/db.js')
const { trimArchivedHot, readArchiveReceipt } = await import('../server/retention.js')

const dbPath = resolve(arg('--db') ?? CONFIG.dbPath)
const isLive = dbPath === resolve(CONFIG.dbPath)
const gb = (p) => (existsSync(p) ? statSync(p).size / 1e9 : 0).toFixed(2)
const t = () => Date.now()
const say = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

if (isLive) {
  const up = await fetch(`http://127.0.0.1:${CONFIG.port}/api/ping`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok).catch(() => false)
  if (up) {
    console.error('✗ The server is running. Stop it first:\n  launchctl bootout gui/$(id -u)/com.airdash.server')
    process.exit(2)
  }
}

const receipt = arg('--receipt-id') ? { readings_src_id: Number(arg('--receipt-id')) } : readArchiveReceipt()
say(`db ${dbPath} (${gb(dbPath)} GB) · archive receipt: ${receipt?.readings_src_id ?? 'NONE — hot rows will be kept'}`)

// openDb applies the normal pragmas + schema. VACUUM builds its copy in the
// temp store, so point that at disk: this host is short of RAM.
process.env.AIRDASH_DB_PATH = dbPath
const db = openDb(dbPath)
db.exec('PRAGMA temp_store = FILE')
db.exec('PRAGMA cache_size = -262144') // 256 MB for the bulk work

let t0 = t()
db.exec('DROP INDEX IF EXISTS idx_readings_lookup')
say(`dropped idx_readings_lookup in ${((t() - t0) / 1000).toFixed(1)} s`)

t0 = t()
const r = await trimArchivedHot(db, { receipt, batch: 50_000, pauseMs: 0 })
say(`trimmed ${r.deleted.toLocaleString()} archived hot-tier rows in ${((t() - t0) / 1000).toFixed(1)} s${r.skipped ? ` (skipped: ${r.skipped})` : ''}`)

t0 = t()
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
db.exec('VACUUM')
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
say(`VACUUM in ${((t() - t0) / 1000).toFixed(1)} s → ${gb(dbPath)} GB`)

t0 = t()
const qc = db.get('PRAGMA quick_check')
const ok = Object.values(qc ?? {})[0] === 'ok'
say(`quick_check: ${Object.values(qc ?? {})[0]} (${((t() - t0) / 1000).toFixed(1)} s)`)
db.close?.()
process.exit(ok ? 0 : 1)
