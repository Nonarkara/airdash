// Skill — does AirDash warn before the air gets bad? Measured, not claimed.
//
// Until 2026-09-17 nothing in this repo could answer that (honesty audit:
// no backtest, no POD, no AUC). Two ledgers, both replayed from the DB:
//
//  1. FORECAST skill (available now): the CAMS 24-h PM2.5 forecast that the
//     score's 20 % forecast component and the verdict's "watch" line read.
//     For every province-day since the forecast was first stored, the
//     prediction is "fc_24h issued the previous day ≥ 25 µg/m³" and the
//     truth is "some Air4Thai station in the province reported ≥ 37.5
//     µg/m³ (Thailand's daily standard) during that day".
//  2. SCORE skill (from the day risk_history started filling): the Air
//     Watch Score band at hour t vs a ≥ 37.5 crossing in (t, t + 24 h].
//
// Both report POD (hits / events), FAR (false alarms / alarms), the raw
// counts, and — when there are no events — say so instead of a number.
// Single-station spikes above 500 µg/m³ are sensor faults, not air, and are
// excluded from truth (Air4Thai has published 916 µg/m³ for one station on
// a clean day).
export const EVENT_UG = 37.5
export const WATCH_UG = 25
export const FAULT_UG = 500

const dayOf = (t) => String(t ?? '').slice(0, 10)

/** Pure: events is a Set of "code|YYYY-MM-DD" province-days that crossed
 *  EVENT_UG; forecasts is [{ province_code, issued_day, target_day, value }].
 *  Returns counts + rates for "value ≥ threshold" as the alarm. */
export function scoreForecast(events, forecasts, { threshold = WATCH_UG } = {}) {
  const alarms = new Map() // "code|day" → max forecast value for that target day
  for (const f of forecasts) {
    const k = `${f.province_code}|${f.target_day}`
    const v = Number(f.value)
    if (!Number.isFinite(v)) continue
    if (!alarms.has(k) || v > alarms.get(k)) alarms.set(k, v)
  }
  let hits = 0, misses = 0, falseAlarms = 0, correctNegatives = 0
  const judged = new Set([...alarms.keys(), ...events])
  for (const k of judged) {
    const alarm = (alarms.get(k) ?? -Infinity) >= threshold
    const event = events.has(k)
    if (alarm && event) hits++
    else if (!alarm && event) misses++
    else if (alarm && !event) falseAlarms++
    else correctNegatives++
  }
  const nEvents = hits + misses, nAlarms = hits + falseAlarms
  return {
    threshold_ug: threshold, event_ug: EVENT_UG,
    province_days_judged: judged.size, events: nEvents, alarms: nAlarms,
    hits, misses, false_alarms: falseAlarms, correct_negatives: correctNegatives,
    pod_pct: nEvents ? Math.round((hits / nEvents) * 1000) / 10 : null,
    far_pct: nAlarms ? Math.round((falseAlarms / nAlarms) * 1000) / 10 : null,
    measurable: nEvents >= 5,
  }
}

/** Pure: history rows [{hour, province_code, band}] and hourly truth rows
 *  [{province_code, hour, max_pm25}] → band ≥ `bandAtLeast` at hour t vs a
 *  crossing within the next 24 h. */
