// River discharge for the connected-waterways cascade.
// Source: Open-Meteo Flood API — a free, keyless wrapper over Copernicus
// GloFAS v4 (5 km global river model, discharge in m³/s, 46-day forecast).
// All reaches fetched in ONE multi-point call. Coordinates in rivers.js are
// grid-snapped to each river's main-stem GloFAS cell so values are truthful.
import { CONFIG } from '../config.js'
import { fetchJson, num } from '../util.js'
import { REACHES, dischargeBand } from '../rivers.js'

const BASE = 'https://flood-api.open-meteo.com/v1/flood'

export default {
  name: 'glofas',
  label_th: 'อัตราการไหลของแม่น้ำ GloFAS',
  label_en: 'GloFAS river discharge',
  intervalMs: CONFIG.intervals.glofas,
  enabled: true,

  async run({ db, bus, alerts }) {
    const lats = REACHES.map((r) => r.lat).join(',')
    const lngs = REACHES.map((r) => r.lng).join(',')
    const url = `${BASE}?latitude=${lats}&longitude=${lngs}&daily=river_discharge&forecast_days=14`
    const json = await fetchJson(url, { timeoutMs: 25_000 })
    const results = Array.isArray(json) ? json : [json]
    if (results.length !== REACHES.length) {
      throw new Error(`GloFAS returned ${results.length} points for ${REACHES.length} reaches`)
    }

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0
    let rising = 0
    const notable = []

    db.tx(() => {
      REACHES.forEach((reach, i) => {
        const daily = results[i]?.daily
        const times = daily?.time
        const q = daily?.river_discharge
        if (!Array.isArray(times) || !Array.isArray(q) || q.length === 0) return

        const today = num(q[0])
        const valid = q.map(num).filter((v) => v !== null && v > 0)
        const peak = valid.length ? Math.max(...valid) : null
        const peakIdx = peak !== null ? q.findIndex((v) => num(v) === peak) : -1

        // Trend over the forecast window (rising if the back third exceeds the front).
        const third = Math.max(1, Math.floor(valid.length / 3))
        const front = avg(valid.slice(0, third))
        const back = avg(valid.slice(-third))
        const trend = back > front * 1.15 ? 'rising' : back < front * 0.85 ? 'falling' : 'stable'
        if (trend === 'rising') rising += 1

        const obs_time = times[0]
        const station = {
          station_key: reach.id,
          name_th: reach.name_th, name_en: reach.name_en,
          province_th: null, province_en: null, province_code: null,
          region_th: reach.region_th, region_en: reach.region_en,
          basin_th: reach.basin_th, basin_en: reach.basin_en,
          lat: reach.lat, lng: reach.lng,
          meta_json: JSON.stringify({
            downstream: reach.downstream, lagDays: reach.lagDays,
            watch: reach.watch, warning: reach.warning, emergency: reach.emergency,
            note_th: reach.note_th, note_en: reach.note_en,
          }),
        }
        db.upsertStation({ source: 'glofas', ...station, now })

        const metrics = {
          discharge: today,
          discharge_fc_peak: peak,
          discharge_fc_peak_day: peakIdx >= 0 ? peakIdx : null,
        }
        for (const [metric, value] of Object.entries(metrics)) {
          if (value === null) continue
          const isNew = db.insertReading({ source: 'glofas', station_key: reach.id, metric, value, obs_time, fetched_at })
          if (isNew && metric === 'discharge') added += 1
        }

        // Peak forecast band drives cascade alerts (lead time = days to peak + transit lag).
        const band = dischargeBand(reach, peak)
        if (band === 'warning' || band === 'emergency') {
          notable.push({ reach, today, peak, peakIdx, band, trend })
        }
      })
    })

    // Emit one batch + a datum per reach forecast to cross warning/emergency.
    if (added > 0 || notable.length > 0) {
      bus.publish({
        kind: 'batch', source: 'glofas',
        severity: notable.some((n) => n.band === 'emergency') ? 2 : notable.length ? 1 : 0,
        title_th: `อัตราการไหลแม่น้ำ ${REACHES.length} จุด · แนวโน้มเพิ่มขึ้น ${rising} จุด`,
        title_en: `River discharge at ${REACHES.length} reaches · ${rising} rising`,
        payload: { reaches: REACHES.length, rising, notable: notable.length },
      })
      for (const n of notable.sort((a, b) => b.peak - a.peak).slice(0, 4)) {
        const eta = n.peakIdx + Math.round(n.reach.lagDays)
        bus.publish({
          kind: 'datum', source: 'glofas', station_key: n.reach.id,
          severity: n.band === 'emergency' ? 3 : 2,
          title_th: `${n.reach.name_th} คาดการณ์ไหลสูงสุด ${Math.round(n.peak).toLocaleString()} ลบ.ม./วิ (อีก ${n.peakIdx} วัน)`,
          title_en: `${n.reach.name_en} forecast peak ${Math.round(n.peak).toLocaleString()} m³/s (in ${n.peakIdx}d)`,
          payload: { band: n.band, peak: Math.round(n.peak), etaDays: eta, downstream: n.reach.downstream },
        })
      }
    }

    return { seen: REACHES.length, added }
  },
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}
