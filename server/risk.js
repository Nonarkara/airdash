// Province air-watch heuristic. Honest framing: this is a WATCH INDICATOR
// computed from live observations + forecast — not a prediction model.
//
// score = 0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation
//
//  - pm25: worst fresh ground station (Thai AQI 2023 breakpoints 15/25/37.5/75)
//  - pollutants: worst of PM10/O3/NO2/SO2/CO against Thai standards
//  - trend: how fast PM2.5 is climbing right now (last 6h) — a leading signal
//  - forecast: CAMS PM2.5 outlook (24–48h) through the same curve
//  - stagnation: ventilation proxy — low wind + no rain coming = nothing
//    disperses or washes the aerosol out
// It also persists a snapshot in kv so the UI can show trend arrows.
import { CONFIG } from './config.js'
import { nationalVerdict, provinceVerdict } from './verdict.js'
import { isThaiProvinceCode } from './provinces.js'

const FRESH_PM_HOURS = 6
const FRESH_FC_HOURS = 13
const FRESH_RAIN_HOURS = 26
const RISE_WINDOW_HOURS = 6

const TREND_KV_KEY = 'risk_prev'

/** Piecewise-linear interpolation over [x, score] anchor points. */
function curve(anchors, x) {
  if (x === null || !Number.isFinite(x)) return 0
  if (x <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i]
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1]
      return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0))
    }
  }
  return anchors.at(-1)[1]
}

const PM25_ANCHORS = [[0, 0], [15, 8], [25, 20], [37.5, 45], [50, 60], [75, 80], [100, 90], [150, 100]]
const POLLUTANT_ANCHORS = {
  pm10: [[0, 0], [50, 10], [80, 25], [120, 50], [180, 75], [250, 100]],
  o3: [[0, 0], [70, 25], [100, 55], [120, 75], [150, 100]],
  no2: [[0, 0], [100, 30], [170, 60], [250, 100]],
  so2: [[0, 0], [100, 30], [200, 60], [300, 100]],
  co: [[0, 0], [9, 30], [15, 60], [30, 100]],
}

export function pm25Score(ug) { return curve(PM25_ANCHORS, ug) }

function trendScore(rise6h) {
  if (rise6h === null || !Number.isFinite(rise6h)) return 0
  if (rise6h >= 25) return 100
  if (rise6h >= 15) return 70
  if (rise6h >= 8) return 40
  if (rise6h >= 4) return 15
  return 0
}

