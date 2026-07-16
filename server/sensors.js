// Sensor health / data-quality engine.
//
// Air-quality decisions are only as good as the data feeding them. This module
// scans the live database for stations that look broken, stale, or suspicious,
// and produces operator-readable signals. It is deliberately conservative:
// it flags *indicators* of sensor problems so a human can verify, never
// silently discards readings.
//
// Heuristics (all thresholds live in CONFIG.sensorHealth):
//   - stale    : no new reading within the source's expected freshness window
//   - flatline : value unchanged for many consecutive observations
//   - outlier  : value far outside plausible physical bounds, or a PM2.5
//                spike at one station while the rest of the province is calm
//   - mismatch : rain is scrubbing the province but a monitor's PM2.5 keeps
//                climbing anyway (wet deposition should pull it down)
import { CONFIG } from './config.js'
import { num } from './util.js'

// How long each source can go dark before we call it stale.
// These follow the native cadences in CONFIG.intervals with generous headroom
// for upstream hiccups and seasonal maintenance windows.
const FRESHNESS_MS = {
  air4thai: 3 * 3600_000,        // hourly PCD publish → 3 h grace
  thaiwater_rain: 4 * 3600_000,  // 10-min cadence → 4 h grace
  openmeteo: 7 * 3600_000,       // 3-h forecast refresh → 7 h grace
  openmeteo_aq: 7 * 3600_000,    // CAMS runs are 12-hourly upstream; poll is 3 h
  enso: 48 * 3600_000,           // ONI revises monthly; the poll is 12-hourly
  imerg: 6 * 3600_000,           // half-hourly with ~4 h upstream latency
}

// Recent window we scan for flatline detection. Wide enough to hold well over
// the required identical-sample count for hourly AQ monitors, narrow enough
// that the set-based flatline query stays index-bounded (~0.5s vs the ~3s
// per-station loop this replaced).
const FLATLINE_WINDOW_H = 12

// Physical plausibility bounds per metric.
const BOUNDS = {
  pm25:     { min: 0, max: 1000 },        // µg/m³ — >1000 is instrument failure
  pm10:     { min: 0, max: 2000 },        // µg/m³
  o3:       { min: 0, max: 500 },         // ppb
  no2:      { min: 0, max: 500 },         // ppb
  so2:      { min: 0, max: 500 },         // ppb
  co:       { min: 0, max: 100 },         // ppm
  aqi:      { min: 0, max: 1000 },
  rain_24h: { min: 0, max: 1500 },        // > 1.5 m/day is physically extreme
  rain_1h:  { min: 0, max: 300 },         // > 300 mm/h is world-record territory
}

// Spike detection: a localized PM2.5 jump is suspicious when the province
// median barely moved — either a faulty sensor or a very local fire.
const SPIKE_PROVINCE_MEDIAN_UG = 10
// Mismatch detection: this much rain in 6 h should scrub PM, not let it rise.
const MISMATCH_RAIN_6H_MM = 10

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

  // Flatline detection: flag monitors that report the exact same value across
  // their recent readings. We are conservative:
  //   - AQ monitors: only when the repeated PM2.5 is > 0 (a true zero is rare
  //     but possible after heavy rain — still, a string of identical zeros on
  //     an hourly monitor is far more likely a stuck firmware value)
  //   - rain gauges: only if the repeated value is > 0 (zeros are normal in dry weather)
  //
  // Set-based queries over a recent window, NOT a per-station loop: the old
  // loop ran one query per gauge (~5,300 queries, ~3s) and froze the
  // single-threaded event loop. A sparse or dark station is already caught by
  // the 'stale' flag, so "K identical samples within FLATLINE_WINDOW_H" is the
  // index-friendly equivalent of "the last K readings are identical".
  const flatlineKeys = new Set()
  {
    const since = localCutoff(FLATLINE_WINDOW_H)
    for (const r of db.all(
      `SELECT station_key FROM readings
        WHERE source = 'air4thai' AND metric = 'pm25' AND obs_time >= ?
        GROUP BY station_key
        HAVING COUNT(*) >= ? AND MIN(value) = MAX(value) AND MIN(value) > 0`,
      since, CONFIG.sensorHealth.flatlineSamples)) {
      flatlineKeys.add(`air4thai:${r.station_key}`)
    }
    for (const r of db.all(
      `SELECT station_key FROM readings
        WHERE source = 'thaiwater_rain' AND metric = 'rain_1h' AND obs_time >= ?
        GROUP BY station_key
        HAVING COUNT(*) >= ? AND MIN(value) = MAX(value) AND MIN(value) > 0`,
      since, CONFIG.sensorHealth.flatlineSamples)) {
      flatlineKeys.add(`thaiwater_rain:${r.station_key}`)
    }
  }
  for (const c of classified) {
    if (flatlineKeys.has(`${c.source}:${c.station_key}`)) c.flags.push('flatline')
  }

  // Cross-checks: rain-vs-PM mismatches and localized PM2.5 spikes.
  const { mismatches, spikes } = findAirAnomalies(db)
  for (const c of classified) {
    if (spikes.has(`${c.source}:${c.station_key}`) && !c.flags.includes('outlier')) {
      const sp = spikes.get(`${c.source}:${c.station_key}`)
      c.flags.push('outlier')
      c.metric = 'pm25'
      c.value = sp.value
      c.spike = sp
    }
  }

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
 * Cross-check air readings against physics over the last 6 hours:
 *   - "rain_without_drop" : province got ≥ 10 mm rain in 6 h but a monitor's
 *     PM2.5 ROSE ≥ CONFIG.sensorHealth.rainWithoutDropUg in the same window.
 *     Wet deposition should scrub particles down — a rise under active rain
 *     points at a stuck or drifting sensor (or hyper-local emissions).
 *   - spike : one station's PM2.5 jumped ≥ CONFIG.sensorHealth.spikeUg6h in
 *     6 h while the province median moved < 10 µg/m³. Either a sensor fault
 *     or a real, very local fire — both deserve a human look.
 *
 * We estimate 6-hour rainfall from stored rain_1h values inside the window.
 */
