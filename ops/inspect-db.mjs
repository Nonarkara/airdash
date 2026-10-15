// One-off read-only DB census: rows per source in `readings`, and the age of
// the oldest row per source. Answers "what is actually filling the hot tier, and
// is it being trimmed?". Never writes.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'
import { statSync } from 'node:fs'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })
const mb = (n) => (n / 1048576).toFixed(1)

console.log(`db ${CONFIG.dbPath}  ${mb(statSync(CONFIG.dbPath).size)} MB\n`)

console.log('readings by source (rows | oldest | newest):')
const rows = db.prepare(`
  SELECT source, COUNT(*) c, MIN(obs_time) oldest, MAX(obs_time) newest
  FROM readings GROUP BY source ORDER BY c DESC`).all()
let total = 0
for (const r of rows) {
  total += r.c
  console.log(`  ${String(r.c).padStart(10)}  ${r.oldest} -> ${r.newest}  ${r.source}`)
}
console.log(`  ${String(total).padStart(10)}  TOTAL\n`)

console.log('readings_hourly by source:')
for (const r of db.prepare(
  `SELECT source, COUNT(*) c FROM readings_hourly GROUP BY source ORDER BY c DESC`).all()) {
  console.log(`  ${String(r.c).padStart(10)}  ${r.source}`)
}

console.log('\nretention config:', JSON.stringify(CONFIG.retention))
console.log('db page_count/freelist (free pages reclaimable by VACUUM):',
  JSON.stringify(db.prepare('PRAGMA page_count').get()),
  JSON.stringify(db.prepare('PRAGMA freelist_count').get()),
  `page_size=${db.prepare('PRAGMA page_size').get().page_size}`)
db.close()