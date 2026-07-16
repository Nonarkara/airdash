// Large-dam daily storage from ThaiWater analyst feed (~50 EGAT/RID dams).
// dam_storage_percent arrives as 0 upstream, so percent is computed from
// dam.max_storage. The feed also carries stale historical rows — only rows
// dated within the freshness window are stored.
import { CONFIG } from '../config.js'
import { fetchJson, num, str, normTime } from '../util.js'
import { names, storeReadings } from './thaiwater-common.js'

const URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/dam'
const FRESH_DAYS = 4

export default {
  name: 'thaiwater_dam',
  label_th: 'เขื่อนขนาดใหญ่',
  label_en: 'Major dams',
  intervalMs: CONFIG.intervals.thaiwater_dam,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL)
    const rows = json?.data?.dam_daily
    if (!Array.isArray(rows)) throw new Error('unexpected dam payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    const cutoff = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10)
    let added = 0
    let full = 0
    const seenFresh = []

    db.tx(() => {
      for (const row of rows) {
        const damObj = row.dam
        if (damObj?.id === null || damObj?.id === undefined) continue

        const obs_time = normTime(row.dam_date)
        if (!obs_time || obs_time < cutoff) continue // drop stale rows

        const name = names(damObj.dam_name)
        const prov = names(row.geocode?.province_name)
        const region = names(row.geocode?.area_name)
        const basin = names(row.basin?.basin_name)

        const storage = num(row.dam_storage)
        const maxStorage = num(damObj.max_storage)
        const pct = storage !== null && maxStorage ? (storage / maxStorage) * 100 : null
        if (pct !== null && pct >= CONFIG.thresholds.damFullPct) full += 1

        const station = {
          station_key: String(damObj.id),
          name_th: name.th, name_en: name.en,
          province_th: prov.th, province_en: prov.en,
          province_code: str(row.geocode?.province_code),
          region_th: region.th, region_en: region.en,
          basin_th: basin.th, basin_en: basin.en,
          lat: num(damObj.dam_lat), lng: num(damObj.dam_long),
          meta_json: JSON.stringify({
            max_storage_mcm: maxStorage,
            agency: str(row.agency?.agency_shortname?.en),
          }),
        }

        added += storeReadings({
          db, alerts, source: 'thaiwater_dam', station,
          metrics: {
            dam_storage_mcm: storage,
            dam_storage_pct: pct !== null ? Math.round(pct * 100) / 100 : null,
            dam_inflow_mcm: num(row.dam_inflow),
            dam_released_mcm: num(row.dam_released),
          },
          obs_time, fetched_at, now,
        })
        seenFresh.push(name.th)
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'thaiwater_dam',
        severity: full > 0 ? 2 : 0,
        title_th: `เขื่อนขนาดใหญ่ +${added} ค่าใหม่ จาก ${seenFresh.length} เขื่อน${full ? ` · เต็มความจุ ${full}` : ''}`,
        title_en: `Major dams: +${added} new readings from ${seenFresh.length} dams${full ? ` · ${full} at capacity` : ''}`,
        payload: { seen: rows.length, fresh: seenFresh.length, added, full },
      })
    }

    return { seen: rows.length, added }
  },
}
