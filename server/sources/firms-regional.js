// NASA FIRMS — regional (mainland Southeast Asia) VIIRS active-fire
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

// Mainland Southeast Asia: Thailand, Myanmar, Laos, Cambodia, Vietnam,
// and Yunnan (China) — wide enough to catch fires that could plausibly
// be a source of transported haze over Thailand, narrow enough that the
// filter is doing real work (not just re-downloading the planet).
const BBOX = { latMin: 4, latMax: 29, lngMin: 92, lngMax: 110 }

function parseCsv(text) {
  const lines = text.split('\n')
  if (lines.length < 2) return []
  const head = lines[0].split(',')
  const idx = (name) => head.indexOf(name)
  const iLat = idx('latitude'), iLng = idx('longitude')
  const iDate = idx('acq_date'), iTime = idx('acq_time')
  const iSat = idx('satellite'), iConf = idx('confidence'), iFrp = idx('frp')
  if (iLat < 0 || iLng < 0) return []

  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const c = line.split(',')
    if (c.length !== head.length) continue
    const lat = Number(c[iLat]), lng = Number(c[iLng])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
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

export default {
  name: 'firms_regional',
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
    for (const url of FIRMS_FEEDS) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        rows.push(...parseCsv(await r.text()))
      } catch (err) {
        failures.push(`${url.split('/').pop()}: ${err?.message ?? err}`)
      }
    }
    // One satellite down is a gap, not an outage; all three down must throw
    // so /api/health and the watchdog see it.
    if (failures.length === FIRMS_FEEDS.length) throw new Error(`FIRMS: all feeds failed — ${failures.join('; ')}`)

    let added = 0
    const now = new Date().toISOString()
    db.tx(() => {
      for (const row of rows) {
        // Round to ~1 km so the key is stable even though FIRMS assigns
        // no persistent detection ID of its own.
        const key = `${row.satellite}:${row.acq_date}:${row.acq_time}:${row.lat.toFixed(2)}:${row.lng.toFixed(2)}`
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
      // Retention: this table exists for a rolling "last few days" cross-
      // border share, not a long-term archive — burn-area.js and the
      // HRDI/DNP knowledge notes already own the long-term Thai record.
      // 14 days keeps roughly two burning-season weeks of context without
      // growing forever.
      db.run(`DELETE FROM regional_hotspots WHERE acq_date < date('now', '-14 days')`)
    })
    return { seen: rows.length, added }
  },
}
