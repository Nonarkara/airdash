// DustBoy — CMU Climate Change Data Center's low-cost sensor network.
//
// WHY THIS IS THE MOST IMPORTANT UNINTEGRATED SOURCE
// --------------------------------------------------
// Air4Thai (PCD) gives us roughly 200 official stations nationwide. For
// national coverage that is adequate. For CHIANG MAI it is close to useless:
// the city has a handful of regulatory stations, and the whole northern
// burning season turns on whether the Mae Mo basin and the Doi Suthep–Doi
// Inthanon ridges are under smoke. DustBoy is a dense low-cost network run
// out of Chiang Mai University specifically to answer that question, with
// stations at a resolution PCD has no hope of matching.
//
// It is also the natural partner to the satellite work. AOD gives coverage
// where sensors are absent; DustBoy gives the ground truth that turns AOD
// into a surface PM2.5 estimate. Right now /api/smoke (FIRMS hotspots x
// upwind wind) tells you fires are burning upwind and /api/forecast tells you
// the model expects it to get worse, and then the only thing that says what
// the air actually IS in the north is a province-level score. DustBoy closes
// that gap at sub-district resolution.
//
// ACCESS
// ------
// The API is open and fully documented at https://open-api.cmuccdc.org/ —
// free registration, no cost, no institutional agreement. Every endpoint
// takes `Authorization: Bearer <token>`. The token is NOT shipped in this
// repository and must be set by the operator:
//
//     launchctl setenv DUSTBOY_TOKEN '<paste your key here>'
//
// Without it this source skips quietly, exactly like the IMERG satellite-rain
// source that also needs a free NASA token. That is deliberate: a missing
// optional key must never be able to fail a boot, and a source that is
// present-but-silent is discoverable in /api/health, whereas a source that
// throws is a nuisance.
//
// ENDPOINTS WE USE (the full catalog is at the docs URL above)
//   GET /api/dustboy/stations          every station's current hourly PM2.5
//   GET /api/dustboy/province          per-province hourly means
//   GET /api/dustboy/station           per-station hourly means
//   GET /api/dustboy/data30day/{id}    30-day history for one station
//
// The response SHAPE is not documented (the worked examples on the docs page
// sit behind the login), so normalizeDustboy() is deliberately permissive: it
// accepts the several plausible envelopes these PHP endpoints emit and picks
// out records by a field-name ladder rather than assuming one schema. That is
// a real compromise and it is called out in the parser — when a key is
// configured the operator should eyeball the first payload (see logShape).

import { CONFIG } from '../config.js'
import { log } from '../util.js'

const BASE = 'https://open-api.cmuccdc.org'

/** Read once at module load. launchctl setenv makes it visible to the
 *  process, so a key added this way survives restarts without editing a file. */
export const DUSTBOY_TOKEN = process.env.DUSTBOY_TOKEN || ''

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * DustBoy is a community/low-cost sensor network, which means the hardware is
 * cheaper and the drift is larger than a PCD reference unit. Published
 * community-sensor practice is to treat a station as suspect outside roughly
 * 0–600 µg/m³ and to sanity-check the shape, so we bound hard here rather than
 * let a failed sensor write a 9999 into the provincial score.
 */
const PM25_MIN = 0
const PM25_MAX = 600

/** Field-name ladder. Thai gov APIs are inconsistent about casing and about
 *  whether they say pm25 / PM25 / pm2_5 / dust. Take the first that parses. */
