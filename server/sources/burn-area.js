// ตามรอยเผา (Tam Roy Pao) — agricultural burn scars, split by crop.
//
// WHY THIS SOURCE EXISTS. Every other burning dataset available to this
// project answers "was this agricultural land?" and stops. GISTDA's fire
// dashboard classifies each hotspot into พื้นที่เกษตร / ป่าอนุรักษ์ /
// ป่าสงวน and so on, which is genuinely useful — but it cannot tell you
// whether the agricultural share was rice in January or sugarcane in
// March. Those are two different problems: different crop, different
// reason to burn, different actors, two months apart. Collapsing them
// into one "agriculture" number is what makes the national debate circle.
//
// This feed carries the crop. Sentinel-2 at 20 m, classified into rice /
// sugarcane / maize by HII + Kasetsart University (NRCT-funded, cane
// ground-truth from Khon Kaen Sugar), with urban, orchard and legally
// defined forest masked out first using Land Development Department
// land-use layers — so agricultural burning is separated from forest
// fire AT THE SOURCE rather than inferred downstream by us.
//
// Published accuracy (their own figures): 87.66% on cane plots (88,403
// of 100,853 rai checked), 80.84% overall multi-crop in Khon Kaen.
//
// CADENCE. Monthly CSVs, and only for the dust-smoke season — the
// publisher emits months 11, 12, 01, 02, 03 and 04 and nothing else.
// Polling hourly would be pointless; this runs daily and is a no-op for
// most of the year, which is correct behaviour, not a broken feed.
import { CONFIG } from '../config.js'

const BASE = 'https://tamroypao.hii.or.th/openburn'
const INDEX = `${BASE}/server/getCsvFiles.jsp`

// Season months, in season order. Anything outside this set is not
// published upstream at all.
const SEASON_MONTHS = new Set(['11', '12', '01', '02', '03', '04'])

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// The CSV is a plain comma file with a leading unnamed index column:
//   ,province_code,province_th,province_en,month,Paddy,Sugarcane,Mixed,Corn
// Thai province names contain no commas in this feed, but split on the
// header count rather than assuming, so a future comma cannot silently
// shift every numeric column left.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = lines[0].split(',').map((h) => h.trim())
  const idx = (name) => head.indexOf(name)
  const iCode = idx('province_code')
  const iTh = idx('province_th')
  const iEn = idx('province_en')
  const iMonth = idx('month')
  const iPaddy = idx('Paddy')
  const iCane = idx('Sugarcane')
  const iCorn = idx('Corn')
  const iMixed = idx('Mixed')
  if (iCode < 0 || iMonth < 0) return []

  const rows = []
  for (const line of lines.slice(1)) {
    const c = line.split(',')
    if (c.length !== head.length) continue
    const code = c[iCode]?.trim()
    const month = c[iMonth]?.trim()
    if (!code || !/^\d{6}$/.test(month)) continue
    const paddy = numOrNull(c[iPaddy])
    const cane = numOrNull(c[iCane])
    const corn = numOrNull(c[iCorn])
    const mixed = numOrNull(c[iMixed])
    rows.push({
      province_code: code,
      province_th: c[iTh]?.trim() || null,
      province_en: c[iEn]?.trim() || null,
      yyyymm: month,
      paddy_rai: paddy, cane_rai: cane, corn_rai: corn, mixed_rai: mixed,
      total_rai: [paddy, cane, corn, mixed].reduce((a, b) => a + (b ?? 0), 0),
    })
  }
  return rows
}

async function getText(url, signal) {
  const r = await fetch(url, { signal, headers: { accept: 'text/csv,application/json,*/*' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}

export default {
  name: 'burn_area',
  label_th: 'พื้นที่เผาไหม้ภาคเกษตร (ตามรอยเผา)',
  label_en: 'Agricultural burn scars (Tam Roy Pao)',
  intervalMs: CONFIG.intervals.burnArea ?? 24 * 3600_000,
  enabled: true,

  async run({ db }) {
    const ctl = AbortSignal.timeout(45_000)

    // The index tells us exactly which months exist, per year. Never
    // guess filenames — outside the Nov–Apr season most would 404, and a
    // feed that logs failures every day for seven months of the year
    // trains everyone to ignore its errors.
    const index = JSON.parse(await getText(INDEX, ctl))
    const prov = index?.prov ?? {}

    // A SEASON SPANS TWO CALENDAR YEARS: Nov and Dec sit in one year's
    // folder and Jan-Apr in the next. Taking the last two folders
    // therefore yields one complete season plus a headless one missing
    // its Nov/Dec — which silently understates the older season and
    // would have made the year-over-year comparison wrong in the
    // dashboard's favour. Three folders = two complete seasons.
    const years = Object.keys(prov).sort().slice(-3)

    let seen = 0
    let added = 0
    const now = new Date().toISOString()

    for (const year of years) {
      for (const file of prov[year] ?? []) {
        const m = /burn_area_province_(\d{4})(\d{2})\.csv$/.exec(file)
        if (!m || !SEASON_MONTHS.has(m[2])) continue
        let rows
        try {
          rows = parseCsv(await getText(`${BASE}/tamroypao/data/csv/province/${year}/${file}`, ctl))
        } catch {
          // One bad month must not abort the other eleven.
          continue
        }
        seen += rows.length
        db.tx(() => {
          for (const r of rows) {
            const res = db.run(
              `INSERT INTO burn_area
                 (province_code, yyyymm, province_th, province_en,
                  paddy_rai, cane_rai, corn_rai, mixed_rai, total_rai, fetched_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(province_code, yyyymm) DO UPDATE SET
                 province_th=excluded.province_th,
                 province_en=excluded.province_en,
                 paddy_rai=excluded.paddy_rai,
                 cane_rai=excluded.cane_rai,
                 corn_rai=excluded.corn_rai,
                 mixed_rai=excluded.mixed_rai,
                 total_rai=excluded.total_rai,
                 fetched_at=excluded.fetched_at`,
              r.province_code, r.yyyymm, r.province_th, r.province_en,
              r.paddy_rai, r.cane_rai, r.corn_rai, r.mixed_rai, r.total_rai, now,
            )
            added += res?.changes ?? 0
          }
        })
      }
    }
    return { seen, added }
  },
}
