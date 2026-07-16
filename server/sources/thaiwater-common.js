// Shared extraction for ThaiWater/HII payload rows (waterlevel, rain, dam).
import { num, str } from '../util.js'

/** Bilingual name object {th, en} → separate fields with sensible fallbacks. */
export function names(obj) {
  const th = str(obj?.th)
  const en = str(obj?.en)
  return { th: th ?? en, en: en ?? th }
}

/** Extract common station/geocode/basin identity from a ThaiWater row. */
export function stationIdentity(row, { keyPath, namePath, latKey, lngKey }) {
  const stationObj = row[keyPath]
  const key = stationObj?.id
  if (key === null || key === undefined) return null

  const name = names(stationObj?.[namePath])
  const prov = names(row.geocode?.province_name)
  const region = names(row.geocode?.area_name)
  const basin = names(row.basin?.basin_name)

  return {
    station_key: String(key),
    name_th: name.th ?? str(stationObj?.tele_station_oldcode) ?? String(key),
    name_en: name.en ?? str(stationObj?.tele_station_oldcode) ?? String(key),
    province_th: prov.th,
    province_en: prov.en,
    province_code: str(row.geocode?.province_code),
    region_th: region.th,
    region_en: region.en,
    basin_th: basin.th,
    basin_en: basin.en,
    lat: num(stationObj?.[latKey]),
    lng: num(stationObj?.[lngKey]),
  }
}

// Per-process cache of each station's last-written identity. Re-upserting
// ~4,400 unchanged station rows every 10-minute rain cycle (only last_seen
// moved — a column nothing reads; freshness comes from latest.obs_time) was
// several seconds of pure write load that froze the synchronous event loop
// mid-request. Write a station only when its identity actually changes;
// after a restart the first cycle re-primes the cache (one full write pass).
const stationFingerprints = new Map() // "source:key" -> JSON identity fingerprint

/**
 * Store one station + its readings inside the current transaction.
 * Reads the previous value per metric first so alert crossings can be detected.
 * Returns the number of genuinely-new readings.
 */
export function storeReadings({ db, alerts, source, station, metrics, obs_time, fetched_at, now }) {
  const cacheKey = `${source}:${station.station_key}`
  const fingerprint = JSON.stringify(station)
  if (stationFingerprints.get(cacheKey) !== fingerprint) {
    db.upsertStation({ source, ...station, now })
    stationFingerprints.set(cacheKey, fingerprint)
  }
  let added = 0
  for (const [metric, value] of Object.entries(metrics)) {
    if (value === null || value === undefined) continue
    const prev = db.get(
      'SELECT value FROM latest WHERE source = ? AND station_key = ? AND metric = ?',
      source, station.station_key, metric,
    )?.value ?? null
    const isNew = db.insertReading({ source, station_key: station.station_key, metric, value, obs_time, fetched_at })
    if (isNew) {
      added += 1
      alerts.considerReading({ source, station, metric, value, prev })
    }
  }
  return added
}
