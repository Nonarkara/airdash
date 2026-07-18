// Patterns engine — "WHAT do history and geography teach about dust HERE?"
// Hour-of-day, day-of-week, and month-of-year PM2.5 profiles per province,
// computed from every reading we hold (air4thai ground stations, the
// openmeteo_aq_hist 92-day backfill, and rolled-up readings_hourly), plus a
// static month-climatology PRIOR table for the focus provinces drawn from
// published knowledge. Observed rows and prior rows are labelled honestly —
// source:'observed' vs source:'prior' — and the insights say how many data
// points back each claim.
//
// Query discipline: every GROUP BY here filters `metric` FIRST so the scans
// ride the covering index idx_readings_metric_cover
// (metric, obs_time, source, station_key, value) and never seek the huge
// readings table itself.
import { allProvinces } from './provinces.js'

const CACHE_MS = 30 * 60_000
const HOURLY_WINDOW_DAYS = 120 // generous: raw readings are pruned at 90d anyway

// Static month-climatology priors for the focus provinces — published,
// widely-reported seasonal patterns (PCD annual reports, GISTDA burn-scar
// mapping, IQAir yearly summaries). These are PRIORS, not our measurements.
const MONTH_PRIORS = {
  '50': { months: [2, 3, 4], th: 'เชียงใหม่: ฤดูเผา/หมอกควันพีค ก.พ.–เม.ย.', en: 'Chiang Mai: burning-season haze peaks Feb–Apr' },
  '57': { months: [2, 3, 4], th: 'เชียงราย: หมอกควันพีค ก.พ.–เม.ย. (รวมควันข้ามแดน)', en: 'Chiang Rai: haze peaks Feb–Apr (incl. transboundary smoke)' },
  '58': { months: [2, 3, 4], th: 'แม่ฮ่องสอน: หมอกควันพีค ก.พ.–เม.ย.', en: 'Mae Hong Son: haze peaks Feb–Apr' },
  '52': { months: [2, 3, 4], th: 'ลำปาง: ฤดูเผาพีค ก.พ.–เม.ย.', en: 'Lampang: burning season peaks Feb–Apr' },
  '10': { months: [11, 12, 1, 2], th: 'กรุงเทพฯ: ฝุ่นสะสมช่วงอากาศปิด พ.ย.–ก.พ.', en: 'Bangkok: stagnation-trapped PM peaks Nov–Feb' },
  '40': { months: [1, 2, 3], th: 'ขอนแก่น: ฝุ่นพีค ม.ค.–มี.ค. (เผาตอซัง)', en: 'Khon Kaen: peaks Jan–Mar (crop-residue burning)' },
  '19': { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], th: 'สระบุรี: PM10 สูงตลอดปี (โรงโม่/ปูนซีเมนต์ หน้าพระลาน)', en: 'Saraburi: PM10 elevated year-round (Na Phra Lan quarry/cement belt)' },
  '90': { months: [8, 9, 10], th: 'สงขลา/หาดใหญ่: หมอกควันข้ามแดนจากสุมาตรา ส.ค.–ต.ค.', en: 'Songkhla/Hat Yai: transboundary Sumatra haze episodes Aug–Oct' },
}

/** Rough official region by DOPA code range — for the national rollup. */
export function regionOf(code) {
  const n = Number(code)
  if (n >= 50 && n <= 58) return 'north'
  if (n >= 60 && n <= 67) return 'north' // lower north
  if (n >= 30 && n <= 49) return 'northeast'
  if (n >= 20 && n <= 27) return 'east'
  if (n >= 80 && n <= 96) return 'south'
  return 'central' // 10–19, 70–77 (central + west)
}

