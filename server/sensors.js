// Sensor health / data-quality engine.
//
// Flood decisions are only as good as the data feeding them. This module scans
// the live database for stations that look broken, stale, or suspicious, and
// produces operator-readable signals. It is deliberately conservative:
// it flags *indicators* of sensor problems so a human can verify, never
// silently discards readings.
//
// Heuristics (all thresholds live in CONFIG.sensorHealth):
//   - stale    : no new reading within the source's expected freshness window
//   - flatline : value unchanged for many consecutive observations
//   - outlier  : value far outside plausible physical bounds
//   - mismatch : rain is falling nearby but the water level never moves,
//                or water is rising fast without any recent rain
import { CONFIG } from './config.js'
import { num } from './util.js'

// How long each source can go dark before we call it stale.
// These follow the native cadences in CONFIG.intervals with generous headroom
// for upstream hiccups and seasonal maintenance windows.
const FRESHNESS_MS = {
  thaiwater_wl: 4 * 3600_000,     // 10-min cadence → 4 h grace
  thaiwater_rain: 4 * 3600_000,
  thaiwater_dam: 48 * 3600_000,   // daily dam bulletins, allow 2 days
  rid_reservoir: 48 * 3600_000,   // reservoir bulletins are often daily
  air4thai: 8 * 3600_000,
  openmeteo: 12 * 3600_000,
  glofas: 48 * 3600_000,          // GloFAS can lag on weekends/holidays
  enso: 90 * 24 * 3600_000,       // monthly index
}

// Recent window we scan for flatline detection. Wide enough to hold well over
// the required identical-sample count for 10-min/hourly gauges, narrow enough
// that the two set-based flatline queries stay index-bounded (~0.5s vs the ~3s
// per-station loop this replaced).
const FLATLINE_WINDOW_H = 12

// Physical plausibility bounds per metric.
const BOUNDS = {
  rain_24h: { min: 0, max: 1500 },        // > 1.5 m/day is physically extreme
  rain_1h:  { min: 0, max: 300 },         // > 300 mm/h is world-record territory
  wl_msl:   { min: -50, max: 5000 },      // m above MSL
  situation_level: { min: 1, max: 5 },
  storage_pct: { min: 0, max: 200 },
  dam_storage_pct: { min: 0, max: 200 },
  rsv_storage_pct: { min: 0, max: 200 },
  aqi:      { min: 0, max: 1000 },
  pm25:     { min: 0, max: 1000 },
}

function parseObsTime(iso) {
  if (!iso) return NaN
  return Date.parse(iso.includes('T') ? iso : `${iso}T00:00:00+07:00`)
}

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

/** Aggregate latest rows into one record per physical station. */
function stationsFromLatest(db) {
  const rows = db.all(
    `SELECT l.source, l.station_key, l.metric, l.value, l.obs_time,
            s.name_th, s.name_en, s.province_th, s.province_en, s.province_code, s.lat, s.lng
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key`
  )
  const byStation = new Map()
  for (const r of rows) {
    const key = `${r.source}:${r.station_key}`
    let s = byStation.get(key)
    if (!s) {
      s = {
        source: r.source, station_key: r.station_key,
        name_th: r.name_th, name_en: r.name_en,
        province_th: r.province_th, province_en: r.province_en, province_code: r.province_code,
        lat: r.lat, lng: r.lng,
        metrics: new Map(), lastSeen: null, lastSeenMs: -Infinity,
      }
      byStation.set(key, s)
    }
    s.metrics.set(r.metric, { value: r.value, obs_time: r.obs_time })
    const t = parseObsTime(r.obs_time)
    if (Number.isFinite(t) && t > s.lastSeenMs) {
      s.lastSeenMs = t
      s.lastSeen = r.obs_time
    }
  }
  return byStation
}

/** Health summary for one physical station. */
function classifyStation(s, nowMs) {
  const ageMs = Number.isFinite(s.lastSeenMs) ? nowMs - s.lastSeenMs : Infinity
  const freshMs = FRESHNESS_MS[s.source] ?? 12 * 3600_000
  const flags = []
  let outlierMetric = null
  let outlierValue = null

  if (ageMs > freshMs) flags.push('stale')

  for (const [metric, reading] of s.metrics) {
    const bounds = BOUNDS[metric]
    if (bounds && Number.isFinite(reading.value)) {
      if (reading.value < bounds.min || reading.value > bounds.max) {
        flags.push('outlier')
        outlierMetric = metric
        outlierValue = reading.value
        break
      }
    }
  }

  return {
    source: s.source,
    station_key: s.station_key,
    name_th: s.name_th,
    name_en: s.name_en,
    province_th: s.province_th,
    province_en: s.province_en,
    province_code: s.province_code,
    lat: s.lat,
    lng: s.lng,
    last_seen: s.lastSeen,
    age_hours: Number.isFinite(ageMs) ? Math.round(ageMs / 3600_000 * 10) / 10 : Infinity,
    metric: outlierMetric,
    value: outlierValue,
    flags,
  }
}

