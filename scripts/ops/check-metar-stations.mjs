// Verify the METAR station table against aviationweather.gov itself.
//
//   node scripts/ops/check-metar-stations.mjs
//
// Why this exists: the table was typed from memory and was wrong in 13 of 28
// rows (10 dead codes, 3 filed under the wrong city) for six weeks, while the
// source reported "ok" every run. Run it after touching THAI_STATIONS, and
// whenever METAR coverage looks thin. Exit 0 = every code answers and sits
// where the service says it does (within 10 km); exit 1 otherwise.
import { THAI_STATIONS } from '../../server/sources/metarVisibility.js'

const ids = THAI_STATIONS.map((s) => s.icao).join(',')
const res = await fetch(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=72`,
  { headers: { 'user-agent': 'AirDash/ops-check (public air-quality dashboard)' }, signal: AbortSignal.timeout(40_000) })
if (!res.ok) { console.error(`✗ aviationweather.gov answered HTTP ${res.status}`); process.exit(2) }
const seen = new Map()
for (const r of await res.json()) if (!seen.has(r.icaoId)) seen.set(r.icaoId, r)

const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
let bad = 0
for (const s of THAI_STATIONS) {
  const r = seen.get(s.icao)
  if (!r) { console.log(`✗ ${s.icao} ${s.name_en}: no METAR in the last 72 h`); bad++; continue }
  const off = km(s, { lat: r.lat, lng: r.lon })
  if (off > 10) { console.log(`✗ ${s.icao} ${s.name_en}: the service puts it ${off.toFixed(0)} km away (${r.name})`); bad++ }
}
console.log(bad ? `\n${bad} of ${THAI_STATIONS.length} stations are wrong` : `✓ all ${THAI_STATIONS.length} stations answer and sit where the service says`)
process.exit(bad ? 1 : 0)
