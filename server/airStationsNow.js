// Air4Thai stations with their latest PM2.5, for pairing cameras with the air
// they look at.
//
// Extracted from api.js (2026-09-28) so the vision source can pair frames to
// stations without importing the HTTP layer — api.js pulls in the whole
// route table, and a scheduler source that imports that is a circular import
// waiting to happen. One 60 s cache: the catalog route is polled and the
// readings only land hourly, so both callers see the same rows.

let cache = null

export function airStationsNow(db) {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows
  const rows = db.all(
    `SELECT s.station_key, s.name_th, s.name_en, s.province_th, s.lat, s.lng,
            pm.value AS pm25, pm.obs_time AS obs_time
     FROM stations s
     JOIN latest pm ON pm.source = s.source AND pm.station_key = s.station_key AND pm.metric = 'pm25'
     WHERE s.source = 'air4thai' AND s.lat IS NOT NULL AND s.lng IS NOT NULL`)
  cache = { at: Date.now(), rows }
  return rows
}

export function __clearAirStationsCache() { cache = null }
