// NASA GPM IMERG Early — satellite-observed precipitation as DATA, not just
// map tiles. Closes the gauge blind spot: ~4,200 gauges cluster near roads
// and towns; the satellite sees every 0.1° cell. Each pass samples the IMERG
// grid around all 77 province centroids and stores a per-province rain rate,
// which the verdict layer + insights cross-check against gauges ("satellite
// sees heavy rain where no gauge is reporting").
//
// Source: GPM_3IMERGHHE v07 (Early run, ~4 h latency, half-hourly) via the
// GES DISC OPeNDAP ASCII subset endpoint — no HDF5 parsing needed, we ask
// the server for exactly the Thailand window as text.
//
// Auth (operator, once, free):
//   1. Register at urs.earthdata.nasa.gov
//   2. Approve the "NASA GESDISC DATA ARCHIVE" application in your profile
//   3. Generate a token (Profile → Generate Token)
//   4. node scripts/set-earthdata-token.mjs <token>
// Without a token the source skips quietly — nothing else depends on it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONFIG } from '../config.js'
import { log } from '../util.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// IMERG grid geometry: 0.1° global, lon index 0 at -180, lat index 0 at -90.
const lonIdx = (lon) => Math.round((lon + 180) / 0.1)
const latIdx = (lat) => Math.round((lat + 90) / 0.1)
// Thailand window (a little padding beyond the borders).
const LON0 = lonIdx(96.5), LON1 = lonIdx(106.5)
const LAT0 = latIdx(4.8), LAT1 = latIdx(21.2)

let provinces = null
function loadProvinces() {
  if (provinces) return provinces
  const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'geo', 'provinces.json'), 'utf8'))
  provinces = raw.map((p) => ({
    code: String(p.provinceCode), name_th: p.provinceNameTh, name_en: p.provinceNameEn,
    lat: p.lat, lng: p.lng,
  }))
  return provinces
}

/** Candidate half-hour granules, newest-first, starting ~4h back (Early-run latency). */
function candidateGranules(now = new Date()) {
  const out = []
  for (let back = 8; back <= 16; back++) { // 4h..8h ago in half-hour steps
    const t = new Date(now.getTime() - back * 30 * 60_000)
    const y = t.getUTCFullYear()
    const startOfYear = Date.UTC(y, 0, 1)
    const doy = String(Math.floor((Date.UTC(y, t.getUTCMonth(), t.getUTCDate()) - startOfYear) / 86_400_000) + 1).padStart(3, '0')
    const ymd = `${y}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`
    const halfHour = t.getUTCHours() * 2 + (t.getUTCMinutes() >= 30 ? 1 : 0)
    const startMin = halfHour * 30
    const hh = String(Math.floor(startMin / 60)).padStart(2, '0')
    const mm = String(startMin % 60).padStart(2, '0')
    const endMin = startMin + 29
    const eh = String(Math.floor(endMin / 60)).padStart(2, '0')
    const em = String(endMin % 60).padStart(2, '0')
    const minutes = String(startMin).padStart(4, '0')
    out.push({
      url: `https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHE.07/${y}/${doy}/` +
        `3B-HHR-E.MS.MRG.3IMERG.${ymd}-S${hh}${mm}00-E${eh}${em}59.${minutes}.V07B.HDF5.ascii` +
        `?precipitation[0:0][${LON0}:${LON1}][${LAT0}:${LAT1}]`,
      obs_time: `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}` +
        `T${hh}:${mm}:00Z`,
    })
  }
  return out
}

/** Parse the OPeNDAP ASCII response into a lon×lat grid of mm/h. */
function parseAscii(text) {
  // Rows look like: "precipitation[0][2760], v0, v1, ..." — one row per lon,
  // columns are lat cells. Fill values are negative (-9999.9).
  const grid = new Map() // lonIdx -> Float32Array over lat window
  for (const lineRaw of text.split('\n')) {
    const m = lineRaw.match(/^precipitation\[0\]\[(\d+)\],\s*(.+)$/)
    if (!m) continue
    const vals = m[2].split(',').map(Number)
    grid.set(Number(m[1]), vals)
  }
  return grid
}

export default {
  name: 'imerg',
  label_th: 'ฝนดาวเทียม GPM IMERG',
  label_en: 'GPM IMERG satellite rain',
  intervalMs: CONFIG.intervals.imerg,
  enabled: true,

  async run({ db, bus }) {
    const token = db.kvGet('earthdata_token')
    if (!token) {
      // Not configured — skip quietly (logged once per boot by the scheduler's
      // run history showing 0/0).
      return { seen: 0, added: 0 }
    }

    let granule = null, text = null
    for (const cand of candidateGranules()) {
      const res = await fetch(cand.url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(CONFIG.fetchTimeoutMs * 2),
        redirect: 'follow',
      })
      if (res.ok) { granule = cand; text = await res.text(); break }
      if (res.status === 401 || res.status === 403) {
        log('warn', 'IMERG auth rejected — check the Earthdata token and GESDISC app approval', { status: res.status })
        return { seen: 0, added: 0 }
      }
      // 404 = granule not published yet; try the next-older one.
    }
    if (!granule) {
      // Token was valid but every candidate granule returned 404. This usually
      // means NASA's processing pipeline is delayed (>8h behind real-time).
      // Log it so an operator checking /api/health knows why satellite data
      // stopped, rather than silently returning 0/0 (looks identical to
      // "source not configured").
      log('warn', 'IMERG: all candidate granules returned 404 — NASA processing may be delayed')
      return { seen: 0, added: 0 }
    }

    const grid = parseAscii(text)
    if (grid.size === 0) {
      log('warn', 'IMERG response parsed to empty grid')
      return { seen: 0, added: 0 }
    }

    // Sample a 3×3 cell window (±0.1°) around each province centroid.
    let added = 0
    const provs = loadProvinces()
    for (const p of provs) {
      const li = lonIdx(p.lng), ti = latIdx(p.lat)
      let maxRate = null
      for (let dx = -1; dx <= 1; dx++) {
        const row = grid.get(li + dx)
        if (!row) continue
        for (let dy = -1; dy <= 1; dy++) {
          const v = row[ti + dy - LAT0]
          if (Number.isFinite(v) && v >= 0 && (maxRate === null || v > maxRate)) maxRate = v
        }
      }
      if (maxRate === null) continue
      const now = new Date().toISOString()
      db.upsertStation({
        source: 'imerg', station_key: p.code,
        name_th: `ฝนดาวเทียม ${p.name_th}`, name_en: `Satellite rain ${p.name_en}`,
        province_th: p.name_th, province_en: p.name_en, province_code: p.code,
        lat: p.lat, lng: p.lng, now,
      })
      const isNew = db.insertReading({
        source: 'imerg', station_key: p.code, metric: 'sat_rain_mmh',
        value: Math.round(maxRate * 100) / 100, obs_time: granule.obs_time,
        fetched_at: now,
      })
      if (isNew) added += 1
    }
    return { seen: provs.length, added }
  },
}