export function scoreHistory(history, truth, { bandAtLeast = 'watch' } = {}) {
  const rank = { normal: 0, watch: 1, elevated: 2, high: 3 }
  const minRank = rank[bandAtLeast] ?? 1
  const crossings = new Map() // code → sorted hour strings where max_pm25 ≥ EVENT_UG
  for (const t of truth) {
    if (!(Number(t.max_pm25) >= EVENT_UG) || Number(t.max_pm25) >= FAULT_UG) continue
    if (!crossings.has(t.province_code)) crossings.set(t.province_code, [])
    crossings.get(t.province_code).push(t.hour)
  }
  for (const arr of crossings.values()) arr.sort()
  let hits = 0, misses = 0, falseAlarms = 0, correctNegatives = 0
  for (const h of history) {
    const alarm = (rank[h.band] ?? 0) >= minRank
    const t0 = Date.parse(h.hour), t1 = t0 + 24 * 3_600_000
    const event = (crossings.get(h.province_code) ?? []).some((x) => { const t = Date.parse(x); return t > t0 && t <= t1 })
    if (alarm && event) hits++
    else if (!alarm && event) misses++
    else if (alarm && !event) falseAlarms++
    else correctNegatives++
  }
  const nEvents = hits + misses, nAlarms = hits + falseAlarms
  return {
    band_at_least: bandAtLeast, event_ug: EVENT_UG,
    province_hours_judged: history.length, events: nEvents, alarms: nAlarms,
    hits, misses, false_alarms: falseAlarms, correct_negatives: correctNegatives,
    pod_pct: nEvents ? Math.round((hits / nEvents) * 1000) / 10 : null,
    far_pct: nAlarms ? Math.round((falseAlarms / nAlarms) * 1000) / 10 : null,
    measurable: nEvents >= 5 && history.length >= 77 * 24 * 14,
  }
}

// ── db readers ─────────────────────────────────────────────────────────────
export function loadEvents(db, sinceIso) {
  // Province-days where a station reported ≥ EVENT_UG (and < FAULT_UG).
  const rows = db.all(`
    SELECT DISTINCT s.province_code AS code, substr(r.obs_time, 1, 10) AS day
      FROM readings r JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'air4thai' AND r.metric = 'pm25' AND r.value >= ? AND r.value < ? AND r.obs_time >= ?
       AND s.province_code IS NOT NULL`, EVENT_UG, FAULT_UG, sinceIso)
  return new Set(rows.map((r) => `${r.code}|${r.day}`))
}
export function loadForecasts(db, sinceIso) {
  // openmeteo_aq rows: station_key = province code, obs_time = issue time
  // (Thai local), value = 24-h-ahead PM2.5. The target day is issue + 1 day.
  const rows = db.all(`SELECT station_key AS code, obs_time, value FROM readings
    WHERE source = 'openmeteo_aq' AND metric = 'pm25_fc_24h' AND obs_time >= ?`, sinceIso)
  return rows.map((r) => {
    const t = Date.parse(`${r.obs_time}:00+07:00`)
    return { province_code: String(r.code), issued_day: dayOf(r.obs_time), target_day: new Date(t + 24 * 3_600_000 + 7 * 3_600_000).toISOString().slice(0, 10), value: r.value }
  })
}
export function loadHistory(db, sinceIso) {
  return db.all(`SELECT hour, province_code, band FROM risk_history WHERE hour >= ?`, sinceIso)
}
export function loadHourlyTruth(db, sinceIso) {
  return db.all(`
    SELECT s.province_code AS province_code, substr(r.obs_time, 1, 13) || ':00' AS hour, MAX(r.value) AS max_pm25
      FROM readings r JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'air4thai' AND r.metric = 'pm25' AND r.obs_time >= ? AND s.province_code IS NOT NULL
     GROUP BY s.province_code, substr(r.obs_time, 1, 13)`, sinceIso)
    // readings obs_time is Thai local; risk_history.hour is UTC. Align.
    .map((t) => ({ ...t, hour: new Date(Date.parse(`${t.hour.slice(0, 16)}:00+07:00`)).toISOString().slice(0, 13) + ':00' }))
}

