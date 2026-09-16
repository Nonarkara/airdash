// Point-in-Thailand test via ray-casting against the real province
// boundary polygons — not a bounding box. A bbox over mainland Southeast
// Asia would misclassify the many places where Thailand, Myanmar, Laos
// and Cambodia border each other in irregular, non-rectangular ways
// (the entire Thai-Myanmar border along the Dawna range, for one).
// Zero npm dependencies, so this is a plain ray-casting implementation
// rather than pulling in a geometry library for one function.
//
// Deliberately answers only "inside Thailand or not" — a two-bucket
// split, matching the same simplification GISTDA's own fire dashboard
// uses (their "นอกประเทศ" / "outside country" legend entry does not
// further break out Myanmar vs Laos vs Cambodia either). Attempting a
// confident Myanmar-vs-Laos-vs-Cambodia split from bounding boxes alone
// would produce a precision this method cannot actually support near
// the tri-border areas — better to be honestly coarse than falsely exact.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEO_DIR = join(__dirname, '..', '..', 'public', 'geo')

let provinces = null
function loadProvinces() {
  if (provinces) return provinces
  const geojson = JSON.parse(
    readFileSync(join(GEO_DIR, 'province-boundaries.geojson'), 'utf8'))
  provinces = geojson.features.map((f) => ({
    province_th: f.properties.pro_th,
    province_en: f.properties.pro_en,
    // Normalise Polygon and MultiPolygon to an array of rings-arrays,
    // so the ray-cast below has one shape to walk regardless of which
    // GeoJSON geometry type a given province happens to use.
    polygons: f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates,
  }))
  return provinces
}

// Standard even-odd ray-casting test: count how many polygon edges a
// horizontal ray from the point crosses; odd = inside. `ring` is the
// outer boundary ring only (rings[0]) — Thai province polygons in this
// dataset carry no holes, so inner rings are not walked.
function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = (yi > lat) !== (yj > lat)
    if (!crosses) continue
    const xIntersect = xj + (lat - yj) * (xi - xj) / (yi - yj)
    if (lng < xIntersect) inside = !inside
  }
  return inside
}

function pointInPolygons(lng, lat, polygons) {
  for (const rings of polygons) {
    if (pointInRing(lng, lat, rings[0])) return true
  }
  return false
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {{ inThailand: boolean, province_th: string|null, province_en: string|null }}
 */
export function pointInThailand(lat, lng) {
  for (const p of loadProvinces()) {
    if (pointInPolygons(lng, lat, p.polygons)) {
      return { inThailand: true, province_th: p.province_th, province_en: p.province_en }
    }
  }
  return { inThailand: false, province_th: null, province_en: null }
}
