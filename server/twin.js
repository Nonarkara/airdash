// The Twin API — GET /api/twin (see docs/TWIN-API.md).
//
// FloodDash and AirDash are twin systems. Each publishes ONE compact,
// keyless, CORS-open, per-province summary that the other twin — and any
// other dashboard — can join on province code without re-ingesting the
// upstream feeds. This module is pure: it takes the risk engine's output
// and returns the wire shape, so the contract is unit-testable with no DB.
//
// Contract rules: additive only; `code` is the join key and is always a
// string; every province carries score/band/level and a bilingual headline
// + top reason; the domain fields are the handful another dashboard can
// act on, not the whole province row (that stays on /api/risk).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG } from './config.js'

export const TWIN_SYSTEM = 'airdash'
export const TWIN_DOMAIN = 'air'
export const TWIN_LICENCE = 'CC BY 4.0 — attribute AirDash and keep upstream agency credits (PCD / Air4Thai, CAMS, Open-Meteo, GISTDA)'

/** The front-end asset token in public/ops.html is the ONE source of truth
 *  for the AirDash version (scripts/bump-version.mjs maintains it;
 *  package.json's 1.0.0 is decorative). Read once at boot; a dashboard
 *  reading /api/twin or /api/health can then tell which release answered. */
export function readAppVersion(publicDir = CONFIG.publicDir) {
  try {
    const ops = readFileSync(join(publicDir, 'ops.html'), 'utf8')
    return ops.match(/\?v=(\d+\.\d+\.\d+)/)?.[1] ?? null
  } catch {
    return null
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v) => (v == null ? null : String(v))

/** One province row of the twin contract. `danger` is the Danger Score row
 *  for the same province (api.js joins it onto /api/risk the same way). */
export function twinProvince(p, danger = null) {
  const card = p?.card ?? null
  const top = card?.reasons?.[0] ?? null
  return {
    code: str(p.province_code),
    th: p.province_th ?? null,
    en: p.province_en ?? null,
    score: num(p.score) ?? 0,
    band: p.band ?? 'normal',
    level: card?.level ?? 'safe',
    head_th: card?.head_th ?? null,
    head_en: card?.head_en ?? null,
    reason_th: top?.th ?? null,
    reason_en: top?.en ?? null,
    // domain: air
    pm25: num(p.pm25),
    aqi: num(p.aqi),
    pm25_fc_24h: num(p.pm25_fc_24h),
    washout_band: p.washout_band ?? null,
    washout_expected_pct: num(p.washout_expected_pct),
    danger_band: danger?.band ?? null,
    danger_score: num(danger?.score),
  }
}

/** Build the whole payload. `risk` is riskEngine.get(); `dangerRows` is
 *  danger.get() (or []); `version` is the app version string. */
export function buildTwin({ risk, dangerRows = [], version = null, now = new Date() }) {
  const dangerByCode = new Map((dangerRows ?? []).map((d) => [str(d.province_code), d]))
  const provinces = (risk?.provinces ?? [])
    .filter((p) => p && p.province_code != null)
    .map((p) => twinProvince(p, dangerByCode.get(str(p.province_code)) ?? null))
  return {
    system: TWIN_SYSTEM,
    domain: TWIN_DOMAIN,
    version,
    updated: risk?.updated ?? risk?.computed_at ?? now.toISOString(),
    licence: TWIN_LICENCE,
    disclaimer_th: 'ข้อมูลจากเซ็นเซอร์และแบบจำลอง ไม่ใช่ประกาศราชการ — สายด่วน คพ. 1650 · กรมควบคุมโรค 1422 · ฉุกเฉิน 1669',
    disclaimer_en: 'Sensor- and model-derived; not an official warning. PCD 1650 · DDC 1422 · EMS 1669.',
    provinces,
  }
}
