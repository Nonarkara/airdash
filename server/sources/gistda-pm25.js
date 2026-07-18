// GISTDA PM2.5 real-time feed — satellite-derived PM2.5 fused with ground
// stations (their own words: "วิเคราะห์จากข้อมูลดาวเทียมร่วมกันข้อมูลจากสถานี
// ภาคพื้นดิน"). Free, keyless, JSON, hourly update.
//
// This is the SECOND independent PM2.5 source alongside Air4Thai. It is
// especially useful in provinces where the PCD ground network is sparse
// (much of the country) — GISTDA's grid coverage is contiguous. The
// server stores both `pm25` (current hour) and `pm25_avg24h` (24-hour
// rolling average) per province.
//
// Listed on data.go.th as:
//   https://opendata.gistda.or.th/dataset/pm2-5  (9 resources, all JSON)
//   Live app: https://pm25.gistda.or.th/
//
// Endpoints we use:
//   /rest/getPm25byProvince              — current hour + 24h avg, all 77 provinces
//   /rest/getPM25byProvince24hrs?pv_idn  — 24 hourly values for one province
//
// Cadence: 1 hour. GISTDA itself refreshes hourly; we poll hourly with a
// small jitter so we don't hammer the same minute.
import { CONFIG } from '../config.js'
import { fetchJson, nowLocal, num } from '../util.js'
import { storeReadings } from './thaiwater-common.js'
import { provinceByName } from '../provinces.js'

const URL_ALL = 'https://pm25.gistda.or.th/rest/getPm25byProvince'
const URL_HIST = (id) => `https://pm25.gistda.or.th/rest/getPM25byProvince24hrs?pv_idn=${id}`

export default {
  name: 'gistda_pm25',
  label_th: 'GISTDA ฝุ่น PM2.5 (ดาวเทียม+ภาคพื้นดิน)',
  label_en: 'GISTDA PM2.5 (satellite + ground fusion)',
  intervalMs: CONFIG.intervals.gistda_pm25,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL_ALL, { timeoutMs: 20_000 })
    const rows = json?.data
    if (!Array.isArray(rows)) throw new Error('unexpected GISTDA PM2.5 payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0, updated = 0, worst = null

    db.tx(() => {
      for (const row of rows) {
        const pvIdn = num(row.pv_idn)
        if (pvIdn === null) continue
        // Resolve via DOPA registry so province_th/en/code are consistent
        // with the rest of the system. GISTDA uses the same numeric codes
        // as the PCD registry, so this lands correctly.
        const prov = provinceByName(row.pv_tn, row.pv_en)
        const pm25 = num(row.pm25)
        const pm25Avg24h = num(row.pm25Avg24hr)
        if (pm25 === null && pm25Avg24h === null) continue

        const station = {
          // GISTDA returns one row per province; we use the numeric id as
          // station_key (matches the DOPA code, easy to join downstream).
          station_key: `pv_${pvIdn}`,
          name_th: row.pv_tn ?? `จ.${pvIdn}`,
          name_en: row.pv_en ?? `Province ${pvIdn}`,
          province_th: prov?.province_th ?? row.pv_tn,
          province_en: prov?.province_en ?? row.pv_en,
          province_code: prov?.province_code ?? String(pvIdn).padStart(2, '0'),
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: null, lng: null, // GISTDA doesn't ship coords on this endpoint
          meta_json: JSON.stringify({ gistda_pv_idn: pvIdn, source: 'gistda.pm25.gistda.or.th' }),
        }
        // Use the upstream observation timestamp when present, else now.
        // GISTDA's `dt` is Bangkok wall time mislabeled with a Z suffix
        // (e.g. 2026-07-18T23:00:00.000Z); strip the fraction+Z so the
        // stored value follows the local YYYY-MM-DDTHH:MM convention
        // explicitly instead of matching string comparisons by accident.
        const obs_time = (typeof row.dt === 'string'
          ? row.dt.replace(/(\.\d+)?Z$/, '')
          : nowLocal()).slice(0, 16)

        const result = storeReadings({
          db, alerts, source: 'gistda_pm25', station,
          metrics: { pm25, pm25_avg24h: pm25Avg24h },
          obs_time, fetched_at, now,
        })
        added += result
        if (result > 0) updated += 1
        if (pm25 !== null && (!worst || pm25 > worst.pm25)) {
          worst = { pm25, name_th: station.province_th, name_en: station.province_en }
        }
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'gistda_pm25',
        severity: 0,
        title_th: `GISTDA PM2.5 +${added} ค่าใหม่ ครอบคลุม ${updated} จังหวัด`,
        title_en: `GISTDA PM2.5 +${added} new readings across ${updated} provinces`,
        payload: { seen: rows.length, added, updated },
      })
      if (worst && worst.pm25 >= CONFIG.thresholds.pm25Unhealthy) {
        bus.publish({
          kind: 'datum', source: 'gistda_pm25', severity: worst.pm25 >= CONFIG.thresholds.pm25VeryUnhealthy ? 2 : 1,
          title_th: `GISTDA: PM2.5 สูงสุด ${worst.pm25.toFixed(0)} µg/m³ ที่ ${worst.name_th}`,
          title_en: `GISTDA: highest PM2.5 ${worst.pm25.toFixed(0)} µg/m³ at ${worst.name_en}`,
          payload: { pm25: worst.pm25 },
        })
      }
    }

    return { seen: rows.length, added, updated }
  },
}
