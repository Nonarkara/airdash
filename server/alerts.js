// Threshold-crossing alert engine. Screen-only in v1: writes the alerts table
// and pushes severity-coded events into the tap. Upward crossings only, with
// a per-station cooldown so a station oscillating on a threshold can't spam.
import { CONFIG } from './config.js'
import { log } from './util.js'

export function createAlerts(db, bus, { line = null, telegram = null } = {}) {
  const cooldownMs = CONFIG.thresholds.alertCooldownMs

  function inCooldown(key, now) {
    const last = db.kvGet(`alert_cd:${key}`)
    return last !== null && now - Number(last) < cooldownMs
  }

  function raise({ rule, source, station, metric, value, prev, severity, message_th, message_en }) {
    const now = Date.now()
    const cdKey = `${rule}:${source}:${station.station_key}`
    if (inCooldown(cdKey, now)) return false
    db.kvSet(`alert_cd:${cdKey}`, String(now))

    const ts = new Date().toISOString()
    db.insertAlert({
      ts, rule, source, station_key: station.station_key,
      province_th: station.province_th, province_en: station.province_en,
      severity, value, prev_value: prev, message_th, message_en,
    })
    bus.publish({
      kind: 'alert', source, station_key: station.station_key, severity,
      title_th: message_th, title_en: message_en,
      payload: { rule, metric, value, prev, province_th: station.province_th, province_en: station.province_en },
    })
    // Severe alerts also fan out to LINE followers (batched; no-op when the
    // OA token isn't configured).
    line?.notifyAlert({ severity, message_th, message_en })
    // Per-subscriber push (LINE Notify + Telegram). Lazily imported so
    // the optional modules never block the alert engine's hot path on a
    // deployment that hasn't enabled them. Telegram is the primary path
    // (free, no monthly cap) — LINE Notify is the fallback for users
    // who already have a Notify token.
    if ((severity ?? 0) >= 2) {
      const alertCtx = {
        severity, message_th, message_en,
        province_th: station.province_th, province_en: station.province_en,
      }
      import('./telegramPush.js').then(({ notifySubscribersForAlert }) => {
        notifySubscribersForAlert(db, alertCtx)
          .catch((err) => log('warn', 'telegram-push alert fan-out failed', { error: String(err?.message ?? err) }))
      }).catch(() => { /* telegramPush not available — silently skip */ })
      import('./linePush.js').then(({ notifySubscribersForAlert }) => {
        notifySubscribersForAlert(db, alertCtx)
          .catch((err) => log('warn', 'line-push alert fan-out failed', { error: String(err?.message ?? err) }))
      }).catch(() => { /* linePush not available — silently skip */ })
    }
    return true
  }

  /** Call after a genuinely-new reading was stored. `prev` is the value before this reading. */
  function considerReading({ source, station, metric, value, prev }) {
    const t = CONFIG.thresholds
    const name = `${station.name_th ?? station.station_key}`
    const nameEn = `${station.name_en ?? station.name_th ?? station.station_key}`
    const provTh = station.province_th ? ` จ.${station.province_th}` : ''
    const provEn = station.province_en ? `, ${station.province_en}` : ''

    // PM2.5 crossing the Thai "starts affecting health" (37.5) and
    // "affecting health" (75) lines. Hazardous (150) rides the same rule at
    // severity 3 — the cooldown key is shared so one station escalating
    // through all three lines inside the window raises once.
    if (metric === 'pm25' && value >= t.pm25Unhealthy && (prev === null || prev < t.pm25Unhealthy)) {
      const isVery = value >= t.pm25VeryUnhealthy
      const isHazard = value >= t.pm25Hazardous
      return raise({
        rule: 'pm25_level', source, station, metric, value, prev,
        severity: isHazard ? 3 : isVery ? 3 : 2,
        message_th: `PM2.5 ${value.toFixed(0)} µg/m³ ที่ ${name}${provTh} — ${isVery ? 'มีผลต่อสุขภาพ' : 'เริ่มมีผลต่อสุขภาพ'}`,
        message_en: `PM2.5 at ${value.toFixed(0)} µg/m³, ${nameEn}${provEn} — ${isVery ? 'affecting health' : 'starting to affect health'}`,
      })
    }

    // Composite Air4Thai AQI past the unhealthy line.
    if (metric === 'aqi' && value >= t.aqiUnhealthy && (prev === null || prev < t.aqiUnhealthy)) {
      return raise({
        rule: 'aqi_level', source, station, metric, value, prev, severity: 2,
        message_th: `AQI ${value.toFixed(0)} ที่ ${name}${provTh} — เกินเกณฑ์มาตรฐาน`,
        message_en: `AQI at ${value.toFixed(0)}, ${nameEn}${provEn} — past the unhealthy line`,
      })
    }

    // Washout-grade rain arriving in a province — good news worth surfacing.
    // Severity 1 (notable): rain ≥5mm/24h starts scrubbing PM out of the air.
    if (metric === 'rain_24h' && source === 'thaiwater_rain' &&
        value >= t.rainWashout24h * 3 && (prev === null || prev < t.rainWashout24h * 3)) {
      return raise({
        rule: 'washout_rain', source, station, metric, value, prev, severity: 1,
        message_th: `ฝนตก ${value.toFixed(0)} มม./24ชม. ที่ ${name}${provTh} — ช่วยชะล้างฝุ่นในพื้นที่`,
        message_en: `Rain ${value.toFixed(0)} mm/24h at ${nameEn}${provEn} — washing dust out locally`,
      })
    }

    return false
  }

  return { considerReading, raise }
}
