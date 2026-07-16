// Thai address gazetteer — loaded once at boot, kept in memory. The actual
// subdistrict records live at public/geo/subdistricts.json (7,436 rows,
// ~1.6 MB) and are loaded via fs.readFileSync at boot. Province boundaries
// come from a sibling GeoJSON and are loaded only by callers that need them.
//
// Source attribution:
//   subdistricts.json · districts.json · provinces.json
//     → thailand-geography-data/thailand-geography-json (CC0) — derived
//       from DOPA's official Thai administrative registry, mirrored from
//       jquery.Thailand.js's raw_database.
//   province-boundaries.geojson
//     → chingchai/OpenGISData-Thailand (CC-BY 4.0) — derived from DOPA shapefiles.
//
// These are the open-data mirrors of the same government registries behind
// data.go.th — we use the mirrors because data.go.th requires a session key
// and was designed for human browsing, not machine-readable pulls.
//
// True muban (village) data is held by DOPA behind an auth wall — we ship
// tambon-level which is the finest open granularity. Every Thai village
// belongs to exactly one tambon, so searching at tambon level still means
// every village is reachable from the search bar.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEO = join(__dirname, '..', 'public', 'geo')

let _tambons = null
let _districts = null
let _provinces = null

function loadTambons() {
  if (_tambons) return _tambons
  const raw = JSON.parse(readFileSync(join(GEO, 'subdistricts.json'), 'utf8'))
  // Build a fast lookup: code → row, and a flat list ready to search.
  _tambons = {
    list: raw,
    byCode: new Map(raw.map((t) => [t.subdistrictCode, t])),
  }
  return _tambons
}

function loadDistricts() {
  if (_districts) return _districts
  const raw = JSON.parse(readFileSync(join(GEO, 'districts.json'), 'utf8'))
  _districts = {
    list: raw,
    byCode: new Map(raw.map((d) => [d.districtCode, d])),
  }
  return _districts
}

function loadProvinces() {
  if (_provinces) return _provinces
  const raw = JSON.parse(readFileSync(join(GEO, 'provinces.json'), 'utf8'))
  _provinces = {
    list: raw,
    byCode: new Map(raw.map((p) => [p.provinceCode, p])),
  }
  return _provinces
}

function trName(en, th, lang) {
  return lang === 'th' ? th : (en ?? th ?? '—')
}

// Look up the display name of any entity by code.
export function resolveName(code, kind, lang = 'en') {
  if (kind === 'province') {
    const p = loadProvinces().byCode.get(Number(code))
    return p ? trName(p.provinceNameEn, p.provinceNameTh, lang) : null
  }
  if (kind === 'district') {
    const d = loadDistricts().byCode.get(Number(code))
    if (!d) return null
    const p = loadProvinces().byCode.get(d.provinceCode)
    return {
      name: trName(d.districtNameEn, d.districtNameTh, lang),
      province: p ? trName(p.provinceNameEn, p.provinceNameTh, lang) : null,
    }
  }
  if (kind === 'tambon') {
    const t = loadTambons().byCode.get(Number(code))
    if (!t) return null
    const d = loadDistricts().byCode.get(t.districtCode)
    const p = loadProvinces().byCode.get(t.provinceCode)
    return {
      name: trName(t.subdistrictNameEn, t.subdistrictNameTh, lang),
      district: d ? trName(d.districtNameEn, d.districtNameTh, lang) : null,
      province: p ? trName(p.provinceNameEn, p.provinceNameTh, lang) : null,
      postalCode: t.postalCode,
    }
  }
  return null
}

