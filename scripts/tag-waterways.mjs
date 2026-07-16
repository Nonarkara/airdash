// One-time preprocessing: tag each thai-rivers.geojson segment as a "named"
// major river (within THRESHOLD_KM of a real GloFAS gauge point defined in
// server/rivers.js) or "minor" (the generic waterway backdrop — canals,
// streams, and any river reach we don't have a named gauge for).
//
// Why proximity-to-gauge instead of a real stream-order derivation: the raw
// GeoJSON's segments are mostly geometrically disconnected (independently
// clipped/simplified — endpoint-matching found real topology in well under
// 20% of features even at 5km snap tolerance), so a from-scratch Strahler/
// Shreve magnitude computation would mostly produce noise. Proximity to our
// own curated, real, GloFAS-backed reach list is honest signal: every tagged
// segment is verifiably close to a station we already have live discharge
// data for. Run with: node scripts/tag-waterways.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { REACHES } from '../server/rivers.js'

const THRESHOLD_KM = 22
const SRC = new URL('../public/geo/thai-rivers.geojson', import.meta.url)

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLambda / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function nearestReach(coords) {
  let best = Infinity
  let bestReach = null
  for (const [lon, lat] of coords) {
    for (const r of REACHES) {
      const d = haversineKm(lat, lon, r.lat, r.lng)
      if (d < best) { best = d; bestReach = r }
    }
  }
  return { dist: best, reach: bestReach }
}

const geo = JSON.parse(await readFile(SRC, 'utf8'))
const tallies = {}
for (const feat of geo.features) {
  const { dist, reach } = nearestReach(feat.geometry.coordinates)
  if (dist <= THRESHOLD_KM && reach) {
    feat.properties.tier = 'named'
    feat.properties.reach = reach.id
    feat.properties.name_th = reach.name_th
    feat.properties.name_en = reach.name_en
    feat.properties.basin_th = reach.basin_th
    feat.properties.basin_en = reach.basin_en
    tallies[reach.id] = (tallies[reach.id] ?? 0) + 1
  } else {
    feat.properties.tier = 'minor'
  }
}

await writeFile(SRC, JSON.stringify(geo), 'utf8')
const namedCount = Object.values(tallies).reduce((a, b) => a + b, 0)
console.log(`Tagged ${namedCount}/${geo.features.length} segments as named-river (within ${THRESHOLD_KM}km of a gauge).`)
console.log(tallies)