/**
 * Scan every station in `latest` and return:
 *   - byFlag: stations grouped by stale/outlier/flatline/mismatch
 *   - byProvince: counts per province
 *   - summary: totals and data-quality score (0-100, higher is healthier)
 */
// One computed result shared across all callers for a few minutes. Every
// connected dashboard polls /api/sensors/health (plus /api/insights calls this
// internally); uncached, N clients each re-ran the full scan serially on the
// one synchronous event loop. Sensor problems evolve over hours — 5 minutes
// of staleness is invisible, the removed load is not.
let healthCache = null // { at, result }
const HEALTH_TTL_MS = 5 * 60_000

export function sensorHealth(db) {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.result
  const result = computeSensorHealth(db)
  healthCache = { at: Date.now(), result }
  return result
}

function computeSensorHealth(db) {
  const nowMs = Date.now()
  const byStation = stationsFromLatest(db)
  const stations = [...byStation.values()]

  // Classify stale/outlier.
  const classified = stations.map((s) => classifyStation(s, nowMs))

  // Flatline detection: flag gauges that report the exact same value across
  // their recent readings. We are conservative:
  //   - rain gauges: only if the repeated value is > 0 (zeros are normal in dry weather)
  //   - water level: require more samples because water can sit steady for hours
  //
  // Two set-based queries over a recent window, NOT a per-station loop: the
  // old loop ran one query per gauge (~5,300 queries, ~3s) and froze the
  // single-threaded event loop. A sparse or dark station is already caught by
  // the 'stale' flag, so "K identical samples within FLATLINE_WINDOW_H" is the
  // index-friendly equivalent of "the last K readings are identical".
  const flatlineKeys = new Set()
  {
    const since = localCutoff(FLATLINE_WINDOW_H)
    for (const r of db.all(
      `SELECT station_key FROM readings
        WHERE source = 'thaiwater_rain' AND metric = 'rain_1h' AND obs_time >= ?
        GROUP BY station_key
        HAVING COUNT(*) >= ? AND MIN(value) = MAX(value) AND MIN(value) > 0`,
      since, CONFIG.sensorHealth.flatlineSamples)) {
      flatlineKeys.add(`thaiwater_rain:${r.station_key}`)
    }
    for (const r of db.all(
      `SELECT station_key FROM readings
        WHERE source = 'thaiwater_wl' AND metric = 'wl_msl' AND obs_time >= ?
        GROUP BY station_key
        HAVING COUNT(*) >= ? AND MIN(value) = MAX(value) AND MIN(value) IS NOT NULL`,
      since, Math.max(CONFIG.sensorHealth.flatlineSamples, 24))) {
      flatlineKeys.add(`thaiwater_wl:${r.station_key}`)
    }
  }
  for (const c of classified) {
    if (flatlineKeys.has(`${c.source}:${c.station_key}`)) c.flags.push('flatline')
  }

  // Mismatch detection: provinces where it rained recently but no water rose,
  // or water rose fast without rain.
  const mismatches = findMismatches(db, byStation)

  const byFlag = { stale: [], outlier: [], flatline: [], mismatch: [] }
  for (const c of classified) {
    for (const f of c.flags) {
      if (byFlag[f]) byFlag[f].push(c)
    }
  }
  for (const m of mismatches) byFlag.mismatch.push(m)

  const byProvince = new Map()
  function bumpProv(code, th, en, f) {
    const key = code ?? th ?? 'unknown'
    if (!byProvince.has(key)) {
      byProvince.set(key, {
        province_code: code, province_th: th, province_en: en,
        stale: 0, outlier: 0, flatline: 0, mismatch: 0, total: 0,
      })
    }
    const p = byProvince.get(key)
    p.total += 1
    if (f === 'stale') p.stale += 1
    if (f === 'outlier') p.outlier += 1
    if (f === 'flatline') p.flatline += 1
    if (f === 'mismatch') p.mismatch += 1
  }
  for (const c of classified) {
    for (const f of c.flags) bumpProv(c.province_code, c.province_th, c.province_en, f)
  }
  for (const m of mismatches) bumpProv(m.province_code, m.province_th, m.province_en, 'mismatch')

  // Data-quality score: start at 100, penalise by flag class.
  const total = stations.length
  const stalePenalty = Math.min(30, (byFlag.stale.length / Math.max(total, 1)) * 200)
  const flatPenalty = Math.min(20, (byFlag.flatline.length / Math.max(total, 1)) * 200)
  const outlierPenalty = Math.min(20, (byFlag.outlier.length / Math.max(total, 1)) * 200)
  const mismatchPenalty = Math.min(15, (byFlag.mismatch.length / Math.max(total, 1)) * 200)
  const qualityScore = Math.max(0, Math.round(100 - stalePenalty - flatPenalty - outlierPenalty - mismatchPenalty))

  return {
    checked_at: new Date().toISOString(),
    quality_score: qualityScore,
    summary: {
      total_stations: total,
      stale: byFlag.stale.length,
      flatline: byFlag.flatline.length,
      outlier: byFlag.outlier.length,
      mismatch: byFlag.mismatch.length,
    },
    by_flag: byFlag,
    by_province: [...byProvince.values()].sort((a, b) => (b.stale + b.flatline + b.outlier + b.mismatch) - (a.stale + a.flatline + a.outlier + a.mismatch)),
  }
}