// Generic substring search with prefix-boost. Returns at most `limit` rows.
function searchList(rows, q, fields, limit) {
  const ql = q.toLowerCase()
  const scored = []
  for (const row of rows) {
    let best = 0
    for (const f of fields) {
      const v = row[f]
      if (!v) continue
      const lo = String(v).toLowerCase()
      const idx = lo.indexOf(ql)
      if (idx === -1) continue
      // Score = earlier-match bonus + length match
      const s = (idx === 0 ? 100 : 40 - idx)
        + Math.min(40, ql.length * 8)
        + Math.min(20, (lo.length - ql.length) === 0 ? 20 : 0)
      if (s > best) best = s
    }
    if (best > 0) scored.push({ row, s: best })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map((x) => x.row)
}

export function searchProvinces(q, lang = 'en', limit = 8) {
  return searchList(loadProvinces().list, q,
    ['provinceNameEn', 'provinceNameTh'], limit)
    .map((p) => ({
      kind: 'province',
      code: p.provinceCode,
      name_en: p.provinceNameEn,
      name_th: p.provinceNameTh,
    }))
}

export function searchDistricts(q, lang = 'en', limit = 8) {
  return searchList(loadDistricts().list, q,
    ['districtNameEn', 'districtNameTh'], limit)
    .map((d) => {
      const p = loadProvinces().byCode.get(d.provinceCode)
      return {
        kind: 'district',
        code: d.districtCode,
        province_code: d.provinceCode,
        name_en: d.districtNameEn,
        name_th: d.districtNameTh,
        province_en: p?.provinceNameEn ?? null,
        province_th: p?.provinceNameTh ?? null,
        postal_code: d.postalCode,
      }
    })
}

export function searchTambons(q, lang = 'en', limit = 12) {
  return searchList(loadTambons().list, q,
    ['subdistrictNameEn', 'subdistrictNameTh'], limit)
    .map((t) => {
      const d = loadDistricts().byCode.get(t.districtCode)
      const p = loadProvinces().byCode.get(t.provinceCode)
      return {
        kind: 'tambon',
        code: t.subdistrictCode,
        province_code: t.provinceCode,
        district_code: t.districtCode,
        name_en: t.subdistrictNameEn,
        name_th: t.subdistrictNameTh,
        district_en: d?.districtNameEn ?? null,
        district_th: d?.districtNameTh ?? null,
        province_en: p?.provinceNameEn ?? null,
        province_th: p?.provinceNameTh ?? null,
        postal_code: t.postalCode,
      }
    })
}

// Postal-code lookup: 5-digit code → tambon / district / province. This is
// the other "no village left behind" path — every Thai postal code maps
// to exactly one tambon, so users can search by typing their own zip.
export function lookupPostal(zip, lang = 'en', limit = 5) {
  const z = String(zip ?? '').trim()
  if (!/^\d{5}$/.test(z)) return []
  const out = []
  for (const t of loadTambons().list) {
    if (t.postalCode !== Number(z)) continue
    const d = loadDistricts().byCode.get(t.districtCode)
    const p = loadProvinces().byCode.get(t.provinceCode)
    out.push({
      kind: 'tambon',
      code: t.subdistrictCode,
      name_en: t.subdistrictNameEn,
      name_th: t.subdistrictNameTh,
      district_en: d?.districtNameEn ?? null,
      district_th: d?.districtNameTh ?? null,
      province_en: p?.provinceNameEn ?? null,
      province_th: p?.provinceNameTh ?? null,
      postal_code: t.postalCode,
    })
    if (out.length >= limit) break
  }
  return out
}

// Helper for choropleth / province lookup that needs geometry-less info.
export function allProvinces() {
  return loadProvinces().list
}

// Place detail for a lat/lng: nearest water stations, nearest rain gauges,
// and the province-level forecast (if a province name was given). This is
// the data the place-card renders after the user picks a search result.
// Pure DB lookups; lat/lng is computed by haversine against every station.
export function placeDetail(db, { lat, lng, province_th = null, radius_km = 30 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // Haversine in SQL.
  // NOTE: the expression does its own deg→rad conversion (the 0.0087…
  // constant is π/360, the 0.0174… is π/180), so the bound parameters must
  // be plain DEGREES. Passing pre-converted radians here once made every
  // distance garbage and every place card claim "no stations within 30 km".
  const R = 6371.0
  const distExpr = `(${R} * 2 * ASIN(SQRT(
     POW(SIN((? - lat) * 0.00872664625997), 2) +
     COS(? * 0.017453292519943) * COS(lat * 0.017453292519943) *
     POW(SIN((? - lng) * 0.00872664625997), 2)
   )))`

  // nearest_water: gather all stations whose latest wl_msl is fresh,
  // compute distance via the bbox-then-haversine pattern. We then post-
  // filter by radius. SQLite has no MERGE so this is two queries glued
  // with a CTE via a subquery.
  const latLo = lat - 0.5, latHi = lat + 0.5
  const lngLo = lng - 0.5, lngHi = lng + 0.5
  const distSelect = `${distExpr} AS distance_km`
  const distParams = [lat, lat, lng] // degrees — see distExpr note above

  // Subselect pulls (station, latest pm25, latest aqi) from the `latest`
  // table joined twice. The outer query computes the distance from the
  // user's lat/lng and sorts by it.
  const nearest_air = db.all(
    `WITH w AS (
       SELECT l.station_key, l.value AS pm25, l.obs_time,
              s.source, s.name_th, s.name_en, s.province_th, s.province_en,
              s.lat, s.lng,
              sa.value AS aqi, sp.value AS pm10
         FROM latest l
         JOIN stations s
           ON s.source = l.source AND s.station_key = l.station_key
         LEFT JOIN latest sa
           ON sa.source = l.source AND sa.station_key = l.station_key AND sa.metric = 'aqi'
         LEFT JOIN latest sp
           ON sp.source = l.source AND sp.station_key = l.station_key AND sp.metric = 'pm10'
         WHERE l.source = 'air4thai' AND l.metric = 'pm25'
           AND s.lat IS NOT NULL AND s.lng IS NOT NULL
           AND s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ?
     )
     SELECT *, ${distSelect} FROM w WHERE ${distExpr} <= ? ORDER BY distance_km ASC LIMIT 5`,
    latLo, latHi, lngLo, lngHi,
    ...distParams, ...distParams, radius_km)

  const nearest_rain = db.all(
    `WITH r AS (
       SELECT l.station_key, l.value AS rain_24h, l.obs_time,
              s.source, s.name_th, s.name_en, s.province_th, s.province_en,
              s.lat, s.lng
         FROM latest l
         JOIN stations s
           ON s.source = l.source AND s.station_key = l.station_key
         WHERE l.metric = 'rain_24h'
           AND s.lat IS NOT NULL AND s.lng IS NOT NULL
           AND s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ?
     )
     SELECT *, ${distSelect} FROM r WHERE ${distExpr} <= ? ORDER BY distance_km ASC LIMIT 5`,
    latLo, latHi, lngLo, lngHi,
    ...distParams, ...distParams, radius_km)

  // 6-hour trend per nearest AQ station — the arrow that turns a static
  // number into "climbing fast". At most 5 stations, each an indexed point
  // lookup on idx_readings_lookup, so this stays sub-ms.
  const trendCutoff = new Date(Date.now() + 7 * 3600_000 - 6 * 3600_000)
    .toISOString().slice(0, 16)
  for (const s of nearest_air) {
    const past = db.get(
      `SELECT value FROM readings
        WHERE source = ? AND station_key = ? AND metric = 'pm25' AND obs_time <= ?
        ORDER BY obs_time DESC LIMIT 1`,
      s.source, s.station_key, trendCutoff)
    s.trend_6h = (past?.value != null && s.pm25 != null)
      ? Math.round((s.pm25 - past.value) * 10) / 10
      : null
  }

  // Rain + dust outlook for the parent province: rain chance and amounts
  // (the washout inputs) plus the CAMS PM2.5 forecast, so the city board
  // can show WHEN relief lands, not just how much.
  let province_forecast = null
  if (province_th) {
    const prov = loadProvinces().list.find((p) =>
      p.provinceNameTh === province_th || p.provinceNameEn === province_th)
    const province_code = prov?.provinceCode ?? null
    if (province_code) {
      const rows = db.all(
        `SELECT source, metric, value, obs_time FROM latest
          WHERE station_key = ?
            AND ((source = 'openmeteo' AND metric IN ('precip_fc_48h','precip_fc_d0','precip_fc_d1','precip_fc_d2','precip_prob_24h','precip_prob_48h','wind_fc_kmh'))
              OR (source = 'openmeteo_aq' AND metric IN ('pm25_fc_24h','pm25_fc_48h','pm25_fc_72h','dust_fc_24h')))`,
        String(province_code))
      if (rows.length) {
        const m = Object.fromEntries(rows.map((r) => [r.metric, r.value]))
        province_forecast = {
          fc_48h: m.precip_fc_48h ?? null,
          d0: m.precip_fc_d0 ?? null, d1: m.precip_fc_d1 ?? null, d2: m.precip_fc_d2 ?? null,
          prob_24h: m.precip_prob_24h ?? null, prob_48h: m.precip_prob_48h ?? null,
          wind_kmh: m.wind_fc_kmh ?? null,
          pm25_24h: m.pm25_fc_24h ?? null, pm25_48h: m.pm25_fc_48h ?? null, pm25_72h: m.pm25_fc_72h ?? null,
          dust_24h: m.dust_fc_24h ?? null,
          obs_time: rows[0].obs_time,
        }
      }
    }
  }

  // nearest_water kept as an alias so older clients don't blank out.
  return { nearest_air, nearest_water: nearest_air, nearest_rain, province_forecast }
}

// Universal place search — combines DB-backed stations, focus areas, and
// the in-memory admin registry (province, district, tambon). Frontend
// expects results of shape { type, name_th, name_en, province_th, lat, lng, … }.
//
// `db` is the open SQLite handle (used only for station / focus queries).
export function searchGazetteer(db, { q = '', limit = 20, lang = 'en' } = {}) {
  q = (q ?? '').trim()
  if (!q || q.length < 2) return { q, results: [] }

  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const results = []

  // ── Provinces (in-memory) ─────────────────────────────────────────────
  for (const p of searchProvinces(q, lang, 5)) {
    const prov = loadProvinces().byCode.get(p.code)
    if (!prov) continue
    results.push({
      type: 'province',
      type_th: 'จังหวัด', type_en: 'Province',
      name_th: p.name_th, name_en: p.name_en,
      province_th: p.name_th, province_en: p.name_en,
      lat: prov.lat ?? null, lng: prov.lng ?? null,
      zoom: 8,
      score: 100,
    })
  }

  // ── Districts (in-memory) ─────────────────────────────────────────────
  for (const d of searchDistricts(q, lang, 5)) {
    const p = loadProvinces().byCode.get(d.province_code)
    results.push({
      type: 'district',
      type_th: 'อำเภอ', type_en: 'District',
      name_th: d.name_th, name_en: d.name_en,
      province_th: d.province_th, province_en: d.province_en,
      // No district centroid yet — fly to the parent province centroid.
      lat: p?.lat ?? null, lng: p?.lng ?? null,
      zoom: 10,
    })
  }

  // ── Tambons (in-memory) ───────────────────────────────────────────────
  for (const t of searchTambons(q, lang, 7)) {
    const p = loadProvinces().byCode.get(t.province_code)
    results.push({
      type: 'subdistrict',
      type_th: 'ตำบล', type_en: 'Tambon',
      name_th: t.name_th, name_en: t.name_en,
      province_th: t.province_th, province_en: t.province_en,
      // No tambon centroid yet — fly to the parent province centroid.
      lat: p?.lat ?? null, lng: p?.lng ?? null,
      zoom: 11,
    })
  }

  // ── Stations (DB) ─────────────────────────────────────────────────────
  try {
    const stationRows = db.all(
      `SELECT source, station_key, name_th, name_en, province_th, province_en, lat, lng
       FROM stations
       WHERE (name_th LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\'
              OR province_th LIKE ? ESCAPE '\\' OR province_en LIKE ? ESCAPE '\\')
       ORDER BY
         CASE WHEN name_th LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
         length(name_th)
       LIMIT 8`,
      like, like, like, like, like, like)
    for (const r of stationRows) {
      const subtype = r.source === 'thaiwater_rain' ? 'rain' : 'air'
      results.push({
        type: 'station', subtype,
        type_th: 'สถานี' + (subtype === 'rain' ? 'ฝน' : 'วัดฝุ่น'),
        type_en: subtype === 'rain' ? 'Rain gauge' : 'Air quality',
        name_th: r.name_th, name_en: r.name_en,
        province_th: r.province_th, province_en: r.province_en,
        lat: r.lat, lng: r.lng,
        zoom: 13,
      })
    }
  } catch { /* stations table may not exist in some test contexts */ }

  return { q, results: results.slice(0, limit) }
}

// Lookup a single tambon / district / province by code. Returns the same
// row shape that searchGazetteer emits so the frontend can render either
// from autocomplete or from a deep-link like ?place=tambon:110101.
export function lookupPlace(code, kind, lang = 'en') {
  if (kind === 'province') {
    const p = loadProvinces().byCode.get(Number(code))
    if (!p) return null
    return {
      type: 'province',
      type_th: 'จังหวัด', type_en: 'Province',
      name_th: p.provinceNameTh, name_en: p.provinceNameEn,
      province_th: p.provinceNameTh, province_en: p.provinceNameEn,
      lat: p.lat ?? null, lng: p.lng ?? null, zoom: 8,
    }
  }
  if (kind === 'district') {
    const d = loadDistricts().byCode.get(Number(code))
    if (!d) return null
    const p = loadProvinces().byCode.get(d.provinceCode)
    return {
      type: 'district',
      type_th: 'อำเภอ', type_en: 'District',
      name_th: d.districtNameTh, name_en: d.districtNameEn,
      province_th: p?.provinceNameTh ?? null, province_en: p?.provinceNameEn ?? null,
      lat: p?.lat ?? null, lng: p?.lng ?? null, zoom: 10,
    }
  }
  if (kind === 'tambon' || kind === 'subdistrict') {
    const t = loadTambons().byCode.get(Number(code))
    if (!t) return null
    const d = loadDistricts().byCode.get(t.districtCode)
    const p = loadProvinces().byCode.get(t.provinceCode)
    return {
      type: 'subdistrict',
      type_th: 'ตำบล', type_en: 'Tambon',
      name_th: t.subdistrictNameTh, name_en: t.subdistrictNameEn,
      province_th: p?.provinceNameTh ?? null,
      province_en: p?.provinceNameEn ?? null,
      lat: p?.lat ?? null, lng: p?.lng ?? null, zoom: 11,
    }
  }
  return null
}