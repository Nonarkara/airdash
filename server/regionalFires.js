import { REGIONAL_FIRE_BOUNDS } from './sources/firms-regional.js'

// A detection is an overpass observation, not an ignition, unique fire or area.
// Keep UTC acquisition time separate from collector time; never make old fire
// observations look current merely because the downloader succeeded.
export function regionalFires(db, now = Date.now()) {
  const run = db.all("SELECT started_at FROM ingest_runs WHERE source='firms_regional' AND ok=1 ORDER BY id DESC LIMIT 1")[0]
  let coverage = null
  try { coverage = JSON.parse(db.kvGet('firms_regional:coverage') ?? 'null') } catch {}
  const age = now - Date.parse(coverage?.fetched_at)
  const feeds = (coverage?.feeds ?? []).map(feed => {
    const observationAge = now - Date.parse(feed.newest_acquisition_at)
    const retrievalAge = now - Date.parse(feed.fetched_at)
    return { ...feed, current: !feed.error && Number.isFinite(observationAge) && observationAge >= -300000 && observationAge <= 12*3600000 && Number.isFinite(retrievalAge) && retrievalAge >= -300000 && retrievalAge <= 12*3600000 }
  })
  const currentFeeds = feeds.filter(f => f.current).length
  const nativeAge = now-Date.parse(coverage?.native_precision_since)
  const available = currentFeeds > 0 && coverage?.key_version === 2 && coverage?.feeds_ok > 0 && JSON.stringify(coverage?.bounds) === JSON.stringify(REGIONAL_FIRE_BOUNDS) && Number.isFinite(age) && age >= -300000 && age <= 12 * 3600000
  const cells = available ? db.all(`
    WITH detections AS (
      SELECT lat, lng, frp,
        datetime(acq_date || ' ' || substr(printf('%04d',CAST(acq_time AS INTEGER)),1,2) || ':' || substr(printf('%04d',CAST(acq_time AS INTEGER)),3,2)) AS observed
      FROM regional_hotspots
      WHERE lat BETWEEN -11 AND 29 AND lng BETWEEN 92 AND 142
        AND length(acq_time) BETWEEN 1 AND 4 AND acq_time NOT GLOB '*[^0-9]*'
        AND CAST(acq_time AS INTEGER) / 100 < 24 AND CAST(acq_time AS INTEGER) % 100 < 60
    )
    SELECT floor(lat*4)/4+0.125 AS lat, floor(lng*4)/4+0.125 AS lng,
      count(*) AS detections, replace(min(observed),' ','T') || 'Z' AS first_observed_at,
      replace(max(observed),' ','T') || 'Z' AS last_observed_at
    FROM detections WHERE observed BETWEEN datetime(?) AND datetime(?)
    GROUP BY floor(lat*4), floor(lng*4)
  `, new Date(now - 48 * 3600000).toISOString(), new Date(now + 300000).toISOString()) : []
  return { available, evaluated_at: new Date(now).toISOString(), checked_at: coverage?.fetched_at ?? run?.started_at ?? null, cells,
    feeds_ok: coverage?.feeds_ok ?? 0, feeds_current: currentFeeds, feeds_expected: 3, feeds,
    counts_partial: currentFeeds < 3 || !Number.isFinite(nativeAge) || nativeAge<48*3600000,
    latest_acquisition_at: feeds.filter(f => f.current).map(f => f.newest_acquisition_at).sort().at(-1) ?? null,
    latest_regional_detection_at: cells.map(c => c.last_observed_at).sort().at(-1) ?? null,
    reason: available ? null : 'regional-coverage-or-upstream-acquisitions-not-current',
    bounds: REGIONAL_FIRE_BOUNDS, window_hours: 48, grid_degrees: 0.25,
    method: 'VIIRS Suomi NPP / NOAA-20 / NOAA-21 detections. Cloud and overpass gaps; repeated detections are not unique fires, burned area, agricultural attribution or smoke arrival forecasts.' }
}