function stagnationScore({ wind, prob24, rainObs24 }) {
  if (rainObs24 !== null && rainObs24 > 10) return 0 // atmosphere actively washing
  let s = 0
  if (wind !== null) {
    if (wind < 8) s = 70
    else if (wind < 12) s = 45
    else if (wind < 16) s = 20
  }
  if (prob24 !== null) {
    if (prob24 < 20) s += 30
    else if (prob24 < 40) s += 15
  }
  return Math.max(0, Math.min(100, s))
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

/** Is `date` inside the dust/burning season window (Dec 1 – Apr 30)? */
export function inDustSeasonWindow(date = new Date()) {
  const { startMonth, startDay, endMonth, endDay } = CONFIG.dustSeason
  const local = new Date(date.getTime() + 7 * 3600_000)
  const m = local.getUTCMonth() + 1
  const d = local.getUTCDate()
  if (m > startMonth || (m === startMonth && d >= startDay)) return true
  if (m < endMonth || (m === endMonth && d <= endDay)) return true
  return false
}

export function createRisk(db, washout) {
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

  /** Max 6h PM2.5 rise per province: max over stations of (latest - earliest). */
  function riseRateByProvince() {
    const rows = db.all(
      `SELECT s.province_code, r.station_key, r.obs_time, r.value
       FROM readings r
       JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.source = 'air4thai' AND r.metric = 'pm25' AND r.obs_time >= ?
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
    const air = freshRows('air4thai',
      ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co', 'aqi'], localCutoff(FRESH_PM_HOURS))
    const fc = freshRows('openmeteo_aq', ['pm25_fc_24h', 'pm25_fc_48h', 'dust_fc_24h'], localCutoff(FRESH_FC_HOURS))
    const wx = freshRows('openmeteo', ['wind_fc_kmh', 'precip_prob_24h', 'precip_fc_d0'], localCutoff(FRESH_FC_HOURS))
    const rain = freshRows('thaiwater_rain', ['rain_24h'], localCutoff(FRESH_RAIN_HOURS))
    const riseByProvince = riseRateByProvince()
    const washoutAll = washout?.all ? washout.all() : new Map()

    const provinces = new Map()
    const prov = (row) => {
      if (!row.province_code && !row.province_th) return null
      // Never mint rows for codes outside the Thai DOPA registry (10–96):
      // border gauges geocode abroad (e.g. an HII rain gauge in Myanmar
      // carries pseudo-code 10499) and used to leak into the province
      // ranking as a 78th "province".
      if (row.province_code && !isThaiProvinceCode(row.province_code)) return null
      const key = row.province_code ?? row.province_th
      let p = provinces.get(key)
      if (!p) {
        p = {
          province_code: row.province_code, province_th: row.province_th, province_en: row.province_en,
          region_th: row.region_th, region_en: row.region_en,
          lat: row.lat, lng: row.lng,
          pm25: null, pm25_station_th: null, pm25_station_en: null,
          aqi: null, pollutant_worst: null,
          pm25_comp: 0, pollutants_comp: 0, forecast_comp: 0,
          stations_unhealthy: 0, stations_very_unhealthy: 0,
          aq_stations: 0, rain_stations: 0,
          pm25_fc_24h: null, pm25_fc_48h: null, dust_fc_24h: null,
          wind_fc_kmh: null, precip_prob_24h: null, precip_fc_24h: null,
          rain_obs_24h: null,
          top_stations: [],
        }
        provinces.set(key, p)
      }
      return p
    }

    // Ground truth: pollutant sub-scores + worst PM2.5 station per province.
    const pmByStation = new Map()
    for (const row of air) {
      const p = prov(row)
      if (!p) continue
      if (row.metric === 'pm25') {
        p.aq_stations += 1
        pmByStation.set(row.station_key, row)
        const s = pm25Score(row.value)
        if (s > p.pm25_comp) p.pm25_comp = s
        if (p.pm25 === null || row.value > p.pm25) {
          p.pm25 = row.value
          p.pm25_station_th = row.name_th
          p.pm25_station_en = row.name_en
        }
        if (row.value >= CONFIG.thresholds.pm25VeryUnhealthy) {
          p.stations_very_unhealthy += 1
          p.top_stations.push({ th: row.name_th, en: row.name_en, pm25: row.value })
        } else if (row.value >= CONFIG.thresholds.pm25Unhealthy) {
          p.stations_unhealthy += 1
          p.top_stations.push({ th: row.name_th, en: row.name_en, pm25: row.value })
        }
      } else if (row.metric === 'aqi') {
        if (p.aqi === null || row.value > p.aqi) p.aqi = row.value
      } else if (POLLUTANT_ANCHORS[row.metric]) {
        const s = curve(POLLUTANT_ANCHORS[row.metric], row.value)
        if (s > p.pollutants_comp) {
          p.pollutants_comp = s
          p.pollutant_worst = { metric: row.metric, value: row.value, score: s }
        }
      }
    }
    for (const p of provinces.values()) {
      p.top_stations = p.top_stations.sort((a, b) => b.pm25 - a.pm25).slice(0, 3)
    }

    // CAMS forecast per province centroid.
    for (const row of fc) {
      const p = prov(row)
      if (!p) continue
      if (row.metric === 'pm25_fc_24h') p.pm25_fc_24h = row.value
      else if (row.metric === 'pm25_fc_48h') p.pm25_fc_48h = row.value
      else if (row.metric === 'dust_fc_24h') p.dust_fc_24h = row.value
    }
    // Weather (ventilation + rain-chance) per province centroid.
    for (const row of wx) {
      const p = prov(row)
      if (!p) continue
      if (row.metric === 'wind_fc_kmh') p.wind_fc_kmh = row.value
      else if (row.metric === 'precip_prob_24h') p.precip_prob_24h = row.value
      else if (row.metric === 'precip_fc_d0') p.precip_fc_24h = row.value
    }
    // Observed rain (max gauge) — already-falling rain kills the stagnation term.
    for (const row of rain) {
      const p = prov(row)
      if (!p) continue
      p.rain_stations += 1
      if (p.rain_obs_24h === null || row.value > p.rain_obs_24h) p.rain_obs_24h = row.value
    }

    // Trend (leading signal) + stagnation + washout join.
    for (const p of provinces.values()) {
      const rise = p.province_code ? riseByProvince.get(p.province_code) : undefined
      p.rise_6h_ug = rise !== undefined ? Math.round(rise * 10) / 10 : null
      p.trend_comp = rise !== undefined ? trendScore(rise) : 0

      const fcWorst = Math.max(p.pm25_fc_24h ?? 0, p.pm25_fc_48h ?? 0)
      p.forecast_comp = fcWorst > 0 ? pm25Score(fcWorst) : 0

      p.stagnation_comp = stagnationScore({
        wind: p.wind_fc_kmh, prob24: p.precip_prob_24h, rainObs24: p.rain_obs_24h,
      })

      const w = p.province_code ? washoutAll.get(p.province_code) : null
      p.washout_band = w?.band ?? null
      p.washout_relief_pct = w?.relief_if_rain_pct ?? null
      p.washout_expected_pct = w?.expected_relief_pct ?? null
      p.projected_pm25 = w?.projected_pm25 ?? null
      p.washout_helps = w?.helps_dust ?? false
    }

    const w = CONFIG.risk.weights
    const prevSnapshot = readPrevSnapshot()
    const list = [...provinces.values()].map((p) => {
      const score = Math.round(
        w.pm25 * p.pm25_comp + w.pollutants * p.pollutants_comp + w.trend * p.trend_comp +
        w.forecast * p.forecast_comp + w.stagnation * p.stagnation_comp,
      )
      const key = p.province_code ?? p.province_th
      const prevScore = prevSnapshot?.scores?.[key]
      const delta = typeof prevScore === 'number' ? Math.round(score - prevScore) : null
      // Per-province "so what" card: action verb, time window, 3-4 step
      // checklist. Drives the expandable action card inside each ranking row.
      const v = provinceVerdict({ ...p, score, band: band(score), delta })
      const card = {
        level: v.level,
        head_th: v.head_th, head_en: v.head_en,
        action_th: v.action_th, action_en: v.action_en,
        checklist: v.checklist,
        window: v.window,
        disclaimer_th: v.disclaimer_th, disclaimer_en: v.disclaimer_en,
        reasons: v.reasons.slice(0, 2),
      }
      return { ...p, score, band: band(score), delta, card }
    }).sort((a, b) => b.score - a.score || (b.pm25 ?? 0) - (a.pm25 ?? 0))

    persistTrendSnapshot(prevSnapshot, list)

    // National rollup.
    const worstPm25 = list.reduce((acc, p) =>
      (p.pm25 !== null && (acc === null || p.pm25 > acc.pm25)) ? p : acc, null)

    const bandCounts = { normal: 0, watch: 0, elevated: 0, high: 0 }
    for (const p of list) bandCounts[p.band] += 1
    const nationalBand = list.some((p) => p.band === 'high') ? 'high'
      : list.some((p) => p.band === 'elevated') ? 'elevated'
      : list.some((p) => p.band === 'watch') ? 'watch' : 'normal'

    // Dust load: % of provinces whose worst PM2.5 is past the Thai "moderate"
    // bound (25 µg/m³). When it crosses the trigger inside the burning-season
    // window we're in dust season — the "Normal" band label becomes lulling
    // (normalcy bias). Frontend swaps it to "LOW — STAY INFORMED" so a clean
    // morning doesn't read as "season over" while a third of the country is
    // already above the moderate line.
    const provincesWithPm = list.filter((p) => p.pm25 !== null)
    const dustyProvinceCount = provincesWithPm
      .filter((p) => p.pm25 >= CONFIG.thresholds.pm25Moderate).length
    const dustLoadPct = provincesWithPm.length > 0
      ? Math.round((dustyProvinceCount / provincesWithPm.length) * 100)
      : 0
    const dustSeason = inDustSeasonWindow() && dustLoadPct >= CONFIG.dustSeason.dustLoadPctTrigger

    // Effective national band: if the raw band says "normal" but we're in
    // dust season, escalate to a "low" pseudo-band so the UI can render the
    // "STAY INFORMED" treatment. The flag lets the UI swap the label.
    const effectiveBand = (nationalBand === 'normal' && dustSeason) ? 'low' : nationalBand

    const result = {
      updated: new Date().toISOString(),
      method_th: 'ดัชนีเฝ้าระวังจากข้อมูลจริง (PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ 15%) — ไม่ใช่การพยากรณ์',
      method_en: 'Watch indicator from live data (PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15%) — heuristic, not a forecast',
      national: {
        band: nationalBand,            // raw rollup (true air picture)
        effective_band: effectiveBand,  // display band (with dust-season override)
        bandCounts,
        worstPm25: worstPm25 && {
          province_th: worstPm25.province_th, province_en: worstPm25.province_en, ug: worstPm25.pm25,
        },
        dustLoadPct,                     // 0–100, % provinces ≥ 25 µg/m³
        dustyProvinceCount,
        dustSampledCount: provincesWithPm.length,
        dustSeason,                      // true ⇒ "Normal" → "LOW" UI override
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
        // scanner) can read the same picture without holding a reference
        // to the in-process cache.
        try { db.kvSet('risk_snapshot_cache', JSON.stringify(cache)) } catch {}
        // ALSO write the slim 'risk_provinces' projection that the push
        // ticks (linePush.js, telegramPush.js) and the Telegram bot's
        // /province resolver (telegramWebhook.js) actually read. Their
        // comments documented this key as "the risk module's cache" but
        // nothing ever wrote it — leaving the 5-minute danger-reminder
        // tick and the /province command permanently dead. Both keys are
        // written from the same computed snapshot; risk_snapshot_cache is
        // kept untouched for back-compat.
        try {
          const slim = cache.provinces.map((p) => ({
            province_code: p.province_code,
            province_th: p.province_th,
            province_en: p.province_en,
            band: p.band,
            score: p.score,
            pm25: p.pm25,
          }))
          db.kvSet('risk_provinces', JSON.stringify(slim))
        } catch {}
      }
      return cache
    },
    invalidate() { cache = null },
  }
}
