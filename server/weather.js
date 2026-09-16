// Weather at a place — over the TMD relay copied from FloodDash
// (sources/tmd-relay.js): the province's (or a TMD destination's) next five
// days and the nearest synoptic station's last observation, with name,
// distance and age. Pure over the relay object; db wrapper at the bottom.
// Same rules as the FloodDash original (server/weather.js there): a station
// farther than 80 km or silent >6 h is not shown; absence is null.
import { readTmdWeather } from './sources/tmd-relay.js'

export const FORECAST_DAYS = 5
export const STATION_MAX_KM = 80
export const TOWN_MAX_KM = 30
export const SYNOP_STALE_H = 6
export const TMD_TOWNS = [
  { key: 'town:pattaya', lat: 12.9236, lng: 100.8825 },
  { key: 'town:huahin',  lat: 12.5684, lng: 99.9577 },
  { key: 'town:samui',   lat: 9.5120,  lng: 100.0136 },
  { key: 'town:hatyai',  lat: 7.0086,  lng: 100.4747 },
]

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}
function ageHours(obsTime, now) {
  if (!obsTime) return null
  const t = Date.parse(`${obsTime}:00+07:00`)
  return Number.isFinite(t) ? Math.round(((now - t) / 3_600_000) * 10) / 10 : null
}
export function todayIso(now = Date.now()) { return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10) }
export function upcomingDays(location, { days = FORECAST_DAYS, now = Date.now() } = {}) {
  if (!location?.days?.length) return []
  const today = todayIso(now)
  return location.days.filter((d) => d.date >= today).slice(0, days)
}

export function nearestSynop(relay, lat, lng, { maxKm = STATION_MAX_KM, now = Date.now() } = {}) {
  let best = null
  for (const s of relay?.stations ?? []) {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lng)) continue
    const km = haversineKm(lat, lng, s.lat, s.lng)
    if (km <= maxKm && (!best || km < best.km)) best = { s, km }
  }
  if (!best) return null
  const age_h = ageHours(best.s.obs_time, now)
  if (age_h !== null && age_h > SYNOP_STALE_H) return null
  return { ...best.s, distance_km: Math.round(best.km * 10) / 10, age_h, agency: 'TMD' }
}

export function weatherAt(relay, { lat, lng, province_code = null, now = Date.now() } = {}) {
  if (!relay || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const locs = relay.forecast?.locations ?? []
  let location = null
  for (const t of TMD_TOWNS) {
    if (haversineKm(lat, lng, t.lat, t.lng) <= TOWN_MAX_KM) { location = locs.find((l) => l.key === t.key) ?? null; if (location) break }
  }
  if (!location && province_code) location = locs.find((l) => l.key === `province:${String(province_code)}`) ?? null
  if (!location) {
    let best = null
    for (const l of locs) {
      if (l.kind !== 'province' || !Number.isFinite(l.lat)) continue
      const km = haversineKm(lat, lng, l.lat, l.lng)
      if (!best || km < best.km) best = { l, km }
    }
    location = best?.l ?? null
  }
  const days = upcomingDays(location, { now })
  const station = nearestSynop(relay, lat, lng, { now })
  if (!days.length && !station) return null
  return {
    agency_th: relay.agency_th ?? 'กรมอุตุนิยมวิทยา', agency_en: relay.agency_en ?? 'Thai Meteorological Department',
    via: 'flooddash',
    forecast: location ? { for_th: location.name_th, for_en: location.name_en, kind: location.kind, build_date: relay.forecast?.build_date ?? null, fetched_at: relay.forecast?.fetched_at ?? null, days } : null,
    station,
  }
}

export function weatherAtDb(db, opts) { return weatherAt(readTmdWeather(db), opts) }
