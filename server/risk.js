// Province flood-risk heuristic. Honest framing: this is a WATCH INDICATOR
// computed from live observations + forecast — not a prediction model.
//
// HII situation_level semantics matter here: 1–2 mean LOW water (drought side),
// 3 normal, 4 high, 5 overflowing. Only 4–5 contribute flood risk.
//
// v2 adds two factors on top of water/rain/forecast:
//  - wetness: catchment saturation from the API-based wetness engine (own rain
//    history) — wet ground turns the same rainfall into more runoff.
//  - riseRate: how fast water levels are climbing right now (last 6h), a
//    leading signal that precedes situation_level crossing a band.
// It also persists a snapshot in kv so the UI can show trend arrows.
import { CONFIG } from './config.js'
import { nationalVerdict, provinceVerdict } from './verdict.js'

const FRESH_WL_HOURS = 24
const FRESH_RAIN_HOURS = 26
const FRESH_FC_HOURS = 13
const RISE_WINDOW_HOURS = 6

const WETNESS_SCORE = { dry: 0, moist: 25, wet: 60, saturated: 100 }

const TREND_KV_KEY = 'risk_prev'

function levelScore(level) {
  if (level >= 5) return 100
  if (level >= 4) return 60
  return 0
}

function rainScore(mm) {
  if (mm > 135) return 95
  if (mm > 90) return 80
  if (mm > 35) return 45
  if (mm > 10) return 15
  return 0
}

function forecastScore(mm48) {
  if (mm48 >= 150) return 90
  if (mm48 >= 90) return 70
  if (mm48 >= 35) return 40
  if (mm48 >= 10) return 15
  return 0
}

function band(score) {
  const b = CONFIG.risk.bands
  if (score >= b.high) return 'high'
  if (score >= b.elevated) return 'elevated'
  if (score >= b.watch) return 'watch'
  return 'normal'
}

export const BAND_LABELS = {
  normal: { th: 'ปกติ', en: 'Normal' },
  watch: { th: 'เฝ้าระวัง', en: 'Watch' },
  elevated: { th: 'เสี่ยงสูง', en: 'Elevated' },
  high: { th: 'วิกฤต', en: 'Critical' },
}

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

function riseScore(m) {
  if (m > 0.6) return 100
  if (m > 0.35) return 80
  if (m > 0.15) return 40
  return 0
}

