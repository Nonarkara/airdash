// Read-only probe of the live DB for science-engine planning.
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('data/airdash.db', { readOnly: true })

console.log('--- latest: source | metric | n | freshest obs_time')
for (const r of db.prepare(
  'SELECT source, metric, COUNT(*) n, MAX(obs_time) latest FROM latest GROUP BY source, metric ORDER BY source, metric',
).all()) console.log(r.source, '|', r.metric, '|', r.n, '|', r.latest)

console.log('\n--- gistda_pm25 sample rows')
for (const r of db.prepare(
  "SELECT station_key, metric, value, obs_time FROM latest WHERE source='gistda_pm25' LIMIT 8",
).all()) console.log(JSON.stringify(r))

console.log('\n--- openmeteo rh_pct presence')
for (const r of db.prepare(
  "SELECT station_key, value, obs_time FROM latest WHERE source='openmeteo' AND metric='rh_pct' LIMIT 5",
).all()) console.log(JSON.stringify(r))

console.log('\n--- air4thai o3 rows in readings, last 7 days')
const o3 = db.prepare(
  `SELECT COUNT(*) n, COUNT(DISTINCT station_key) stations, MIN(obs_time) lo, MAX(obs_time) hi
   FROM readings WHERE source='air4thai' AND metric='o3' AND obs_time >= datetime('now','-7 days')`,
).get()
console.log(JSON.stringify(o3))

console.log('\n--- o3 hourly coverage one station (last 30)')
for (const r of db.prepare(
  `SELECT obs_time, value FROM readings WHERE source='air4thai' AND metric='o3'
   ORDER BY obs_time DESC LIMIT 10`,
).all()) console.log(JSON.stringify(r))

console.log('\n--- stations with non-Thai province codes')
for (const r of db.prepare(
  `SELECT DISTINCT province_code, province_th, source FROM stations
   WHERE province_code IS NOT NULL AND (LENGTH(province_code) > 2 OR province_code GLOB '*[^0-9]*' OR CAST(province_code AS INTEGER) NOT BETWEEN 10 AND 96)`,
).all()) console.log(JSON.stringify(r))

console.log('\n--- risk province codes leaked? codes in latest join stations not in 10..96')
for (const r of db.prepare(
  `SELECT DISTINCT s.province_code, s.province_th, l.source
   FROM latest l JOIN stations s ON s.source=l.source AND s.station_key=l.station_key
   WHERE s.province_code IS NOT NULL AND CAST(s.province_code AS INTEGER) NOT BETWEEN 10 AND 96`,
).all()) console.log(JSON.stringify(r))