function pickPm25(rec) {
  for (const k of ['pm25', 'PM25', 'pm2_5', 'pm2.5', 'PM2_5', 'dust', 'value', 'pm25_avg', 'hourly']) {
    const n = num(rec?.[k])
    if (n !== null) return n
  }
  return null
}
function pickId(rec) {
  for (const k of ['id', 'station_id', 'stationId', 'sensor_id', 'code', 'device_id']) {
    const v = rec?.[k]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return null
}
function pickLat(rec) {
  for (const k of ['lat', 'latitude', 'Lat', 'Latitude']) { const n = num(rec?.[k]); if (n !== null) return n }
  return null
}
function pickLng(rec) {
  for (const k of ['lng', 'lon', 'long', 'longitude', 'Lng', 'Longitude']) { const n = num(rec?.[k]); if (n !== null) return n }
  return null
}
function pickTime(rec) {
  for (const k of ['timestamp', 'time', 'datetime', 'date_time', 'last_update', 'updated_at', 'date']) {
    const v = rec?.[k]
    if (v === null || v === undefined || v === '') continue
    const ms = Date.parse(String(v).replace(' ', 'T') + (/[zZ+]|-\d\d:\d\d$/.test(String(v)) ? '' : '+07:00'))
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return null
}
function pickName(rec) {
  for (const k of ['station_name', 'name', 'station_th', 'name_th', 'location', 'site']) {
    const v = rec?.[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

/** Pull the record array out of whichever envelope the endpoint used. */
function unwrap(json) {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []
  for (const k of ['data', 'datas', 'rows', 'result', 'results', 'items', 'records', 'stations', 'payload']) {
    if (Array.isArray(json[k])) return json[k]
  }
  // Some endpoints return { data: { stations: [...] } }
  if (json.data && typeof json.data === 'object') {
    for (const k of ['stations', 'rows', 'items', 'data', 'list']) if (Array.isArray(json.data[k])) return json.data[k]
  }
  return []
}

/**
 * Normalize a DustBoy payload into station rows. Pure, so the unit tests can
 * throw synthetic envelopes at it without a network or a key.
 *
 * Returns { rows, skipped, fields } where `fields` is the key ladder actually
 * used — surfaced in the log on the first successful run so the permissive
 * parser can be tightened against a real payload rather than left as a guess.
 */
export function normalizeDustboy(json) {
  const recs = unwrap(json)
  const rows = []
  let skipped = 0
  const fields = new Set()
  for (const rec of recs) {
    if (!rec || typeof rec !== 'object') { skipped++; continue }
    const pm25 = pickPm25(rec)
    const id = pickId(rec)
    if (pm25 === null || id === null) { skipped++; continue }
    fields.add('pm25')
    // Out of range: a failed low-cost sensor, not an air-quality event. Drop
    // it rather than store a number that would distort a province mean.
    if (pm25 < PM25_MIN || pm25 > PM25_MAX) { skipped++; continue }
    const lat = pickLat(rec); const lng = pickLng(rec)
    if (lat !== null) fields.add('lat')
    if (lng !== null) fields.add('lng')
    const obs = pickTime(rec)
    if (obs) fields.add('time')
    const name = pickName(rec)
    if (name) fields.add('name')
    rows.push({
      station_key: id,
      name: name ?? `DustBoy ${id}`,
      lat, lng,
      pm25,
      obs_time: obs,
    })
  }
  return { rows, skipped, fields: [...fields] }
}

async function dustboyFetch(path, { timeoutMs = 25_000 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'application/json',
      // A token is required for every documented endpoint. Send it even if
      // empty so the failure is a clean 401/403 we can report, not a
      // confusing shape error from a public-only route.
      authorization: `Bearer ${DUSTBOY_TOKEN}`,
      'user-agent': 'AirDash/2.4 (public air-quality dashboard)',
    },
  })
  if (!res.ok) throw new Error(`DustBoy ${path} → HTTP ${res.status}`)
  return res.json()
}

export default {
  name: 'dustboy',
  label_th: 'DustBoy (มหาวิทยาลัยเชียงใหม่) — เครือข่ายเซ็นเซอร์ฝุ่นภาคเหนือ',
  label_en: 'DustBoy (Chiang Mai University) — dense northern Thailand sensor network',
  intervalMs: CONFIG.intervals.dustboy ?? 60 * 60_000, // hourly, same as PCD
  enabled: true,
  version: 1, // bump when the parser changes → runs at next boot

  async run({ db }) {
    if (!DUSTBOY_TOKEN) {
      // Skip quietly, like the IMERG token-gated source. The scheduler logs
      // this once per boot; /api/health shows the source as idle so the gap
      // is visible rather than invisible.
      log('info', 'dustboy: no DUSTBOY_TOKEN set — skipping (see server/sources/dustboy.js for the one-time request)')
      return { seen: 0, added: 0, skipped_no_token: true }
    }

    const json = await dustboyFetch('/api/dustboy/stations')
    const { rows, skipped, fields } = normalizeDustboy(json)
    if (!rows.length) {
      log('warn', 'dustboy: payload produced no usable rows', { skipped, fields })
      return { seen: 0, added: 0 }
    }
    // Log which field ladder resolved, once, so the permissive parser can be
    // replaced with a strict one against a real payload.
    log('info', 'dustboy: normalised', { stations: rows.length, skipped, fields: fields.join(',') })

    const fetched_at = new Date().toISOString()
    let added = 0
    db.tx(() => {
      for (const r of rows) {
        const station = {
          source: 'dustboy',
          now: fetched_at,
          station_key: r.station_key,
          name_th: r.name,
          name_en: r.name,
          province_th: null, province_en: null, province_code: null,
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: r.lat, lng: r.lng,
          meta_json: JSON.stringify({ source: 'open-api.cmuccdc.org', network: 'dustboy' }),
        }
        db.upsertStation(station)
        // obs_time is the upstream observation when DustBoy supplies one and
        // the fetch time otherwise — never invent an observation time, and
        // never back-date to a stale reading.
        const obs = r.obs_time ?? fetched_at
        if (db.insertReading({
          source: 'dustboy', station_key: r.station_key, metric: 'pm25',
          value: r.pm25, obs_time: obs, fetched_at,
        })) added++
      }
    })
    return { seen: rows.length, added }
  },
}