function findAirAnomalies(db) {
  const since = localCutoff(6)

  // 6-hour rain total per province (sum of hourly gauge readings).
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

  // First/last PM2.5 per station over the window → per-station delta.
  const pmRows = db.all(
    `SELECT s.province_code, s.province_th, s.province_en,
            s.name_th, s.name_en, r.station_key, r.obs_time, r.value
     FROM readings r
     JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'air4thai' AND r.metric = 'pm25' AND r.obs_time >= ?
     ORDER BY r.station_key, r.obs_time`,
    since,
  )
  const byKey = new Map()
  for (const row of pmRows) {
    let s = byKey.get(row.station_key)
    if (!s) { s = { first: row, last: row }; byKey.set(row.station_key, s) }
    else s.last = row
  }

  // Province median delta — the "did the whole province move?" baseline.
  const deltasByProv = new Map()
  for (const s of byKey.values()) {
    const code = s.last.province_code
    if (!code) continue
    const d = num(s.last.value) !== null && num(s.first.value) !== null
      ? s.last.value - s.first.value : null
    if (d === null) continue
    if (!deltasByProv.has(code)) deltasByProv.set(code, [])
    deltasByProv.get(code).push(d)
  }
  const medianByProv = new Map()
  for (const [code, ds] of deltasByProv) {
    const sorted = [...ds].sort((a, b) => a - b)
    medianByProv.set(code, sorted[Math.floor(sorted.length / 2)])
  }

  const mismatches = []
  const spikes = new Map()
  for (const [stationKey, s] of byKey) {
    const code = s.last.province_code
    const rise = s.last.value - s.first.value
    if (!Number.isFinite(rise)) continue

    // (a) mismatch: heavy rain in the province, yet this monitor's PM rose.
    const mm6 = code ? (rainByProv.get(String(code))?.rain_6h ?? 0) : 0
    if (mm6 >= MISMATCH_RAIN_6H_MM && rise >= CONFIG.sensorHealth.rainWithoutDropUg) {
      mismatches.push({
        source: 'air4thai', station_key: stationKey,
        province_code: code, province_th: s.last.province_th, province_en: s.last.province_en,
        name_th: s.last.name_th, name_en: s.last.name_en,
        type: 'rain_without_drop',
        metric: 'pm25', value: Math.round(rise),
        body_th: `ฝนสะสม 6 ชม. ~${Math.round(mm6)} มม. แต่ PM2.5 ที่ ${s.last.name_th ?? stationKey} กลับเพิ่ม +${Math.round(rise)} µg/m³ — ฝนควรชะล้างฝุ่นลง อาจเป็นเซ็นเซอร์ค้าง`,
        body_en: `~${Math.round(mm6)} mm of rain in 6 h but PM2.5 at ${s.last.name_en ?? stationKey} ROSE +${Math.round(rise)} µg/m³ — rain should scrub PM down; the monitor may be stuck or drifting`,
      })
    }

    // (b) spike: one station jumped hard while the province median barely moved.
    const median = code ? (medianByProv.get(code) ?? 0) : 0
    if (rise >= CONFIG.sensorHealth.spikeUg6h && Math.abs(median) < SPIKE_PROVINCE_MEDIAN_UG) {
      spikes.set(`air4thai:${stationKey}`, {
        value: Math.round(s.last.value),
        rise: Math.round(rise),
        province_median: Math.round(median),
        body_th: `PM2.5 ที่สถานีนี้พุ่ง +${Math.round(rise)} µg/m³ ใน 6 ชม. ขณะที่ค่ากลางจังหวัดขยับ ${Math.round(median)} — อาจเป็นเซ็นเซอร์ผิดพลาด หรือไฟไหม้/การเผาในพื้นที่ใกล้สถานี`,
        body_en: `PM2.5 spiked +${Math.round(rise)} µg/m³ in 6 h at this one station while the province median moved ${Math.round(median)} — possible sensor fault, OR a real fire/burning right near the monitor`,
      })
    }
  }
  return { mismatches, spikes }
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
