// NASA AERONET (Aerosol Robotic Network) — ground sunphotometer AOD,
// the gold-standard reference for satellite aerosol retrieval validation.
//
// WHY THIS SOURCE EXISTS. Everything else on this dashboard that says
// "AOD 0.4 over Thailand today" is a SATELLITE inference — MODIS, VIIRS,
// Himawari-9, OMPS. None of them are measuring AOD directly; they are
// inferring it from reflected sunlight at one or two channels and
// guessing at the rest. AERONET ground instruments are different: a
// sunphotometer points straight at the sun and measures how much light
// each wavelength loses going through the atmosphere, which gives a
// DIRECT measurement of column aerosol optical depth. It is the only
// feed on this dashboard whose value is not a model output.
//
// For PM2.5 work specifically: AERONET AOD is the cross-check that
// keeps the satellite AOD layer honest. If Silpakorn University (Bangkok)
// reads 0.42 AOD at 440 nm this morning and MODIS Aqua says 0.18, one
// of them is wrong, and the answer usually lives in cloud contamination
// or surface reflectance assumptions — but you cannot tell which without
// the ground point. We log this gap as a deliberate piece of the
// dashboard's honesty story, not as a bug.
//
// NO API KEY. Verified 2026-09-27: the print_web_data_v3 CGI endpoint
// returns a complete CSV with no auth header and no rate limit at
// human-poll cadence. Eight Thailand stations exist on AERONET's
// global list (Chiang Mai, Chiang Mai Met Sta, Chiang Dao, Bangkok,
// Silpakorn Univ, Songkhla Met Sta, Ubon Ratchathani); we probe each
// and only ingest the ones that actually respond with real readings,
// so a station that stopped reporting 2022-08-15 does not turn into a
// "0.00 AOD forever" ghost dot on the map.
//
// CADENCE. Daily. AERONET L1.5 is published with a 1-day lag and is
// "near-real-time but not realtime" — once per afternoon is plenty.
// Six stations is enough work that this would matter if it were hourly,
// so daily is the right answer.
import { CONFIG } from '../config.js'

const BASE = 'https://aeronet.gsfc.nasa.gov/cgi-bin/print_web_data_v3'

// All Thailand stations, lat/lng pinned from
// https://aeronet.gsfc.nasa.gov/aeronet_locations.txt (verified 2026-09-27).
// Bangkok and Silpakorn_Univ are kept distinct on purpose: Silpakorn
// University (Serm Janjai PI) is a rooftop-instrument site in Nakhon
// Pathom province west of Bangkok, NOT a Bangkok-district site, and
// the upstream distinguishes them by name.
const STATIONS = [
  { code: 'Chiang_Mai',         th: 'เชียงใหม่',         en: 'Chiang Mai',            lat: 18.813333, lng: 98.986944 },
  { code: 'Chiang_Mai_Met_Sta', th: 'เชียงใหม่ (สถานีอุตุ)', en: 'Chiang Mai (Meteorological Station)', lat: 18.771125, lng: 98.972467 },
  { code: 'Chiang_Dao',         th: 'เชียงดาว',         en: 'Chiang Dao',            lat: 19.360000, lng: 98.961400 },
  { code: 'Bangkok',            th: 'กรุงเทพ',           en: 'Bangkok',               lat: 13.666310, lng: 100.606935 },
  { code: 'Silpakorn_Univ',     th: 'ม.ศิลปากร',         en: 'Silpakorn University',  lat: 13.819308, lng: 100.041183 },
  { code: 'Songkhla_Met_Sta',   th: 'สงขลา (สถานีอุตุ)', en: 'Songkhla (Meteorological Station)', lat: 7.184387, lng: 100.604583 },
  { code: 'Ubon_Ratchathani',   th: 'อุบลราชธานี',       en: 'Ubon Ratchathani',      lat: 15.245518, lng: 104.871011 },
]

// AERONET's data is published one day late. We pull yesterday's whole
// day (UTC) — that catches the most recent quality-controlled L1.5
// snapshot. Going further back is the job of the historical sources,
// not this live pull.
function rangeUtcDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
  }
}