export function createRisk(db, wetness) {
  let cache = null
  let cacheAt = 0

  function readPrevSnapshot() {
    const raw = db.kvGet(TREND_KV_KEY)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  /** Only overwrite the stored snapshot once it's stale enough (~30min) so
   *  arrows compare against a meaningfully earlier state, not the last tick. */
  function persistTrendSnapshot(prev, list) {
    const now = Date.now()
    const prevAt = prev?.at ? Date.parse(prev.at) : NaN
    if (prev && Number.isFinite(prevAt) && now - prevAt <= CONFIG.risk.trendGapMs) return

    const scores = {}
    for (const p of list) scores[p.province_code ?? p.province_th] = p.score
    db.kvSet(TREND_KV_KEY, JSON.stringify({ at: new Date(now).toISOString(), scores }))
  }

  function freshRows(source, metrics, cutoff) {
    const placeholders = metrics.map(() => '?').join(',')
    return db.all(
      `SELECT l.station_key, l.metric, l.value, l.obs_time,
              s.name_th, s.name_en, s.province_th, s.province_en, s.province_code,
              s.region_th, s.region_en, s.lat, s.lng
       FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = ? AND l.metric IN (${placeholders}) AND l.obs_time >= ?`,
      source, ...metrics, cutoff,
    )
  }

  /** Max 6h rise of wl_msl per province: max over stations of (latest - earliest). */
  function riseRateByProvince() {
    const rows = db.all(
      `SELECT s.province_code, r.station_key, r.obs_time, r.value
       FROM readings r
       JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.source = 'thaiwater_wl' AND r.metric = 'wl_msl' AND r.obs_time >= ?
       ORDER BY r.station_key, r.obs_time`,
      localCutoff(RISE_WINDOW_HOURS),
    )

    const byStation = new Map()
    for (const row of rows) {
      let s = byStation.get(row.station_key)
      if (!s) { s = { province_code: row.province_code, first: row, last: row }; byStation.set(row.station_key, s) }
      else s.last = row
    }

    const riseByProvince = new Map()
    for (const s of byStation.values()) {
      if (!s.province_code) continue
      const rise = s.last.value - s.first.value
      const prev = riseByProvince.get(s.province_code)
      if (prev === undefined || rise > prev) riseByProvince.set(s.province_code, rise)
    }
    return riseByProvince
  }

  function compute() {
    const wl = freshRows('thaiwater_wl', ['situation_level', 'storage_pct'], localCutoff(FRESH_WL_HOURS))
    const rain = freshRows('thaiwater_rain', ['rain_24h', 'rain_1h'], localCutoff(FRESH_RAIN_HOURS))
    const fc = freshRows('openmeteo', ['precip_fc_48h'], localCutoff(FRESH_FC_HOURS))
    const riseByProvince = riseRateByProvince()
    const wetnessAll = wetness?.all ? wetness.all() : new Map()

    const provinces = new Map()
    const prov = (row) => {
      if (!row.province_code && !row.province_th) return null
      const key = row.province_code ?? row.province_th
      let p = provinces.get(key)
      if (!p) {
        p = {
          province_code: row.province_code, province_th: row.province_th, province_en: row.province_en,
          region_th: row.region_th, region_en: row.region_en,
          lat: row.lat, lng: row.lng,
          water: 0, rain: 0, forecast: 0,
          stations_l4: 0, stations_l5: 0, storage_over: 0,
          max_rain_24h: null, max_rain_station_th: null, max_rain_station_en: null,
          fc_48h: null, wl_stations: 0, rain_stations: 0,
          top_wl: [],
        }
        provinces.set(key, p)
      }
      return p
    }

    // Water level: level 4/5 counts + storage overflow.
    const levelByStation = new Map()
    for (const row of wl) {
      const p = prov(row)
      if (!p) continue
      if (row.metric === 'situation_level') {
        p.wl_stations += 1
        levelByStation.set(row.station_key, row)
        const score = levelScore(row.value)
        if (score > p.water) p.water = score
        if (row.value >= 5) { p.stations_l5 += 1; p.top_wl.push({ th: row.name_th, en: row.name_en, level: row.value }) }
        else if (row.value >= 4) { p.stations_l4 += 1; p.top_wl.push({ th: row.name_th, en: row.name_en, level: row.value }) }
      } else if (row.metric === 'storage_pct' && row.value >= 100) {
        p.storage_over += 1
      }
    }
    for (const p of provinces.values()) {
      if (p.storage_over > 0) p.water = Math.min(100, p.water + 10)
      p.top_wl = p.top_wl.sort((a, b) => b.level - a.level).slice(0, 3)
    }

    // Rain: worst 24h gauge per province; flash-rain bonus.
    for (const row of rain) {
      const p = prov(row)
      if (!p) continue
      if (row.metric === 'rain_24h') {
        p.rain_stations += 1
        if (p.max_rain_24h === null || row.value > p.max_rain_24h) {
          p.max_rain_24h = row.value
          p.max_rain_station_th = row.name_th
          p.max_rain_station_en = row.name_en
        }
        const score = rainScore(row.value)
        if (score > p.rain) p.rain = score
      } else if (row.metric === 'rain_1h' && row.value >= CONFIG.thresholds.rainFlash1h) {
        p.rain = Math.min(100, p.rain + 10)
      }
    }

    // Forecast per province centroid.
    for (const row of fc) {
      const p = prov(row)
      if (!p) continue
      p.fc_48h = row.value
      p.forecast = forecastScore(row.value)
    }

    // Wetness (catchment saturation) + rise rate (leading signal from wl_msl trend).
    for (const p of provinces.values()) {
      const wEntry = p.province_code ? wetnessAll.get(p.province_code) : null
      p.wetness_band = wEntry?.band ?? null
      p.wetness_score = WETNESS_SCORE[wEntry?.band] ?? 0

      const riseM = p.province_code ? riseByProvince.get(p.province_code) : undefined
      p.rise_6h_m = riseM !== undefined ? Math.round(riseM * 100) / 100 : null
      p.rise_score = riseM !== undefined ? riseScore(riseM) : 0
    }

    const w = CONFIG.risk.weights
    const prevSnapshot = readPrevSnapshot()
    const list = [...provinces.values()].map((p) => {
      const score = Math.round(
        w.water * p.water + w.rain * p.rain + w.forecast * p.forecast +
        w.wetness * p.wetness_score + w.riseRate * p.rise_score,
      )
      const key = p.province_code ?? p.province_th
      const prevScore = prevSnapshot?.scores?.[key]
      const delta = typeof prevScore === 'number' ? Math.round(score - prevScore) : null
      // Per-province "so what" card: action verb, time window, 3-4 step
      // checklist. Drives the expandable action card inside each ranking
      // row (audit Tier 1 #1 — "Dynamic Action Cards"). Skip the cross-
      // border / cascade inputs here; the per-place card endpoint enriches
      // those when the user drills into a specific city.
      const v = provinceVerdict({ ...p, score, band: band(score), delta })
      const card = {
        level: v.level,
        head_th: v.head_th, head_en: v.head_en,
        action_th: v.action_th, action_en: v.action_en,
        checklist: v.checklist,
        window: v.window,
        disclaimer_th: v.disclaimer_th, disclaimer_en: v.disclaimer_en,
        // Truncate reasons to keep the per-province payload lean — the full
        // reason list still lives in the place-card endpoint.
        reasons: v.reasons.slice(0, 2),
      }
      return { ...p, score, band: band(score), delta, card }
    }).sort((a, b) => b.score - a.score || (b.max_rain_24h ?? 0) - (a.max_rain_24h ?? 0))

    persistTrendSnapshot(prevSnapshot, list)

    // National rollup.
    const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of levelByStation.values()) {
      const lv = Math.round(row.value)
      if (byLevel[lv] !== undefined) byLevel[lv] += 1
    }
    const worstRain = list.reduce((acc, p) =>
      (p.max_rain_24h !== null && (acc === null || p.max_rain_24h > acc.max_rain_24h)) ? p : acc, null)

    const bandCounts = { normal: 0, watch: 0, elevated: 0, high: 0 }
    for (const p of list) bandCounts[p.band] += 1
    const nationalBand = list.some((p) => p.band === 'high') ? 'high'
      : list.some((p) => p.band === 'elevated') ? 'elevated'
      : list.some((p) => p.band === 'watch') ? 'watch' : 'normal'

    // Soil saturation: % of provinces with wetness in {wet, saturated}. The
    // audit's "85% national soil saturation" framing uses this exact metric.
    // When it crosses 70% we're in flood season — the "Normal" band label
    // becomes lethal (normalcy bias). Frontend swaps it to "LOW — STAY
    // INFORMED" so a low score today doesn't lull residents into thinking
    // "all clear" while 2 in 3 provinces are already primed to flood.
    const provincesWithWetness = list.filter((p) => p.wetness_band)
    const wetSaturatedCount = provincesWithWetness
      .filter((p) => p.wetness_band === 'wet' || p.wetness_band === 'saturated').length
    const soilSaturationPct = provincesWithWetness.length > 0
      ? Math.round((wetSaturatedCount / provincesWithWetness.length) * 100)
      : 0
    const floodSeason = soilSaturationPct >= 70

    // Effective national band: if the raw band says "normal" but we're in
    // flood season, escalate to a "low" pseudo-band so the UI can render the
    // "STAY INFORMED" treatment. The flag lets the UI swap the label.
    const effectiveBand = (nationalBand === 'normal' && floodSeason) ? 'low' : nationalBand

    const result = {
      updated: new Date().toISOString(),
      method_th: 'ดัชนีเฝ้าระวังจากข้อมูลจริง (ระดับน้ำ 40% · ฝนสะสม 25% · พยากรณ์ 15% · ความชุ่มน้ำ 10% · อัตราการเพิ่มระดับ 10%) — ไม่ใช่การพยากรณ์',
      method_en: 'Watch indicator from live data (water 40% · rain 25% · forecast 15% · ground wetness 10% · rise rate 10%) — heuristic, not a forecast',
      national: {
        band: nationalBand,            // raw rollup (true risk picture)
        effective_band: effectiveBand,  // display band (with flood-season override)
        byLevel, bandCounts,
        worstRain: worstRain && {
          province_th: worstRain.province_th, province_en: worstRain.province_en, mm: worstRain.max_rain_24h,
        },
        soilSaturationPct,               // 0–100, % provinces wet/saturated
        wetSaturatedCount,
        soilSampledCount: provincesWithWetness.length,
        floodSeason,                     // true ⇒ "Normal" → "LOW" UI override
        // Worst-case province score — used by the hero to show
        // the national-scale confidence interval (±5 by default).
        max_province_score: list.length ? list[0].score : 0,
      },
      provinces: list,
    }
    // Plain-language one-liner for the overview panel ("so what" layer).
    result.national_verdict = nationalVerdict(result)
    return result
  }

  return {
    get() {
      const now = Date.now()
      if (!cache || now - cacheAt > CONFIG.risk.cacheMs) {
        cache = compute()
        cacheAt = now
        // Mirror to kv so background jobs (line-push cron, dead-sensor
        // scanner) can read the same risk picture without holding a
        // reference to the in-process cache. The payload is gzipped on
        // the wire but stored as JSON here; ~135 KB is fine for a kv row.
        try { db.kvSet('risk_snapshot_cache', JSON.stringify(cache)) } catch {}
      }
      return cache
    },
    invalidate() { cache = null },
  }
}
