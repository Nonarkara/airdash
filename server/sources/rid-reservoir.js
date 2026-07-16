// Royal Irrigation Department medium reservoirs (~460, daily, grouped by
// region; no coordinates upstream — shown as ranked lists, not map pins).
import { CONFIG } from '../config.js'
import { fetchJson, num, str } from '../util.js'
import { storeReadings } from './thaiwater-common.js'

const URL = 'https://app.rid.go.th/reservoir/api/reservoir/public'

// RID region labels arrive in Thai only.
const REGION_EN = {
  'ภาคเหนือ': 'North',
  'ภาคตะวันออกเฉียงเหนือ': 'Northeast',
  'ภาคตะวันออก': 'East',
  'ภาคกลาง': 'Central',
  'ภาคตะวันตก': 'West',
  'ภาคใต้': 'South',
}

export default {
  name: 'rid_reservoir',
  label_th: 'อ่างเก็บน้ำ กรมชลฯ',
  label_en: 'RID reservoirs',
  intervalMs: CONFIG.intervals.rid_reservoir,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL)
    if (!Array.isArray(json?.data)) throw new Error('unexpected RID payload shape')
    const obs_time = str(json.date)
    if (!obs_time) throw new Error('RID payload missing date')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0, seen = 0, nearFull = 0

    db.tx(() => {
      for (const group of json.data) {
        const region_th = str(group.region)
        const region_en = REGION_EN[region_th] ?? region_th
        if (!Array.isArray(group.reservoir)) continue

        for (const r of group.reservoir) {
          const key = str(r.id)
          if (!key) continue
          seen += 1
          const pct = num(r.percent_storage)
          if (pct !== null && pct >= CONFIG.thresholds.reservoirFullPct) nearFull += 1

          const station = {
            station_key: key,
            name_th: str(r.name) ?? key,
            name_en: str(r.name) ?? key, // upstream provides Thai only
            province_th: null, province_en: null, province_code: null,
            region_th, region_en,
            basin_th: null, basin_en: null, lat: null, lng: null,
            meta_json: JSON.stringify({ capacity_mcm: num(r.storage), dead_storage_mcm: num(r.dead_storage) }),
          }

          added += storeReadings({
            db, alerts, source: 'rid_reservoir', station,
            metrics: {
              rsv_storage_pct: pct,
              rsv_volume_mcm: num(r.volume),
              rsv_inflow_mcm: num(r.inflow),
              rsv_outflow_mcm: num(r.outflow),
            },
            obs_time, fetched_at, now,
          })
        }
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'rid_reservoir',
        severity: nearFull > 20 ? 1 : 0,
        title_th: `อ่างเก็บน้ำ กรมชลฯ +${added} ค่าใหม่ จาก ${seen} อ่าง · ใกล้เต็ม ${nearFull}`,
        title_en: `RID reservoirs: +${added} new readings from ${seen} · ${nearFull} near capacity`,
        payload: { seen, added, nearFull, date: obs_time },
      })
    }

    return { seen, added }
  },
}
