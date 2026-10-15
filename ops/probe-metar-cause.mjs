// Read-only: hazeEvidence sets `fog_likely` from humidity >= 90 OR a METAR
// observer cause of 'obscure' (FG/BR — mist/fog). Is that second disjunct ever
// reachable, or is it decorative like the tint block was?
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })

console.log('METAR stations and what the observer actually reports:')
const rows = db.prepare(
  `SELECT s.name_th, s.name_en, s.meta_json, l.value vis_km, l.obs_time
     FROM latest l JOIN stations s ON s.source=l.source AND s.station_key=l.station_key
    WHERE l.source='metar' AND l.metric='vis_km'`).all()

const causes = {}
for (const r of rows) {
  let c = null
  try { c = JSON.parse(r.meta_json ?? '{}').cause ?? null } catch { /* unparsable */ }
  causes[c ?? '(none)'] = (causes[c ?? '(none)'] ?? 0) + 1
}
console.log('  cause distribution:', JSON.stringify(causes))
console.log(`  stations carrying cause='obscure': ${causes.obscure ?? 0} of ${rows.length}`)
console.log(`  stations carrying ANY cause: ${rows.length - (causes['(none)'] ?? 0)} of ${rows.length}`)

console.log('\nWhat the METAR parser writes into meta_json (sample):')
for (const r of rows.slice(0, 3)) {
  let m = null
  try { m = JSON.parse(r.meta_json ?? '{}') } catch { /* unparsable */ }
  console.log(`  ${String(r.name_en ?? r.name_th).padEnd(18)} vis=${r.vis_km}  meta=${JSON.stringify(m)}`)
}

console.log('\nRaw METAR weather codes in stations.meta_json (weather field):')
const weather = db.prepare(
  `SELECT name_en, meta_json FROM stations WHERE source='metar' LIMIT 40`).all()
const wcodes = {}
for (const r of weather) {
  let m = null
  try { m = JSON.parse(r.meta_json ?? '{}') } catch { /* unparsable */ }
  const w = m?.weather ?? m?.raw_weather ?? '(none)'
  wcodes[w] = (wcodes[w] ?? 0) + 1
}
console.log(' ', JSON.stringify(wcodes))
db.close()