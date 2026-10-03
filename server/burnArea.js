// Historical agricultural scars. Comparisons use the same province/month cells,
// never a whole season against a partial publication or absent crop values.
import { allProvinces, isThaiProvinceCode } from './provinces.js'
export const CROP_FIELDS = ['paddy_rai', 'cane_rai', 'corn_rai', 'mixed_rai']
const valid = value => Number.isFinite(value) && value >= 0
export function seasonFor(month) {
  if (!/^\d{6}$/.test(month)) return null
  const year = Number(month.slice(0, 4)), m = Number(month.slice(4))
  if (![11, 12, 1, 2, 3, 4].includes(m)) return null
  const start = m >= 11 ? year : year - 1
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}
export function validSeason(season) {
  const match = /^(\d{4})\/(\d{2})$/.exec(season ?? '')
  return !!match && Number(match[1]) >= 2000 && Number(match[1]) <= 2100 && Number(match[2]) === (Number(match[1]) + 1) % 100
}
export function normalizeBurnRow(row) {
  const code = String(row.province_code ?? '').replace(/^TH/i, '')
  if (!isThaiProvinceCode(code) || !seasonFor(row.yyyymm)) return null
  const crops = Object.fromEntries(CROP_FIELDS.map(key => [key, valid(row[key]) ? row[key] : null]))
  // Recompute from components: older ingest stored all-null as a false zero.
  return { ...row, province_code: `TH${code}`, ...crops,
    total_rai: CROP_FIELDS.every(key => crops[key] !== null) ? CROP_FIELDS.reduce((sum, key) => sum + crops[key], 0) : null }
}
export function summarizeBurnRows(rows) {
  const byMonth = new Map()
  for (const row of rows) {
    const list = byMonth.get(row.yyyymm) ?? []
    list.push(row); byMonth.set(row.yyyymm, list)
  }
  return [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([yyyymm, list]) => {
    const sums = Object.fromEntries([...CROP_FIELDS, 'total_rai'].map(key => [key,
      list.every(row => valid(row[key])) ? list.reduce((sum, row) => sum + row[key], 0) : null]))
    return { yyyymm, ...sums, province_count: list.length,
      complete_rows: list.filter(row => row.total_rai !== null).length }
  })
}
export function compareBurnRows(current, previous) {
  const key = row => `${row.province_code}:${row.yyyymm.slice(4)}`
  const before = new Map(previous.map(row => [key(row), row]))
  const pairs = current.filter(row => valid(row.total_rai) && valid(before.get(key(row))?.total_rai))
  const currentTotal = pairs.length ? pairs.reduce((sum, row) => sum + row.total_rai, 0) : null
  const previousTotal = pairs.length ? pairs.reduce((sum, row) => sum + before.get(key(row)).total_rai, 0) : null
  return { basis: 'matched-province-months', paired_cells: pairs.length,
    current_cells: current.length, previous_cells: previous.length,
    excluded_current_cells: current.length - pairs.length, excluded_previous_cells: previous.length - pairs.length,
    months: [...new Set(pairs.map(row => row.yyyymm.slice(4)))].sort(),
    current_rai: currentTotal, previous_rai: previousTotal,
    change_pct: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal * 100 : null }
}
export function burnAreaPayload(db, { season = null, province = null, compare = null } = {}) {
  if (season && !validSeason(season)) throw new Error('season must be consecutive years, e.g. 2025/26')
  if (compare && (!season || !validSeason(compare))) throw new Error('compare requires a valid season and consecutive comparison years')
  const code = province ? String(province).replace(/^TH/i, '') : null
  if (code && !isThaiProvinceCode(code)) throw new Error('unknown Thai province')
  const all = db.all(`SELECT province_code, province_th, province_en, yyyymm,
    paddy_rai, cane_rai, corn_rai, mixed_rai, total_rai, fetched_at FROM burn_area ORDER BY yyyymm, total_rai DESC`)
    .map(normalizeBurnRow).filter(Boolean)
  const rows = all.filter(row => (!season || seasonFor(row.yyyymm) === season) && (!code || row.province_code === `TH${code}`))
  const published = new Set(all.map(row => row.province_code))
  const provinces = allProvinces().map(p => ({ code: `TH${p.province_code}`, th: p.province_th, en: p.province_en, published: published.has(`TH${p.province_code}`) }))
    .sort((a, b) => a.code.localeCompare(b.code))
  const months = summarizeBurnRows(rows)
  return { unit: 'rai', historical: true, season, province: code ? `TH${code}` : null,
    seasons: [...new Set(all.map(row => seasonFor(row.yyyymm)))].sort().reverse(), provinces,
    source: { name_th: 'ตามรอยเผา (สสน. + ม.เกษตรศาสตร์)', name_en: 'Tam Roy Pao (HII + Kasetsart University)',
      sensor: 'Sentinel-2, 20 m, crop-classified', url: 'https://tamroypao.hii.or.th/',
      note_th: 'รอยเผาภาคเกษตรย้อนหลัง ไม่ใช่ไฟที่กำลังไหม้', note_en: 'Historical agricultural burn scars, not active fires.',
      fetched_at: rows.map(row => row.fetched_at).filter(Boolean).sort().at(-1) ?? null },
    coverage: { months: months.map(m => m.yyyymm), expected_months: season ? 6 : null,
      scope_provinces: code ? 1 : 77, complete_cells: rows.filter(row => row.total_rai !== null).length,
      expected_cells: season ? (code ? 6 : 462) : null },
    total_rai: rows.length && rows.every(row => row.total_rai !== null) ? rows.reduce((sum, row) => sum + row.total_rai, 0) : null,
    months, rows,
    comparison: compare ? { season: compare, ...compareBurnRows(rows, all.filter(row => seasonFor(row.yyyymm) === compare && (!code || row.province_code === `TH${code}`))) } : null }
}
