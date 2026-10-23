// NASA FIRMS — regional (Southeast Asia) VIIRS active-fire
// detections, used ONLY to answer one question the domestic hotspot
// feeds cannot: how much of the smoke is home-grown versus blowing in
// from across the border. HRDI/GISTDA's hotspot data (see burn-area.js,
// burning.js) is Thailand-only by construction — there is no way to
// compute a Thailand-vs-elsewhere share from a feed that never sees
// what is happening on the other side of the line.
//
// NO API KEY. FIRMS's per-area CSV API needs a registered MAP_KEY
// (verified: DEMO_KEY returns "Invalid MAP_KEY", a real key requires
// signing up at https://firms.modaps.eosdis.nasa.gov/api/area/ under
// someone's own email — not something to register on a user's behalf).
// FIRMS ALSO publishes a plain, keyless bulk CSV of the last 24h of
// GLOBAL VIIRS detections for exactly this kind of use — verified live
// 2026-09-16: HTTP 200, ~7.3 MB, 89,573 global rows. We filter that
// down to a bounding box over mainland Southeast Asia ourselves rather
// than trust any third-party "regional" cut.
import { pointInThailand } from '../geo/pointInThailand.js'
import { CONFIG } from '../config.js'

// All three VIIRS satellites. Suomi NPP alone (the original feed) sees each
// place ~twice a day; adding NOAA-20 and NOAA-21 roughly triples the passes,
// so short-lived agricultural burns are far less likely to be missed. Each
// file is ~5.5 MB, keyless, public.
const FIRMS_FEEDS = [
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv',
]

// Retain mainland AND maritime Southeast Asia, including Myanmar, Sumatra,
// Kalimantan and Papua. Same three global downloads; no added upstream calls.
// Legacy mainland comparisons explicitly retain their original bounds.
export const REGIONAL_FIRE_BOUNDS = [-11, 92, 29, 142]
const BBOX = { latMin: -11, latMax: 29, lngMin: 92, lngMax: 142 }

export function parseCsv(text, report = {}) {
  const lines = text.split('\n')
  const head = lines[0].split(',').map(s => s.trim())
  const idx = (name) => head.indexOf(name)
  const iLat = idx('latitude'), iLng = idx('longitude')
  const iDate = idx('acq_date'), iTime = idx('acq_time')
  const iSat = idx('satellite'), iConf = idx('confidence'), iFrp = idx('frp')
  if ([iLat, iLng, iDate, iTime, iSat].some(i => i < 0)) throw new Error('FIRMS CSV missing required columns')

  const rows = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split(',')
    if (c.length !== head.length) continue
    if (!c[iLat]?.trim() || !c[iLng]?.trim()) continue
    const lat = Number(c[iLat]), lng = Number(c[iLng])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[iDate]) || !/^\d{1,4}$/.test(c[iTime])) continue
    const hhmm = c[iTime].padStart(4, '0')
    if (+hhmm.slice(0, 2) > 23 || +hhmm.slice(2) > 59) continue
    const acquired = `${c[iDate]}T${hhmm.slice(0,2)}:${hhmm.slice(2)}:00Z`
    const stamp = Date.parse(acquired)
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== c[iDate] || stamp > (report.now ?? Date.now()) + 300000) continue
    if (stamp <= (report.now ?? Date.now()) + 300000 && (!report.newest_acquisition_at || stamp > Date.parse(report.newest_acquisition_at))) report.newest_acquisition_at = acquired
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) continue
    rows.push({
      lat, lng,
      acq_date: c[iDate] ?? null,
      acq_time: c[iTime] ?? null,
      satellite: c[iSat] ?? null,
      confidence: c[iConf] ?? null,
      frp: Number(c[iFrp]) || null,
    })
  }
  return rows
}

// A VIIRS pixel is375m; rounding to1km merges distinct observations.
export function detectionKey(row) {
  return `v2:${row.satellite}:${row.acq_date}:${String(row.acq_time).padStart(4,'0')}:${Number(row.lat)}:${Number(row.lng)}`
}
// Re-key surviving legacy rows before adding new ones. Interrupted runs can
// resume; an already-migrated duplicate is retained rather than counted twice.
export async function migrateDetectionKeys(db) {
  let cursor = ''
  for (;;) {
    const batch = db.all("SELECT detection_key,lat,lng,acq_date,acq_time,satellite FROM regional_hotspots WHERE detection_key > ? AND detection_key NOT LIKE 'v2:%' ORDER BY detection_key LIMIT 500", cursor)
    if (!batch.length) return
    db.tx(() => { for (const row of batch) {
      db.run('UPDATE OR IGNORE regional_hotspots SET detection_key=? WHERE detection_key=?', detectionKey(row), row.detection_key)
      db.run('DELETE FROM regional_hotspots WHERE detection_key=?', row.detection_key)
    } })
    cursor = batch.at(-1).detection_key
    await new Promise(setImmediate)
  }
}

