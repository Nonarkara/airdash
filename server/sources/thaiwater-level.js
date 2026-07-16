// HII/ThaiWater telemetered water levels — the primary flood signal.
// situation_level: 1 critically-low, 2 low, 3 normal, 4 high, 5 overflowing.
import { CONFIG } from '../config.js'
import { fetchJson, num, str, normTime } from '../util.js'
import { stationIdentity, storeReadings } from './thaiwater-common.js'

const URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load'

export default {
  name: 'thaiwater_wl',
  label_th: 'ระดับน้ำ สสน.',
  label_en: 'HII water level',
  intervalMs: CONFIG.intervals.thaiwater_wl,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL)
    const rows = json?.waterlevel_data?.data
    if (!Array.isArray(rows)) throw new Error('unexpected waterlevel payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0
    const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const notable = []

    db.tx(() => {
      for (const row of rows) {
        const identity = stationIdentity(row, {
          keyPath: 'station', namePath: 'tele_station_name',
          latKey: 'tele_station_lat', lngKey: 'tele_station_long',
        })
        if (!identity) continue

        const obs_time = normTime(row.waterlevel_datetime)
        if (!obs_time) continue

        const level = num(row.situation_level)
        if (level !== null && byLevel[level] !== undefined) byLevel[level] += 1

        const station = {
          ...identity,
          meta_json: JSON.stringify({
            oldcode: str(row.station?.tele_station_oldcode),
            min_bank: num(row.station?.min_bank),
            ground_level: num(row.station?.ground_level),
            river: str(row.river_name),
            agency: str(row.agency?.agency_shortname?.en),
            diff_wl_bank: num(row.diff_wl_bank),
          }),
        }

        const newCount = storeReadings({
          db, alerts, source: 'thaiwater_wl', station,
          metrics: {
            wl_msl: num(row.waterlevel_msl),
            storage_pct: num(row.storage_percent),
            situation_level: level,
          },
          obs_time, fetched_at, now,
        })
        added += newCount
        if (newCount > 0 && level !== null && level >= 4) {
          notable.push({ station, level, wl: num(row.waterlevel_msl), pct: num(row.storage_percent) })
        }
      }
    })

    if (added > 0) {
      const crit = byLevel[5], high = byLevel[4]
      bus.publish({
        kind: 'batch', source: 'thaiwater_wl',
        severity: crit > 0 ? 2 : 0,
        title_th: `ระดับน้ำ สสน. +${added} ค่าใหม่ · ล้นตลิ่ง ${crit} · น้ำมาก ${high} สถานี`,
        title_en: `HII water level: +${added} new readings · ${crit} overflowing · ${high} high`,
        payload: { seen: rows.length, added, byLevel },
      })
      for (const n of notable.sort((a, b) => b.level - a.level).slice(0, 5)) {
        bus.publish({
          kind: 'datum', source: 'thaiwater_wl', station_key: n.station.station_key,
          severity: n.level >= 5 ? 3 : 2,
          title_th: `${n.station.name_th} จ.${n.station.province_th ?? '—'} ระดับ ${n.level}${n.level >= 5 ? ' ล้นตลิ่ง' : ' น้ำมาก'}${n.pct !== null ? ` (${n.pct.toFixed(0)}%)` : ''}`,
          title_en: `${n.station.name_en}, ${n.station.province_en ?? '—'}: level ${n.level}${n.level >= 5 ? ' overflowing' : ' high'}${n.pct !== null ? ` (${n.pct.toFixed(0)}%)` : ''}`,
          payload: { level: n.level, wl_msl: n.wl, storage_pct: n.pct },
        })
      }
    }

    return { seen: rows.length, added }
  },
}
