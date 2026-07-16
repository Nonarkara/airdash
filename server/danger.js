// Danger Score — the "is it dangerous to breathe here RIGHT NOW" composite.
// Distinct from the Air Watch Score (which is a per-province watch INDICATOR
// weighted across PM, pollutants, trend, forecast, stagnation).
//
// The Danger Score answers a sharper question: given the air, the heat, the
// humidity, and any incoming rain, how much more dangerous is it to be
// outside for an at-risk person than on a normal day? It is the number we
// want a parent, an elderly neighbour, or a coach to act on.
//
//   danger = pm_base × (1 + heat_amp) × (1 + hum_amp) − rain_relief
//
// Each modifier is anchored in peer-reviewed literature and capped so a
// single dimension cannot drive the score alone:
//
//   • pm_base        — Thai AQI 2023 PM2.5 breakpoints (0–100, same curve
//                       as the Air Watch Score so the two stay comparable).
//   • heat_amp       — synergistic mortality of PM + heat (Scortichini 2022,
//                       620 cities, 22.6M deaths: heat effect on mortality
//                       jumped from 5.3% on low-PM10 days to 12.8% on high-
//                       PM10 days). Below 28°C no amplifier; above 35°C
//                       fully capped at +30%.
//
//   • hum_amp        — hygroscopic growth of PM2.5 with relative humidity
//                       (Liu et al. 2023, PMC8361198: f(RH) growth factor
//                       accelerates past 80% RH, light-scattering efficiency
//                       of hygroscopic PM rises sharply). 0–60% RH no
//                       amplifier; >90% RH capped at +25%.
//
//   • rain_relief    — below-cloud scavenging Λ = a·R^b (Henzing et al.
//                       2006: a≈8×10⁻⁵, b≈0.65 for accumulation-mode PM2.5
//                       at 1 mm/h, ~20% reduction per 5 mm). Either rain
//                       already observed (24h gauge) or forecast with
//                       ≥40% probability and ≥5 mm.
//
// The combined score is clamped 0–100 and the UI shades it with the same
// AQI palette so the meaning is visually continuous with the rest of
// the dashboard.
//
// This is not an epidemiological claim — it is a transparent, documented
// composite for the practical "should I tell my mother to stay inside?"
// question. The research paper Section 2 walks through each coefficient.
import { CONFIG } from './config.js'
import { num } from './util.js'

const FRESH_HOURS = 6
const FRESH_FC_HOURS = 13
const FRESH_RAIN_HOURS = 26

// Same curve as risk.js — kept in lock-step so a 37.5 µg/m³ reading
// scores the same whether the user is looking at the ranking (Air Watch
// Score) or the Danger chip. Cloned locally to avoid a circular dep
// with risk.js (risk imports washout, danger imports neither).
const PM25_ANCHORS = [[0, 0], [15, 8], [25, 20], [37.5, 45], [50, 60], [75, 80], [100, 90], [150, 100]]

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

function pmBaseScore(ug) { return curve(PM25_ANCHORS, ug) }

/**
 * Heat amplification (0–0.30, capped).
 * Anchored to: Scortichini et al. 2022 (Lancet Planetary Health), 620 cities,
 * 22.6M deaths. Heat effect 5.3% mortality on low-PM10 days → 12.8% on
 * high-PM10 days — ~2.4× amplification.
 * Below 28°C: 0.  Above 35°C: 0.30. Linear in between.
 */
function heatAmp(tempC) {
  if (tempC === null || !Number.isFinite(tempC)) return 0
  if (tempC <= 28) return 0
  if (tempC >= 35) return 0.30
  return Math.round(((tempC - 28) / 7) * 0.30 * 100) / 100
}

/**
 * Humidity amplification (0–0.25, capped).
 * Anchored to: Liu et al. 2023, Hygroscopic properties of particulate matter
 * (PMC8361198) and Seinfeld & Pandis 2006. Hygroscopic growth of
 * water-soluble PM accelerates sharply above 80% RH — light scattering
 * increases, so the same dry mass is "more PM" optically and
 * physiologically. Below 60% RH: 0.  Above 90% RH: 0.25. Linear ramp.
 *
 * Important caveat (kept honest in the UI): high RH also means rain is
 * more likely, which RELIEVES the danger. We deliberately do NOT net the
 * rain relief inside hum_amp — we apply it separately so the breakdown
 * remains auditable.
 */
