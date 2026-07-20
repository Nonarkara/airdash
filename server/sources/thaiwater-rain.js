// ThaiWater aggregated national rain gauges (multi-agency, ~4,200 stations).
import { CONFIG } from '../config.js'
import { fetchJson, num, str, normTime } from '../util.js'
import { stationIdentity, storeReadings } from './thaiwater-common.js'

const URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'

export default {
  name: 'thaiwater_rain',
  label_th: 'ฝนสะสม 24 ชม.',
  label_en: 'Rain 24h gauges',
  intervalMs: CONFIG.intervals.thaiwater_rain,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL)
    const rows = json?.data
    if (!Array.isArray(rows)) throw new Error('unexpected rain payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    const t = CONFIG.thresholds
    let added = 0
    let heavy = 0, veryHeavy = 0
    const notable = []

    db.tx(() => {
      for (const row of rows) {
        const identity = stationIdentity(row, {
          keyPath: 'station', namePath: 'tele_station_name',
          latKey: 'tele_station_lat', lngKey: 'tele_station_long',
        })
        if (!identity) continue

        const obs_time = normTime(row.rainfall_datetime)
        if (!obs_time) continue

        const rain24 = num(row.rain_24h)
        if (rain24 !== null && rain24 >= t.rainVeryHeavy24h) veryHeavy += 1
        else if (rain24 !== null && rain24 >= t.rainHeavy24h) heavy += 1

        const station = {
          ...identity,
          meta_json: JSON.stringify({
            oldcode: str(row.station?.tele_station_oldcode),
            agency: str(row.agency?.agency_shortname?.en),
          }),
        }

        const newCount = storeReadings({
          db, alerts, source: 'thaiwater_rain', station,
          metrics: { rain_1h: num(row.rain_1h), rain_24h: rain24 },
          obs_time, fetched_at, now,
        })
        added += newCount
        // Notable = past AirDash's "worth a tap event" bar (10 mm/24h), not
        // TMD's very-heavy category — rainy-season gauges cross 90 mm rarely,
        // and 10 mm is already decisive washout for the dust situation.
        if (newCount > 0 && rain24 !== null && rain24 >= t.rainNotable24h) {
          notable.push({ station, rain24, rain1: num(row.rain_1h) })
        }
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'thaiwater_rain',
        severity: veryHeavy > 0 ? 2 : 0,
        title_th: `ฝนสะสม +${added} ค่าใหม่ · หนักมาก ${veryHeavy} · หนัก ${heavy} จุด`,
        title_en: `Rain gauges: +${added} new readings · ${veryHeavy} very heavy · ${heavy} heavy`,
        payload: { seen: rows.length, added, heavy, veryHeavy },
      })
      for (const n of notable.sort((a, b) => b.rain24 - a.rain24).slice(0, 5)) {
        bus.publish({
          kind: 'datum', source: 'thaiwater_rain', station_key: n.station.station_key,
          severity: n.rain24 >= t.rainVeryHeavy24h ? 3 : 2,
          title_th: `ฝน ${n.rain24.toFixed(0)} มม./24ชม. ${n.station.name_th} จ.${n.station.province_th ?? '—'}`,
          title_en: `Rain ${n.rain24.toFixed(0)} mm/24h at ${n.station.name_en}, ${n.station.province_en ?? '—'}`,
          payload: { rain_24h: n.rain24, rain_1h: n.rain1 },
        })
      }
    }

    return { seen: rows.length, added }
  },
}