export const REGION_LABELS = {
  north: { th: 'ภาคเหนือ', en: 'North' },
  northeast: { th: 'ภาคอีสาน', en: 'Northeast' },
  east: { th: 'ภาคตะวันออก', en: 'East' },
  central: { th: 'ภาคกลาง/ตะวันตก', en: 'Central/West' },
  south: { th: 'ภาคใต้', en: 'South' },
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const hh = (h) => String(h).padStart(2, '0') + ':00'

function localCutoffDays(days) {
  return new Date(Date.now() + 7 * 3600_000 - days * 86_400_000).toISOString().slice(0, 16)
}

/** Best 3 consecutive hours (with midnight wrap) by average PM2.5. */
function peakWindow(hourly) {
  const avgByHour = new Array(24).fill(null)
  for (const row of hourly) avgByHour[row.hour] = row.avg
  let best = null
  for (let start = 0; start < 24; start++) {
    const hours = [start, (start + 1) % 24, (start + 2) % 24]
    const vals = hours.map((h) => avgByHour[h]).filter((v) => v !== null)
    if (vals.length < 3) continue
    const mean = vals.reduce((a, b) => a + b, 0) / 3
    if (!best || mean > best.avg) best = { start, end: (start + 3) % 24, avg: Math.round(mean * 10) / 10 }
  }
  if (!best) return null
  return { ...best, label: `${hh(best.start)}–${hh(best.end)}` }
}

export function createPatterns(db) {
  const provCache = new Map() // code -> { at, payload }
  let natCache = null

  // The three observation feeds, unioned. `metric` is always the FIRST
  // predicate so idx_readings_metric_cover covers the scan.
  function unionSql(select, provinceFilter) {
    const provAir = provinceFilter ? 'AND s.province_code = ?2' : ''
    const provHist = provinceFilter ? 'AND station_key = ?2' : ''
    return `
      SELECT ${select('r.obs_time', 'r.value')}
        FROM readings r JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.metric = 'pm25' AND r.obs_time >= ?1 AND r.source = 'air4thai' ${provAir}
      UNION ALL
      SELECT ${select('obs_time', 'value')}
        FROM readings
       WHERE metric = 'pm25_hist' AND source = 'openmeteo_aq_hist' ${provHist}
      UNION ALL
      SELECT ${select("rh.hour || ':00'", 'rh.v_avg')}
        FROM readings_hourly rh JOIN stations s ON s.source = rh.source AND s.station_key = rh.station_key
       WHERE rh.source = 'air4thai' AND rh.metric = 'pm25' ${provinceFilter ? 'AND s.province_code = ?2' : ''}
      UNION ALL
      SELECT ${select("hour || ':00'", 'v_avg')}
        FROM readings_hourly
       WHERE source = 'openmeteo_aq_hist' AND metric = 'pm25_hist' ${provHist}`
  }

  function hourlyProfile(code) {
    const sel = (t, v) => `substr(${t}, 12, 2) AS k, ${v} AS v`
    const rows = db.all(
      `SELECT k, ROUND(AVG(v), 1) AS avg, COUNT(*) AS n
         FROM (${unionSql(sel, !!code)})
        WHERE k IS NOT NULL AND length(k) = 2
        GROUP BY k ORDER BY k`,
      ...(code ? [localCutoffDays(HOURLY_WINDOW_DAYS), String(code)] : [localCutoffDays(HOURLY_WINDOW_DAYS)]),
    )
    return rows.map((r) => ({ hour: Number(r.k), avg: r.avg, n: r.n }))
      .filter((r) => Number.isFinite(r.hour))
  }

  function weekdayProfile(code) {
    const sel = (t, v) => `CAST(strftime('%w', substr(${t}, 1, 10)) AS INTEGER) AS k, ${v} AS v`
    const rows = db.all(
      `SELECT k, AVG(v) AS avg, COUNT(*) AS n
         FROM (${unionSql(sel, !!code)})
        WHERE k IS NOT NULL GROUP BY k`,
      ...(code ? [localCutoffDays(HOURLY_WINDOW_DAYS), String(code)] : [localCutoffDays(HOURLY_WINDOW_DAYS)]),
    )
    let wSum = 0, wN = 0, eSum = 0, eN = 0
    for (const r of rows) {
      if (r.k === 0 || r.k === 6) { eSum += r.avg * r.n; eN += r.n }
      else { wSum += r.avg * r.n; wN += r.n }
    }
    const weekday_avg = wN ? Math.round((wSum / wN) * 10) / 10 : null
    const weekend_avg = eN ? Math.round((eSum / eN) * 10) / 10 : null
    const weekend_drop_pct = weekday_avg && weekend_avg
      ? Math.round((1 - weekend_avg / weekday_avg) * 100) : null
    return { weekday_avg, weekend_avg, n_weekday: wN, n_weekend: eN, weekend_drop_pct }
  }

  function monthlyClimatology(code) {
    const sel = (t, v) => `substr(${t}, 6, 2) AS k, ${v} AS v`
    // No time cutoff — month climatology wants ALL stored history.
    const rows = db.all(
      `SELECT k, ROUND(AVG(v), 1) AS avg, ROUND(MAX(v), 1) AS max, COUNT(*) AS n
         FROM (${unionSql(sel, !!code)})
        WHERE k IS NOT NULL AND length(k) = 2
        GROUP BY k ORDER BY k`,
      ...(code ? ['0000-01-01T00:00', String(code)] : ['0000-01-01T00:00']),
    )
    const observed = new Map()
    for (const r of rows) {
      const m = Number(r.k)
      if (m >= 1 && m <= 12) observed.set(m, { month: m, avg: r.avg, max: r.max, n: r.n, source: 'observed' })
    }
    const prior = code ? MONTH_PRIORS[String(code)] : null
    const monthly = []
    for (let m = 1; m <= 12; m++) {
      if (observed.has(m)) monthly.push(observed.get(m))
      else if (prior && prior.months.includes(m)) {
        monthly.push({ month: m, avg: null, max: null, n: 0, source: 'prior' })
      }
    }
    return { monthly, prior }
  }

  function buildInsightList({ hourly, peak, weekday, monthly, prior }) {
    const insights = []
    if (peak && hourly.length >= 12) {
      insights.push({
        th: `PM2.5 ที่นี่พีคช่วง ${peak.label} (เฉลี่ย ${peak.avg} µg/m³) — เลี่ยงออกกำลังกายกลางแจ้งช่วงนั้น`,
        en: `PM2.5 here peaks ${peak.label} (avg ${peak.avg} µg/m³) — avoid outdoor exercise in that window`,
      })
    }
    if (weekday.weekend_drop_pct !== null && weekday.n_weekday >= 100 && weekday.n_weekend >= 50) {
      if (weekday.weekend_drop_pct >= 8) {
        insights.push({
          th: `วันหยุดฝุ่นต่ำกว่าวันทำงาน ~${weekday.weekend_drop_pct}% (${weekday.weekend_avg} vs ${weekday.weekday_avg} µg/m³) — ลายนิ้วมือจราจร`,
          en: `Weekends run ~${weekday.weekend_drop_pct}% cleaner than weekdays (${weekday.weekend_avg} vs ${weekday.weekday_avg} µg/m³) — a traffic fingerprint`,
        })
      } else if (weekday.weekend_drop_pct <= -8) {
        insights.push({
          th: `วันหยุดฝุ่นสูงกว่าวันทำงาน (${weekday.weekend_avg} vs ${weekday.weekday_avg} µg/m³) — แหล่งกำเนิดไม่ใช่จราจรเป็นหลัก`,
          en: `Weekends run dirtier than weekdays (${weekday.weekend_avg} vs ${weekday.weekday_avg} µg/m³) — the dominant source is not commute traffic`,
        })
      }
    }
    const obsMonths = monthly.filter((m) => m.source === 'observed' && m.n >= 200)
    if (obsMonths.length >= 2) {
      const worst = obsMonths.reduce((a, b) => (b.avg > a.avg ? b : a))
      insights.push({
        th: `เดือนที่แย่ที่สุดจากข้อมูลที่เก็บได้: ${TH_MONTHS[worst.month - 1]} (เฉลี่ย ${worst.avg} µg/m³ จาก ${worst.n} ค่า)`,
        en: `Worst observed month so far: ${EN_MONTHS[worst.month - 1]} (avg ${worst.avg} µg/m³ over ${worst.n} readings)`,
      })
    }
    if (prior) {
      const mths = prior.months.length === 12
        ? { th: 'ตลอดปี', en: 'year-round' }
        : {
            th: `${TH_MONTHS[prior.months[0] - 1]}–${TH_MONTHS[prior.months.at(-1) - 1]}`,
            en: `${EN_MONTHS[prior.months[0] - 1]}–${EN_MONTHS[prior.months.at(-1) - 1]}`,
          }
      insights.push({
        th: `ความรู้ตีพิมพ์ (prior): ${prior.th} — ช่วง ${mths.th}`,
        en: `Published prior: ${prior.en} — window ${mths.en}`,
      })
    }
    return insights
  }

  function computeProvince(code) {
    const prov = allProvinces().find((p) => p.province_code === String(code)) ?? null
    const hourly = hourlyProfile(code)
    const peak = peakWindow(hourly)
    const weekday = weekdayProfile(code)
    const { monthly, prior } = monthlyClimatology(code)
    const nObs = hourly.reduce((a, r) => a + r.n, 0)
    return {
      province_code: String(code),
      province_th: prov?.province_th ?? null,
      province_en: prov?.province_en ?? null,
      n_observations: nObs,
      hourly,
      peak_hours: peak,
      weekday,
      monthly,
      insights: buildInsightList({ hourly, peak, weekday, monthly, prior }),
      method_th: 'โปรไฟล์จากค่าที่เก็บจริง (Air4Thai + ประวัติ Open-Meteo 92 วัน) — เดือนที่ไม่มีข้อมูลใช้ความรู้ตีพิมพ์ (source:prior) — เป็นรูปแบบทางสถิติ ไม่ใช่การพยากรณ์',
      method_en: 'Profiles from stored observations (Air4Thai + 92-day Open-Meteo history); months without data fall back to published knowledge (source:prior) — statistical patterns, not a forecast',
    }
  }

  function computeNational() {
    const hourly = hourlyProfile(null)
    const peak = peakWindow(hourly)
    const weekday = weekdayProfile(null)
    // Per-region worst observed month: per-province month means, rolled up.
    const rows = db.all(
      `SELECT k AS month, code, AVG(v) AS avg, COUNT(*) AS n FROM (
         SELECT substr(r.obs_time, 6, 2) AS k, s.province_code AS code, r.value AS v
           FROM readings r JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
          WHERE r.metric = 'pm25' AND r.source = 'air4thai' AND s.province_code IS NOT NULL
         UNION ALL
         SELECT substr(obs_time, 6, 2) AS k, station_key AS code, value AS v
           FROM readings WHERE metric = 'pm25_hist' AND source = 'openmeteo_aq_hist'
         UNION ALL
         SELECT substr(rh.hour, 6, 2) AS k, s.province_code AS code, rh.v_avg AS v
           FROM readings_hourly rh JOIN stations s ON s.source = rh.source AND s.station_key = rh.station_key
          WHERE rh.source = 'air4thai' AND rh.metric = 'pm25' AND s.province_code IS NOT NULL
         UNION ALL
         SELECT substr(hour, 6, 2) AS k, station_key AS code, v_avg AS v
           FROM readings_hourly WHERE source = 'openmeteo_aq_hist' AND metric = 'pm25_hist'
       ) GROUP BY month, code`,
    )
    const byRegion = new Map()
    for (const r of rows) {
      const m = Number(r.month)
      if (!(m >= 1 && m <= 12)) continue
      const reg = regionOf(r.code)
      let acc = byRegion.get(reg)
      if (!acc) byRegion.set(reg, acc = new Map())
      let cell = acc.get(m)
      if (!cell) acc.set(m, cell = { sum: 0, n: 0 })
      cell.sum += r.avg * r.n
      cell.n += r.n
    }
    const regions = []
    for (const [reg, months] of byRegion) {
      let worst = null
      const table = []
      for (const [m, cell] of [...months.entries()].sort((a, b) => a[0] - b[0])) {
        const avg = Math.round((cell.sum / cell.n) * 10) / 10
        table.push({ month: m, avg, n: cell.n, source: 'observed' })
        if (!worst || avg > worst.avg) worst = { month: m, avg, n: cell.n }
      }
      regions.push({
        region: reg,
        label_th: REGION_LABELS[reg].th, label_en: REGION_LABELS[reg].en,
        monthly: table,
        worst_month: worst,
      })
    }
    regions.sort((a, b) => (b.worst_month?.avg ?? 0) - (a.worst_month?.avg ?? 0))
    const insights = []
    if (peak) {
      insights.push({
        th: `ทั่วประเทศ PM2.5 พีคช่วง ${peak.label} (เฉลี่ย ${peak.avg} µg/m³)`,
        en: `Nationally PM2.5 peaks ${peak.label} (avg ${peak.avg} µg/m³)`,
      })
    }
    if (regions.length && regions[0].worst_month) {
      const r0 = regions[0]
      insights.push({
        th: `ภูมิภาคที่เดือนแย่สุดหนักที่สุด: ${r0.label_th} — ${TH_MONTHS[r0.worst_month.month - 1]} เฉลี่ย ${r0.worst_month.avg} µg/m³`,
        en: `Region with the harshest worst-month: ${r0.label_en} — ${EN_MONTHS[r0.worst_month.month - 1]} avg ${r0.worst_month.avg} µg/m³`,
      })
    }
    return {
      scope: 'national',
      n_observations: hourly.reduce((a, r) => a + r.n, 0),
      hourly,
      peak_hours: peak,
      weekday,
      regions,
      priors: Object.entries(MONTH_PRIORS).map(([code, p]) => ({
        province_code: code, months: p.months, note_th: p.th, note_en: p.en, source: 'prior',
      })),
      insights,
      method_th: 'สรุปจากค่าที่เก็บจริงทุกจังหวัด — จะแม่นขึ้นเมื่อฐานข้อมูลโตขึ้น — ไม่ใช่การพยากรณ์',
      method_en: 'Summary of all stored observations, per region — sharpens as the DB grows — not a forecast',
    }
  }

  return {
    forProvince(code) {
      const key = String(code)
      const c = provCache.get(key)
      if (c && Date.now() - c.at < CACHE_MS) return c.payload
      const payload = computeProvince(key)
      provCache.set(key, { at: Date.now(), payload })
      return payload
    },
    national() {
      if (natCache && Date.now() - natCache.at < CACHE_MS) return natCache.payload
      const payload = computeNational()
      natCache = { at: Date.now(), payload }
      return payload
    },
  }
}
