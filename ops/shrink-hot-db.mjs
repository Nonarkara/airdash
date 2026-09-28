#!/usr/bin/env node
// Compact the SSD working set (maintenance — the server must be STOPPED).
//
// The live DB on the internal SSD is a HOT TIER: the permanent record lives in
// the long-term archive on the 8 TB external drive (ops/archive-longterm.mjs).
// The server sheds a day or two of archived rain rows hourly; anything bigger
// is this script's job — a live bulk delete froze the server for 4–10+ s per
// batch on 2026-09-28.
//
// Method: rather than deleting ~90% of the table row by row (each delete
// maintains four indexes), COPY the rows to keep into a fresh table with the
// same DDL, swap it in, rebuild the secondary indexes once (sorted build),
// then VACUUM. Steps 1–4 run in ONE transaction: any failure rolls back and
// the DB is exactly as it was. The dropped duplicate idx_readings_lookup is
// simply not rebuilt.
//
//   launchctl bootout gui/$(id -u)/com.airdash.server      # stop
//   node ops/shrink-hot-db.mjs
//   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.airdash.server.plist
//
//   node ops/shrink-hot-db.mjs --db /tmp/copy.db --receipt-id 123   # rehearsal
import { statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

const { CONFIG } = await import('../server/config.js')
const { readArchiveReceipt, retentionCutoff } = await import('../server/retention.js')

const dbPath = resolve(arg('--db') ?? CONFIG.dbPath)
const isLive = dbPath === resolve(CONFIG.dbPath)
const gb = (p) => (existsSync(p) ? statSync(p).size / 1e9 : 0).toFixed(2)
const t = () => Date.now()
const secs = (t0) => `${((t() - t0) / 1000).toFixed(1)} s`
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
if (!receipt) { console.error('✗ No archive receipt — nothing is confirmed archived, so nothing may leave the SSD.'); process.exit(2) }
const hot = Object.entries(CONFIG.retention.hotDays ?? {})
if (!hot.length) { console.error('✗ CONFIG.retention.hotDays is empty — nothing to do.'); process.exit(2) }

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA busy_timeout = 5000')
db.exec('PRAGMA temp_store = FILE')          // VACUUM's copy: disk, not this RAM-starved host
db.exec('PRAGMA cache_size = -262144')       // 256 MB for the bulk work
const one = (sql, ...a) => Object.values(db.prepare(sql).get(...a) ?? {})[0]

const liveMax = one('SELECT MAX(id) FROM readings')
if (receipt.readings_src_id > liveMax) { console.error(`✗ Receipt (${receipt.readings_src_id}) is ahead of this DB (${liveMax}) — ids do not line up.`); process.exit(2) }
say(`db ${dbPath} (${gb(dbPath)} GB) · archived through id ${receipt.readings_src_id} of ${liveMax}`)

// Rows that may leave: hot source, older than its window, and archived.
const now = Date.now()
const dropWhere = hot.map(([src, days]) =>
  `(source = '${src.replace(/'/g, "''")}' AND obs_time < '${retentionCutoff(now, days)}' AND id <= ${Number(receipt.readings_src_id)})`).join(' OR ')

const ddl = one("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'readings'")
if (!/^CREATE TABLE ["`]?readings["`]?\s*\(/i.test(ddl)) { console.error('✗ unexpected readings DDL'); process.exit(1) }
const secondary = db.prepare(`SELECT name, sql FROM sqlite_master
  WHERE type = 'index' AND tbl_name = 'readings' AND sql IS NOT NULL AND name != 'idx_readings_lookup'`).all()

let t0 = t()
const total = one('SELECT COUNT(*) FROM readings')
db.exec('BEGIN IMMEDIATE')
try {
  db.exec(ddl.replace(/^CREATE TABLE ["`]?readings["`]?/i, 'CREATE TABLE readings_new'))
  const kept = Number(db.prepare(`INSERT INTO readings_new SELECT * FROM readings WHERE NOT (${dropWhere}) ORDER BY id`).run().changes)
  say(`copied ${kept.toLocaleString()} of ${total.toLocaleString()} rows to keep in ${secs(t0)}`)
  const dropped = one(`SELECT COUNT(*) FROM readings WHERE ${dropWhere}`)
  if (kept + dropped !== total) throw new Error(`count mismatch: kept ${kept} + dropped ${dropped} != ${total}`)
  t0 = t()
  db.exec('DROP TABLE readings')
  db.exec('ALTER TABLE readings_new RENAME TO readings')
  for (const ix of secondary) db.exec(ix.sql)
  say(`swapped table + rebuilt ${secondary.map((i) => i.name).join(', ')} in ${secs(t0)}`)
  if (!one("SELECT name FROM sqlite_master WHERE name = 'sqlite_autoindex_readings_1'")) throw new Error('unique index name changed')
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  console.error(`✗ rolled back, DB unchanged: ${err.message}`)
  process.exit(1)
}

t0 = t()
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
db.exec('VACUUM')
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
say(`VACUUM in ${secs(t0)} → ${gb(dbPath)} GB`)

t0 = t()
const qc = one('PRAGMA quick_check')
say(`quick_check: ${qc} (${secs(t0)}) · rows now ${one('SELECT COUNT(*) FROM readings').toLocaleString()}`)
db.close()
process.exit(qc === 'ok' ? 0 : 1)
