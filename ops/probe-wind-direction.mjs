// Read-only: does the wind DIRECTION data actually exist, and is it fresh?
// /api/smoke uses wind_dir_d0/d1; /api/risk fetches only wind_fc_kmh. Before
// plumbing direction into the risk payload, confirm the columns are populated
// and current — plumbing for data that does not exist is worse than nothing.
import { openDb } from '../server/db.js'

const db = openDb()

console.log('wind-related metrics in `latest`:')
for (const r of db.all(
  `SELECT source, metric, COUNT(*) c FROM latest
    WHERE metric LIKE 'wind%' GROUP BY source, metric ORDER BY metric`)) {
  console.log(`  ${String(r.c).padStart(4)}  ${r.source}/${r.metric}`)
}

console.log('\nsample wind_dir values (the thing /api/risk is missing):')
for (const r of db.all(
  `SELECT station_key, metric, value, obs_time FROM latest
    WHERE metric LIKE 'wind_dir%' ORDER BY station_key LIMIT 8`)) {
  console.log(`  ${String(r.station_key).padEnd(6)} ${r.metric.padEnd(12)} ${String(r.value).padStart(6)}°  @ ${r.obs_time}`)
}

const dirs = db.all(
  `SELECT metric, COUNT(*) n, MIN(value) lo, MAX(value) hi,
          SUM(value IS NULL OR value < 0 OR value > 360) bad
     FROM latest WHERE metric LIKE 'wind_dir%' GROUP BY metric`)
console.log('\nrange check (degrees must be 0–360):')
for (const d of dirs) {
  console.log(`  ${d.metric.padEnd(12)} n=${String(d.n).padStart(4)} range=${d.lo}–${d.hi} out-of-range=${d.bad}`)
}

const age = db.get(
  `SELECT MIN(obs_time) oldest FROM latest WHERE metric LIKE 'wind_dir%'`).oldest
console.log(`\noldest wind_dir row: ${age}  (${age ? Math.round((Date.now() - Date.parse(age)) / 3600_000) : '?'} h ago)`)

// How many of the 77 provinces actually have a direction? That is the real
// coverage question for a per-province wind statement.
const provs = db.get(
  `SELECT COUNT(DISTINCT s.province_code) c FROM latest l
     JOIN stations s ON s.source=l.source AND s.station_key=l.station_key
    WHERE l.metric = 'wind_dir_d0' AND s.province_code IS NOT NULL`)
console.log(`provinces with a wind_dir_d0 reading: ${provs.c} of 77`)

const speed = db.get(
  `SELECT COUNT(DISTINCT s.province_code) c FROM latest l
     JOIN stations s ON s.source=l.source AND s.station_key=l.station_key
    WHERE l.metric = 'wind_fc_kmh' AND s.province_code IS NOT NULL`)
console.log(`provinces with a wind_fc_kmh reading: ${speed.c} of 77`)