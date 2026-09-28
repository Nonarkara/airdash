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
// 'down' is normally excluded — but during haze season (Dec–Apr), when every DOH
// stream on the cameras facing the Chiang Mai–Lampang corridor is offline, we
// still want to surface the camera's NAME and DOH viewer page so users can find
// the road's haziness. The hazEyes() includeDown flag opts into this treatment,
// which ranks `down` cams last so live streams always win ties.
const STREAM_RANK = { live: 0, embed: 1, unknown: 2, down: 3 }

/** Cameras whose viewer_url or attribution_url gives a public "open on source"
 *  destination. Used by haze-eyes includeDown: a down cam with this surface is
 *  still useful (gives the user the source page) — a down cam without it is
 *  truly black-box and stays hidden. */
function hasExternalSurface(c) {
  return typeof c.viewer_url === 'string' && /^https?:\/\//i.test(c.viewer_url)
}

/**
 * The cameras looking at the worst air: for each station, from the highest
 * PM2.5 down, the best not-yet-used camera within reach. A dead stream is
 * never chosen; live video beats a link-only camera beats an unproven one.
 *
 * `includeDown` (haze season, 2026-09-28): also consider `down` cameras
 * that have a `viewer_url` (so the user still gets a public cam page).
 * Down cams are ranked AFTER every live / embed / unknown cam so a healthy
 * stream on the same station always wins the tie.
 */
export function hazeEyes(cams, stations, { now = Date.now(), limit = 12, maxKm = EYES_MAX_KM, minPm25 = 25, includeDown = false } = {}) {
  const pool = cams.filter((c) => {
    if (!(c.stream_status in STREAM_RANK)) return false
    // `online` reflects the registry's "is this camera listed as alive?" — but
    // when applyHealth sets stream_status='down' it also flips online=false.
    // The relevant question for includeDown is: do we have a viewer surface?
    if (c.stream_status === 'down') return includeDown && hasExternalSurface(c)
    return c.online !== false
  })
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

/** Every north-Thailand camera (lat >= 17) paired with its nearest fresh
 *  PM2.5 station. The haze-eyes wall uses the live ones; this surface lists
 *  ALL of them, including down cams, so a user planning a drive along Highway
 *  11 from Chiang Mai to Lampang can see every camera on the route and which
 *  upstreams are alive. `?lat=&lng=` centres; otherwise we return them all
 *  sorted by descending `air.pm25` of the nearest station (worst air first).
 *  Pure: same input contract as pairAir/hazeEyes. */
export function northHazeCams(cams, stations, { now = Date.now(), limit = 60, minLat = 17, maxKm = 30 } = {}) {
  const pool = pairAir(cams, stations, { now, maxKm })
  const north = pool.filter((c) => c.lat >= minLat).filter((c) => c.stream_status in STREAM_RANK)
  // Rank: worst-air cams first; ties break on stream-rank then distance.
  // null pm25 → pushed to the tail (treated as -1 so they sort last in DESC).
  const airScore = (c) => (c.air?.pm25 ?? -1)
  return [...north]
    .sort((a, b) => {
      const d = airScore(b) - airScore(a)  // larger pm25 first
      if (d !== 0) return d
      const r = (STREAM_RANK[a.stream_status] ?? 9) - (STREAM_RANK[b.stream_status] ?? 9)
      if (r !== 0) return r
      return (a.air?.km ?? 999) - (b.air?.km ?? 999)
    })
    .slice(0, Math.max(1, Math.min(500, Math.trunc(Number(limit) || 60))))
}
