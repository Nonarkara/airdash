// Forecast warnings — tell a province the day BEFORE the air turns bad.
//
// Every other alert rule fires on an observation, i.e. once people are
// already breathing it. In a haze season the useful message is "tomorrow
// will be bad — get masks, move the school sports day, run the purifier
// tonight". This turns the bias-corrected CAMS forecast (forecastBias.js)
// into per-province warnings on the same alert path as observed ones, so
// they reach the feed, Telegram and LINE subscribers of that province.
import { CONFIG } from './config.js'

const COOLDOWN_MS = 12 * 3600_000 // CAMS refreshes every ~6 h; warn at most twice a day

/** Pure: which provinces get a warning, and how severe.
 *  entries: [{ code, province_th, province_en, tomorrow, dayAfter }] (µg/m³, corrected) */
export function forecastWarnings(entries, t = CONFIG.thresholds) {
  const out = []
  for (const e of entries) {
    const days = [
      { key: 'tomorrow', v: e.tomorrow, th: 'พรุ่งนี้', en: 'tomorrow' },
      { key: 'day_after', v: e.dayAfter, th: 'มะรืนนี้', en: 'the day after tomorrow' },
    ].filter((d) => Number.isFinite(d.v) && d.v >= t.pm25Unhealthy)
    if (!days.length) continue
    // The nearest day that crosses the line, escalated if any day is severe.
    const first = days[0]
    const worst = days.reduce((a, b) => (b.v > a.v ? b : a))
    const severe = worst.v >= t.pm25VeryUnhealthy
    out.push({
      code: e.code, province_th: e.province_th, province_en: e.province_en,
      day: first.key, value: Math.round(first.v), worst: Math.round(worst.v),
      severity: severe ? 3 : 2,
      message_th: `คาดว่า PM2.5 ใน จ.${e.province_th} ${first.th}จะสูงถึง ~${Math.round(first.v)} µg/m³`
        + `${severe ? ' (ระดับมีผลกระทบต่อสุขภาพมาก)' : ' (เริ่มมีผลกระทบต่อสุขภาพ)'}`
        + ' — เตรียมหน้ากาก N95 ปิดหน้าต่าง เลื่อนกิจกรรมกลางแจ้งของเด็กและผู้ป่วย',
      message_en: `PM2.5 in ${e.province_en} forecast to reach ~${Math.round(first.v)} µg/m³ ${first.en}`
        + `${severe ? ' (very unhealthy)' : ' (starts to affect health)'}`
        + ' — get N95 masks ready, plan to keep windows shut, move outdoor activities for children and sensitive groups',
    })
  }
  return out
}

/** Raise the warnings on the normal alert path. */
export function raiseForecastWarnings(alerts, warnings) {
  let raised = 0
  for (const w of warnings) {
    const station = {
      station_key: w.code,
      name_th: `พยากรณ์ จ.${w.province_th}`, name_en: `${w.province_en} forecast`,
      province_th: w.province_th, province_en: w.province_en, province_code: w.code,
    }
    const ok = alerts.raise({
      rule: 'pm25_forecast', source: 'openmeteo_aq', station, metric: `pm25_fc_${w.day}`,
      value: w.value, prev: null, severity: w.severity,
      message_th: w.message_th, message_en: w.message_en,
      cooldownMs: COOLDOWN_MS, cooldownScope: `province:${w.code}`,
    })
    if (ok) raised++
  }
  return raised
}