export default {
  name: 'firms_regional',
  version: 4, // bump when the fetch/parse logic changes → runs at next boot
  label_th: 'จุดความร้อนภูมิภาค (NASA FIRMS — ข้ามพรมแดน)',
  label_en: 'Regional hotspots (NASA FIRMS — cross-border)',
  // Bulk 24h files, refreshed several times daily upstream. Every 6 h: the
  // smoke-upwind signal (server/smoke.js) needs today's fires, not
  // yesterday's; 3 × 5.5 MB four times a day is modest.
  intervalMs: CONFIG.intervals.firmsRegional ?? 6 * 3600_000,
  enabled: true,

  async run({ db }) {
    const rows = []
    const failures = []
    const feeds = []
    for (const url of FIRMS_FEEDS) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const report = { now: Date.now() }
        const parsed = parseCsv(await r.text(), report)
        rows.push(...parsed)
        feeds.push({ name: url.split('/').pop(), fetched_at: new Date().toISOString(), newest_acquisition_at: report.newest_acquisition_at ?? null, regional_detections: parsed.length })
      } catch (err) {
        feeds.push({ name: url.split('/').pop(), error: true, newest_acquisition_at: null })
        failures.push(`${url.split('/').pop()}: ${err?.message ?? err}`)
      }
    }
    // One satellite down is a gap, not an outage; all three down must throw
    // so /api/health and the watchdog see it.
    if (failures.length === FIRMS_FEEDS.length) throw new Error(`FIRMS: all feeds failed — ${failures.join('; ')}`)
    if (!feeds.some(f => !f.error && Number.isFinite(Date.parse(f.newest_acquisition_at)) && Date.now()-Date.parse(f.newest_acquisition_at) <= 12*3600000 && Date.now()-Date.parse(f.newest_acquisition_at) >= -300000)) throw new Error('FIRMS: no recent upstream acquisitions in successfully fetched feeds')
    let previous = null
    try { previous = JSON.parse(db.kvGet('firms_regional:coverage') ?? 'null') } catch {}
    const nativePrecisionSince = previous?.native_precision_since ?? new Date().toISOString()


    await migrateDetectionKeys(db)
    let added = 0
    const now = new Date().toISOString()
    // Commit bounded batches and yield between them. A regional fire episode
    // can contain tens of thousands of detections; ingestion shares the HTTP
    // event loop, so one giant transaction would stall health and map traffic.
    for (let offset = 0; offset < rows.length; offset += 500) {
      db.tx(() => {
        for (const row of rows.slice(offset, offset + 500)) {
          const key = detectionKey(row)
          const { inThailand, province_th, province_en } = pointInThailand(row.lat, row.lng)
          const res = db.run(
            `INSERT OR IGNORE INTO regional_hotspots
               (detection_key, lat, lng, acq_date, acq_time, satellite,
                confidence, frp, in_thailand, province_th, province_en, fetched_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            key, row.lat, row.lng, row.acq_date, row.acq_time, row.satellite,
            row.confidence, row.frp, inThailand ? 1 : 0, province_th, province_en, now,
          )
          added += res?.changes ?? 0
        }
      })
      await new Promise(setImmediate)
    }
    // Retention: this table exists for a rolling "last few days" cross-
    // border share, not a long-term archive — burn-area.js and the
    // HRDI/DNP knowledge notes already own the long-term Thai record.
    // 14 days keeps roughly two burning-season weeks of context without
    // growing forever.
    db.run(`DELETE FROM regional_hotspots WHERE acq_date < date('now', '-14 days')`)
    db.kvSet('firms_regional:coverage', JSON.stringify({ bounds: REGIONAL_FIRE_BOUNDS, feeds, key_version: 2, native_precision_since: nativePrecisionSince, fetched_at: now, feeds_ok: FIRMS_FEEDS.length - failures.length, feeds_expected: FIRMS_FEEDS.length }))
    return { seen: rows.length, added }
  },
}