/**
 * Find provinces where recent rain and recent water-level behaviour disagree.
 *   - "rain_without_rise" : province got ≥ 20 mm in 6 h but no water station rose
 *   - "rise_without_rain" : at least one water station rose ≥ 0.3 m in 6 h
 *                            but province rain total was < 5 mm
 *
 * We estimate 6-hour rainfall from stored rain_1h values inside the window.
 */
function findMismatches(db, byStation) {
  const since = localCutoff(6)

  // 6-hour rain total per province.
  const rainByProv = new Map()
  const rainRows = db.all(
    `SELECT s.province_code, s.province_th, s.province_en,
            SUM(r.value) AS rain_6h
     FROM readings r
     JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'thaiwater_rain' AND r.metric = 'rain_1h' AND r.obs_time >= ?
     GROUP BY s.province_code`,
    since,
  )
  for (const r of rainRows) {
    if (r.province_code) rainByProv.set(String(r.province_code), { ...r, rain_6h: r.rain_6h ?? 0 })
  }

  // Max per-station water rise in 6 h per province.
  const riseByProv = new Map()
  const riseRows = db.all(
    `SELECT s.province_code, s.province_th, s.province_en,
            s.station_key, MAX(r.value) - MIN(r.value) AS rise_m
     FROM readings r
     JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'thaiwater_wl' AND r.metric = 'wl_msl' AND r.obs_time >= ?
     GROUP BY s.province_code, s.station_key`,
    since,
  )
  for (const r of riseRows) {
    if (!r.province_code) continue
    const code = String(r.province_code)
    let entry = riseByProv.get(code)
    if (!entry) {
      entry = { province_code: code, province_th: r.province_th, province_en: r.province_en, max_rise_m: 0 }
      riseByProv.set(code, entry)
    }
    const rise = r.rise_m ?? 0
    if (rise > entry.max_rise_m) entry.max_rise_m = rise
  }

  const out = []
  const codes = new Set([...rainByProv.keys(), ...riseByProv.keys()])
  for (const code of codes) {
    const rain = rainByProv.get(code)
    const rise = riseByProv.get(code)
    const mm6 = rain?.rain_6h ?? 0
    const maxRise = rise?.max_rise_m ?? 0

    if (mm6 >= CONFIG.sensorHealth.rainWithoutRiseMm && maxRise < CONFIG.sensorHealth.minRiseM) {
      out.push({
        source: 'thaiwater_rain', station_key: code,
        province_code: code, province_th: rain?.province_th, province_en: rain?.province_en,
        type: 'rain_without_rise',
        metric: 'rain_1h', value: Math.round(mm6),
        body_th: `ฝนสะสม 6 ชม. ~${Math.round(mm6)} มม. แต่ระดับน้ำในจังหวัดไม่ขึ้น — อาจดูดซับ หรือเครื่องวัดระดับน้ำค้าง`,
        body_en: `~${Math.round(mm6)} mm in 6 h but no water-level rise in the province — may be soaking in, or the water gauges are stuck`,
      })
    }
    if (maxRise >= CONFIG.sensorHealth.minRiseM && mm6 < CONFIG.sensorHealth.riseWithoutRainMm) {
      out.push({
        source: 'thaiwater_wl', station_key: code,
        province_code: code, province_th: rise?.province_th, province_en: rise?.province_en,
        type: 'rise_without_rain',
        metric: 'wl_msl', value: Math.round(maxRise * 100) / 100,
        body_th: `ระดับน้ำขึ้นสูงสุด ${maxRise.toFixed(2)} ม. ใน 6 ชม. แต่ฝนในจังหวัดน้อย — อาจเป็นน้ำเหนือไหลมา หรือเครื่องวัดฝนค้าง`,
        body_en: `Water rose up to ${maxRise.toFixed(2)} m in 6 h with little rain in the province — could be upstream flow, or the rain gauges are stuck`,
      })
    }
  }
  return out
}

/** Province-level data-quality note for the risk payload / UI tooltips. */
export function provinceQuality(db, provinceCode) {
  const health = sensorHealth(db)
  const p = health.by_province.find((x) => x.province_code === provinceCode)
  if (!p) return null
  const issues = []
  if (p.stale) issues.push(`stale ${p.stale}`)
  if (p.flatline) issues.push(`flatline ${p.flatline}`)
  if (p.outlier) issues.push(`outlier ${p.outlier}`)
  if (p.mismatch) issues.push(`mismatch ${p.mismatch}`)
  return {
    score: health.quality_score,
    issues,
    stale: p.stale, flatline: p.flatline, outlier: p.outlier, mismatch: p.mismatch,
  }
}