export function buildSkill(db, { days = 60, now = Date.now() } = {}) {
  const sinceLocal = new Date(now - days * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 16)
  const sinceUtc = new Date(now - days * 86_400_000).toISOString().slice(0, 13) + ':00'
  const events = loadEvents(db, sinceLocal)
  const forecast = scoreForecast(events, loadForecasts(db, sinceLocal))
  const history = loadHistory(db, sinceUtc)
  const score = scoreHistory(history, history.length ? loadHourlyTruth(db, sinceLocal) : [])
  const firstHistory = db.get(`SELECT MIN(hour) AS h FROM risk_history`)?.h ?? null
  // Where the events were — the first replay (2026-09-17) found the wet
  // season's crossings are single-station industrial spikes (Rayong ×9,
  // Chonburi, Ayutthaya) that a 0.4° CAMS field cannot see. A reader of
  // "0 % POD" needs that context beside the number.
  const names = new Map(db.all(`SELECT DISTINCT province_code, province_th, province_en FROM stations WHERE province_code IS NOT NULL`).map((r) => [String(r.province_code), r]))
  const perProv = new Map()
  for (const k of events) { const code = k.split('|')[0]; perProv.set(code, (perProv.get(code) ?? 0) + 1) }
  const events_by_province = [...perProv].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([code, n]) => ({ code, th: names.get(code)?.province_th ?? null, en: names.get(code)?.province_en ?? null, event_days: n }))
  return {
    generated_at: new Date(now).toISOString(), window_days: days,
    method_th: `ความจริง = จังหวัดที่สถานีใดสถานีหนึ่งรายงาน PM2.5 ≥ ${EVENT_UG} µg/m³ (ค่ามาตรฐานรายวันไทย) ในวันนั้น · ค่าเดี่ยวเกิน ${FAULT_UG} ถือเป็นเซ็นเซอร์เสีย ไม่นับ · POD = จับได้/เหตุการณ์ · FAR = เตือนผิด/เตือนทั้งหมด`,
    method_en: `Truth = a province where any station reported PM2.5 ≥ ${EVENT_UG} µg/m³ (Thailand's daily standard) that day · a lone reading above ${FAULT_UG} is a sensor fault and is excluded · POD = hits / events · FAR = false alarms / alarms`,
    events_by_province,
    forecast_24h: {
      ...forecast,
      what_th: `พยากรณ์ CAMS 24 ชม. ที่ออกวันก่อนหน้า ≥ ${WATCH_UG} µg/m³ (เส้น "เฝ้าระวัง" ของคำตัดสิน)`,
      what_en: `CAMS 24-h forecast issued the day before ≥ ${WATCH_UG} µg/m³ (the verdict's "watch" line)`,
      verdict_th: forecast.measurable ? `จาก ${forecast.events} เหตุการณ์ พยากรณ์จับได้ ${forecast.pod_pct}% เตือนผิด ${forecast.far_pct}% ของการเตือน` : `มีเหตุการณ์เพียง ${forecast.events} ครั้งในหน้าต่างนี้ — ยังวัดทักษะไม่ได้ ระบบบอกตามนี้แทนที่จะแสดงตัวเลข`,
      verdict_en: forecast.measurable ? `Across ${forecast.events} events the forecast caught ${forecast.pod_pct}%; ${forecast.far_pct}% of its alarms did not verify` : `Only ${forecast.events} events in this window — skill is not measurable yet, and the system says so instead of showing a number`,
    },
    score_band: {
      ...score,
      recording_since: firstHistory,
      what_th: 'แบนด์คะแนนเฝ้าระวัง ≥ "เฝ้าระวัง" ณ ชั่วโมง t เทียบกับการข้ามเส้น 37.5 ภายใน 24 ชม. ถัดไป',
      what_en: 'Air Watch Score band ≥ "watch" at hour t vs a 37.5 crossing within the next 24 h',
      verdict_th: score.measurable ? `จาก ${score.events} เหตุการณ์ คะแนนจับได้ ${score.pod_pct}% เตือนผิด ${score.far_pct}%` : `เริ่มบันทึกคะแนนรายชั่วโมงเมื่อ ${firstHistory ?? '2026-09-17'} — ต้องมีอย่างน้อย 14 วันและ 5 เหตุการณ์ก่อนจะวัดได้`,
      verdict_en: score.measurable ? `Across ${score.events} events the score caught ${score.pod_pct}%; ${score.far_pct}% of its alarms did not verify` : `Hourly score recording began ${firstHistory ?? '2026-09-17'} — at least 14 days and 5 events are needed before this can be measured`,
    },
    disclaimer_th: 'การวัดผลตนเอง ไม่ใช่การรับรองจากหน่วยงานใด', disclaimer_en: 'Self-measured; not an endorsement by any agency',
  }
}
