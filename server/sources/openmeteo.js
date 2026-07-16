// Open-Meteo 3-day precipitation forecast per province. Province centroids are
// DERIVED from real station coordinates already in the DB (mean of ThaiWater
// water-level + rain stations per province) — no hand-typed geo data.
import { CONFIG } from '../config.js'
import { fetchJson, nowLocal } from '../util.js'
import { storeReadings } from './thaiwater-common.js'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const MAX_POINTS = 100 // Open-Meteo multi-point limit safety

export function provinceCentroids(db) {
  return db.all(
    `SELECT province_code, province_th, province_en, region_th, region_en,
            AVG(lat) AS lat, AVG(lng) AS lng, COUNT(*) AS n
     FROM stations
     WHERE source IN ('thaiwater_wl','thaiwater_rain')
       AND lat IS NOT NULL AND lng IS NOT NULL AND province_code IS NOT NULL
     GROUP BY province_code
     ORDER BY province_code`,
  )
}

export default {
  name: 'openmeteo',
  label_th: 'พยากรณ์ฝน Open-Meteo',
  label_en: 'Open-Meteo rain forecast',
  intervalMs: CONFIG.intervals.openmeteo,
  enabled: true,

  async run({ db, bus, alerts }) {
    const provinces = provinceCentroids(db).slice(0, MAX_POINTS)
    if (provinces.length === 0) {
      // First boot: ThaiWater stations not ingested yet; next cycle will cover it.
      return { seen: 0, added: 0 }
    }

    const lats = provinces.map((p) => p.lat.toFixed(3)).join(',')
    const lngs = provinces.map((p) => p.lng.toFixed(3)).join(',')
    const url = `${BASE}?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FBangkok`
    // 77 province centroids in one call can exceed 20s; allow headroom before backoff.
    const json = await fetchJson(url, { timeoutMs: 45_000 })
    const results = Array.isArray(json) ? json : [json]
    if (results.length !== provinces.length) throw new Error(`Open-Meteo returned ${results.length} points for ${provinces.length} provinces`)

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    // Issue-hour timestamp: each 3-hour poll stores a fresh forecast row set.
    const obs_time = nowLocal().slice(0, 13) + ':00'
    let added = 0
    let wetProvinces = 0
    const heavyFc = []

    db.tx(() => {
      provinces.forEach((p, i) => {
        const daily = results[i]?.daily
        const sums = daily?.precipitation_sum
        if (!Array.isArray(sums)) return

        const [d0, d1, d2] = [sums[0], sums[1], sums[2]].map((v) => (Number.isFinite(v) ? v : null))
        const next48 = d0 !== null && d1 !== null ? d0 + d1 : null
        if (next48 !== null && next48 >= CONFIG.thresholds.rainVeryHeavy24h) {
          wetProvinces += 1
          heavyFc.push({ p, next48 })
        }

        const station = {
          station_key: p.province_code,
          name_th: p.province_th, name_en: p.province_en,
          province_th: p.province_th, province_en: p.province_en,
          province_code: p.province_code,
          region_th: p.region_th, region_en: p.region_en,
          basin_th: null, basin_en: null,
          lat: p.lat, lng: p.lng,
          meta_json: JSON.stringify({ centroid_of_stations: p.n }),
        }

        added += storeReadings({
          db, alerts, source: 'openmeteo', station,
          metrics: { precip_fc_d0: d0, precip_fc_d1: d1, precip_fc_d2: d2, precip_fc_48h: next48 },
          obs_time, fetched_at, now,
        })
      })
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'openmeteo',
        severity: wetProvinces > 0 ? 1 : 0,
        title_th: `พยากรณ์ฝน ${provinces.length} จังหวัด · ฝนหนัก 48 ชม. ${wetProvinces} จังหวัด`,
        title_en: `Rain forecast for ${provinces.length} provinces · heavy 48h rain in ${wetProvinces}`,
        payload: { provinces: provinces.length, added, wetProvinces },
      })
      for (const { p, next48 } of heavyFc.sort((a, b) => b.next48 - a.next48).slice(0, 3)) {
        bus.publish({
          kind: 'datum', source: 'openmeteo', station_key: p.province_code, severity: 1,
          title_th: `คาดฝน 48 ชม. ${next48.toFixed(0)} มม. จ.${p.province_th}`,
          title_en: `Forecast 48h rain ${next48.toFixed(0)} mm in ${p.province_en}`,
          payload: { precip_fc_48h: next48 },
        })
      }
    }

    return { seen: provinces.length, added }
  },
}
