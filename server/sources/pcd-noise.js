// PCD (กรมควบคุมมลพิษ) noise pollution monitoring — the only public
// real-time network of Leq stations in Thailand. 27 semi-permanent
// stations across Bangkok, the perimeter, and the major industrial
// provinces (Chiang Mai, Rayong, Phuket, Songkhla, Korat, Khon Kaen,
// Saraburi). Published via noisemonitor.net (the "Noise4Thai" site
// behind the Sound24Thai app).
//
// Each station page returns an HTML document with a Highcharts config
// block that embeds the daily Leq series as a JavaScript array:
//   var LeqDayInMonth = [[ts_ms, leq_dB, sample_count], ...]
// The last entry is the most recent completed 24h window. We store
// that as `noise_leq_db` for the live point and keep the prior day's
// value as `noise_leq_prev_db` so the UI can show a 24h delta.
//
// For the Danger Score we aggregate per province by taking the
// MAXIMUM Leq across stations (worst-case exposure within the
// province). Bangkok's 7 stations are aggregated to a single per-
// province reading; Rayong's 4 stations likewise.
//
// Cadence: 30 min. PCD refreshes daily; sub-hourly polling lets us
// catch the morning rollover without re-hammering the upstream.
import { CONFIG } from '../config.js'
import { num, nowLocal } from '../util.js'
import { storeReadings } from './thaiwater-common.js'
import { provinceByName } from '../provinces.js'

const BASE = 'http://noisemonitor.net/web/station.php'
const TIMEOUT_MS = 12_000

// 27 PCD noise monitoring stations. Each maps to a province so the
// Danger Score can fold noise into the per-province composite. The
// station IDs come from noisemonitor.net's <select>; the province
// mapping was audited against the official station locations
// (Bangkok districts, perimeter, and provincial sites).
const STATIONS = [
  // Bangkok — 7 stations across districts.
  { id: 'ns01', name_th: 'พาหุรัด',                          name_en: 'Phahurat',                 province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st09', name_th: 'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)', name_en: 'Bodindecha (Singha)',    province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st10', name_th: 'การเคหะชุมชนคลองจั่น',              name_en: 'Khlong Chan Community',    province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st12', name_th: 'โรงเรียนนนทรีวิทยา',                name_en: 'Nonthaburi Wittaya',       province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st52', name_th: 'สถานีไฟฟ้าย่อยธนบุรี',             name_en: 'Thonburi Substation',      province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st53', name_th: 'สถานีตำรวจนครบาลโชคชัย',          name_en: 'Chokchai Police',          province_th: 'กรุงเทพมหานคร', province_code: '10' },
  { id: 'st54', name_th: 'การเคหะชุมชนดินแดง',               name_en: 'Din Daeng Community',      province_th: 'กรุงเทพมหานคร', province_code: '10' },
  // Perimeter — 5 stations.
  { id: 'ns05', name_th: 'ศาลากลางจังหวัดสมุทรปราการ',     name_en: 'Samut Prakan Hall',         province_th: 'สมุทรปราการ', province_code: '11' },
  { id: 'st22', name_th: 'มหาวิทยาลัยสุโขทัยธรรมาธิราช',     name_en: 'STOU Pak Kret',             province_th: 'นนทบุรี',     province_code: '12' },
  { id: 'ns04', name_th: 'โรงเรียนปทุมวิไล',                 name_en: 'Pathumwilai School',        province_th: 'ปทุมธานี',   province_code: '13' },
  { id: 'st20', name_th: 'มหาวิทยาลัยกรุงเทพ วิทยาเขตรังสิต', name_en: 'Bangkok U. Rangsit',        province_th: 'ปทุมธานี',   province_code: '13' },
  { id: 'st14', name_th: 'แขวงการทางสมุทรสาคร',             name_en: 'Samut Sakhon Highway',      province_th: 'สมุทรสาคร',   province_code: '74' },
  { id: 'ns06', name_th: 'มหาวิทยาลัยราชภัฏนครปฐม',         name_en: 'Nakhon Pathom Rajabhat',    province_th: 'นครปฐม',     province_code: '73' },
  // Saraburi — 3 stations.
  { id: 'ns02', name_th: 'อบต.หน้าพระลาน',                   name_en: 'Na Phra Lan TAO',          province_th: 'สระบุรี',     province_code: '19' },
  { id: 'ns03', name_th: 'วัดถ้ำศรีวิไล',                     name_en: 'Tham Sri Wilai',           province_th: 'สระบุรี',     province_code: '19' },
  { id: 'st24', name_th: 'สภ.หน้าพระลาน',                    name_en: 'Na Phra Lan Police',        province_th: 'สระบุรี',     province_code: '19' },
  // Rayong (industrial east) — 4 stations.
  { id: 'st25', name_th: 'สถานีดับเพลิงเขาน้อย',             name_en: 'Khao Noi Fire Station',     province_th: 'ระยอง',       province_code: '21' },
  { id: 'st29', name_th: 'รพ.สต.มาบตาพุด',                   name_en: 'Map Ta Phut Health',        province_th: 'ระยอง',       province_code: '21' },
  { id: 'st33', name_th: 'รพ.สต.บ้านเขาหิน',                 name_en: 'Ban Khao Hin Health',       province_th: 'ระยอง',       province_code: '21' },
  { id: 'st34', name_th: 'สำนักงานควบคุมมลพิษที่ 13',          name_en: 'PCD Regional Office 13',   province_th: 'ระยอง',       province_code: '21' },
  // Provincial — 6 stations.
  { id: 'st35', name_th: 'ศูนย์ราชการจังหวัดเชียงใหม่',     name_en: 'Chiang Mai Gov Center',     province_th: 'เชียงใหม่',   province_code: '50' },
  { id: 'st36', name_th: 'โรงเรียนยุพราชวิทยาลัย',            name_en: 'Yupparaj Wittayalai',      province_th: 'เชียงใหม่',   province_code: '50' },
  { id: 'st43', name_th: 'กองการแพทย์ เทศบาลนครภูเก็ต',      name_en: 'Phuket City Medical',       province_th: 'ภูเก็ต',       province_code: '83' },
  { id: 'st44', name_th: 'เทศบาลนครหาดใหญ่',                 name_en: 'Hat Yai City Hall',         province_th: 'สงขลา',       province_code: '90' },
  { id: 'st46', name_th: 'ส่วนอุทกวิทยา สำนักงานทรัพยากรน้ำ ภาค 4', name_en: 'Hydrology Region 4',    province_th: 'ขอนแก่น',     province_code: '40' },
  { id: 'st47', name_th: 'โรงสูบน้ำเสียเทศบาลนครนครราชสีมา',  name_en: 'Korat Wastewater Pump',     province_th: 'นครราชสีมา', province_code: '30' },
]

