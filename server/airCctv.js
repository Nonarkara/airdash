// CCTV x air. A PM2.5 number is abstract; a camera looking at the same place
// is not. This pairs every camera with the reading nearest to it and picks
// the live cameras that face the worst air right now ("haze eyes").
//
// Pure: no DB, no network, no mutation. The API layer feeds it the catalog
// (already health-checked, see sources/cctvHealth.js) and the air4thai
// stations with their latest PM2.5.
const FRESH_MS = 6 * 3_600_000   // a reading older than this is not "the air right now"
const PAIR_MAX_KM = 25           // beyond this a station says nothing about that camera
const EYES_MAX_KM = 20
const CELL = 0.25                // degrees; ~27 km, so a 3x3 neighbourhood covers PAIR_MAX_KM

/** Thai AQI 2023 PM2.5 (24 h) bands: 15 / 25 / 37.5 / 75 µg/m³. null when there is no valid reading. */
export function pm25Band(v) {
  if (!Number.isFinite(v) || v < 0) return null
  if (v <= 15) return 'excellent'
  if (v <= 25) return 'good'
  if (v <= 37.5) return 'moderate'
  if (v <= 75) return 'sensitive'
  return 'unhealthy'
}

const km = (aLat, aLng, bLat, bLng) => Math.hypot((aLat - bLat) * 111, (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180))
const cellKey = (lat, lng) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`

// air4thai stamps local (UTC+7) minutes without a zone.
function isFresh(obs, now) {
  if (!obs) return false
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(obs)
  const ms = Date.parse(hasZone ? obs : `${obs}+07:00`)
  return Number.isFinite(ms) && now - ms <= FRESH_MS && ms - now < 3_600_000
}

const airOf = (s, d) => ({
  station_key: s.station_key, name_th: s.name_th ?? null, name_en: s.name_en ?? null,
  province_th: s.province_th ?? null, pm25: s.pm25, band: pm25Band(s.pm25), km: Math.round(d * 10) / 10, obs_time: s.obs_time,
})

function usableStations(stations, now) {
  return stations.filter((s) => Number.isFinite(s.pm25) && Number.isFinite(s.lat) && Number.isFinite(s.lng) && isFresh(s.obs_time, now))
}

/** Every camera + `air`: the nearest fresh PM2.5 station within reach, or null. */
export function pairAir(cams, stations, { now = Date.now(), maxKm = PAIR_MAX_KM } = {}) {
  const grid = new Map()
  for (const s of usableStations(stations, now)) {
    const k = cellKey(s.lat, s.lng)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(s)
  }
  return cams.map((c) => {
    let best = null, bestKm = Infinity
    const cy = Math.floor(c.lat / CELL), cx = Math.floor(c.lng / CELL)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const s of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
        const d = km(c.lat, c.lng, s.lat, s.lng)
        if (d < bestKm) { best = s; bestKm = d }
      }
    }
    return { ...c, air: best && bestKm <= maxKm ? airOf(best, bestKm) : null }
  })
}

// 'flaky' (one timeout, awaiting a second look) is excluded: better to show fewer
// eyes than a black box. 'unknown' only exists before the first probe cycle ends.
const STREAM_RANK = { live: 0, embed: 1, unknown: 2 }

/**
 * The cameras looking at the worst air: for each station, from the highest
 * PM2.5 down, the best not-yet-used camera within reach. A dead stream is never
 * chosen; live video beats a link-only camera beats an unproven one.
 */
export function hazeEyes(cams, stations, { now = Date.now(), limit = 12, maxKm = EYES_MAX_KM, minPm25 = 25 } = {}) {
  const pool = cams.filter((c) => c.stream_status !== 'down' && c.online !== false && c.stream_status in STREAM_RANK)
  const used = new Set()
  const out = []
  const ranked = usableStations(stations, now).filter((s) => s.pm25 > minPm25).sort((a, b) => b.pm25 - a.pm25)
  for (const s of ranked) {
    if (out.length >= limit) break
    let best = null, bestKey = null
    for (const c of pool) {
      const id = `${c.source}:${c.id}`
      if (used.has(id)) continue
      const d = km(s.lat, s.lng, c.lat, c.lng)
      if (d > maxKm) continue
      const key = [STREAM_RANK[c.stream_status], d]
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = { c, d }; bestKey = key }
    }
    if (!best) continue
    used.add(`${best.c.source}:${best.c.id}`)
    out.push({ rank: out.length + 1, air: airOf(s, best.d), camera: best.c })
  }
  return out
}
