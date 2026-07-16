// Open-Meteo Air Quality API (CAMS global model) — PM2.5/PM10/dust FORECAST
// per province. This is the "forecast" leg of the Air Watch Score: ground
// stations tell us what the air IS, CAMS tells us where it's HEADED, and the
// dust variable separates Saharan/desert advection from combustion smog.
// Free, keyless, same multi-point call pattern as the weather API.
import { CONFIG } from '../config.js'
import { fetchJson, nowLocal } from '../util.js'
import { storeReadings } from './thaiwater-common.js'
import { allProvinces } from '../provinces.js'

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const MAX_POINTS = 100

/** Mean of the first n finite values in an hourly array; null when empty. */
function meanNext(arr, n) {
  if (!Array.isArray(arr)) return null
  let sum = 0, count = 0
  for (let i = 0; i < Math.min(n, arr.length); i++) {
    if (Number.isFinite(arr[i])) { sum += arr[i]; count += 1 }
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null
}

/** Mean of hours [from, to) — the "day 2" and "day 3" windows. */
function meanWindow(arr, from, to) {
  if (!Array.isArray(arr)) return null
  let sum = 0, count = 0
  for (let i = from; i < Math.min(to, arr.length); i++) {
    if (Number.isFinite(arr[i])) { sum += arr[i]; count += 1 }
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null
}

export default {
  name: 'openmeteo_aq',
  label_th: 'พยากรณ์ฝุ่น CAMS',
  label_en: 'CAMS PM2.5 forecast',
  intervalMs: CONFIG.intervals.openmeteo_aq,
  enabled: true,

  async run({ db, bus, alerts }) {
    const provinces = allProvinces().slice(0, MAX_POINTS)

    const lats = provinces.map((p) => p.lat.toFixed(3)).join(',')
    const lngs = provinces.map((p) => p.lng.toFixed(3)).join(',')
    const hourly = 'pm2_5,pm10,dust'
    const url = `${BASE}?latitude=${lats}&longitude=${lngs}&hourly=${hourly}&forecast_days=3&timezone=Asia%2FBangkok`
    const json = await fetchJson(url, { timeoutMs: 45_000 })
    const results = Array.isArray(json) ? json : [json]
    if (results.length !== provinces.length) throw new Error(`Open-Meteo AQ returned ${results.length} points for ${provinces.length} provinces`)

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    const obs_time = nowLocal().slice(0, 13) + ':00'
    let added = 0
    const rising = []

    db.tx(() => {
      provinces.forEach((p, i) => {
        const h = results[i]?.hourly
        if (!h) return

        const pm25_24 = meanNext(h.pm2_5, 24)
        const pm25_48 = meanWindow(h.pm2_5, 24, 48)
        const pm25_72 = meanWindow(h.pm2_5, 48, 72)
        const pm10_24 = meanNext(h.pm10, 24)
        const dust_24 = meanNext(h.dust, 24)

        if (pm25_24 !== null && pm25_48 !== null &&
            pm25_48 >= CONFIG.thresholds.pm25Unhealthy && pm25_48 > pm25_24 * 1.25) {
          rising.push({ p, from: pm25_24, to: pm25_48 })
        }

        const station = {
          station_key: p.province_code,
          name_th: p.province_th, name_en: p.province_en,
          province_th: p.province_th, province_en: p.province_en,
          province_code: p.province_code,
          region_th: null, region_en: null,
          basin_th: null, basin_en: null,
          lat: p.lat, lng: p.lng,
          meta_json: JSON.stringify({ model: 'cams_global' }),
        }

        added += storeReadings({
          db, alerts, source: 'openmeteo_aq', station,
          metrics: {
            pm25_fc_24h: pm25_24, pm25_fc_48h: pm25_48, pm25_fc_72h: pm25_72,
            pm10_fc_24h: pm10_24, dust_fc_24h: dust_24,
          },
          obs_time, fetched_at, now,
        })
      })
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'openmeteo_aq',
        severity: rising.length > 0 ? 1 : 0,
        title_th: `พยากรณ์ฝุ่น CAMS ${provinces.length} จังหวัด${rising.length ? ` · แนวโน้มแย่ลง ${rising.length} จังหวัด` : ''}`,
        title_en: `CAMS dust forecast for ${provinces.length} provinces${rising.length ? ` · worsening in ${rising.length}` : ''}`,
        payload: { provinces: provinces.length, added, worsening: rising.length },
      })
      for (const { p, from, to } of rising.sort((a, b) => b.to - a.to).slice(0, 3)) {
        bus.publish({
          kind: 'datum', source: 'openmeteo_aq', station_key: p.province_code, severity: 1,
          title_th: `คาด PM2.5 จ.${p.province_th} เพิ่มจาก ${from.toFixed(0)} เป็น ${to.toFixed(0)} µg/m³ ใน 48 ชม.`,
          title_en: `PM2.5 in ${p.province_en} forecast to rise ${from.toFixed(0)} → ${to.toFixed(0)} µg/m³ within 48h`,
          payload: { pm25_fc_24h: from, pm25_fc_48h: to },
        })
      }
    }

    return { seen: provinces.length, added }
  },
}