/** Extract the LeqDayInMonth series from the station HTML.
 *  Pattern: `var LeqDayInMonth = [[ts, db, n], [ts, db, n], ...];`
 *  Each entry is [unix_ms, leq_dB_A, sample_hours]. */
function parseLeqSeries(html) {
  const m = html.match(/LeqDayInMonth\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[1])
    if (!Array.isArray(arr)) return []
    // Validate row shape: [number, number, number]
    return arr.filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && Number.isFinite(r[2]))
  } catch {
    return []
  }
}

async function fetchOne(id) {
  const url = `${BASE}?stationID=${id}`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const html = await res.text()
    return parseLeqSeries(html)
  } catch {
    return null
  }
}

export default {
  name: 'pcd_noise',
  label_th: 'PCD เสียงรบกวน (noisemonitor.net)',
  label_en: 'PCD noise pollution (noisemonitor.net)',
  intervalMs: CONFIG.intervals.pcd_noise,
  enabled: true,

  async run({ db, bus, alerts }) {
    // Fetch all 27 stations in parallel — noisemonitor.net is a static
    // HTML page with no rate limit, so a single sweep takes ~3–5 s.
    const results = await Promise.all(STATIONS.map(async (s) => ({ s, series: await fetchOne(s.id) })))
    const fetched_at = new Date().toISOString()
    const now = fetched_at
    let added = 0
    const worst = []

    db.tx(() => {
      for (const { s, series } of results) {
        if (!series || series.length === 0) continue
        // Latest entry = most recent completed 24h window.
        const latest = series[series.length - 1]
        const prev = series.length >= 2 ? series[series.length - 2] : null
        const leq = num(latest[1])
        if (leq === null) continue
        // Dead upstream stations keep returning the last entry of an old
        // month series; skip anything whose latest 24h window is older
        // than ~48h so stale data never upserts as "current".
        if (Date.now() - latest[0] > 48 * 3600_000) continue
        // We don't have station-level coords from PCD; use the province
        // centroid so the station sits on the map where readers expect.
        const prov = provinceByName(s.province_th, s.province_en ?? null)
        const station = {
          station_key: `pcd_noise_${s.id}`,
          name_th: s.name_th,
          name_en: s.name_en,
          province_th: prov?.province_th ?? s.province_th,
          province_en: prov?.province_en ?? s.name_en,
          province_code: prov?.province_code ?? s.province_code,
          region_th: null, region_en: null, basin_th: null, basin_en: null,
          lat: prov?.lat ?? null, lng: prov?.lng ?? null,
          meta_json: JSON.stringify({ upstream: 'noisemonitor.net', pcd_station_id: s.id }),
        }
        // Use the timestamp from the upstream data (start of the 24h
        // window) so the observation time is honest. Convert to the
        // system-wide Bangkok-local YYYY-MM-DDTHH:MM convention — raw
        // toISOString() is UTC, 7h behind every other source, which
        // starved danger.js freshness cutoffs.
        const obs_time = new Date(latest[0] + 7 * 3600_000).toISOString().slice(0, 16)
        added += storeReadings({
          db, alerts, source: 'pcd_noise', station,
          metrics: {
            noise_leq_db: leq,
            noise_leq_prev_db: prev ? num(prev[1]) : null,
            noise_samples: latest[2],
          },
          obs_time, fetched_at, now,
        })
        if (leq >= 70) worst.push({ name_th: s.province_th, name_en: s.province_en ?? s.name_th, leq })
      }
    })

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'pcd_noise',
        severity: 0,
        title_th: `PCD เสียงรบกวน +${added} ค่าใหม่จาก ${STATIONS.length} สถานี`,
        title_en: `PCD noise: +${added} new Leq readings across ${STATIONS.length} stations`,
        payload: { stations: STATIONS.length, added },
      })
      for (const w of worst.sort((a, b) => b.leq - a.leq).slice(0, 3)) {
        bus.publish({
          kind: 'datum', source: 'pcd_noise', severity: 1,
          title_th: `เสียงดัง ${w.leq.toFixed(0)} dB(A) ที่ ${w.name_th} — เกินเกณฑ์ WHO 53 dB`,
          title_en: `Noise ${w.leq.toFixed(0)} dB(A) at ${w.name_en} — above WHO 53 dB Lden`,
          payload: { leq: w.leq },
        })
      }
    }

    return { stations: STATIONS.length, added }
  },
}
