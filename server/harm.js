// Effective Harm — Ambient Watch Score × Social Load.
//
// Distinct from Air Watch (plume physics) and Danger (acute outside-now
// modifiers). This answers: given the same watch score, who absorbs more
// harm because they work outdoors, cannot stop earning, are age-sensitive,
// or lack filtration/shelter?
//
//   social_load = 0.35·outdoor + 0.30·income_strain + 0.20·sensitivity
//                 + 0.15·adaptive_deficit
//   harm = clamp(0, 100, round(watch_score × (0.55 + 0.45 × social_load/100)))
//
// Ambient still dominates — clean air stays low even in vulnerable
// provinces; social load re-ranks when watch scores are similar.
//
// Always emits all 77 DOPA provinces (names from provinces.js). Watch score
// is 0 when the risk engine has no live row yet — so a sparse post-outage
// risk snapshot cannot drop high-social provinces from /api/harm.
//
// This is a transparent heuristic for ranking and messaging, not an
// epidemiological attributable-fraction claim.
import { CONFIG } from './config.js'
import { allProvinces, isThaiProvinceCode } from './provinces.js'
import {
  PROVINCE_SOCIAL,
  SOCIAL_LOAD_WEIGHTS,
  SOCIAL_LOAD_METHOD,
} from './socialLoadData.js'

const CACHE_MS = 60_000

export const HARM_METHOD = {
  th: `ภาระจริง = ดัชนีเฝ้าระวัง × (0.55 + 0.45 × ภาระทางสังคม/100) — ${SOCIAL_LOAD_METHOD.th} ไม่ใช่การพยากรณ์หรืออัตราตายเชิงระบาดวิทยา`,
  en: `Effective Harm = Watch Score × (0.55 + 0.45 × Social Load/100) — ${SOCIAL_LOAD_METHOD.en}. Heuristic, not a forecast or epidemiological rate`,
}

const BAND_LABELS = {
  normal: { th: 'ปกติ', en: 'Normal' },
  watch: { th: 'เฝ้าระวัง', en: 'Watch' },
  elevated: { th: 'เสี่ยงสูง', en: 'Elevated' },
  high: { th: 'วิกฤต', en: 'Critical' },
}

/** @param {{ outdoor_labor?: number, income_strain?: number, sensitivity?: number, adaptive_deficit?: number } | null | undefined} row */
export function socialLoadScore(row) {
  if (!row) return null
  const w = SOCIAL_LOAD_WEIGHTS
  const o = Number(row.outdoor_labor)
  const i = Number(row.income_strain)
  const s = Number(row.sensitivity)
  const a = Number(row.adaptive_deficit)
  if (![o, i, s, a].every(Number.isFinite)) return null
  return Math.round(
    w.outdoor_labor * o +
    w.income_strain * i +
    w.sensitivity * s +
    w.adaptive_deficit * a,
  )
}

/**
 * @param {number | null | undefined} watchScore
 * @param {number | null | undefined} socialLoad
 */
export function effectiveHarm(watchScore, socialLoad) {
  // Number(null) === 0 — reject null/undefined explicitly.
  if (watchScore == null || socialLoad == null) return null
  const w = Number(watchScore)
  const s = Number(socialLoad)
  if (!Number.isFinite(w) || !Number.isFinite(s)) return null
  const mult = 0.55 + 0.45 * (Math.max(0, Math.min(100, s)) / 100)
  return Math.max(0, Math.min(100, Math.round(w * mult)))
}

function harmBand(score) {
  const b = CONFIG.risk.bands
  if (score >= b.high) return 'high'
  if (score >= b.elevated) return 'elevated'
  if (score >= b.watch) return 'watch'
  return 'normal'
}

/** Capacity-aware action copy from social load (not from ambient band). */
function actionForSocial(socialLoad) {
  if (socialLoad >= 65) {
    return {
      label_th: 'ภาระสูง',
      label_en: 'High social load',
      action_th: 'แรงงานกลางแจ้งและโรงเรียนต้องการมาตรการเชิงโครงสร้าง — หน้ากาก N95 / ที่พักพิง ไม่ใช่แค่เครื่องฟอกในบ้าน',
      action_en: 'Outdoor workers and schools need structural protection — N95 / shelter — not only home purifiers',
    }
  }
  if (socialLoad >= 45) {
    return {
      label_th: 'ภาระปานกลาง',
      label_en: 'Moderate social load',
      action_th: 'ลดเวลากลางแจ้งเมื่อเป็นไปได้ กลุ่มเปราะบางควรอยู่ในอาคารที่มีการระบายอากาศดี',
      action_en: 'Cut outdoor time when possible; sensitive groups should use well-ventilated indoor space',
    }
  }
  return {
    label_th: 'ภาระต่ำ',
    label_en: 'Lower social load',
    action_th: 'ใช้เครื่องกรองอากาศและจำกัดกิจกรรมกลางแจ้งเมื่อค่าเฝ้าระวังสูง',
    action_en: 'Use filtration and limit outdoor exertion when the watch score is high',
  }
}