function buildUrl(site, days) {
  const end = rangeUtcDaysAgo(days)
  const start = rangeUtcDaysAgo(days + 3)   // 3-day rolling window keeps the
                                            //   table warm even if a single
                                            //   nightly pull fails
  const p = new URLSearchParams({
    site,
    year: String(start.y), month: String(start.m), day: String(start.d),
    year2: String(end.y), month2: String(end.m), day2: String(end.d),
    // AOD15 = Level 1.5 (cloud-screened, near-real-time). This used to send
    // AOD20=1 — Level 2.0, final calibration, published MONTHS late — plus a
    // `level` param the API ignores, so every recent window came back empty.
    AOD15: '1',
    AVG: '10',            // all points (10); 20 = daily averages
    // Without this the v3 API wraps the CSV in HTML and the header search
    // below never matches: the feed reported "ok, 0 rows" since it shipped
    // (2026-09-28 audit).
    if_no_html: '1',
  })
  return `${BASE}?${p.toString()}`
}

// AERONET CSV has a 4-line preamble (title, version block, contact,
// "The following data are…" prose) then the header. The header line is
// the first one that starts with "AERONET_Site,Date(...)". Everything
// before it is decorative.
function parseCsv(text) {
  const lines = text.split(/\r?\n/)
  let headerIdx = -1
  for (let i = 0; i < lines.length && i < 40; i++) {
    if (lines[i].startsWith('AERONET_Site,')) { headerIdx = i; break }
  }
  if (headerIdx < 0) return { rows: [], columns: [] }

  const head = lines[headerIdx].split(',')
  const idx = (n) => head.indexOf(n)
  const iDate  = idx('Date(dd:mm:yyyy)')
  const iTime  = idx('Time(hh:mm:ss)')
  const iA440  = idx('AOD_440nm')
  const iA500  = idx('AOD_500nm')
  const iA675  = idx('AOD_675nm')
  const iA870  = idx('AOD_870nm')
  const iA1020 = idx('AOD_1020nm')
  const iPW    = idx('Precipitable_Water(cm)')
  if (iDate < 0 || iTime < 0) return { rows: [], columns: head }

  const numOrNull = (v) => {
    if (v === undefined || v === null || v === '' || v === 'N/A' || v === '-999.0') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = lines[i].split(',')
    if (c.length !== head.length) continue
    const date = c[iDate]?.trim()
    const time = c[iTime]?.trim()
    if (!date || !time) continue
    // Date is dd:mm:yyyy and Time is hh:mm:ss — combine into a real
    // ISO. AERONET's dates are UTC (the CSV header says so).
    const [dd, mm, yy] = date.split(':')
    if (!dd || !mm || !yy) continue
    const iso = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${time}Z`
    rows.push({
      ts: iso,
      aod_440: numOrNull(c[iA440]),
      aod_500: numOrNull(c[iA500]),
      aod_675: numOrNull(c[iA675]),
      aod_870: numOrNull(c[iA870]),
      aod_1020: numOrNull(c[iA1020]),
      precipitable_water_cm: numOrNull(c[iPW]),
    })
  }
  return { rows, columns: head }
}

async function fetchSite(site) {
  const url = buildUrl(site, 1)
  const ctl = AbortSignal.timeout(45_000)
  const r = await fetch(url, { signal: ctl, headers: { accept: 'text/csv,*/*' } })
  // AERONET returns 200 with the empty-help page when no data matches;
  // we count that as "0 readings" rather than an error so a station
  // that has temporarily gone offline does not page the watcher.
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${site}`)
  const text = await r.text()
  const { rows } = parseCsv(text)
  return rows
}

export default {
  name: 'aeronet',
  version: 2, // bump when the fetch/parse logic changes → runs at next boot
  label_th: 'AERONET (ภาคพื้นดิน — สอบเทียบดาวเทียม)',
  label_en: 'AERONET (ground truth — satellite calibration)',
  intervalMs: CONFIG.intervals.aeronet ?? 24 * 3600_000,
  enabled: true,

  async run({ db }) {
    const fetched_at = new Date().toISOString()
    let totalAdded = 0
    let sitesWithData = 0

    for (const site of STATIONS) {
      let rows
      try { rows = await fetchSite(site.code) }
      catch (e) { continue }   // one dead station must not break the run
      if (rows.length === 0) continue
      sitesWithData += 1

      db.tx(() => {
        for (const r of rows) {
          const res = db.run(
            `INSERT OR REPLACE INTO aeronet_readings
               (station, ts, aod_440, aod_500, aod_675, aod_870, aod_1020,
                precipitable_water_cm, fetched_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            site.code, r.ts, r.aod_440, r.aod_500, r.aod_675, r.aod_870, r.aod_1020,
            r.precipitable_water_cm, fetched_at,
          )
          totalAdded += res?.changes ?? 0
        }
      })
    }

    return { seen: sitesWithData, added: totalAdded }
  },
}

// Re-export the station registry so the /api/aeronet endpoint and any
// future UI surface can list the active sites without re-deriving them.
export { STATIONS as AERONET_STATIONS }
