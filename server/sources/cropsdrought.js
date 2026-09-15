// GISTDA Check Drought (cropsdrought) — province-level drought risk and
// crop water use. Two keyless public APIs from data.go.th via GISTDA's
// Open Data portal; both serve GeoJSON-flavored JSON with Thai province
// geometry, refreshed weekly. The drought-risk score and the normalized
// ET index feed directly into the citizen-panel cause chip and the
// cause explanation ("why is the air bad here?").
//
// Why this matters for an air-quality dashboard:
// Drought is the second-largest natural cause of haze in northern
// Thailand after agricultural burning. Dry topsoil lifts with any wind,
// and a province that has been drought-stressed for 3+ weeks is much more
// likely to spike PM2.5 on the next gust than a wet one with the same
// burn scar count. So the weekly drought score is a leading indicator
// for the citizen panel's "watch" bands, not just a backdrop.
//
// Both endpoints are public; no API key needed. (Tried `ud4Faf2e1tMO`
// against the disaster platform — invalid. The cropsdrought subdomain
// uses the same origin security model as pm25.gistda.or.th — no auth.)
import { CONFIG } from '../config.js'
import { fetchJson } from '../util.js'

const RISK_URL = 'https://cropsdrought.gistda.or.th/api/rest/zonal/province'
const ET_URL = 'https://cropsdrought.gistda.or.th/api/statwater/et/province'

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function strOrNull(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s || null
}

// `geometry` may come in two flavours: a JSON object (zonal/province)
// or a JSON-encoded string (statwater/et/province). Normalise to a
// string we can store as-is and serve verbatim.
function geomToString(g) {
  if (g === undefined || g === null) return null
  if (typeof g === 'string') return g
  try { return JSON.stringify(g) } catch { return null }
}

// The risk feed wraps the array in `data.jsonFeatures`; the ET feed is
// a bare array. Both carry a `week` field but in different formats
// (ISO date string vs `YYYY-Www`). Normalise to ISO date.
function isoWeekStart(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /(\d{4})-?W?(\d{1,2})/.exec(s)
  if (!m) return s
  // ISO week → Monday of that week (best-effort; exact date not load-bearing).
  const year = Number(m[1])
  const week = Number(m[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Mon = new Date(jan4)
  week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const target = new Date(week1Mon)
  target.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7)
  return target.toISOString().slice(0, 10)
}

export default {
  name: 'cropsdrought',
  label_th: 'GISTDA เช็คแล้ง — ความเสี่ยงภัยแล้งรายจังหวัด',
  label_en: 'GISTDA Check Drought — provincial drought risk',
  intervalMs: CONFIG.intervals.cropsdrought ?? 6 * 3600_000,
  enabled: true,

  async run({ db, bus }) {
    const ctl = AbortSignal.timeout(30_000)
    const now = new Date().toISOString()
    let seen = 0, added = 0

    // ── 1. Province-level drought risk (multi-polygon + 0-100 score) ─
    let riskPayload
    try {
      riskPayload = await fetchJson(RISK_URL, { timeoutMs: 25_000, signal: ctl })
    } catch (err) {
      log('warn', 'cropsdrought risk fetch failed', { error: String(err?.message ?? err) })
      // Soft-fail: keep the ET pass; the next tick will retry the risk one.
    }
    if (riskPayload?.data?.jsonFeatures && Array.isArray(riskPayload.data.jsonFeatures)) {
      const week = isoWeekStart(riskPayload.data.start_date) ?? isoWeekStart(riskPayload.data.import_date) ?? now.slice(0, 10)
      const end = isoWeekStart(riskPayload.data.end_date)
      db.tx(() => {
        for (const f of riskPayload.data.jsonFeatures) {
          const code = strOrNull(f.pv_code)
          if (!code) continue
          const geom = geomToString(f.geometry)
          db.run(
            `INSERT INTO drought_risk
               (province_code, week, end_date, pv_tn, pv_en, mean, des, geometry_json, fetched_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(province_code, week) DO UPDATE SET
               end_date=excluded.end_date,
               pv_tn=excluded.pv_tn,
               pv_en=excluded.pv_en,
               mean=excluded.mean,
               des=excluded.des,
               geometry_json=excluded.geometry_json,
               fetched_at=excluded.fetched_at`,
            code, week, end, strOrNull(f.pv_tn), strOrNull(f.pv_en),
            numOrNull(f.mean_), strOrNull(f.des_), geom, now,
          )
          seen += 1
          added += 1
        }
      })

      // Headline tap: the single highest-risk province this week.
      let worst = null
      for (const f of riskPayload.data.jsonFeatures) {
        const m = numOrNull(f.mean_)
        if (m === null) continue
        if (!worst || m > worst.mean) {
          worst = { mean: m, name_th: strOrNull(f.pv_tn), name_en: strOrNull(f.pv_en), des: strOrNull(f.des_) }
        }
      }
      if (worst && worst.mean >= 60) {
        bus.publish({
          kind: 'datum', source: 'cropsdrought',
          severity: worst.mean >= 80 ? 2 : 1,
          title_th: `GISTDA: ภัยแล้งสูงสุด ${worst.mean.toFixed(0)}/100 ที่ ${worst.name_th ?? '?'}`,
          title_en: `GISTDA: drought risk peaks at ${worst.mean.toFixed(0)}/100 in ${worst.name_en ?? '?'}`,
          payload: { mean: worst.mean, des: worst.des },
        })
      }
    }

    // ── 2. Weekly actual vs baseline crop ET per province ────────────
    let etPayload
    try {
      etPayload = await fetchJson(ET_URL, { timeoutMs: 25_000, signal: ctl })
    } catch (err) {
      log('warn', 'cropsdrought et fetch failed', { error: String(err?.message ?? err) })
    }
    if (Array.isArray(etPayload)) {
      db.tx(() => {
        for (const r of etPayload) {
          const code = strOrNull(r.pv_code)
          const weekRaw = strOrNull(r.week)
          if (!code || !weekRaw) continue
          // ET feed uses week-of-year as a YYYY-Www string; pass through.
          const week = isoWeekStart(weekRaw) ?? weekRaw
          db.run(
            `INSERT INTO crop_water
               (province_code, week, pv_tn, pv_en, re_royin,
                et_di, et_mean, et_base_mean, et_base_min, et_base_max,
                et_normalized, et_range, geometry_json, fetched_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(province_code, week) DO UPDATE SET
               pv_tn=excluded.pv_tn,
               pv_en=excluded.pv_en,
               re_royin=excluded.re_royin,
               et_di=excluded.et_di,
               et_mean=excluded.et_mean,
               et_base_mean=excluded.et_base_mean,
               et_base_min=excluded.et_base_min,
               et_base_max=excluded.et_base_max,
               et_normalized=excluded.et_normalized,
               et_range=excluded.et_range,
               geometry_json=excluded.geometry_json,
               fetched_at=excluded.fetched_at`,
            code, week,
            strOrNull(r.pv_tn), strOrNull(r.pv_en), strOrNull(r.re_royin),
            numOrNull(r.et_di), numOrNull(r.et_mean),
            numOrNull(r.et_base_mean), numOrNull(r.et_base_min), numOrNull(r.et_base_max),
            numOrNull(r.et_normalized), numOrNull(r.et_range),
            geomToString(r.geojson), now,
          )
          seen += 1
          added += 1
        }
      })
    }

    return { seen, added }
  },
}
