// Danger Score — the "is it dangerous to be outside RIGHT NOW" composite.
// Distinct from the Air Watch Score (which is a per-province watch INDICATOR
// weighted across PM, pollutants, trend, forecast, stagnation).
//
// The Danger Score answers a sharper question: given the air, the heat, the
// humidity, the noise, and any incoming rain, how much more dangerous is it
// to be outside for an at-risk person than on a normal day? It is the
// number we want a parent, an elderly neighbour, or a coach to act on.
//
//   danger = pm_base × (1 + heat_amp) × (1 + hum_amp) × (1 + noise_amp)
//            × (1 − rain_relief)
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
//   • noise_amp      — traffic + environmental noise is an independent
//                       cardiovascular risk factor that the WHO 2018
//                       Environmental Noise Guidelines recommends be kept
//                       below 53 dB Lden. AIRCARD 2025 found a +7.5% MACE
//                       risk per 14.9 dB of traffic noise after adjusting
//                       for air pollution. 0–55 dB: 0; 55–85 dB: linear
//                       ramp; >85 dB capped at +30%.
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
import { reliefFraction } from './washout-curve.js'
import { isThaiProvinceCode } from './provinces.js'

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
 * Noise amplification (0–0.30, capped).
 * Anchored to: WHO Environmental Noise Guidelines for the European Region
 * (2018) — the recommended limit for road traffic noise is 53 dB Lden
 * (cardiovascular protection). Above that, every 10 dB is associated
 * with +8% IHD incidence (Kempen et al. 2018, meta-analysis of 7 cohorts)
 * and +9% CHD mortality (Gan et al. 2012, AJE). AIRCARD 2025 found an
 * independent +7.5% MACE risk per 14.9 dB of traffic noise AFTER
 * adjustment for air pollution — meaning noise is a real additional
 * amplifier, not a proxy.
 *
 * Thresholds (conservative, anchored to the WHO 53 dB Lden guideline):
 *   below 55 dB: 0     (within WHO safe zone)
 *   55–85 dB:    linear ramp
 *   above 85 dB: 0.30 cap (matches heat_amp — each modifier's ceiling
 *                     is intentionally the same so no single dimension
 *                     can dominate the composite)
 *
 * A typical Bangkok roadside reads 68–74 dB (peak) and 60–65 dB
 * (background). 85 dB+ is the regime of a motorcycle at 1 m, a chainsaw,
 * or a busy construction site — sustained exposure is rare outside
 * industrial zones, so the cap is rarely hit in practice.
 */
function noiseAmp(leq) {
  if (leq === null || !Number.isFinite(leq)) return 0
  if (leq <= 55) return 0
  if (leq >= 85) return 0.30
  return Math.round(((leq - 55) / 30) * 0.30 * 100) / 100
}

/**
 * Rain relief (0–0.40 max, returns the fraction of the amplified score to
 * subtract). Two sources, whichever yields more relief:
 *   • Observed 24h rain from HII gauges (rain already in the air).
 *   • Forecast 24h rain amount × probability from Open-Meteo.
 *
 * The mm→% mapping is the shared curve in washout-curve.js (8/20/30/40) —
 * danger.js previously carried a divergent 5/20/30/40 copy, so the Danger
 * Score and the Washout engine disagreed about the same rain event.
 */
