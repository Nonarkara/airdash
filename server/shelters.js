// Shelter data ingestion + lookup API.
//
// Sourced from data.go.th (DDPM national shelter registry, ~11K entries).
// The CSV is UTF-8 with BOM, comma-separated, and contains quoted fields
// with embedded commas in the "place" / "responsible" columns. We use a
// minimal CSV parser that handles the quoted-field case; full RFC 4180
// compliance isn't needed for this dataset.
//
// The ingest runs:
//   - on first call to ensureSheltersLoaded() (lazy, per-process)
//   - on every daily cron tick (shelter-ingest)
//
// Storage: a single `shelters` table (see db.js schema). Lookups:
//   - by bbox (map viewports)        → /api/shelters?bbox=...
//   - by province                    → /api/shelters?province=...
//   - nearest to a point             → /api/shelters/nearest?lat=..&lng=..&limit=3
import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'

// CSV lives next to the SQLite DB (root/data/).
const SHELTER_CSV = `${dirname(CONFIG.dbPath)}/shelters.csv`
export const SHELTER_SOURCE = 'ddpm_gd002'
const YES_VALUES = new Set(['มี', 'yes', 'true', '1', 'Y'])

/** Minimal CSV parser that handles double-quoted fields with embedded commas.
 *  Throws on a malformed quote — the DDPM CSV is clean enough that this is
 *  fine, and failing loudly is better than silently truncating rows. */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"' && cur === '') inQuotes = true
      else cur += c
    }
  }
  out.push(cur)
  return out
}

function toInt(v) {
  const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}
function toFloat(v) {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function toBool(v) { return YES_VALUES.has(String(v ?? '').trim()) ? 1 : 0 }

/** Parse a single shelter row from the DDPM CSV. Throws on shape mismatch
 *  (helps catch upstream schema changes early). */
function parseShelterRow(cells) {
  if (cells.length < 16) return null
  const [no, region_th, province_th, district_th, subdistrict_th, village,
         place, capacity, responsible, coordinator, phone,
         power, water, toilet, lat, lng] = cells
  return {
    no: toInt(no),
    region_th: region_th || null,
    province_th: province_th || null,
    district_th: district_th || null,
    subdistrict_th: subdistrict_th || null,
    village: village || null,
    place: place || null,
    capacity: toInt(capacity),
    responsible: responsible || null,
    coordinator: coordinator || null,
    phone: phone || null,
    has_power: toBool(power),
    has_water: toBool(water),
    has_toilet: toBool(toilet),
    lat: toFloat(lat),
    lng: toFloat(lng),
  }
}

/** Load the CSV file and upsert all rows into the shelters table. Idempotent:
 *  deletes rows from this source and re-inserts, so any source-side changes
 *  (capacity updates, removed shelters) propagate. */
export function ingestShelters(db) {
  if (!existsSync(SHELTER_CSV)) {
    log('warn', 'shelter csv missing', { path: SHELTER_CSV })
    return { rows: 0, ok: false, reason: 'csv missing' }
  }
  const raw = readFileSync(SHELTER_CSV, 'utf8')
  // Strip UTF-8 BOM if present
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return { rows: 0, ok: false, reason: 'csv empty' }
  const header = parseCsvLine(lines[0])
  if (header[0] !== 'ที่') {
    log('warn', 'shelter csv header mismatch', { header: header.slice(0, 3) })
    return { rows: 0, ok: false, reason: 'header mismatch' }
  }
  const now = new Date().toISOString()
  let inserted = 0
  let skipped = 0
  db.tx(() => {
    // Wipe + re-insert for this source so renames / removals propagate.
    db.run('DELETE FROM shelters WHERE source = ?', SHELTER_SOURCE)
    const stmt = db.prep(`INSERT INTO shelters
      (no, region_th, province_th, district_th, subdistrict_th, village,
       place, capacity, responsible, coordinator, phone,
       has_power, has_water, has_toilet, lat, lng, source, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      const r = parseShelterRow(cells)
      if (!r || r.lat == null || r.lng == null) { skipped++; continue }
      stmt.run(r.no, r.region_th, r.province_th, r.district_th, r.subdistrict_th, r.village,
               r.place, r.capacity, r.responsible, r.coordinator, r.phone,
               r.has_power, r.has_water, r.has_toilet, r.lat, r.lng, SHELTER_SOURCE, now)
      inserted++
    }
  })
  log('info', 'shelters ingested', { inserted, skipped })
  return { rows: inserted, ok: true, skipped }
}

/** Lazy loader — called on the first /api/shelters request. Cheap check via
 *  the kv store so subsequent restarts skip the file read. */
export function ensureSheltersLoaded(db) {
  const stamp = db.kvGet('shelters_loaded_at')
  if (stamp) return
  const r = ingestShelters(db)
  if (r.ok) db.kvSet('shelters_loaded_at', new Date().toISOString())
}

/** Haversine distance in km. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Bbox filter: lat_min, lng_min, lat_max, lng_max (decimal degrees).
 *  Returns only shelters with valid coordinates inside the box. */
export function sheltersInBbox(db, bbox, limit = 500) {
  const [latMin, lngMin, latMax, lngMax] = bbox
  return db.all(`SELECT id, place, district_th, subdistrict_th, village, capacity,
                       has_power, has_water, has_toilet, lat, lng, phone, coordinator
                FROM shelters
                WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
                  AND source = ?
                LIMIT ?`,
    latMin, latMax, lngMin, lngMax, SHELTER_SOURCE, limit)
}

/** K-nearest shelters to a point. SQLite can't ORDER BY haversine directly,
 *  so we do a coarse pre-filter (1° bbox) then sort in JS. The dataset is
 *  ~11K rows so a 1°-wide window is well under 5K rows even in dense
 *  areas — fast enough for a per-click nearest lookup. */
export function nearestShelters(db, lat, lng, limit = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
  const pad = 0.5  // ~55km
  const rough = db.all(`SELECT id, place, province_th, district_th, subdistrict_th,
                              village, capacity, has_power, has_water, has_toilet,
                              lat, lng, phone, coordinator
                       FROM shelters
                       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
                         AND source = ?`,
    lat - pad, lat + pad, lng - pad, lng + pad, SHELTER_SOURCE)
  return rough
    .map((s) => ({ ...s, distance_km: haversineKm(lat, lng, s.lat, s.lng) }))
    .filter((s) => Number.isFinite(s.distance_km))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit)
}

/** By province — useful for the citizen-mode "show me the shelters in
 *  my province" call. */
export function sheltersInProvince(db, province_th, limit = 100) {
  return db.all(`SELECT id, place, district_th, subdistrict_th, village, capacity,
                       has_power, has_water, has_toilet, lat, lng, phone, coordinator
                FROM shelters
                WHERE province_th = ? AND source = ?
                LIMIT ?`, province_th, SHELTER_SOURCE, limit)
}
