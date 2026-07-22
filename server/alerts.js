// Threshold-crossing alert engine. Screen-only in v1: writes the alerts table
// and pushes severity-coded events into the tap. Upward crossings AND
// downward all-clear crossings, with a per-station cooldown so a station
// oscillating on a threshold can't spam.
//
// Alert rules (all thresholds from CONFIG.thresholds):
//   pm25_level    — PM2.5 crossing 37.5 (sev 2), 75 (sev 3), 150 (sev 3)
//   aqi_level     — Air4Thai composite AQI crossing 100 (sev 2)
//   washout_rain  — washout-grade rain arriving (sev 1, good news)
//   pm25_all_clear — PM2.5 back below 25 µg/m³ sustained (sev 1, own 12h
//                    cooldown), delivered as a reassuring push, not danger
//
// Cooldown is SEVERITY-AWARE: each rule+station remembers the severity of
// the last alert it sent. A HIGHER severity than the last alerted severity
// bypasses the cooldown (a station crossing at 40 and hitting 160 two
// hours later MUST escalate — the old shared key suppressed the hazardous
// escalation for the full 6 h); same-or-lower severity still respects the
// window. Cooldown rows are stored in kv as JSON { at, sev }; plain
// numeric timestamps from before this change still parse (treated as
// severity 0, so any new alert bypasses them exactly once).
//
// SEV-3 CORROBORATION (added after the 2026-07-17 Chonburi incident —
// station 33t read 10.0 → 426.1 → 10.3 µg/m³ from a sensor glitch and
// fired a nationwide sev-3 "Hazardous" broadcast): before a PM2.5 alert
// at severity 3 (≥ 75 µg/m³) is emitted, it must be corroborated by at
// least one of:
//   (a) the station's own jump does NOT look like a sensor spike per the
//       same heuristic sensors.js uses (a ≥ spikeUg6h jump vs the previous
//       reading while the province median moved < 10 µg/m³), OR
//   (b) at least one OTHER station in the same province — or the GISTDA
//       province fusion value — is also at/above the very-unhealthy line.
// An uncorroborated sev-3 is downgraded: no public alert, no fan-out; it
// is logged and recorded as a severity-0 'pm25_spike_suppressed' row so
// operators can audit suppressed spikes in /api/alerts.
import { CONFIG } from './config.js'
import { log } from './util.js'

// All-clear rule: the station was past the Thai "starts affecting health"
// line (37.5) and has now come back under the "good" line (25) SUSTAINED.
// Sustained = at least 2 stored readings in the last 2 h (Air4Thai
// publishes hourly, so ≈ two consecutive hourly readings) and NOTHING in
// that window back at/above 25 — enough hysteresis that one gusty reading
// (or the tail of a sensor glitch like the Chonburi spike) can't cry wolf.
const ALL_CLEAR_WINDOW_H = 2
const ALL_CLEAR_MIN_READINGS = 2
const ALL_CLEAR_COOLDOWN_MS = 12 * 60 * 60_000

// Spike heuristic — mirrors sensors.js findAirAnomalies (kept in sync by
// hand; both read the same CONFIG.sensorHealth constants).
const SPIKE_PROVINCE_MEDIAN_UG = 10

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

