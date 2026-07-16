// Antecedent Precipitation Index (API) — catchment wetness from our OWN stored
// rain history. Physics: API_t = k·API_{t-1} + P_t, with k≈0.92 daily decay.
// Wet ground has low infiltration capacity (Horton), so saturation-excess runoff
// turns the SAME rainfall into 3–4× the flood volume. This makes API a leading
// indicator: two provinces with equal rain today are NOT equally dangerous if
// one has been soaking for a week.
//
// Refs: Antecedent Precipitation Index (Kohler & Linsley); Horton infiltration.
import { num } from './util.js'

const K = 0.92          // daily recession constant (0.85–0.95 typical)
const WINDOW_DAYS = 14  // how far back the decay is meaningfully non-zero

// Wetness bands from normalized API (mm-equivalent of decayed prior rain).
function band(api) {
  if (api >= 120) return 'saturated'
  if (api >= 70) return 'wet'
  if (api >= 30) return 'moist'
  return 'dry'
}

export const WETNESS_LABELS = {
  saturated: { th: 'อิ่มตัว', en: 'Saturated' },
  wet: { th: 'ชุ่มน้ำ', en: 'Wet' },
  moist: { th: 'ชื้น', en: 'Moist' },
  dry: { th: 'แห้ง', en: 'Dry' },
  unknown: { th: 'ไม่ทราบ', en: 'Unknown' },
}

export function createWetness(db) {
  let cache = null
  let cacheAt = 0

  function compute() {
    // Daily rain per province from stored rain_24h readings (max gauge per
    // province per day is a conservative proxy for catchment input).
    const since = new Date(Date.now() + 7 * 3600_000 - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
    const rows = db.all(
      `SELECT s.province_code, s.province_th, s.province_en,
              substr(r.obs_time, 1, 10) AS day, MAX(r.value) AS rain
       FROM readings r
       JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.source = 'thaiwater_rain' AND r.metric = 'rain_24h'
         AND r.obs_time >= ? AND s.province_code IS NOT NULL
       GROUP BY s.province_code, day`,
      since,
    )

    const byProv = new Map()
    for (const r of rows) {
      if (!byProv.has(r.province_code)) {
        byProv.set(r.province_code, {
          province_code: r.province_code, province_th: r.province_th, province_en: r.province_en,
          days: new Map(),
        })
      }
      byProv.get(r.province_code).days.set(r.day, num(r.rain) ?? 0)
    }

    const todayLocal = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    const out = new Map()
    for (const p of byProv.values()) {
      // Walk the window forward applying the recession so recent rain weighs most.
      let api = 0
      for (let d = WINDOW_DAYS; d >= 0; d--) {
        const day = new Date(Date.parse(todayLocal) - d * 86_400_000).toISOString().slice(0, 10)
        api = api * K + (p.days.get(day) ?? 0)
      }
      api = Math.round(api * 10) / 10
      out.set(p.province_code, {
        province_code: p.province_code, province_th: p.province_th, province_en: p.province_en,
        api, band: band(api),
      })
    }
    return out
  }

  return {
    all() {
      const now = Date.now()
      if (!cache || now - cacheAt > 60_000) { cache = compute(); cacheAt = now }
      return cache
    },
    forProvince(code) {
      return this.all().get(code) ?? null
    },
  }
}
