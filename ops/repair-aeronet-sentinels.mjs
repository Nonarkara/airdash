// One-off data repair: AERONET sentinel values stored as measurements.
//
// server/sources/aeronet.js matched the literal string '-999.0' and nothing
// else, so the numeric '-999' that AERONET actually writes was stored as a
// real reading. Measured before this ran: 158 rows, 154 of them on the 1020 nm
// band and 4 on 500 nm. Optical depth is dimensionless and cannot be negative,
// so these were never measurements.
//
// The reader is fixed (it now validates physical range, so new sentinels
// cannot arrive), which is the part that matters long-term. This only cleans
// what is already stored. Every touched row is a value that was never a
// measurement, so there is no information to lose; the row itself, its
// timestamp and its other bands are left untouched.
//
// Run with --apply to write. Without it, this only reports.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'

const APPLY = process.argv.includes('--apply')
const BANDS = ['aod_440', 'aod_500', 'aod_675', 'aod_870', 'aod_1020']
const AOD_MAX = 5

const db = new DatabaseSync(CONFIG.dbPath)
const where = BANDS.map(b => `${b} < 0 OR ${b} > ${AOD_MAX}`).join(' OR ')
const before = db.prepare(`SELECT COUNT(*) c FROM aeronet_readings WHERE ${where}`).get().c

console.log(`rows holding an out-of-range optical depth: ${before}`)
if (!before) { console.log('nothing to repair'); db.close(); process.exit(0) }

// Show what is actually in there before touching it.
const kinds = db.prepare(
  `SELECT aod_440 v440, aod_500 v500, aod_675 v675, aod_870 v870, aod_1020 v1020, COUNT(*) c
     FROM aeronet_readings WHERE ${where} GROUP BY v440, v500, v675, v870, v1020
    ORDER BY c DESC LIMIT 10`).all()
console.log('distinct corrupted shapes (value, count):')
for (const k of kinds) {
  console.log(`  ${String(k.v440).padStart(7)} ${String(k.v500).padStart(7)} ${String(k.v675).padStart(7)} ` +
    `${String(k.v870).padStart(7)} ${String(k.v1020).padStart(7)}  x${k.c}`)
}

if (!APPLY) {
  console.log('\n--apply was not passed: nothing written.')
  db.close()
  process.exit(0)
}

db.exec('PRAGMA busy_timeout = 5000')
let fixed = 0
// Explicit transaction: raw node:sqlite has no .tx() helper, and a half-applied
// repair would leave the table in a state this script could not re-detect.
db.exec('BEGIN IMMEDIATE')
try {
  for (const b of BANDS) {
    fixed += db.prepare(`UPDATE aeronet_readings SET ${b} = NULL WHERE ${b} < 0 OR ${b} > ${AOD_MAX}`).run().changes
  }
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  console.error('✗ repair rolled back:', String(err))
  db.close()
  process.exit(1)
}

const after = db.prepare(`SELECT COUNT(*) c FROM aeronet_readings WHERE ${where}`).get().c
const survivors = db.prepare(
  `SELECT COUNT(*) c FROM aeronet_readings
    WHERE aod_440 IS NOT NULL OR aod_500 IS NOT NULL OR aod_675 IS NOT NULL
       OR aod_870 IS NOT NULL OR aod_1020 IS NOT NULL`).get().c

console.log(`\ncells nulled: ${fixed}`)
console.log(`rows still out of range: ${after}`)
console.log(`rows retaining at least one band: ${survivors}`)
if (after !== 0) { console.error('✗ repair incomplete'); db.close(); process.exit(1) }
console.log('✓ repair complete')
db.close()