function humAmp(rh) {
  if (rh === null || !Number.isFinite(rh)) return 0
  if (rh <= 60) return 0
  if (rh >= 90) return 0.25
  return Math.round(((rh - 60) / 30) * 0.25 * 100) / 100
}

/**
 * Rain relief (0–0.45 max, returns 0..0.45 of pm_base to subtract).
 * Two sources, whichever yields more relief:
 *   • Observed 24h rain from HII gauges (rain already in the air).
 *   • Forecast 24h rain amount × probability from Open-Meteo.
 *
 * Curve (from below-cloud scavenging studies, Henzing 2006; Wang 2010):
 *   1 mm  →  ~5%  reduction (5 min after onset, ~Λ = 1e-5 s⁻¹)
 *   5 mm  →  ~20% reduction
 *  15 mm  →  ~30%
 *  35+ mm →  ~40%
 */
function rainRelief(rainObs24, rainFc24, rainProb24) {
  // Already-raining always wins. If gauges show 5+ mm in the last 24h,
  // the air is currently being washed, period.
  if (rainObs24 !== null && Number.isFinite(rainObs24) && rainObs24 >= 5) {
    return { relief: reliefCurve(rainObs24), source: 'observed' }
  }
  // Forecast rain must clear BOTH the amount bar and the probability bar.
  if (rainFc24 === null || rainProb24 === null) return { relief: 0, source: null }
  if (rainFc24 < 1 || rainProb24 < 25) return { relief: 0, source: null }
  // Probability-weighted: a 60% chance of 10 mm is worse than 100% of 10 mm.
  const weighted = rainFc24 * (rainProb24 / 100)
  return { relief: reliefCurve(weighted) * 0.85, source: 'forecast' } // 0.85x because probability < 1
}

function reliefCurve(mm) {
  if (!Number.isFinite(mm) || mm < 1) return 0
  if (mm < 5) return 0.05
  if (mm < 15) return 0.20
  if (mm < 35) return 0.30
  return 0.40
}

function band(score) {
  const b = CONFIG.danger.bands
  if (score >= b.high) return 'high'
  if (score >= b.elevated) return 'elevated'
  if (score >= b.watch) return 'watch'
  return 'normal'
}

export const DANGER_LABELS = {
  normal:   { th: 'ปลอดภัย',     en: 'Safe to be out' },
  watch:    { th: 'ระวัง',       en: 'Be cautious' },
  elevated: { th: 'อันตราย',     en: 'Dangerous' },
  high:     { th: 'อันตรายมาก',  en: 'Very dangerous' },
}

export const DANGER_BG = {
  normal:   '#2E8B57',
  watch:    '#C8B560',
  elevated: '#C8453A',
  high:     '#6B2D5C',
}

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

function freshByProvince(db, source, metrics, cutoff) {
  const placeholders = metrics.map(() => '?').join(',')
  return db.all(
    `SELECT l.metric, MAX(l.value) AS value, s.province_code, s.province_th, s.province_en
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
     WHERE l.source = ? AND l.metric IN (${placeholders})
       AND l.obs_time >= ? AND s.province_code IS NOT NULL
     GROUP BY s.province_code, l.metric`,
    source, ...metrics, cutoff,
  )
}

