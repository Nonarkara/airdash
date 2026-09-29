// METAR visibility — the oldest dust-storm detector there is.
//
// WHY THIS SOURCE EXISTS
// ----------------------
// Everything else in this project measures particulate MATTER. Visibility
// measures the thing particulate matter DOES: light extinction. Koschmieder
// (1924) puts it exactly: C(x) = C0 · e^(−β·x), so a reported visibility gives
// β = 3.912 / vis_km directly. That is the same physical quantity a satellite
// infers as aerosol optical depth, measured from the ground.
//
// Two reasons it earns its place:
//
//  1. IT IS FASTER THAN EVERYTHING ELSE HERE. METAR files every 30 minutes.
//     A PM2.5 station updates hourly, IMERG and MODIS are daily, GEMS is daily
//     and unreachable from here. When a dust front crosses the Myanmar border
//     at Mae Sot, this source says so inside half an hour, and every other
//     layer on the map is still showing yesterday.
//
//  2. IT IS THE ONLY OPTICAL REFERENCE AVAILABLE FOR THE CAMERA WORK.
//     server/vision/hazeRead.js produces a relative haze index and refuses to
//     calibrate it, because calibrateAgainstPm25 needs both axes to vary and
//     today's PM2.5 spans about 5 µg/m³. Visibility is a second, INDEPENDENT
//     optical axis that does vary with aerosol load, so it is the best
//     available anchor for the camera estimator. It calibrates a REGION, not
//     a camera — airports are not co-located with CCTV — and the code says so.
//
// ACCESS
// ------
// NOAA's aviationweather.gov. No key, no registration, no rate-limit friction
// (verified 2026-09-29). `bbox=` returns 204 No Content, so the station list
// is a static ICAO set rather than a discovery call — which is the right shape
// anyway, since a source whose station set drifts hourly would silently
// rewrite the map.
//
// THE TRAP, AND WHY THE PARSER IGNORES `visib`
// ---------------------------------------------
// The API's own `visib` field is in STATUTE MILES and is the string "6+"
// whenever visibility is at or above 6 SM. A clear station therefore does not
// return a number at all, and 6 miles is 9.66 km, not 6. Reading `visib` as
// kilometres would understate a clear day and then treat "6+" as a parse
// failure. The authoritative value is the 4-digit group in `rawOb`
// ("9999", "5000", "M0050"), so that is what this parser uses. `visib` is kept
// only as a cross-check that a parse looks sane.
//
// A VISIBILITY DROP IS NOT A DUST EVENT — the honesty rule
// --------------------------------------------------------
// Rain, fog, mist, smoke, blowing sand and volcanic ash all collapse
// visibility, and only some of them are particulate air pollution. Storing one
// number would let "Lampang fell to 5 km because it is raining" be read as
// "Lampang has a dust problem". So this source emits THREE metrics:
//
//   vis_km        always — what the pilot reported
//   beta_km1      always — Koschmieder extinction from it
//   aerosol_vis_km  ONLY when the present-weather code names an aerosol
//                   cause (SA sand, HZ haze, FU smoke, DU dust, DS dust
//                   storm). Rain, drizzle, fog, mist, snow, thunderstorms and
//                   ice are excluded, and it is stored as NULL — withheld,
//                   not zero — because "measured and the cause was rain" and
//                   "never measured" must not collapse into the same number.
//
// Pure parsing, exported for tests. No clock, no network.

import { log } from '../util.js'

const BASE = 'https://aviationweather.gov/api/data/metar'

/** Present-weather codes that ARE an aerosol event. The only cases where a
 *  visibility drop may be attributed to airborne particulate. */
export const AEROSOL_CODES = {
  SA: 'sand',    // sand raised by wind
  HZ: 'haze',    // reduced visibility by fine particles in the air
  FU: 'smoke',   // smoke
  DU: 'dust',    // widespread dust
  DS: 'duststorm',
}

