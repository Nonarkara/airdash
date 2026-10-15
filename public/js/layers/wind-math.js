// Pure wind-grid math. No DOM, no network. Shared by the map layers and the
// server cache so the grid the client samples is the grid the server fetched.
//
// One Open-Meteo request accepts about 100 coordinates. This grid is exactly
// 100 cells and covers mainland Southeast Asia. Cells outside it stay blank.

export const WIND_GRID = { lat0: 2, lng0: 92, dlat: 2.5, dlng: 3, nlat: 10, nlng: 10 }

// Display motion only. A phone must not animate hundreds of streaks.
export const PARTICLE_CAP = { phone: 140, desktop: 420, absolute: 480 }

// 12 h at the current wind, drawn short. Not an arrival time.
export const PLUME_MAX_KM = 320
export const PM_HAZE_LINE = 37.5

export const AIR_COPY = {
  wind_th: 'ลมปัจจุบันที่ความสูง 10 เมตร ลูกศรและจุดเคลื่อนที่บอกทิศและความเร็วสัมพัทธ์ ไม่ใช่เวลาที่อากาศเคลื่อนที่จริง',
  wind_en: 'Current 10 m wind. Arrows and particles show direction and relative speed, not air moving in real time.',
  wind_zh: '当前10米风。箭头和粒子表示方向和相对速度，不是空气的真实移动时间。',
  heat_th: 'พื้นผิว PM2.5 จากสถานีที่ยังสด ถ่วงด้วยระยะทางผกผัน สีจางลงเมื่อห่างสถานี ช่องว่างหมายถึงข้อมูลไม่พอ ไม่ใช่อากาศสะอาด',
  heat_en: 'PM2.5 surface from fresh stations, inverse-distance weighted. It fades away from stations. A blank is unsupported, not clean air.',
  heat_zh: '由新鲜站点反距离加权的PM2.5面。离站点越远越淡。空白表示测站不够，不是空气干净。',
  drift_th: 'ลมพัดหมอกควันไปทางนี้ ไม่ใช่พยากรณ์เวลาถึง',
  drift_en: 'Wind carries haze this way, not a forecast',
  drift_zh: '风把霾往这边带，不是到达时间预报',
  credit_th: 'ลม: Open-Meteo (CC BY 4.0) · ฝุ่น: สถานี Air4Thai / คพ. · จุดความร้อน: NASA FIRMS ไม่ใช่พื้นที่เผา',
  credit_en: 'Wind: Open-Meteo (CC BY 4.0) · PM: Air4Thai / PCD stations · Hotspots: NASA FIRMS detections, not burned area',
  credit_zh: '风：Open-Meteo（CC BY 4.0）· 颗粒物：Air4Thai / 污染控制局站点 · 热异常：NASA FIRMS，不是过火面积',
}

// The dashboard switch is Thai or English. Chinese stays available for the
// same phrase; the legend prints only the active language.
export function pageLang() {
  const lang = typeof document !== 'undefined' ? document.documentElement?.lang : ''
  if (lang === 'th' || lang === 'zh') return lang
  return 'en'
}

// Bangkok clock. Shown only when the server marks the grid stale.
export function windAsOf(iso, lang = 'en') {
  if (!iso) return null
  const raw = String(iso)
  const normalized = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`
  const t = Date.parse(normalized)
  if (!Number.isFinite(t)) return null
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(t))
  if (lang === 'th') return `ลม ณ ${hm}`
  if (lang === 'zh') return `风截至 ${hm}`
  return `wind as of ${hm}`
}

export function pointsForGrid(grid = WIND_GRID) {
  const pts = []
  for (let i = 0; i < grid.nlat; i++) {
    for (let j = 0; j < grid.nlng; j++) {
      pts.push({
        lat: Math.round((grid.lat0 + i * grid.dlat) * 1000) / 1000,
        lng: Math.round((grid.lng0 + j * grid.dlng) * 1000) / 1000,
      })
    }
  }
  return pts
}

export function openMeteoUrl(points) {
  const lat = points.map((p) => p.lat.toFixed(3)).join(',')
  const lng = points.map((p) => p.lng.toFixed(3)).join(',')
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&forecast_days=1&timezone=UTC`
}

export function decodeCurrents(points, results) {
  const speed = []
  const from = []
  const list = Array.isArray(results) ? results : [results]
  for (let i = 0; i < points.length; i++) {
    const row = list[i]
    const cur = row?.current ?? {}
    const sp = Number(cur.wind_speed_10m)
    const dir = Number(cur.wind_direction_10m)
    const latOk = Number.isFinite(Number(row?.latitude)) && Math.abs(Number(row.latitude) - points[i].lat) < 0.4
    const lngOk = Number.isFinite(Number(row?.longitude)) && Math.abs(Number(row.longitude) - points[i].lng) < 0.4
    const ok = latOk && lngOk && Number.isFinite(sp) && sp >= 0 && sp <= 180 && Number.isFinite(dir) && dir >= 0 && dir <= 360
    speed.push(ok ? Math.round(sp * 10) / 10 : null)
    from.push(ok ? Math.round(dir) : null)
  }
  return { speed, from_deg: from }
}

