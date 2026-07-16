// Rain-Washout engine — AirDash's signature analysis. Wet deposition: rain
// scavenges airborne particles (below-cloud washout + in-cloud rainout), so a
// forecast rain event is a forecast dust-relief event. Field studies over
// Asian cities consistently show a single ≥5 mm event knocks PM2.5 down
// 15–30%, and sustained heavy rain 30–40%+ (PM10 responds even more —
// coarse particles scavenge easier).
//
// Per province we combine: what the air holds NOW (worst fresh PM2.5), how
// LIKELY rain is (Open-Meteo precipitation probability), and how MUCH is
// forecast (precipitation sum) into:
//   relief_if_rain_pct   — expected PM2.5 reduction IF the forecast rain falls
//   expected_relief_pct  — probability-weighted relief (the honest number)
//   projected_pm25       — the after-rain level if it does rain
//   band                 — none | light | moderate | strong
//
// This is a heuristic from published washout ratios, not dispersion modelling
// — the UI says so wherever these numbers show.
import { num } from './util.js'

const FRESH_PM_HOURS = 6
const FRESH_FC_HOURS = 13
const FRESH_RAIN_HOURS = 26

// Expected PM2.5 reduction (%) if the forecast 24h rain amount actually falls.
export function reliefIfRainPct(mm) {
  if (mm === null || !Number.isFinite(mm) || mm < 1) return 0
  if (mm < 5) return 8
  if (mm < 15) return 20
  if (mm < 35) return 30
  return 40
}

// Washout band: amount AND probability must both clear the bar.
export function washoutBand(mm, prob) {
  const m = mm ?? 0
  const p = prob ?? 0
  if (m >= 15 && p >= 60) return 'strong'
  if (m >= 5 && p >= 40) return 'moderate'
  if (m >= 1 && p >= 25) return 'light'
  return 'none'
}

export const WASHOUT_LABELS = {
  strong: { th: 'ฝนล้างฝุ่นได้มาก', en: 'Strong washout expected' },
  moderate: { th: 'ฝนช่วยลดฝุ่นได้', en: 'Moderate washout likely' },
  light: { th: 'ฝนช่วยได้เล็กน้อย', en: 'Slight washout possible' },
  none: { th: 'ไม่มีฝนช่วยล้างฝุ่น', en: 'No rain relief expected' },
  unknown: { th: 'ไม่ทราบ', en: 'Unknown' },
}

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

export function createWashout(db) {
  let cache = null
  let cacheAt = 0

  function latestByProvince(source, metrics, cutoff) {
    const placeholders = metrics.map(() => '?').join(',')
    return db.all(
      `SELECT l.metric, l.value,
              s.province_code, s.province_th, s.province_en
       FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = ? AND l.metric IN (${placeholders})
         AND l.obs_time >= ? AND s.province_code IS NOT NULL`,
      source, ...metrics, cutoff,
    )
  }

  function compute() {
    const pmRows = latestByProvince('air4thai', ['pm25'], localCutoff(FRESH_PM_HOURS))
    const fcRows = latestByProvince('openmeteo',
      ['precip_fc_d0', 'precip_fc_48h', 'precip_prob_24h', 'precip_prob_48h'],
      localCutoff(FRESH_FC_HOURS))
    const rainRows = latestByProvince('thaiwater_rain', ['rain_24h'], localCutoff(FRESH_RAIN_HOURS))

    const out = new Map()
    const entry = (row) => {
      let e = out.get(row.province_code)
      if (!e) {
        e = {
          province_code: row.province_code, province_th: row.province_th, province_en: row.province_en,
          pm25: null, prob24: null, prob48: null,
          rain_fc_24: null, rain_fc_48: null, rain_obs_24: null,
        }
        out.set(row.province_code, e)
      }
      return e
    }

    // Worst fresh PM2.5 station per province — the air a resident actually breathes.
    for (const row of pmRows) {
      const e = entry(row)
      const v = num(row.value)
      if (v !== null && (e.pm25 === null || v > e.pm25)) e.pm25 = v
    }
    for (const row of fcRows) {
      const e = entry(row)
      const v = num(row.value)
      if (v === null) continue
      if (row.metric === 'precip_fc_d0') e.rain_fc_24 = v
      else if (row.metric === 'precip_fc_48h') e.rain_fc_48 = v
      else if (row.metric === 'precip_prob_24h') e.prob24 = v
      else if (row.metric === 'precip_prob_48h') e.prob48 = v
    }
    // Max observed 24h rain gauge per province — is washout already underway?
    for (const row of rainRows) {
      const e = entry(row)
      const v = num(row.value)
      if (v !== null && (e.rain_obs_24 === null || v > e.rain_obs_24)) e.rain_obs_24 = v
    }

    for (const e of out.values()) {
      e.relief_if_rain_pct = reliefIfRainPct(e.rain_fc_24)
      e.expected_relief_pct = Math.round(e.relief_if_rain_pct * (e.prob24 ?? 0)) / 100
      e.band = washoutBand(e.rain_fc_24, e.prob24)
      e.projected_pm25 = e.pm25 !== null
        ? Math.round(e.pm25 * (1 - e.relief_if_rain_pct / 100))
        : null
      e.helps_dust = e.pm25 !== null && e.pm25 > 25 && (e.band === 'moderate' || e.band === 'strong')
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