function rainRelief(rainObs24, rainFc24, rainProb24) {
  // Already-raining always wins. If gauges show 5+ mm in the last 24h,
  // the air is currently being washed, period.
  if (rainObs24 !== null && Number.isFinite(rainObs24) && rainObs24 >= 5) {
    return { relief: reliefFraction(rainObs24), source: 'observed' }
  }
  // Forecast rain must clear BOTH the amount bar and the probability bar.
  if (rainFc24 === null || rainProb24 === null) return { relief: 0, source: null }
  if (rainFc24 < 1 || rainProb24 < 25) return { relief: 0, source: null }
  // Probability-weighted: a 60% chance of 10 mm is worse than 100% of 10 mm.
  // The probability weighting is the ONLY discount — the old code multiplied
  // the curved result by another 0.85 "because probability < 1", which
  // double-counted the uncertainty the weighting already applied.
  const weighted = rainFc24 * (rainProb24 / 100)
  return { relief: reliefFraction(weighted), source: 'forecast' }
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
    // Pull all 5 inputs as per-province rows.
    const pmRows = freshByProvince(db, 'air4thai', ['pm25'], localCutoff(FRESH_HOURS))
    const wxRows = freshByProvince(db, 'openmeteo', ['temp_c', 'rh_pct'], localCutoff(FRESH_FC_HOURS))
    const fcRows = freshByProvince(db, 'openmeteo', ['precip_fc_d0', 'precip_prob_24h'], localCutoff(FRESH_FC_HOURS))
    const rainRows = freshByProvince(db, 'thaiwater_rain', ['rain_24h'], localCutoff(FRESH_RAIN_HOURS))
    // Optional: prefer GISTDA's pm25 over Air4Thai's worst station if the
    // PCD ground network is sparse for that province. We keep BOTH values
    // in the breakdown so the user can audit which feed drove the score.
    const gistRows = freshByProvince(db, 'gistda_pm25', ['pm25'], localCutoff(FRESH_HOURS))
    // PCD noise: freshByProvince already MAX-aggregates per province; for
    // the few provinces with multiple stations (Bangkok has 7, Rayong 4)
    // the SQL aggregate takes the loudest reading, which is what we want
    // for a worst-case danger score.
    // Noise is a DAILY Leq window (obs_time = start of the 24h window), so
    // a 6h freshness cutoff starved it; 30h fits the daily cadence.
    const noiseRows = freshByProvince(db, 'pcd_noise', ['noise_leq_db'], localCutoff(30))

    const provinces = new Map()
    const get = (code, th, en) => {
      // Only real Thai provinces (DOPA 10–96 in the registry). Gauges
      // geocoded across a border (Myanmar HII gauge → code 10499) must not
      // mint pseudo-province rows in the danger ranking.
      if (!isThaiProvinceCode(code)) return null
      let p = provinces.get(code)
      if (!p) {
        p = {
          province_code: code, province_th: th, province_en: en,
          pm25_pcd: null, pm25_gistda: null,
          temp_c: null, rh_pct: null, apparent_c: null,
          rain_obs_24: null, rain_fc_24: null, rain_prob_24: null,
          noise_leq_db: null, noise_stations: 0,
        }
        provinces.set(code, p)
      }
      return p
    }

    for (const r of pmRows) { const p = get(r.province_code, r.province_th, r.province_en); if (p) p.pm25_pcd = num(r.value) }
    for (const r of gistRows) { const p = get(r.province_code, r.province_th, r.province_en); if (p) p.pm25_gistda = num(r.value) }
    for (const r of wxRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (!p) continue
      if (r.metric === 'temp_c') p.temp_c = num(r.value)
      else if (r.metric === 'rh_pct') p.rh_pct = num(r.value)
    }
    for (const r of fcRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (!p) continue
      if (r.metric === 'precip_fc_d0') p.rain_fc_24 = num(r.value)
      else if (r.metric === 'precip_prob_24h') p.rain_prob_24 = num(r.value)
    }
    for (const r of rainRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (p) p.rain_obs_24 = num(r.value)
    }
    // Noise: we want MAX Leq across all stations in a province (worst
    // case), and a count so the UI can flag "from N stations" when
    // more than one. freshByProvince already MAX-aggregates; we count
    // separately via a second query.
    for (const r of noiseRows) {
      const p = get(r.province_code, r.province_th, r.province_en)
      if (p) p.noise_leq_db = num(r.value)
    }
    const noiseCounts = db.all(
      `SELECT s.province_code, COUNT(DISTINCT s.station_key) AS n
         FROM latest l
         JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
        WHERE l.source = 'pcd_noise' AND l.metric = 'noise_leq_db'
          AND l.obs_time >= ? AND s.province_code IS NOT NULL
        GROUP BY s.province_code`,
      localCutoff(FRESH_HOURS),
    )
    for (const r of noiseCounts) {
      const p = provinces.get(r.province_code)
      if (p) p.noise_stations = r.n
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
      const noise = noiseAmp(p.noise_leq_db)
      const { relief, source: rainSrc } = rainRelief(p.rain_obs_24, p.rain_fc_24, p.rain_prob_24)

      // danger = pm × (1+heat) × (1+hum) × (1+noise) × (1 − rain_relief)
      const amplified = pmBase * (1 + heat) * (1 + hum) * (1 + noise)
      const raw = amplified * (1 - relief)
      const danger = Math.max(0, Math.min(100, Math.round(raw)))
      const bandName = band(danger)

      // Forward-looking danger: the SAME composite formula with the CAMS
      // PM2.5 forecast as the PM input. Base-definition decision (documented
      // here because the old code mixed bases silently): the live score's PM
      // base is max(worst Air4Thai station, GISTDA grid) — observed truth —
      // while the forecast can only ever come from the CAMS model centroid;
      // CAMS publishes no "current" analysis field we could score against.
      // So trend_24h is explicitly "danger at the CAMS forecast level vs
      // danger at the observed level, with an IDENTICAL modifier set": same
      // heat/hum/noise amplifiers and the SAME full rain relief on both
      // sides (the old code halved the relief for the forecast and left the
      // base switch undocumented, so trend mixed a model-vs-observation bias
      // with the actual trajectory). A residual CAMS-vs-station bias can
      // still lean the trend — it is a heuristic arrow, not a prediction.
      const cams = riskByCode.get(p.province_code)
      const camsWorst = Math.max(cams?.pm25_fc_24h ?? 0, cams?.pm25_fc_48h ?? 0)
      const dangerFc = camsWorst > 0 ? Math.round(Math.min(100,
        pmBaseScore(camsWorst) * (1 + heat) * (1 + hum) * (1 + noise) * (1 - relief))) : danger
      const trend = dangerFc - danger

      out.push({
        province_code: p.province_code,
        province_th: p.province_th,
        province_en: p.province_en,
        // Inputs (audit trail — every modifier is visible to the user)
        pm25_pcd: p.pm25_pcd, pm25_gistda: p.pm25_gistda, pm25_live: pmLive,
        temp_c: p.temp_c, rh_pct: p.rh_pct,
        rain_obs_24: p.rain_obs_24, rain_fc_24: p.rain_fc_24, rain_prob_24: p.rain_prob_24,
        noise_leq_db: p.noise_leq_db, noise_stations: p.noise_stations,
        // Modifiers (named so the UI can show a breakdown)
        pm_base: pmBase, heat_amp: heat, hum_amp: hum, noise_amp: noise,
        rain_relief: relief, rain_source: rainSrc,
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
