// TMD weather, relayed from the FloodDash twin (docs/TWIN-API.md).
//
// FloodDash ingests the Thai Meteorological Department's 7-day forecast
// (77 provinces + Pattaya, Hua Hin, Ko Samui, Hat Yai) and its 125 synoptic
// stations' 3-hourly observations once, and publishes them at /api/weather.
// This source copies that relay into kv every 15 min so every AirDash place
// card and the citizen page can show the same five days and the same nearest
// station — one ingestion, two dashboards. Localhost first, public fallback.
import { CONFIG } from '../config.js'
import { fetchJson } from '../util.js'

export const KV_KEY = 'tmd_weather_v1'
const URLS = ['http://127.0.0.1:8340/api/weather', 'https://flood.nonarkara.org/api/weather']
const MAX_AGE_MS = 4 * 60 * 60 * 1000 // 4 h — forecast is 3-hourly, obs 3-hourly

/** Validate the relay shape so a changed upstream can never poison kv. */
export function parseRelay(body) {
  const locations = body?.forecast?.locations
  const stations = body?.stations
  if (!Array.isArray(locations) || locations.length < 70) throw new Error('TMD relay: forecast has too few locations')
  if (!Array.isArray(stations) || stations.length < 80) throw new Error('TMD relay: too few stations')
  return {
    agency_th: body.agency_th ?? 'กรมอุตุนิยมวิทยา', agency_en: body.agency_en ?? 'Thai Meteorological Department',
    licence: body.licence ?? null,
    forecast: { build_date: body.forecast.build_date ?? null, fetched_at: body.forecast.fetched_at ?? null, locations },
    stations, stations_fetched_at: body.stations_fetched_at ?? null,
  }
}

export function readTmdWeather(db, now = Date.now()) {
  try {
    const raw = db.kvGet(KV_KEY)
    if (!raw) return null
    const rel = JSON.parse(raw)
    if (!rel?.fetched_at || now - Date.parse(rel.fetched_at) > MAX_AGE_MS) return null
    return rel
  } catch { return null }
}

export default {
  name: 'tmd_relay',
  label_th: 'อากาศกรมอุตุฯ (ผ่านระบบแฝด FloodDash)',
  label_en: 'TMD weather (via FloodDash twin)',
  intervalMs: CONFIG.intervals.tmd_relay,
  enabled: true,

  async run({ db }) {
    let lastErr = null
    for (const url of URLS) {
      try {
        const body = await fetchJson(url, { timeoutMs: 15_000 })
        const rel = parseRelay(body)
        db.kvSet(KV_KEY, JSON.stringify({ ...rel, source_url: url, fetched_at: new Date().toISOString() }))
        return { seen: rel.forecast.locations.length + rel.stations.length, added: 0 }
      } catch (err) { lastErr = err }
    }
    throw lastErr ?? new Error('TMD relay unreachable')
  },
}