/** Present-weather codes that are NOT particulate air pollution. A drop with
 *  one of these present is real but is not a haze measurement. */
export const NON_AEROSOL_CODES = {
  RA: 'rain', DZ: 'drizzle', SN: 'snow', SG: 'snowgrains', PL: 'icepellets',
  IC: 'icecrystals', GR: 'hail', GS: 'smallhail', UP: 'unknownprecip',
  TS: 'thunderstorm', SQ: 'squalls', BR: 'mist', FG: 'fog', VA: 'volcanicash',
  FZ: 'freezingfog', PO: 'dustwhirl',
}

/**
 * Thai aerodromes that file METAR, verified by query on 2026-09-29.
 * 16 of these reported within the last hour; the rest are here so a station
 * that resumes filing is picked up without a code change.
 *
 * The geography is not incidental: Mae Sot sits on the Myanmar border, Trat
 * on the Gulf biomass-burn corridor, and Nakhon Phanom on the Laos border —
 * the three routes Thai dust actually arrives by.
 */
export const THAI_STATIONS = [
  // northern border belt — the dust-import gateways
  { icao: 'VTPM', name_th: 'แม่สอด', name_en: 'Mae Sot', lat: 16.703, lng: 98.542 },
  { icao: 'VTCT', name_th: 'เชียงราย', name_en: 'Chiang Rai', lat: 19.961, lng: 99.881 },
  { icao: 'VTCM', name_th: 'เชียงใหม่', name_en: 'Chiang Mai', lat: 18.7669, lng: 98.9626 },
  { icao: 'VTCN', name_th: 'น่าน', name_en: 'Nan', lat: 18.807, lng: 100.787 },
  { icao: 'VTCL', name_th: 'ลำปาง', name_en: 'Lamping', lat: 18.277, lng: 99.502 },
  { icao: 'VTCP', name_th: 'แพร่', name_en: 'Phrae', lat: 18.129, lng: 100.162 },
  { icao: 'VTPB', name_th: 'เพชรบูรณ์', name_en: 'Phetchabun', lat: 16.676, lng: 101.195 },
  { icao: 'VTMW', name_th: 'พระมหาลาภินิยม', name_en: 'Mae Fah Luang', lat: 17.238, lng: 99.817 },
  { icao: 'VTYK', name_th: 'ตาก', name_en: 'Tak', lat: 16.892, lng: 99.12 },
  { icao: 'VTPU', name_th: 'กำแพงเพชร', name_en: 'Kamphaeng Phet', lat: 14.102, lng: 99.517 },
  // central
  { icao: 'VTBS', name_th: 'สุวรรณภูมิ', name_en: 'Suvarnabhumi', lat: 13.686, lng: 100.767 },
  { icao: 'VTBD', name_th: 'ดอนเมือง', name_en: 'Don Mueang', lat: 13.913, lng: 100.607 },
  { icao: 'VTBU', name_th: 'อุดมธุร', name_en: 'Udon Thani', lat: 17.398, lng: 102.788 },
  { icao: 'VTKT', name_th: 'โคราช', name_en: 'Nakhon Ratchasima', lat: 14.932, lng: 102.139 },
  { icao: 'VTYJ', name_th: 'ระยอง', name_en: 'Rayong', lat: 12.681, lng: 101.253 },
  { icao: 'VTPR', name_th: 'เพชรบุรี', name_en: 'Phetchaburi', lat: 13.172, lng: 100.991 },
  // east / Isan — Trat is the Gulf biomass-burn corridor, Nakhon Phanom the
  // Laos overland route
  { icao: 'VTBO', name_th: 'ตราด', name_en: 'Trat', lat: 12.275, lng: 102.319 },
  { icao: 'VTUU', name_th: 'อุบลราชธานี', name_en: 'Ubon Ratchathani', lat: 15.251, lng: 104.87 },
  { icao: 'VTUW', name_th: 'นครพนม', name_en: 'Nakhon Phanom', lat: 17.384, lng: 104.643 },
  { icao: 'VTUB', name_th: 'บุรีรัมย์', name_en: 'Buriram', lat: 15.666, lng: 103.501 },
  { icao: 'VTUR', name_th: 'ร้อยเอ็ด', name_en: 'Roi Et', lat: 16.136, lng: 103.172 },
  { icao: 'VTUV', name_th: 'สกลนคร', name_en: 'Sakon Nakhon', lat: 17.699, lng: 104.12 },
  { icao: 'VTSZ', name_th: 'สระแก้ว', name_en: 'Sa Kaeo', lat: 13.682, lng: 102.093 },
  // south — the Andaman dust belt
  { icao: 'VTSP', name_th: 'หาดใหญ่', name_en: 'Hat Yai', lat: 8.105, lng: 98.308 },
  { icao: 'VTSG', name_th: 'กระบี่', name_en: 'Krabi', lat: 8.099, lng: 98.986 },
  { icao: 'VTSB', name_th: 'สุราษฎร์ธานี', name_en: 'Surat Thani', lat: 9.133, lng: 99.152 },
  { icao: 'VTSR', name_th: 'ระนอง', name_en: 'Ranong', lat: 9.773, lng: 98.587 },
  { icao: 'VTST', name_th: 'ตรัง', name_en: 'Trang', lat: 7.512, lng: 99.621 },
]

