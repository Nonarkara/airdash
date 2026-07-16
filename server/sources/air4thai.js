// PCD Air4Thai national AQI network (~170 stations). Fetched via curl because
// the upstream serves an incomplete TLS chain Node's fetch rejects (see util.js).
import { CONFIG } from '../config.js'
import { curlJson, num, str } from '../util.js'
import { storeReadings } from './thaiwater-common.js'

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
  label_th: 'คุณภาพอากาศ คพ.',
  label_en: 'Air4Thai AQI',
  intervalMs: CONFIG.intervals.air4thai,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await curlJson(URL)
    const rows = json?.stations
    if (!Array.isArray(rows)) throw new Error('unexpected Air4Thai payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0, unhealthy = 0

    db.tx(() => {
      for (const row of rows) {
        const key = str(row.stationID)
        const last = row.AQILast
        const date = str(last?.date)
        const time = str(last?.time)
        if (!key || !date || !time) continue
        const obs_time = `${date}T${time}`

        const pm25 = reading(last?.PM25?.value)
        const aqi = reading(last?.AQI?.aqi)
        if (aqi !== null && aqi > 100) unhealthy += 1

        const station = {
          station_key: key,
          name_th: str(row.nameTH) ?? key,
          name_en: str(row.nameEN) ?? key,
          province_th: provinceFromArea(row.areaTH),
          province_en: provinceFromArea(row.areaEN),
          province_code: null,
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: num(row.lat), lng: num(row.long),
          meta_json: JSON.stringify({ type: str(row.stationType) }),
        }

        added += storeReadings({
          db, alerts, source: 'air4thai', station,
          metrics: { pm25, aqi },
          obs_time, fetched_at, now,
        })
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'air4thai',
        severity: 0,
        title_th: `คุณภาพอากาศ +${added} ค่าใหม่ จาก ${rows.length} สถานี${unhealthy ? ` · เกินเกณฑ์ ${unhealthy}` : ''}`,
        title_en: `Air quality: +${added} new readings from ${rows.length} stations${unhealthy ? ` · ${unhealthy} unhealthy` : ''}`,
        payload: { seen: rows.length, added, unhealthy },
      })
    }

    return { seen: rows.length, added }
  },
}
