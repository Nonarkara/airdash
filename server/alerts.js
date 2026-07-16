// Threshold-crossing alert engine. Screen-only in v1: writes the alerts table
// and pushes severity-coded events into the tap. Upward crossings only, with
// a per-station cooldown so a station oscillating on a threshold can't spam.
import { CONFIG } from './config.js'

// HII situation_level semantics: 1 critically-low … 3 normal … 4 high … 5 overflow.
const LEVEL_TH = { 4: 'น้ำมาก', 5: 'น้ำล้นตลิ่ง' }
const LEVEL_EN = { 4: 'high water', 5: 'overflowing banks' }

export function createAlerts(db, bus, { line = null } = {}) {
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
    return true
  }

  /** Call after a genuinely-new reading was stored. `prev` is the value before this reading. */
  function considerReading({ source, station, metric, value, prev }) {
    const t = CONFIG.thresholds
    const name = `${station.name_th ?? station.station_key}`
    const nameEn = `${station.name_en ?? station.name_th ?? station.station_key}`
    const provTh = station.province_th ? ` จ.${station.province_th}` : ''
    const provEn = station.province_en ? `, ${station.province_en}` : ''

    if (metric === 'situation_level' && value >= t.alertSituationLevel && (prev === null || prev < t.alertSituationLevel)) {
      const isOverflow = value >= 5
      return raise({
        rule: 'wl_level', source, station, metric, value, prev,
        severity: isOverflow ? 3 : 2,
        message_th: `สถานี${name}${provTh} ${LEVEL_TH[isOverflow ? 5 : 4] ?? 'น้ำมาก'} (ระดับ ${value})`,
        message_en: `Station ${nameEn}${provEn}: ${LEVEL_EN[isOverflow ? 5 : 4] ?? 'high water'} (level ${value})`,
      })
    }

    if (metric === 'rain_24h' && value >= t.rainVeryHeavy24h && (prev === null || prev < t.rainVeryHeavy24h)) {
      return raise({
        rule: 'rain_24h', source, station, metric, value, prev,
        severity: value >= t.rainCritical24h ? 3 : 2,
        message_th: `ฝนตกหนักมาก ${value.toFixed(0)} มม./24ชม. ที่ ${name}${provTh}`,
        message_en: `Very heavy rain: ${value.toFixed(0)} mm/24h at ${nameEn}${provEn}`,
      })
    }

    if (metric === 'dam_storage_pct' && value >= t.damFullPct && (prev === null || prev < t.damFullPct)) {
      return raise({
        rule: 'dam_full', source, station, metric, value, prev, severity: 2,
        message_th: `เขื่อน${name} กักเก็บ ${value.toFixed(1)}% ของความจุ`,
        message_en: `${nameEn} dam at ${value.toFixed(1)}% of capacity`,
      })
    }

    if (metric === 'rsv_storage_pct' && value >= t.reservoirFullPct && (prev === null || prev < t.reservoirFullPct)) {
      const rsvTh = name.startsWith('อ่างเก็บน้ำ') ? name : `อ่างเก็บน้ำ${name}`
      return raise({
        rule: 'reservoir_full', source, station, metric, value, prev, severity: 2,
        message_th: `${rsvTh} กักเก็บ ${value.toFixed(1)}%`,
        message_en: `Reservoir ${nameEn} at ${value.toFixed(1)}%`,
      })
    }

    return false
  }

  return { considerReading, raise }
}