// Meteorological "from" degrees → eastward u and northward v, km/h.
export function components(fromDeg, speedKmh) {
  const rad = fromDeg * Math.PI / 180
  return { u: -speedKmh * Math.sin(rad), v: -speedKmh * Math.cos(rad) }
}

export function sampleWind(field, lat, lng) {
  if (!field?.available || !field.speed_kmh || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const fi = (lat - field.lat0) / field.dlat
  const fj = (lng - field.lng0) / field.dlng
  if (fi < 0 || fj < 0 || fi > field.nlat - 1 || fj > field.nlng - 1) return null
  const i0 = Math.floor(fi)
  const j0 = Math.floor(fj)
  const i1 = Math.min(field.nlat - 1, i0 + 1)
  const j1 = Math.min(field.nlng - 1, j0 + 1)
  const at = (i, j) => {
    const k = i * field.nlng + j
    const sp = field.speed_kmh[k]
    const dir = field.from_deg[k]
    if (!Number.isFinite(sp) || !Number.isFinite(dir)) return null
    return components(dir, sp)
  }
  const q00 = at(i0, j0)
  const q10 = at(i1, j0)
  const q01 = at(i0, j1)
  const q11 = at(i1, j1)
  if (!q00 || !q10 || !q01 || !q11) return null
  const ti = fi - i0
  const tj = fj - j0
  const u = q00.u * (1 - ti) * (1 - tj) + q10.u * ti * (1 - tj) + q01.u * (1 - ti) * tj + q11.u * ti * tj
  const v = q00.v * (1 - ti) * (1 - tj) + q10.v * ti * (1 - tj) + q01.v * (1 - ti) * tj + q11.v * ti * tj
  const speed = Math.hypot(u, v)
  return { u, v, speed_kmh: speed }
}

export function advect(lat, lng, u, v, hours) {
  const northKm = v * hours
  const eastKm = u * hours
  const dLat = northKm / 111.32
  const dLng = eastKm / (111.32 * Math.max(0.2, Math.abs(Math.cos(lat * Math.PI / 180))))
  return { lat: lat + dLat, lng: lng + dLng, km: Math.hypot(northKm, eastKm) }
}

export function plumeTrack(lat, lng, sample) {
  if (!sample) return null
  const speed = Number.isFinite(sample.speed_kmh) ? sample.speed_kmh : Math.hypot(sample.u ?? NaN, sample.v ?? NaN)
  if (!(speed >= 2)) return null
  const full = advect(lat, lng, sample.u, sample.v, 12)
  const scale = full.km > PLUME_MAX_KM ? PLUME_MAX_KM / full.km : 1
  const h6 = advect(lat, lng, sample.u * scale, sample.v * scale, 6)
  const h12 = advect(lat, lng, sample.u * scale, sample.v * scale, 12)
  return { km: h12.km, points: [[lat, lng], [h6.lat, h6.lng], [h12.lat, h12.lng]] }
}

export function chevron(from, to) {
  const [lat1, lng1] = from
  const [lat2, lng2] = to
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const len = Math.hypot(dLat, dLng) || 1
  const uLat = dLat / len
  const uLng = dLng / len
  const back = len * 0.22
  const side = len * 0.12
  const baseLat = lat2 - uLat * back
  const baseLng = lng2 - uLng * back
  return [
    [baseLat + -uLng * side, baseLng + uLat * side],
    [lat2, lng2],
    [baseLat - -uLng * side, baseLng - uLat * side],
  ]
}

export function particleBudget({ narrow = false, hidden = false, reduce = false } = {}) {
  if (hidden || reduce) return 0
  return Math.min(PARTICLE_CAP.absolute, narrow ? PARTICLE_CAP.phone : PARTICLE_CAP.desktop)
}

export function hazeSources({ stations = [], fires = [], field, maxPlumes = 18 } = {}) {
  if (!field?.available) return []
  const picks = []
  const fireCap = Math.max(1, Math.ceil(maxPlumes / 2))
  const seenF = new Set()
  const ranked = fires
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && (f.detections ?? 0) >= 1)
    .sort((a, b) => (b.detections ?? 0) - (a.detections ?? 0))
  for (const f of ranked) {
    const key = `${Math.round(f.lat / 0.75)}:${Math.round(f.lng / 0.75)}`
    if (seenF.has(key)) continue
    seenF.add(key)
    const track = plumeTrack(f.lat, f.lng, sampleWind(field, f.lat, f.lng))
    if (!track) continue
    picks.push({ kind: 'fire', lat: f.lat, lng: f.lng, detections: f.detections, track })
    if (picks.length >= fireCap) break
  }
  const cells = new Map()
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !(s.pm25 >= PM_HAZE_LINE)) continue
    const key = `${Math.round(s.lat / 0.5)}:${Math.round(s.lng / 0.5)}`
    const prev = cells.get(key)
    if (!prev || s.pm25 > prev.pm25) cells.set(key, s)
  }
  const highs = [...cells.values()].sort((a, b) => b.pm25 - a.pm25)
  for (const s of highs) {
    const track = plumeTrack(s.lat, s.lng, sampleWind(field, s.lat, s.lng))
    if (!track) continue
    picks.push({ kind: 'pm', lat: s.lat, lng: s.lng, pm25: s.pm25, track })
    if (picks.length >= maxPlumes) break
  }
  return picks
}
