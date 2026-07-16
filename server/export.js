// Daily compiled exports from AirDash SQLite — meaningful rollups for
// researchers who want our collected observations (PM2.5/PM10/O3/NO2/SO2/CO/
// AQI, rain gauges, forecasts) without hitting live APIs.
import { CONFIG } from './config.js'

/** List calendar days that have hourly or raw readings.
 *
 * The raw `readings` table is millions of rows, so a naive
 * `SELECT DISTINCT substr(obs_time,1,10)` scans the whole table (~11s) and
 * freezes the single-threaded event loop. Because obs_time is ISO-ordered and
 * covered by idx_readings_time, we skip-scan instead: seek the first day, then
 * repeatedly seek the first row strictly after that day (`> day || 'T99'`).
 * That touches one index entry per distinct day (~ms) instead of every row.
 * Hourly rollup days are unioned in so historical days survive raw retention.
 */
export function listExportDays(db, limit = 365) {
  return db.all(
    `WITH RECURSIVE d(day) AS (
       SELECT substr(MIN(obs_time), 1, 10) FROM readings
       UNION ALL
       SELECT (SELECT substr(MIN(obs_time), 1, 10) FROM readings WHERE obs_time > d.day || 'T99')
       FROM d WHERE d.day IS NOT NULL
     )
     SELECT day FROM d WHERE day IS NOT NULL
     UNION
     SELECT DISTINCT substr(hour, 1, 10) FROM readings_hourly
     ORDER BY day DESC LIMIT ?`, limit,
  ).map((r) => r.day)
}

/** Build a daily bundle: per-station min/max/avg from hourly + raw fallback. */
export function buildDailyExport(db, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('date must be YYYY-MM-DD')

  const hourly = db.all(
    `SELECT h.source, h.station_key, h.metric,
            MIN(h.v_min) AS v_min, MAX(h.v_max) AS v_max,
            AVG(h.v_avg) AS v_avg, SUM(h.n) AS samples,
            s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.lat, s.lng
     FROM readings_hourly h
     LEFT JOIN stations s ON s.source = h.source AND s.station_key = h.station_key
     WHERE h.hour LIKE ? || '%'
     GROUP BY h.source, h.station_key, h.metric
     ORDER BY h.source, s.province_th, h.station_key, h.metric`, `${day}`,
  )

  // Same-day raw readings not yet rolled up (within retention window).
  const raw = db.all(
    `SELECT r.source, r.station_key, r.metric,
            MIN(r.value) AS v_min, MAX(r.value) AS v_max,
            AVG(r.value) AS v_avg, COUNT(*) AS samples,
            s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.lat, s.lng
     FROM readings r
     LEFT JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.obs_time LIKE ? || '%'
     GROUP BY r.source, r.station_key, r.metric
     ORDER BY r.source, s.province_th, r.station_key, r.metric`, `${day}`,
  )

  // Merge: hourly wins when both exist for the same key.
  const byKey = new Map()
  for (const row of raw) {
    byKey.set(`${row.source}|${row.station_key}|${row.metric}`, { ...row, resolution: 'raw' })
  }
  for (const row of hourly) {
    byKey.set(`${row.source}|${row.station_key}|${row.metric}`, { ...row, resolution: 'hourly' })
  }

  const alerts = db.all(
    'SELECT ts, rule, severity, province_th, province_en, message_th, message_en FROM alerts WHERE ts LIKE ? || \'%\' ORDER BY ts',
    `${day}`,
  )
  const ingest = db.all(
    'SELECT source, started_at, dur_ms, ok, rows_seen, rows_new, error FROM ingest_runs WHERE started_at LIKE ? || \'%\' ORDER BY started_at',
    `${day}`,
  )

  return {
    date: day,
    generated: new Date().toISOString(),
    retention_raw_days: CONFIG.retention.rawDays,
    method_th: 'ค่ารายวัน = min/max/avg จาก readings_hourly (หรือ raw ในช่วง 90 วัน)',
    method_en: 'Daily values = min/max/avg from readings_hourly (or raw within 90-day window)',
    stations: [...byKey.values()],
    alerts,
    ingest_runs: ingest,
    counts: {
      series: byKey.size,
      alerts: alerts.length,
      ingest_runs: ingest.length,
    },
  }
}

export function dailyToCsv(bundle) {
  const head = [
    'date', 'source', 'station_key', 'metric', 'resolution',
    'v_min', 'v_max', 'v_avg', 'samples',
    'name_th', 'name_en', 'province_th', 'province_en', 'province_code', 'lat', 'lng',
  ]
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [head.join(',')]
  for (const r of bundle.stations) {
    lines.push(head.map((k) => esc(r[k])).join(','))
  }
  return lines.join('\n')
}

/**
 * Build the complete permanent dataset — all hourly aggregates across all
 * days, joined with station metadata. This is the research-quality export:
 * every observation AirDash has ever permanently stored, ready for offline
 * analysis.
 */
export function buildFullExport(db) {
  const hourly = db.all(
    `SELECT h.source, h.station_key, h.metric,
            substr(h.hour, 1, 10) AS date, h.hour,
            h.v_min, h.v_max, h.v_avg, h.n AS samples,
            s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.lat, s.lng
     FROM readings_hourly h
     LEFT JOIN stations s ON s.source = h.source AND s.station_key = h.station_key
     ORDER BY h.hour, h.source, s.province_th, h.station_key, h.metric`,
  )
  return {
    generated: new Date().toISOString(),
    retention_raw_days: CONFIG.retention.rawDays,
    method_th: 'ค่ารายชั่วโมงถาวรทั้งหมด (min/max/avg) — ข้อมูลที่ AirDash เก็บถาวร',
    method_en: 'All permanent hourly aggregates (min/max/avg) — AirDash permanent record',
    series: hourly,
    counts: { series: hourly.length },
  }
}

export function fullToCsv(bundle) {
  const head = [
    'date', 'hour', 'source', 'station_key', 'metric',
    'v_min', 'v_max', 'v_avg', 'samples',
    'name_th', 'name_en', 'province_th', 'province_en', 'province_code', 'lat', 'lng',
  ]
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [head.join(',')]
  for (const r of bundle.series) {
    lines.push(head.map((k) => esc(r[k])).join(','))
  }
  return lines.join('\n')
}