/** Slim payload folded onto risk/snapshot province rows. */
export function harmPayload(entry) {
  if (!entry) return null
  return {
    score: entry.score,
    band: entry.band,
    social_load: entry.social_load,
    outdoor_labor: entry.outdoor_labor,
    income_strain: entry.income_strain,
    sensitivity: entry.sensitivity,
    adaptive_deficit: entry.adaptive_deficit,
    watch_score: entry.watch_score,
    watch_live: entry.watch_live,
    label_th: entry.label_th,
    label_en: entry.label_en,
    action_th: entry.action_th,
    action_en: entry.action_en,
    social_label_th: entry.social_label_th,
    social_label_en: entry.social_label_en,
  }
}

function buildEntry(code, nameTh, nameEn, watch, watchLive, row) {
  const social = socialLoadScore(row)
  const score = effectiveHarm(watch, social)
  if (score === null || social === null) return null
  const band = harmBand(score)
  const copy = actionForSocial(social)
  return {
    province_code: code,
    province_th: nameTh,
    province_en: nameEn,
    watch_score: watch,
    watch_live: watchLive,
    social_load: social,
    outdoor_labor: row.outdoor_labor,
    income_strain: row.income_strain,
    sensitivity: row.sensitivity,
    adaptive_deficit: row.adaptive_deficit,
    score,
    band,
    label_th: BAND_LABELS[band].th,
    label_en: BAND_LABELS[band].en,
    action_th: copy.action_th,
    action_en: copy.action_en,
    social_label_th: copy.label_th,
    social_label_en: copy.label_en,
  }
}

export function createHarm({ riskEngine }) {
  let cache = null
  let cacheAt = 0
  let cacheRiskUpdated = null

  function compute() {
    const risk = riskEngine?.get?.()
    const riskByCode = new Map()
    for (const rp of risk?.provinces ?? []) {
      if (rp.province_code != null) riskByCode.set(String(rp.province_code), rp)
    }

    const list = []
    for (const prov of allProvinces()) {
      const code = prov.province_code
      if (!isThaiProvinceCode(code)) continue
      const row = PROVINCE_SOCIAL[code]
      if (!row) continue
      const rp = riskByCode.get(code)
      const watchLive = typeof rp?.score === 'number'
      const watch = watchLive ? rp.score : 0
      const entry = buildEntry(
        code,
        rp?.province_th ?? prov.province_th,
        rp?.province_en ?? prov.province_en,
        watch,
        watchLive,
        row,
      )
      if (entry) list.push(entry)
    }
    list.sort((a, b) => b.score - a.score || b.social_load - a.social_load
      || a.province_code.localeCompare(b.province_code))
    return { list, riskUpdated: risk?.updated ?? null }
  }

  function get() {
    const now = Date.now()
    const riskUpdated = riskEngine?.get?.()?.updated ?? null
    // Bust when risk recomputes, not only on the 60s wall clock — otherwise
    // harm can lag a fresh watch score by almost a full cache window.
    const stale = !cache
      || now - cacheAt >= CACHE_MS
      || riskUpdated !== cacheRiskUpdated
    if (!stale) return cache
    const { list, riskUpdated: ru } = compute()
    cache = list
    cacheAt = now
    cacheRiskUpdated = ru
    return cache
  }

  function forProvince(code) {
    const c = String(code ?? '').trim()
    return get().find((p) => p.province_code === c) ?? null
  }

  /** Static social row for a code (even if risk has no live row yet). */
  function socialFor(code) {
    const c = String(code ?? '').trim()
    if (!isThaiProvinceCode(c)) return null
    const row = PROVINCE_SOCIAL[c]
    if (!row) return null
    const social = socialLoadScore(row)
    return { province_code: c, ...row, social_load: social }
  }

  return { get, forProvince, socialFor }
}
