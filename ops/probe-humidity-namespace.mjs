// Read-only: is the humidity lookup in hazeEvidence joining two namespaces?
// hazeEvidence builds `rh` as station_key -> value from the openmeteo feed,
// then reads it with `rh.get(provinceCode)`. Those are only the same thing if
// openmeteo station_keys are province codes.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })

const keys = db.prepare(
  `SELECT DISTINCT station_key FROM latest WHERE source='openmeteo' AND metric='rh_pct'`).all()
    .map(r => String(r.station_key))
console.log(`openmeteo rh_pct station_keys: ${keys.length} distinct`)
console.log('  sample:', keys.slice(0, 10).join(', '))

const numeric = keys.filter(k => /^\d+$/.test(k))
console.log(`  purely numeric (i.e. usable as a province code): ${numeric.length}/${keys.length}`)

console.log('\nopenmeteo stations and their province_code:')
for (const s of db.prepare(
  `SELECT station_key, province_code, name_th FROM stations WHERE source='openmeteo' LIMIT 6`).all()) {
  console.log(`  station_key=${String(s.station_key).padEnd(8)} province_code=${String(s.province_code).padEnd(6)} ${s.name_th ?? ''}`)
}

console.log('\nMETAR vis_km distinct values (lowest 15):')
console.log(db.prepare(
  `SELECT DISTINCT value FROM latest WHERE source='metar' AND metric='vis_km' ORDER BY value LIMIT 15`)
  .all().map(r => r.value).join(', '))
console.log('METAR max vis_km:', JSON.stringify(
  db.prepare(`SELECT MAX(value) mx FROM latest WHERE source='metar' AND metric='vis_km'`).get()))
db.close()