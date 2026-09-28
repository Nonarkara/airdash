// Smoke transport — "is there fire upwind of my province?"
//
// Thailand's worst haze weeks are imported as much as home-made: burning in
// Myanmar, Laos and Cambodia rides the prevailing wind in. A ground sensor
// only says so once the smoke has arrived. This joins two things we already
// ingest — VIIRS fire detections from three satellites (firms-regional.js)
// and each province's forecast dominant wind (openmeteo.js) — into a
// per-province "smoke potential": the fire radiative power (MW) burning
// UPWIND within SMOKE_RADIUS_KM, down-weighted with distance.
//
// It is a transport INDICATOR, not a concentration forecast: it says where
// smoke can come from, not how much PM2.5 will arrive. The CAMS forecast
// (bias-corrected) carries the "how much". Labels say so.
const RADIUS_KM = 500
const SECTOR_HALF_DEG = 45        // upwind = within ±45° of the wind-from bearing
const DECAY_KM = 150              // weight = 1 / (1 + d / DECAY_KM)
const LOOKBACK_DAYS = 2
const GRID_DEG = 0.25             // pre-aggregate detections so province × fire stays cheap
const LEVELS = [                  // weighted MW → level (first match wins)
  { min: 600, level: 'high' },
  { min: 150, level: 'moderate' },
  { min: 20, level: 'low' },
  { min: 0, level: 'none' },
]
const TTL_MS = 10 * 60_000
const COMPASS_TH = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ']
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const rad = (d) => (d * Math.PI) / 180
export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}
/** Initial bearing (degrees from north) from point 1 toward point 2. */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
const compass = (deg) => Math.round(deg / 45) % 8

/** Pure: fires → grid cells { lat, lng, frp, n, inThailand }. */
export function gridFires(fires) {
  const cells = new Map()
  for (const f of fires) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue
    const key = `${Math.floor(f.lat / GRID_DEG)}:${Math.floor(f.lng / GRID_DEG)}`
    const c = cells.get(key) ?? { latSum: 0, lngSum: 0, frp: 0, n: 0, thai: 0 }
    c.latSum += f.lat; c.lngSum += f.lng; c.frp += f.frp > 0 ? f.frp : 1; c.n += 1; c.thai += f.in_thailand ? 1 : 0
    cells.set(key, c)
  }
  return [...cells.values()].map((c) => ({ lat: c.latSum / c.n, lng: c.lngSum / c.n, frp: c.frp, n: c.n, thaiShare: c.thai / c.n }))
}

/** Pure: smoke potential for one province. windFromDeg is the meteorological
 *  "from" direction (Open-Meteo's wind_direction_10m_dominant). */
export function smokeFor(province, cells, windFromDeg) {
  if (!Number.isFinite(windFromDeg)) return null
  let weighted = 0, fires = 0, nearest = null, thaiFrp = 0, frpSum = 0
  for (const c of cells) {
    const d = distanceKm(province.lat, province.lng, c.lat, c.lng)
    if (d > RADIUS_KM) continue
    // A cell within ~15 km is "here" — count it regardless of wind.
    if (d > 15 && angleDiff(bearingDeg(province.lat, province.lng, c.lat, c.lng), windFromDeg) > SECTOR_HALF_DEG) continue
    const w = 1 / (1 + d / DECAY_KM)
    weighted += c.frp * w
    frpSum += c.frp
    thaiFrp += c.frp * c.thaiShare
    fires += c.n
    if (nearest === null || d < nearest) nearest = d
  }
  const level = LEVELS.find((l) => weighted >= l.min).level
  const k = compass(windFromDeg)
  return {
    level,
    upwind_frp_mw: Math.round(weighted),
    upwind_fires: fires,
    nearest_km: nearest === null ? null : Math.round(nearest),
    from_deg: Math.round(windFromDeg),
    from_th: COMPASS_TH[k], from_en: COMPASS_EN[k],
    // Where the upwind fire power sits: inside Thailand vs across a border.
    thai_share: frpSum > 0 ? Math.round((thaiFrp / frpSum) * 100) / 100 : null,
  }
}

const cache = new WeakMap() // db → { at, value }

/** Per-province smoke potential for TOMORROW's wind (today's as fallback). */
export function computeSmoke(db) {
  const c = cache.get(db)
  if (c && Date.now() - c.at < TTL_MS) return c.value
  let value
  try {
    const fires = db.all(
      `SELECT lat, lng, frp, in_thailand FROM regional_hotspots WHERE acq_date >= date('now', ?)`,
      `-${LOOKBACK_DAYS} days`)
    const cells = gridFires(fires)
    const wind = db.all(
      `SELECT l.station_key AS code, l.metric, l.value, s.lat, s.lng, s.province_th, s.province_en
         FROM latest l JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
        WHERE l.source = 'openmeteo' AND l.metric IN ('wind_dir_d0', 'wind_dir_d1')
          AND l.obs_time >= ?`,
      new Date(Date.now() + 7 * 3600_000 - 26 * 3600_000).toISOString().slice(0, 16))
    const byCode = new Map()
    for (const r of wind) {
      const p = byCode.get(r.code) ?? { code: r.code, lat: r.lat, lng: r.lng, province_th: r.province_th, province_en: r.province_en }
      p[r.metric] = r.value
      byCode.set(r.code, p)
    }
    const provinces = []
    for (const p of byCode.values()) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
      const s = smokeFor(p, cells, p.wind_dir_d1 ?? p.wind_dir_d0)
      if (s) provinces.push({ code: String(p.code), province_th: p.province_th, province_en: p.province_en, ...s })
    }
    provinces.sort((a, b) => b.upwind_frp_mw - a.upwind_frp_mw)
    value = { fires_48h: fires.length, provinces, computed_at: new Date().toISOString() }
  } catch (err) {
    value = { fires_48h: null, provinces: [], error: String(err?.message ?? err), computed_at: new Date().toISOString() }
  }
  cache.set(db, { at: Date.now(), value })
  return value
}

export const SMOKE_METHOD = {
  th: `ควันจากไฟที่อยู่ "เหนือลม" ของจังหวัด: รวมพลังงานความร้อน (MW) ของจุดความร้อน VIIRS 3 ดาวเทียม ในรัศมี ${RADIUS_KM} กม. ภายในมุม ±${SECTOR_HALF_DEG}° ของทิศลมพรุ่งนี้ (Open-Meteo) ย้อนหลัง ${LOOKBACK_DAYS} วัน ถ่วงน้ำหนักตามระยะทาง — เป็นตัวชี้ "ศักยภาพที่ควันจะพัดมา" ไม่ใช่การพยากรณ์ค่าฝุ่น`,
  en: `Fire UPWIND of each province: fire radiative power (MW) of VIIRS detections from 3 satellites within ${RADIUS_KM} km and ±${SECTOR_HALF_DEG}° of tomorrow's dominant wind direction (Open-Meteo), last ${LOOKBACK_DAYS} days, distance-weighted. A smoke-transport indicator, not a PM2.5 forecast.`,
}