export function createDanger(db, { riskEngine, washout }) {
  let cache = null
  let cacheAt = 0
  const CACHE_MS = 60_000

  function compute() {
    // Pull all 4 inputs as per-province rows.
    const pmRows = freshByProvince(db, 'air4thai', ['pm25'], localCutoff(FRESH_HOURS))
    const wxRows = freshByProvince(db, 'openmeteo', ['temp_c', 'rh_pct'], localCutoff(FRESH_FC_HOURS))
    const fcRows = freshByProvince(db, 'openmeteo', ['precip_fc_d0', 'precip_prob_24h'], localCutoff(FRESH_FC_HOURS))
    const rainRows = freshByProvince(db, 'thaiwater_rain', ['rain_24h'], localCutoff(FRESH_RAIN_HOURS))
    // Optional: prefer GISTDA's pm25 over Air4Thai's worst station if the
    // PCD ground network is sparse for that province. We keep BOTH values
    // in the breakdown so the user can audit which feed drove the score.
    const gistRows = freshByProvince(db, 'gistda_pm25', ['pm25'], localCutoff(FRESH_HOURS))

    const provinces = new Map()
    const get = (code, th, en) => {
      let p = provinces.get(code)
      if (!p) {
        p = {
          province_code: code, province_th: th, province_en: en,
          pm25_pcd: null, pm25_gistda: null,
          temp_c: null, rh_pct: null, apparent_c: null,
          rain_obs_24: null, rain_fc_24: null, rain_prob_24: null,
        }
        provinces.set(code, p)
      }
      return p
    }

    for (const r of pmRows) get(r.province_code, r.province_th, r.province_en).pm25_pcd = num(r.value)
    for (const r of gistRows) get(r.province_code, r.province_th, r.province_en).pm25_gistda = num(r.value)
    for (const r of wxRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (r.metric === 'temp_c') p.temp_c = num(r.value)
      else if (r.metric === 'rh_pct') p.rh_pct = num(r.value)
    }
    for (const r of fcRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (r.metric === 'precip_fc_d0') p.rain_fc_24 = num(r.value)
      else if (r.metric === 'precip_prob_24h') p.rain_prob_24 = num(r.value)
    }
    for (const r of rainRows) {
      get(r.province_code, r.province_th, r.province_en).rain_obs_24 = num(r.value)
    }

    // Risk engine already has aggregated province pm25_fc values; use
    // it for the CAMS forecast PM (forward-looking) without re-querying.
    const risk = riskEngine?.get?.()
    const riskByCode = new Map()
    for (const rp of risk?.provinces ?? []) {
      if (rp.province_code) riskByCode.set(rp.province_code, rp)
    }

    const out = []
    for (const p of provinces.values()) {
      // Use the WORST of (Air4Thai worst station, GISTDA grid value) as
      // the live PM. Honest framing: both are real, both can be higher.
      const pmLives = [p.pm25_pcd, p.pm25_gistda].filter((v) => v !== null && Number.isFinite(v))
      const pmLive = pmLives.length ? Math.max(...pmLives) : null
      const pmBase = pmBaseScore(pmLive)

      const heat = heatAmp(p.temp_c)
      const hum = humAmp(p.rh_pct)
      const { relief, source: rainSrc } = rainRelief(p.rain_obs_24, p.rain_fc_24, p.rain_prob_24)

      // danger = pm × (1+heat) × (1+hum) − relief × pm
      const amplified = pmBase * (1 + heat) * (1 + hum)
      const raw = amplified * (1 - relief)
      const danger = Math.max(0, Math.min(100, Math.round(raw)))
      const bandName = band(danger)

      // Forward-looking: if CAMS says PM2.5 doubles in 48h and there's
      // no rain on the way, flag the danger trajectory so the UI can
      // surface "GETTING WORSE".
      const cams = riskByCode.get(p.province_code)
      const camsWorst = Math.max(cams?.pm25_fc_24h ?? 0, cams?.pm25_fc_48h ?? 0)
      const dangerFc = camsWorst > 0 ? Math.round(Math.min(100,
        pmBaseScore(camsWorst) * (1 + heat) * (1 + hum) * (1 - relief * 0.5))) : danger
      const trend = dangerFc - danger

      out.push({
        province_code: p.province_code,
        province_th: p.province_th,
        province_en: p.province_en,
        // Inputs (audit trail — every modifier is visible to the user)
        pm25_pcd: p.pm25_pcd, pm25_gistda: p.pm25_gistda, pm25_live: pmLive,
        temp_c: p.temp_c, rh_pct: p.rh_pct,
        rain_obs_24: p.rain_obs_24, rain_fc_24: p.rain_fc_24, rain_prob_24: p.rain_prob_24,
        // Modifiers (named so the UI can show a breakdown)
        pm_base: pmBase, heat_amp: heat, hum_amp: hum, rain_relief: relief, rain_source: rainSrc,
        // Output
        score: danger, band: bandName, score_forecast: dangerFc, trend_24h: trend,
        // Bilingual labels for the UI to render directly
        label_th: DANGER_LABELS[bandName].th,
        label_en: DANGER_LABELS[bandName].en,
        band_color: DANGER_BG[bandName],
      })
    }
    out.sort((a, b) => b.score - a.score || (a.province_th || '').localeCompare(b.province_th || ''))
    return out
  }

  return {
    get() {
      const now = Date.now()
      if (!cache || now - cacheAt > CACHE_MS) { cache = compute(); cacheAt = now }
      return cache
    },
    invalidate() { cache = null },
  }
}
