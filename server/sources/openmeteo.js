// Open-Meteo 3-day weather forecast per province: precipitation amount AND
// probability (the washout engine's key input), plus wind (ventilation /
// stagnation proxy). One multi-point call over all 77 province centroids
// from the DOPA registry (public/geo/provinces.json).
import { CONFIG } from '../config.js'
import { fetchJson, nowLocal, num, validNum } from '../util.js'
import { storeReadings } from './thaiwater-common.js'
import { allProvinces } from '../provinces.js'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const MAX_POINTS = 100 // Open-Meteo multi-point limit safety

export default {
  name: 'openmeteo',
  label_th: 'พยากรณ์ฝน/ลม Open-Meteo',
  label_en: 'Open-Meteo rain & wind forecast',
  intervalMs: CONFIG.intervals.openmeteo,
  enabled: true,

  async run({ db, bus, alerts }) {
    const provinces = allProvinces().slice(0, MAX_POINTS)

    const lats = provinces.map((p) => p.lat.toFixed(3)).join(',')
    const lngs = provinces.map((p) => p.lng.toFixed(3)).join(',')
    // daily[]: rain, rain probability, wind — used by stagnation/washout.
    // current[]: temperature, relative humidity, apparent temperature — used
    // by the Danger Score to capture heat + hygroscopic-growth modulation of
    // the live PM2.5 reading. Open-Meteo returns the current-hour value
    // alongside the daily rollups, no extra cost.
    const daily = 'precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
    const current = 'temperature_2m,relative_humidity_2m,apparent_temperature'
    const url = `${BASE}?latitude=${lats}&longitude=${lngs}&current=${current}&daily=${daily}&forecast_days=3&timezone=Asia%2FBangkok`
    // 77 province centroids in one call can exceed 20s; allow headroom before backoff.
    const json = await fetchJson(url, { timeoutMs: 45_000 })
    const results = Array.isArray(json) ? json : [json]
    if (results.length !== provinces.length) throw new Error(`Open-Meteo returned ${results.length} points for ${provinces.length} provinces`)

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    // Issue-hour timestamp: each 3-hour poll stores a fresh forecast row set.
    const obs_time = nowLocal().slice(0, 13) + ':00'
    let added = 0
    let rainyProvinces = 0
    const bestWashout = []

    db.tx(() => {
      provinces.forEach((p, i) => {
        const d = results[i]?.daily
        const c = results[i]?.current
        if (!d) return
        const val = (arr, idx) => (Array.isArray(arr) && Number.isFinite(arr[idx]) ? arr[idx] : null)
        const num = (v) => (Number.isFinite(v) ? v : null)

        // Sanity-bound each metric. Open-Meteo's forecast can occasionally
        // ship a nonsense value (the wind speed units have flipped on
        // their API more than once over the years), and a 2000 mm/day
        // precipitation forecast or a 1000 km/h wind reading would
        // skew the washout engine and the danger score.
        const sums = [0, 1, 2].map((k) => validNum(val(d.precipitation_sum, k), 'rain_24h', 'openmeteo'))
        const probs = [0, 1, 2].map((k) => val(d.precipitation_probability_max, k))
        const winds = [0, 1, 2].map((k) => validNum(val(d.wind_speed_10m_max, k), 'wind_speed', 'openmeteo'))

        // Live temperature / humidity / apparent temperature — used by the
        // Danger Score to capture heat-amplification and hygroscopic-growth
        // effects on the same air mass. Open-Meteo's `current` is the
        // model-time at request, which for our 3-hourly poll cadence is
        // fresh enough for the daily-mean score the Danger Score reports.
        const tempC = c ? validNum(c.temperature_2m, 'temperature', 'openmeteo') : null
        const rh = c ? validNum(c.relative_humidity_2m, 'humidity', 'openmeteo') : null
        const apparentC = c ? validNum(c.apparent_temperature, 'temperature', 'openmeteo') : null

        const next48 = sums[0] !== null && sums[1] !== null ? sums[0] + sums[1] : null
        const prob48 = probs[0] !== null && probs[1] !== null ? Math.max(probs[0], probs[1]) : (probs[0] ?? probs[1])

        if (probs[0] !== null && sums[0] !== null &&
            probs[0] >= 40 && sums[0] >= CONFIG.thresholds.rainWashout24h) {
          rainyProvinces += 1
          bestWashout.push({ p, mm: sums[0], prob: probs[0] })
        }

        const station = {
          station_key: p.province_code,
          name_th: p.province_th, name_en: p.province_en,
          province_th: p.province_th, province_en: p.province_en,
          province_code: p.province_code,
          region_th: null, region_en: null,
          basin_th: null, basin_en: null,
          lat: p.lat, lng: p.lng,
          meta_json: JSON.stringify({ centroid: 'dopa_registry' }),
        }

        added += storeReadings({
          db, alerts, source: 'openmeteo', station,
          metrics: {
            precip_fc_d0: sums[0], precip_fc_d1: sums[1], precip_fc_d2: sums[2],
            precip_fc_48h: next48,
            precip_prob_d0: probs[0], precip_prob_d1: probs[1], precip_prob_d2: probs[2],
            precip_prob_24h: probs[0], precip_prob_48h: prob48,
            wind_fc_kmh: winds[0], wind_fc_d1: winds[1],
            temp_c: tempC, rh_pct: rh, apparent_c: apparentC,
          },
          obs_time, fetched_at, now,
        })
      })
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'openmeteo',
        severity: 0,
        title_th: `พยากรณ์ฝน/ลม ${provinces.length} จังหวัด · ฝนพอช่วยล้างฝุ่นได้ ${rainyProvinces} จังหวัด`,
        title_en: `Rain & wind forecast for ${provinces.length} provinces · washout-grade rain likely in ${rainyProvinces}`,
        payload: { provinces: provinces.length, added, rainyProvinces },
      })
      for (const { p, mm, prob } of bestWashout.sort((a, b) => b.mm - a.mm).slice(0, 3)) {
        bus.publish({
          kind: 'datum', source: 'openmeteo', station_key: p.province_code, severity: 0,
          title_th: `คาดฝน 24 ชม. ${mm.toFixed(0)} มม. (โอกาส ${prob.toFixed(0)}%) จ.${p.province_th} — ช่วยล้างฝุ่น`,
          title_en: `Forecast 24h rain ${mm.toFixed(0)} mm (${prob.toFixed(0)}% chance) in ${p.province_en} — dust washout likely`,
          payload: { precip_fc_d0: mm, precip_prob_24h: prob },
        })
      }
    }

    return { seen: provinces.length, added }
  },
}