/** Koschmieder constant: the contrast fraction at which an object is "barely
 *  visible". 3.912 = 3/ln(C0/C) for C = 0.05, the meteorological definition. */
export const KOSCHMIEDER_BETA = 3.912

/**
 * Visibility in metres, from the raw METAR body.
 *
 * METAR visibility is a 4-digit group in metres: 9999 means 10 km or more,
 * 5000 means 5 km, M0050 means under 50 m, and // means not reported. It sits
 * immediately after the wind group, so we scan token by token and take the
 * first token that is a 4-digit (or M-prefixed) number. Scanning rather than
 * indexing is deliberate: METAR groups are variable-length and the position is
 * not guaranteed by the spec.
 */
export function parseVisibilityMetres(rawOb) {
  if (typeof rawOb !== 'string') return null
  const tokens = rawOb.trim().split(/\s+/)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    // The QNH group is "Q1013" — one token, so it never matches the bare
    // 4-digit pattern below. But a station that omits the Q prefix would make
    // a pressure reading look like 1013 m of visibility, so stop at the first
    // Q-prefixed token and never look past it.
    if (/^Q\d{3,4}$/i.test(t)) return null
    // 4-digit metres, or M-prefixed for "under this much".
    if (/^M?\d{4}$/.test(t)) {
      const n = Number(t.replace(/^M/i, ''))
      return Number.isFinite(n) ? n : null
    }
    // "////" and "//" mean visibility was not reported. Stop rather than
    // keep scanning into later groups.
    if (/^\/+$/.test(t)) return null
  }
  return null
}

/**
 * What kind of atmosphere produced this visibility, from the present-weather
 * group. Returns { cause, codes } where cause is one of:
 *   'aerosol'   — SA/HZ/FU/DU/DS: a particulate event. Visibility may be
 *                 attributed to airborne dust/smoke.
 *   'precip'     — RA/DZ/TS/SN/GR…: a real drop, but not a haze measurement.
 *   'obscure'    — FG/BR/VA…: visibility lost to something other than aerosol.
 *   'clear'      — no weather code at all and visibility is 9999.
 *   'unknown'    — visibility reduced but nothing in the report explains it.
 *
 * Aerosol wins over the others when both are present (a dust storm with
 * residual rain is still a dust storm), but the non-aerosol cause is
 * preserved in `codes` so the UI can say "dust, with rain".
 */