export function createAlerts(db, bus, { line = null, telegramBroadcaster = null } = {}) {
  const cooldownMs = CONFIG.thresholds.alertCooldownMs

  // Severity-aware cooldown state. New rows are JSON { at, sev }; legacy
  // rows are bare timestamps and parse as severity 0.
  function lastAlert(key) {
    const raw = db.kvGet(`alert_cd:${key}`)
    if (raw === null) return null
    if (raw.startsWith('{')) {
      try {
        const j = JSON.parse(raw)
        if (Number.isFinite(j?.at)) return { at: j.at, sev: j.sev ?? 0 }
      } catch { /* fall through */ }
      return null
    }
    const at = Number(raw)
    return Number.isFinite(at) ? { at, sev: 0 } : null
  }

  // In cooldown when the window hasn't elapsed AND the new alert isn't a
  // severity escalation over the last one we sent.
  function inCooldown(key, now, severity, windowMs) {
    const last = lastAlert(key)
    if (!last) return false
    if (now - last.at >= windowMs) return false
    return severity <= last.sev
  }

  function raise({ rule, source, station, metric, value, prev, severity, message_th, message_en, cooldownMs: windowMs }) {
    const now = Date.now()
    const cdKey = `${rule}:${source}:${station.station_key}`
    const window = windowMs ?? cooldownMs
    if (inCooldown(cdKey, now, severity, window)) return false
    db.kvSet(`alert_cd:${cdKey}`, JSON.stringify({ at: now, sev: severity }))

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
    // OA token isn't configured). The structured fields (rule, source,
    // value, province_*) let the broadcast formatter group by severity
    // and dedupe by province the same way FloodDash does.
    const structured = {
      severity, message_th, message_en,
      rule, source, metric, value, prev,
      province_th: station.province_th,
      province_en: station.province_en,
      station_name_th: station.name_th,
      station_name_en: station.name_en,
    }
    line?.notifyAlert(structured)
    // Telegram broadcast (per-subscriber sendMessage). Same structured
    // payload — the broadcaster groups by severity and dedupes by
    // province so a haze episode doesn't spam every subscriber with
    // one message per station.
    telegramBroadcaster?.notifyAlert?.(structured)
    // Per-subscriber push (LINE Notify + Telegram per-chat). Lazily
    // imported so the optional modules never block the alert engine's
    // hot path on a deployment that hasn't enabled them. Telegram is
    // the primary path (free, no monthly cap) — LINE Notify is the
    // fallback for users who already have a Notify token.
    // All-clear alerts (rule pm25_all_clear) ride the same fan-out but
    // with their own reassuring template inside the push modules.
    if ((severity ?? 0) >= 2 || rule === 'pm25_all_clear') {
      import('./telegramPush.js').then(({ notifySubscribersForAlert }) => {
        notifySubscribersForAlert(db, structured)
          .catch((err) => log('warn', 'telegram-push alert fan-out failed', { error: String(err?.message ?? err) }))
      }).catch(() => { /* telegramPush not available — silently skip */ })
      import('./linePush.js').then(({ notifySubscribersForAlert }) => {
        notifySubscribersForAlert(db, structured)
          .catch((err) => log('warn', 'line-push alert fan-out failed', { error: String(err?.message ?? err) }))
      }).catch(() => { /* linePush not available — silently skip */ })
    }
    return true
  }

  // ── Sev-3 corroboration helpers (see header for the rule) ────────────

  // (a) Does this reading look like a sensor spike? Same heuristic as
  // sensors.js: the station jumped ≥ spikeUg6h vs its previous reading
  // while the province median first→last delta over 6 h moved < 10.
  function looksLikeSpike({ source, station, value, prev }) {
    if (prev === null || prev === undefined) return false
    const rise = value - prev
    if (rise < CONFIG.sensorHealth.spikeUg6h) return false
    if (!station.province_code) return true // can't check the median — treat a lone huge jump as suspect
    const rows = db.all(
      `SELECT r.station_key, r.obs_time, r.value
       FROM readings r
       JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
       WHERE r.source = ? AND r.metric = 'pm25' AND r.obs_time >= ? AND s.province_code = ?
       ORDER BY r.station_key, r.obs_time`,
      source, localCutoff(6), String(station.province_code),
    )
    const byKey = new Map()
    for (const row of rows) {
      let s = byKey.get(row.station_key)
      if (!s) { s = { first: row, last: row }; byKey.set(row.station_key, s) }
      else s.last = row
    }
    const deltas = []
    for (const s of byKey.values()) {
      const d = s.last.value - s.first.value
      if (Number.isFinite(d)) deltas.push(d)
    }
    if (!deltas.length) return true // no provincial baseline — lone huge jump is suspect
    deltas.sort((a, b) => a - b)
    const median = deltas[Math.floor(deltas.length / 2)]
    return Math.abs(median) < SPIKE_PROVINCE_MEDIAN_UG
  }

  // (b) Is anyone else in the province also past the very-unhealthy line?
  // Checks other ground stations (latest) and the GISTDA province fusion.
  function corroboratedByNeighbour({ station, threshold }) {
    if (!station.province_code) return false
    const neighbour = db.get(
      `SELECT l.value AS value FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = 'air4thai' AND l.metric = 'pm25'
         AND s.province_code = ? AND l.station_key != ? AND l.value >= ?
       LIMIT 1`,
      String(station.province_code), station.station_key, threshold,
    )
    if (neighbour) return true
    const fusion = db.get(
      `SELECT l.value AS value FROM latest l
       JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
       WHERE l.source = 'gistda_pm25' AND l.metric = 'pm25'
         AND s.province_code = ? AND l.value >= ?
       LIMIT 1`,
      String(station.province_code), threshold,
    )
    return Boolean(fusion)
  }

  // Corroboration gate for sev-3 PM2.5 alerts. Returns true when the alert
  // may go out. Uncorroborated readings are logged + recorded sev-0.
  function mayEmitSevere({ source, station, metric, value, prev }) {
    const t = CONFIG.thresholds
    if (corroboratedByNeighbour({ station, threshold: t.pm25VeryUnhealthy })) return true
    if (!looksLikeSpike({ source, station, value, prev })) return true
    log('warn', 'sev-3 PM2.5 alert suppressed — uncorroborated sensor spike', {
      source, station_key: station.station_key, province_th: station.province_th,
      value, prev,
    })
    // Data-quality record (severity 0 — never fans out, never shows on the
    // public banner; operators see it in /api/alerts and the tap).
    db.insertAlert({
      ts: new Date().toISOString(), rule: 'pm25_spike_suppressed', source,
      station_key: station.station_key,
      province_th: station.province_th, province_en: station.province_en,
      severity: 0, value, prev_value: prev,
      message_th: `PM2.5 ${value.toFixed(0)} µg/m³ ที่ ${station.name_th ?? station.station_key} — ระงับการแจ้งเตือน: ค่าพุ่งผิดปกติโดยไม่มีสถานีอื่นในจังหวัดยืนยัน (สงสัยเซ็นเซอร์ผิดพลาด)`,
      message_en: `PM2.5 ${value.toFixed(0)} µg/m³ at ${station.name_en ?? station.station_key} — alert suppressed: uncorroborated spike (suspected sensor fault)`,
    })
    return false
  }

  // ── All-clear detection ──────────────────────────────────────────────
  // Sustained drop below 25 (see constants above for the exact hysteresis
  // rule). The trigger ALSO requires that we actually sent this station a
  // pm25_level danger alert within the last 24 h — an all-clear only makes
  // sense to people we told about the danger, and it stops a suppressed
  // sensor glitch (426 → 10) from manufacturing a "good news" push.
  function isSustainedClear({ source, station }) {
    const t = CONFIG.thresholds
    const rows = db.all(
      `SELECT value FROM readings
       WHERE source = ? AND station_key = ? AND metric = 'pm25' AND obs_time >= ?
       ORDER BY obs_time DESC LIMIT 6`,
      source, station.station_key, localCutoff(ALL_CLEAR_WINDOW_H),
    )
    if (rows.length < ALL_CLEAR_MIN_READINGS) return false
    return rows.every((r) => r.value !== null && r.value < t.pm25Moderate)
  }

  function dangerAlertedRecently(source, station, now) {
    const last = lastAlert(`pm25_level:${source}:${station.station_key}`)
    return last !== null && now - last.at < 24 * 3600_000
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
    // severity 3. The cooldown key is shared BUT severity-aware: one
    // station escalating through the lines inside the window raises once
    // per NEW severity level — a later, higher severity always gets
    // through; a same-or-lower one waits out the cooldown.
    if (metric === 'pm25' && value >= t.pm25Unhealthy && (prev === null || prev < t.pm25Unhealthy)) {
      const isVery = value >= t.pm25VeryUnhealthy
      const severity = isVery ? 3 : 2
      // Sev-3 (≥75) needs corroboration before it can broadcast — see the
      // module header for the Chonburi 2026-07-17 incident this prevents.
      if (severity >= 3 && !mayEmitSevere({ source, station, metric, value, prev })) return false
      return raise({
        rule: 'pm25_level', source, station, metric, value, prev,
        severity,
        message_th: `PM2.5 ${value.toFixed(0)} µg/m³ ที่ ${name}${provTh} — ${isVery ? 'มีผลต่อสุขภาพ' : 'เริ่มมีผลต่อสุขภาพ'}`,
        message_en: `PM2.5 at ${value.toFixed(0)} µg/m³, ${nameEn}${provEn} — ${isVery ? 'affecting health' : 'starting to affect health'}`,
      })
    }

    // All-clear: the station's air is back under the good line, sustained,
    // AND we actually warned about this station within the last 24 h.
    // Subscribers who got the danger push deserve to hear the air is safe
    // again. Own rule key + own 12 h cooldown so it never fights the
    // danger cooldown. Gradual declines (60 → 30 → 20) qualify — the
    // trigger is the sustained-clear state, not a single-step crossing.
    if (metric === 'pm25' && prev !== null && value < t.pm25Moderate &&
        isSustainedClear({ source, station }) &&
        dangerAlertedRecently(source, station, Date.now())) {
      return raise({
        rule: 'pm25_all_clear', source, station, metric, value, prev,
        severity: 1, cooldownMs: ALL_CLEAR_COOLDOWN_MS,
        message_th: `PM2.5 ลดเหลือ ${value.toFixed(0)} µg/m³ ที่ ${name}${provTh} — อากาศดีขึ้นแล้ว ออกไปข้างนอกได้ตามปกติ`,
        message_en: `PM2.5 back down to ${value.toFixed(0)} µg/m³ at ${nameEn}${provEn} — the air has cleared; outdoor activity is fine again`,
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
