// TMD weather relay from the FloodDash twin: relay validation, the point
// join, the landmark/destination search ranking, and wiring. No DB, no
// network — the fixture is a real (trimmed) /api/weather payload.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parseRelay, readTmdWeather, KV_KEY } from '../server/sources/tmd-relay.js'
import { weatherAt, nearestSynop, upcomingDays } from '../server/weather.js'
import { searchGazetteer, destinationCore } from '../server/gazetteer.js'
import { SOURCES } from '../server/sources-catalog.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}
const NOW = Date.parse('2026-09-16T23:50:00+07:00')
const day = (d, i) => ({ date: `2026-09-${String(16 + i).padStart(2, '0')}`, tmax: 30 + d, tmin: 23, rain_pct: 60, cond_th: 'ฝนฟ้าคะนอง', cond_en: 'Heavy Rain', wind_kmh: 10 })
const loc = (key, kind, th, en, code, lat, lng) => ({ key, kind, name_th: th, name_en: en, province_code: code, lat, lng, days: [0, 1, 2, 3, 4, 5, 6].map((i) => day(0, i)) })
const locations = [loc('province:25', 'province', 'ปราจีนบุรี', 'Prachin Buri', '25', 14.05, 101.37), loc('province:10', 'province', 'กรุงเทพมหานคร', 'Bangkok', '10', 13.77, 100.5), loc('town:huahin', 'town', 'หัวหิน', 'Hua Hin', '77', 12.5684, 99.9577)]
while (locations.length < 70) locations.push(loc(`province:${locations.length}`, 'province', 'x', 'x', String(locations.length), 15 + locations.length / 100, 100))
const station = (wmo, en, lat, lng, obs) => ({ wmo, name_th: en, name_en: en, lat, lng, obs_time: obs, temp_c: 20.4, rh_pct: 99, wind_kt: 0, wind_kmh: 0, visibility_km: 0.1, rain_24h_mm: 21.6, tmax_c: 29, tmin_c: 20 })
const stations = [station('48430', 'NAKORNNAYOK', 14.21667, 101.38333, '2026-09-16T22:00'), station('48455', 'BANGKOK', 13.73, 100.56, '2026-09-16T22:00'), station('48475', 'HUA HIN', 12.586, 99.964, '2026-09-16T22:00')]
while (stations.length < 80) stations.push(station(String(50000 + stations.length), 'x', 5 + stations.length / 10, 99, '2026-09-16T22:00'))
const RELAY_BODY = { agency_en: 'Thai Meteorological Department', forecast: { build_date: '2026-09-16 23:57:29', locations }, stations }

// ── relay ──
{
  const rel = parseRelay(RELAY_BODY)
  check('parseRelay keeps forecast + stations', rel.forecast.locations.length >= 70 && rel.stations.length >= 80)
  let threw = false; try { parseRelay({ forecast: { locations: [] }, stations }) } catch { threw = true }
  check('too few locations is refused', threw)
  threw = false; try { parseRelay(null) } catch { threw = true }
  check('null body is refused', threw)
  const fresh = { ...rel, fetched_at: '2026-09-16T16:50:00.000Z' }
  const db = { kvGet: (k) => (k === KV_KEY ? JSON.stringify(fresh) : null) }
  check('readTmdWeather returns a fresh relay', readTmdWeather(db, NOW)?.stations.length >= 80)
  check('readTmdWeather returns null after 4 h', readTmdWeather(db, NOW + 5 * 3600 * 1000) === null)
  check('readTmdWeather survives broken kv', readTmdWeather({ kvGet: () => '{nope' }, NOW) === null)
}

// ── join ──
{
  const rel = parseRelay(RELAY_BODY)
  const w = weatherAt(rel, { lat: 14.326, lng: 101.511, province_code: '25', now: NOW })
  check('Khao Yai → Prachin Buri province forecast, 5 days from today', w?.forecast?.for_en === 'Prachin Buri' && w.forecast.days.length === 5 && w.forecast.days[0].date === '2026-09-16', JSON.stringify(w?.forecast?.days?.map((d) => d.date)))
  check('nearest station is Nakhon Nayok with distance + age', w?.station?.name_en === 'NAKORNNAYOK' && w.station.distance_km > 10 && w.station.distance_km < 30 && w.station.age_h < 6, JSON.stringify(w?.station))
  check('via flooddash is stated', w?.via === 'flooddash')
  const hh = weatherAt(rel, { lat: 12.57, lng: 99.96, province_code: '77', now: NOW })
  check('within 30 km of Hua Hin the destination forecast wins', hh?.forecast?.kind === 'town' && hh.forecast.for_en === 'Hua Hin')
  check('a silent station is null, not calm', nearestSynop(rel, 13.75, 100.5, { now: NOW + 8 * 3600 * 1000 }) === null)
  check('no relay → null', weatherAt(null, { lat: 13.7, lng: 100.5 }) === null)
  check('upcomingDays drops yesterday, caps at 5', upcomingDays({ days: [{ date: '2026-09-15' }, ...[16, 17, 18, 19, 20, 21].map((d) => ({ date: `2026-09-${d}` }))] }, { now: NOW }).length === 5)
  check('no undefined leaks', !JSON.stringify(w).includes('undefined'))
}

// ── search ──
{
  const db = { all: () => [] }
  for (const q of ['Khao Yai', 'เขาใหญ่']) {
    const r = searchGazetteer(db, { q, limit: 5 })
    const top = r.results[0]
    check(`"${q}" → Khao Yai National Park first`, top?.type === 'landmark' && top.subtype === 'park' && /Khao Yai National Park/.test(top.name_en), `${top?.type}:${top?.name_en}`)
  }
  check('"Bang Khen" is still the district', searchGazetteer(db, { q: 'Bang Khen', limit: 3 }).results[0]?.type === 'district')
  check('destinationCore strips the type word', destinationCore({ name_th: 'อุทยานแห่งชาติเขาใหญ่', name_en: 'Khao Yai National Park' }).join('|') === 'เขาใหญ่|Khao Yai')
  check('landmarks.json present', (() => { try { return JSON.parse(readFileSync(join(ROOT, 'public', 'geo', 'landmarks.json'), 'utf8')).length > 10000 } catch { return false } })())
}

// ── wiring ──
{
  check('tmd_relay is catalogued', !!SOURCES.find((s) => s.id === 'tmd_relay'))
  check('index.js registers the relay', /tmdRelay\]/.test(readFileSync(join(ROOT, 'server', 'index.js'), 'utf8')))
  check('api.js joins weather on /api/place', /detail\.weather = weatherAtDb/.test(readFileSync(join(ROOT, 'server', 'api.js'), 'utf8')))
  const search = readFileSync(join(ROOT, 'public', 'js', 'panels', 'search.js'), 'utf8')
  const citizen = readFileSync(join(ROOT, 'public', 'js', 'panels', 'citizen.js'), 'utf8')
  check('place card renders the strip', /weatherStripHtml\(d\.weather\)/.test(search))
  check('citizen page renders the strip', /weatherStripHtml\(w\?\.weather/.test(citizen))
  check('/api/weather is edge-mirrored', /'\/api\/weather'/.test(readFileSync(join(ROOT, 'functions', 'api', '[[path]].js'), 'utf8')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
