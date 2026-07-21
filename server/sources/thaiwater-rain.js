// ThaiWater aggregated national rain gauges (multi-agency, ~4,200 stations).
import { CONFIG } from '../config.js'
import { fetchJson, num, str, normTime, validNum } from '../util.js'
import { stationIdentity, storeReadings } from './thaiwater-common.js'

const URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'

// Chunk size for the in-memory ingest loop. The full payload is ~4,500
// rain-gauge rows. Without yielding, the synchronous SQLite write loop
// blocks Node's single event loop for 25–45s — long enough that the
// hourly watchdog probe times out three times in a row (3 × 20s gap)
// and then "recovers" by killing the very server that's just busy. We
// saw a 12-process boot loop in the 09:23 disk-full incident; we saw
// the same pattern (false-positive "PROBLEM" at 16:00 and 17:00 today)
// when only thaiwater_rain was the culprit. Yielding every 250 rows
// keeps each chunk well under 2s, so /api/health always answers
// within the watchdog's first probe.
const INGEST_CHUNK = 250

export default {
  name: 'thaiwater_rain',
  label_th: 'ฝนสะสม 24 ชม.',
  label_en: 'Rain 24h gauges',
  intervalMs: CONFIG.intervals.thaiwater_rain,
  enabled: true,

  async run({ db, bus, alerts }) {
    const json = await fetchJson(URL)
    const rows = json?.data
    if (!Array.isArray(rows)) throw new Error('unexpected rain payload shape')

    const fetched_at = new Date().toISOString()
    const now = fetched_at
    const t = CONFIG.thresholds
    let added = 0
    let heavy = 0, veryHeavy = 0
    const notable = []

    // Per-row work is processReadings(row) so we can both unit-test it
    // and yield the event loop between chunks without restructuring the
    // loop body. The "yield" is just setImmediate — under the hood that
    // is a one-tick event-loop hand-off, so /api/health probes (which
    // have ~0s of sync work) always find a responsive event loop.
    const processRow = (row) => {
      const identity = stationIdentity(row, {
        keyPath: 'station', namePath: 'tele_station_name',
        latKey: 'tele_station_lat', lngKey: 'tele_station_long',
      })
      if (!identity) return 0

      const obs_time = normTime(row.rainfall_datetime)
      if (!obs_time) return 0

      // Sanity-bound both rain metrics: a 1h reading over 500mm or a
      // 24h reading over 1500mm is a sensor fault, not a 1-in-1000-year
      // flood event. The bound is comfortably above the worst real Thai
      // flood on record (Hat Yai 2000 ≈ 400mm/24h) so genuine extremes
      // still pass; only garbage readings get dropped.
      const rain1 = validNum(row.rain_1h, 'rain_1h', 'thaiwater_rain')
      const rain24 = validNum(row.rain_24h, 'rain_24h', 'thaiwater_rain')
      if (rain24 !== null && rain24 >= t.rainVeryHeavy24h) veryHeavy += 1
      else if (rain24 !== null && rain24 >= t.rainHeavy24h) heavy += 1

      const station = {
        ...identity,
        meta_json: JSON.stringify({
          oldcode: str(row.station?.tele_station_oldcode),
          agency: str(row.agency?.agency_shortname?.en),
        }),
      }

      const newCount = storeReadings({
        db, alerts, source: 'thaiwater_rain', station,
        metrics: { rain_1h: rain1, rain_24h: rain24 },
        obs_time, fetched_at, now,
      })
      // Notable = past AirDash's "worth a tap event" bar (10 mm/24h), not
      // TMD's very-heavy category — rainy-season gauges cross 90 mm rarely,
      // and 10 mm is already decisive washout for the dust situation.
      if (newCount > 0 && rain24 !== null && rain24 >= t.rainNotable24h) {
        notable.push({ station, rain24, rain1 })
      }
      return newCount
    }

    for (let i = 0; i < rows.length; i += INGEST_CHUNK) {
      // Each chunk runs in its own short transaction so the SQLite write
      // lock is held for at most ~500ms (250 rows × ~2ms per row), and
      // the chunks are independent — a crash mid-ingest keeps the
      // earlier chunks instead of rolling everything back. The "all
      // or nothing" guarantee the old single-tx loop gave us wasn't
      // doing anything useful here: there is no downstream consumer
      // that depends on the rows being all-or-nothing (alerts fire
      // per-reading, the UI doesn't care which 250-row chunk a number
      // landed in), and the partial state is strictly more honest than
      // a 30-second "the system is dead" window.
      const end = Math.min(i + INGEST_CHUNK, rows.length)
      let chunkAdded = 0
      db.tx(() => {
        for (let j = i; j < end; j++) chunkAdded += processRow(rows[j])
      })
      added += chunkAdded
      // Yield to the event loop between chunks so /api/health, the
      // SSE bus, the watchdog probe, and any in-flight HTTP request
      // can be served before we take the SQLite write lock again.
      if (end < rows.length) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    if (added > 0) {
      bus.publish({
        kind: 'batch', source: 'thaiwater_rain',
        severity: veryHeavy > 0 ? 2 : 0,
        title_th: `ฝนสะสม +${added} ค่าใหม่ · หนักมาก ${veryHeavy} · หนัก ${heavy} จุด`,
        title_en: `Rain gauges: +${added} new readings · ${veryHeavy} very heavy · ${heavy} heavy`,
        payload: { seen: rows.length, added, heavy, veryHeavy },
      })
      for (const n of notable.sort((a, b) => b.rain24 - a.rain24).slice(0, 5)) {
        bus.publish({
          kind: 'datum', source: 'thaiwater_rain', station_key: n.station.station_key,
          severity: n.rain24 >= t.rainVeryHeavy24h ? 3 : 2,
          title_th: `ฝน ${n.rain24.toFixed(0)} มม./24ชม. ${n.station.name_th} จ.${n.station.province_th ?? '—'}`,
          title_en: `Rain ${n.rain24.toFixed(0)} mm/24h at ${n.station.name_en}, ${n.station.province_en ?? '—'}`,
          payload: { rain_24h: n.rain24, rain_1h: n.rain1 },
        })
      }
    }

    return { seen: rows.length, added }
  },
}