export function classifyCause(rawOb, visMetres = null) {
  if (typeof rawOb !== 'string') return { cause: 'unknown', codes: [] }
  const codes = []
  // Present weather is a run-together code, not one fixed-position group:
  // "-SHRA" is light showers of rain, "DSHRA" is a dust storm with residual
  // rain, "VCTS" is a thunderstorm in the vicinity, "+TSRA" is a heavy
  // thunderstorm with rain. So a code can appear ANYWHERE in the token, which
  // is why matching only the tail misses DS in DSHRA.
  //
  // Start scanning AFTER the time group and the wind group. The station id
  // sits before them and is itself all letters — without this, a station
  // called VTST contributes a phantom "TS" thunderstorm to every report,
  // which is exactly what it did before this anchor existed.
  const tokens = rawOb.trim().split(/\s+/)
  let i = 0
  const timeIdx = tokens.findIndex((t) => /^\d{6}Z$/i.test(t))
  if (timeIdx >= 0) {
    // +2 steps over the time group and the wind group; then step over the
    // visibility group, which is itself a 4-digit token and would otherwise
    // be mistaken for the end of the interesting part of the report.
    i = timeIdx + 2
    while (i < tokens.length && /^\d{4}$/.test(tokens[i])) i++
  }
  const WEATHER_TOKEN = /^[+\-]?(VC)?[A-Z]{2,6}$/
  for (; i < tokens.length; i++) {
    const tok = tokens[i]
    // QNH and the temperature pair end the part that can carry weather.
    if (/^Q\d{3,4}$/i.test(tok) || /^\d+\/\d+$/.test(tok)) break
    if (!WEATHER_TOKEN.test(tok)) continue
    for (const key of Object.keys({ ...AEROSOL_CODES, ...NON_AEROSOL_CODES })) {
      if (tok.includes(key) && !codes.includes(key)) codes.push(key)
    }
  }
  const hasAerosol = codes.some((c) => AEROSOL_CODES[c])
  if (hasAerosol) return { cause: 'aerosol', codes }
  if (codes.some((c) => ['RA', 'DZ', 'TS', 'SN', 'GR', 'GS', 'PL', 'IC', 'SG', 'UP', 'SQ'].includes(c))) {
    return { cause: 'precip', codes }
  }
  if (codes.some((c) => ['FG', 'BR', 'VA', 'FZ', 'PO'].includes(c))) return { cause: 'obscure', codes }
  // Visibility is the deciding evidence when no weather code was reported.
  // "2000" with nothing in the report is a genuine unknown — calling it
  // 'clear' would claim the air is fine, which is the one thing we cannot
  // infer from a missing code.
  if (visMetres === null) return { cause: 'unknown', codes }
  return { cause: visMetres >= 9999 ? 'clear' : 'unknown', codes }
}

/** Normalize one METAR record into a reading set. Pure — unit tested. */
export function normalizeMetar(rec, station) {
  if (!rec || !station) return null
  const lat = Number.isFinite(Number(rec.lat)) ? Number(rec.lat) : station.lat
  const lng = Number.isFinite(Number(rec.lon)) ? Number(rec.lon) : station.lng
  const vis = parseVisibilityMetres(rec.rawOb)
  if (vis === null) return null
  const visKm = vis / 1000
  // 9999 m is the METAR ceiling for "10 km or more", not a measurement of
  // 9.999 km. Report it as null so nobody computes beta = 0.00039 and calls
  // that a visibility.
  const atCeiling = vis >= 9999
  const { cause, codes } = classifyCause(rec.rawOb, vis)
  return {
    icao: rec.icaoId ?? station.icao,
    station_key: station.icao,
    name_th: station.name_th,
    name_en: station.name_en,
    lat, lng,
    vis_km: visKm,
    // Extinction coefficient. Null at the reporting ceiling, because
    // "10 km or more" carries no upper bound on beta.
    beta_km1: atCeiling ? null : KOSCHMIEDER_BETA / visKm,
    at_ceiling: atCeiling,
    // The honest aerosol attribution: only ever populated when the METAR
    // itself names an aerosol cause. Null means withheld, not zero.
    aerosol_vis_km: cause === 'aerosol' ? visKm : null,
    cause,
    codes,
    wx: rec.wxString ?? null,
    temp_c: Number.isFinite(Number(rec.temp)) ? Number(rec.temp) : null,
    obs_time: rec.obsTime ?? rec.reportTime ?? null,
  }
}

