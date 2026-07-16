// Build public/geo/provinces.json with lat/lng centroids derived from
// the GeoJSON polygon for each province. Used by the gazetteer when a
// tambon/district result has no geometry of its own — we fall back to
// the parent province centroid so the map still flies somewhere useful.
import { readFileSync, writeFileSync } from 'node:fs'

const provinces = JSON.parse(readFileSync('public/geo/provinces.json', 'utf8'))
const boundaries = JSON.parse(readFileSync('public/geo/province-boundaries.geojson', 'utf8'))

// Build {pro_code → centroid}
const centroids = {}
for (const f of boundaries.features ?? []) {
  const code = f.properties?.pro_code
  if (!code) continue
  const c = polygonCentroid(f.geometry)
  if (c) centroids[code] = c
}

// Patch each province with its centroid. The provinces.json uses 2-digit
// codes like "10"; boundaries use the same. Match by string equality.
const patched = provinces.map((p) => {
  const code2 = String(p.provinceCode).padStart(2, '0')
  const c = centroids[code2]
  return c ? { ...p, lat: c.lat, lng: c.lng } : p
})

writeFileSync('public/geo/provinces.json', JSON.stringify(patched, null, 2) + '\n')

const withCentroid = patched.filter((p) => p.lat).length
console.log(`patched ${withCentroid}/${patched.length} provinces with centroids`)

function polygonCentroid(geom) {
  if (!geom) return null
  if (geom.type === 'Polygon') return centroidOfRings(geom.coordinates)
  if (geom.type === 'MultiPolygon') {
    // Largest ring wins (by signed area) — that's the "mainland" province body.
    let best = null, bestArea = 0
    for (const poly of geom.coordinates) {
      const a = ringArea(poly[0] ?? [])
      if (a > bestArea) { bestArea = a; best = poly }
    }
    return best ? centroidOfRings(best) : null
  }
  return null
}

function centroidOfRings(rings) {
  // Centroid of the outer ring only (interior holes ignored — small effect).
  const outer = rings[0] ?? []
  if (outer.length === 0) return null
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i]
    const [xj, yj] = outer[j]
    const f = xi * yj - xj * yi
    a += f
    cx += (xi + xj) * f
    cy += (yi + yj) * f
  }
  if (a === 0) return null
  a *= 0.5
  return { lat: cy / (6 * a), lng: cx / (6 * a) }
}

function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    a += xi * yj - xj * yi
  }
  return Math.abs(a * 0.5)
}