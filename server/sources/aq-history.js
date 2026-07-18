// Open-Meteo Air Quality HISTORY backfill — one-shot 92-day hourly PM2.5
// per province centroid, so the patterns engine (hour-of-day / day-of-week /
// month profiles) is meaningful from day one instead of waiting months for
// the live ingest to accumulate.
//
// Same multi-point pattern as openmeteo-aq.js, but with &past_days=92 and
// real per-hour obs_time values. Stored as source 'openmeteo_aq_hist',
// metric 'pm25_hist' — deliberately separate from live 'pm25' so nothing
// downstream ever mistakes CAMS model history for a ground observation.
//
// Scheduler runs this every 24h, but it is effectively idempotent:
//   • readings has a UNIQUE(source, station_key, metric, obs_time) guard, so
//     re-runs only add the hours that slid into the window since last run;
//   • a coverage guard skips the network fetch entirely once ≥80 distinct
//     days of pm25_hist are already stored.
// The 77 centroids are fetched in 2 batches to keep each response modest
// (~39 provinces × 92 d × 24 h ≈ 86k values per call).
import { fetchJson, nowLocal } from '../util.js'
import { allProvinces } from '../provinces.js'

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const MAX_POINTS = 100
const PAST_DAYS = 92
const COVERAGE_SKIP_DAYS = 80
const BATCHES = 2
const HOUR = 3600_000

export default {
  name: 'openmeteo_aq_hist',
  label_th: 'ประวัติฝุ่น CAMS ย้อนหลัง 92 วัน',
  label_en: 'CAMS PM2.5 history backfill (92 days)',
  intervalMs: 24 * HOUR,
  enabled: true,

  async run({ db, bus }) {
    // Coverage guard — metric filter FIRST so the covering index serves this.
    const cov = db.get(
      `SELECT COUNT(DISTINCT substr(obs_time, 1, 10)) AS days
       FROM readings WHERE metric = 'pm25_hist' AND source = 'openmeteo_aq_hist'`)
    if ((cov?.days ?? 0) >= COVERAGE_SKIP_DAYS) {
      return { seen: 0, added: 0 }
    }

    const provinces = allProvinces().slice(0, MAX_POINTS)
    const batchSize = Math.ceil(provinces.length / BATCHES)
    const fetched_at = new Date().toISOString()
    const nowLocalStr = nowLocal().slice(0, 16)
    let added = 0
    let seen = 0

    for (let b = 0; b < provinces.length; b += batchSize) {
      const batch = provinces.slice(b, b + batchSize)
      const lats = batch.map((p) => p.lat.toFixed(3)).join(',')
      const lngs = batch.map((p) => p.lng.toFixed(3)).join(',')
      const url = `${BASE}?latitude=${lats}&longitude=${lngs}&hourly=pm2_5`
        + `&past_days=${PAST_DAYS}&forecast_days=1&timezone=Asia%2FBangkok`
      const json = await fetchJson(url, { timeoutMs: 90_000 })
      const results = Array.isArray(json) ? json : [json]
      if (results.length !== batch.length) {
        throw new Error(`Open-Meteo AQ history returned ${results.length} points for ${batch.length} provinces`)
      }

      db.tx(() => {
        batch.forEach((p, i) => {
          const h = results[i]?.hourly
          if (!Array.isArray(h?.time) || !Array.isArray(h?.pm2_5)) return
          db.upsertStation({
            source: 'openmeteo_aq_hist',
            station_key: p.province_code,
            name_th: p.province_th, name_en: p.province_en,
            province_th: p.province_th, province_en: p.province_en,
            province_code: p.province_code,
            region_th: null, region_en: null, basin_th: null, basin_en: null,
            lat: p.lat, lng: p.lng,
            meta_json: JSON.stringify({ model: 'cams_global', kind: 'history_backfill' }),
            now: fetched_at,
          })
          for (let t = 0; t < h.time.length; t++) {
            const v = h.pm2_5[t]
            if (!Number.isFinite(v)) continue
            const obs = h.time[t] // "YYYY-MM-DDTHH:MM" local (timezone=Asia/Bangkok)
            if (typeof obs !== 'string' || obs > nowLocalStr) continue // skip forecast hours
            seen += 1
            if (db.insertReading({
              source: 'openmeteo_aq_hist', station_key: p.province_code,
              metric: 'pm25_hist', value: v, obs_time: obs, fetched_at,
            })) added += 1
          }
        })
      })
    }

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'openmeteo_aq_hist', severity: 0,
        title_th: `เติมประวัติ PM2.5 ย้อนหลัง ${PAST_DAYS} วัน +${added} ค่า (${provinces.length} จังหวัด)`,
        title_en: `Backfilled ${PAST_DAYS}-day PM2.5 history: +${added} values across ${provinces.length} provinces`,
        payload: { provinces: provinces.length, added },
      })
    }
    return { seen, added }
  },
}
