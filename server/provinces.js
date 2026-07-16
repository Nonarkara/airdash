// Province registry — all 77 provinces with DOPA codes and centroids, loaded
// from public/geo/provinces.json (CC0 mirror of the official registry). Used
// to (a) give Air4Thai stations a province_code (upstream only ships a Thai
// area string) and (b) drive the per-province Open-Meteo forecast points
// without depending on any station ingest having run first.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _list = null
let _byName = null

/** Strip spaces and the "จ."/"จังหวัด" prefixes Air4Thai sometimes ships. */
function normTh(s) {
  return String(s ?? '')
    .replace(/^จังหวัด/, '').replace(/^จ\./, '')
    .replace(/\s+/g, '').trim()
}

function normEn(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

export function allProvinces() {
  if (_list) return _list
  const raw = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'geo', 'provinces.json'), 'utf8'))
  _list = raw.map((p) => ({
    province_code: String(p.provinceCode),
    province_th: p.provinceNameTh,
    province_en: p.provinceNameEn,
    lat: p.lat,
    lng: p.lng,
  }))
  return _list
}

function nameIndex() {
  if (_byName) return _byName
  _byName = new Map()
  for (const p of allProvinces()) {
    _byName.set(normTh(p.province_th), p)
    _byName.set(normEn(p.province_en), p)
  }
  // Common shorthand Air4Thai uses for Bangkok.
  const bkk = allProvinces().find((p) => p.province_code === '10')
  if (bkk) {
    _byName.set(normTh('กรุงเทพฯ'), bkk)
    _byName.set(normEn('Bangkok Metropolis'), bkk)
  }
  return _byName
}

/** Look up a province record by Thai or English name; null when unknown. */
export function provinceByName(nameTh, nameEn) {
  const idx = nameIndex()
  return idx.get(normTh(nameTh)) ?? idx.get(normEn(nameEn)) ?? null
}
