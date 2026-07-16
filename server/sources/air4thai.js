// PCD Air4Thai national AQI network (~200 stations) — AirDash's PRIMARY source.
// Full pollutant set: PM2.5, PM10, O3, CO, NO2, SO2 + composite AQI.
// Units upstream: PM µg/m³ · O3/NO2/SO2 ppb · CO ppm.
// Fetched via curl because the upstream serves an incomplete TLS chain Node's
// fetch rejects (see util.js).
import { CONFIG } from '../config.js'
import { curlJson, num, str } from '../util.js'
import { storeReadings } from './thaiwater-common.js'
import { provinceByName } from '../provinces.js'

const URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php'

/** "ต.ปากน้ำ อ.เมือง, กระบี่" → "กระบี่" (province is the segment after the last comma). */
function provinceFromArea(area) {
  const s = str(area)
  if (!s) return null
  const parts = s.split(',')
  return str(parts.at(-1))
}

/** Air4Thai reports missing values as -1 or "-1". */
function reading(x) {
  const n = num(x)
  return n !== null && n >= 0 ? n : null
}

export default {
  name: 'air4thai',
  label_th: 'คุณภาพอากาศ คพ. (Air4Thai)',
  label_en: 'Air4Thai AQI network',
  intervalMs: CONFIG.intervals.air4thai,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await curlJson(URL)
    const rows = json?.stations
    if (!Array.isArray(rows)) throw new Error('unexpected Air4Thai payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0, unhealthy = 0
    let worst = null

    db.tx(() => {
      for (const row of rows) {
        const key = str(row.stationID)
        const last = row.AQILast
        const date = str(last?.date)
        const time = str(last?.time)
        if (!key || !date || !time) continue
        const obs_time = `${date}T${time}`

        const metrics = {
          pm25: reading(last?.PM25?.value),
          pm10: reading(last?.PM10?.value),
          o3: reading(last?.O3?.value),
          co: reading(last?.CO?.value),
          no2: reading(last?.NO2?.value),
          so2: reading(last?.SO2?.value),
          aqi: reading(last?.AQI?.aqi),
        }
        if (metrics.aqi !== null && metrics.aqi > CONFIG.thresholds.aqiUnhealthy) unhealthy += 1
        if (metrics.pm25 !== null && (!worst || metrics.pm25 > worst.pm25)) {
          worst = { pm25: metrics.pm25, name_th: str(row.nameTH) ?? key, name_en: str(row.nameEN) ?? key }
        }

        // Upstream only ships a Thai/English area string — resolve it against
        // the DOPA province registry so every station carries a province_code
        // (the join key for scores, forecasts, and washout).
        const province_th = provinceFromArea(row.areaTH)
        const province_en = provinceFromArea(row.areaEN)
        const prov = provinceByName(province_th, province_en)

        const station = {
          station_key: key,
          name_th: str(row.nameTH) ?? key,
          name_en: str(row.nameEN) ?? key,
          province_th: prov?.province_th ?? province_th,
          province_en: prov?.province_en ?? province_en,
          province_code: prov?.province_code ?? null,
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: num(row.lat), lng: num(row.long),
          meta_json: JSON.stringify({ type: str(row.stationType) }),
        }

        added += storeReadings({
          db, alerts, source: 'air4thai', station,
          metrics, obs_time, fetched_at, now,
        })
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'air4thai',
        severity: unhealthy > 0 ? 1 : 0,
        title_th: `คุณภาพอากาศ +${added} ค่าใหม่ จาก ${rows.length} สถานี${unhealthy ? ` · เกินเกณฑ์ ${unhealthy} สถานี` : ''}`,
        title_en: `Air quality: +${added} new readings from ${rows.length} stations${unhealthy ? ` · ${unhealthy} unhealthy` : ''}`,
        payload: { seen: rows.length, added, unhealthy },
      })
      if (worst && worst.pm25 >= CONFIG.thresholds.pm25Unhealthy) {
        bus.publish({
          kind: 'datum', source: 'air4thai', severity: worst.pm25 >= CONFIG.thresholds.pm25VeryUnhealthy ? 2 : 1,
          title_th: `PM2.5 สูงสุด ${worst.pm25.toFixed(0)} µg/m³ ที่ ${worst.name_th}`,
          title_en: `Highest PM2.5 ${worst.pm25.toFixed(0)} µg/m³ at ${worst.name_en}`,
          payload: { pm25: worst.pm25 },
        })
      }
    }

    return { seen: rows.length, added }
  },
}