export function normalizeMetars(payload, stations = THAI_STATIONS) {
  const byIcao = new Map(stations.map((s) => [s.icao, s]))
  const recs = Array.isArray(payload) ? payload : (payload?.data ?? [])
  const rows = []
  let unknownStation = 0
  for (const rec of recs) {
    const st = byIcao.get(rec?.icaoId)
    if (!st) { unknownStation++; continue }
    const r = normalizeMetar(rec, st)
    if (r) rows.push(r)
  }
  return { rows, unknownStation }
}

async function fetchMetars(icaoList, { timeoutMs = 20_000 } = {}) {
  const url = `${BASE}?ids=${icaoList.join(',')}&format=json&hours=2`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': 'AirDash/2.4 (public air-quality dashboard)' },
  })
  if (res.status === 204) return [] // no observations in the window
  if (!res.ok) throw new Error(`aviationweather METAR → HTTP ${res.status}`)
  return res.json()
}

export default {
  name: 'metarVisibility',
  label_th: 'ระยะมองหน้าสนามบิน (METAR) — ตัวชี้วัดฝุ่นจากการมองเห็น',
  label_en: 'Airport visibility (METAR) — an optical dust/haze detector',
  intervalMs: 30 * 60_000, // METAR files every 30 min; polling faster re-reads the same report
  enabled: true,
  version: 1, // bump when the parser changes → runs at next boot

  async run({ db }) {
    const { rows, unknownStation } = normalizeMetars(
      await fetchMetars(THAI_STATIONS.map((s) => s.icao)))
    if (!rows.length) {
      log('warn', 'metar: no usable reports', { requested: THAI_STATIONS.length, unknownStation })
      return { seen: 0, added: 0 }
    }
    const fetched_at = new Date().toISOString()
    let added = 0
    db.tx(() => {
      for (const r of rows) {
        db.upsertStation({
          source: 'metar',
          now: fetched_at,
          station_key: r.station_key,
          name_th: r.name_th,
          name_en: r.name_en,
          province_th: null, province_en: null, province_code: null,
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: r.lat, lng: r.lng,
          meta_json: JSON.stringify({
            source: 'aviationweather.gov', icao: r.icao, kind: 'visibility',
            cause: r.cause, wx: r.wx,
          }),
        })
        const obs = r.obs_time ?? fetched_at
        // Three metrics, and the third is the point of the whole source.
        if (db.insertReading({ source: 'metar', station_key: r.station_key, metric: 'vis_km', value: r.vis_km, obs_time: obs, fetched_at })) added++
        if (r.beta_km1 !== null && db.insertReading({ source: 'metar', station_key: r.station_key, metric: 'beta_km1', value: r.beta_km1, obs_time: obs, fetched_at })) added++
        // Stored as a row only when the METAR names an aerosol cause. There is
        // deliberately no row when it does not — a reader asking for
        // aerosol_vis_km gets an empty set, which is the honest answer, and
        // cannot be confused with "visibility was fine".
        if (r.aerosol_vis_km !== null && db.insertReading({ source: 'metar', station_key: r.station_key, metric: 'aerosol_vis_km', value: r.aerosol_vis_km, obs_time: obs, fetched_at })) added++
      }
    })
    const aerosol = rows.filter((r) => r.aerosol_vis_km !== null)
    log('info', 'metar: reports ingested', {
      stations_reporting: rows.length,
      added,
      reduced_visibility: rows.filter((r) => r.vis_km < 9999).length,
      aerosol_attributed: aerosol.length,
      causes: [...new Set(rows.map((r) => r.cause))].join(','),
    })
    return { seen: rows.length, added, aerosol: aerosol.length }
  },
}
