// Real-time insights engine — the "super real-time analytics" layer on top
// of the source pipelines. Each insight is a single sentence an operator
// can act on: "Chiang Mai is in a compound event — PM2.5 at 82 with stagnant
// air and still climbing" or "Rain reaching Lampang tomorrow should wash out
// ~30% of the dust".
//
// Pattern families (in priority order):
//   1. compound            — high PM2.5 + stagnation + rising trend
//   2. washout_incoming    — dusty province with washout-grade rain coming
//   3. regional_escalation — 3+ provinces elevated/high at once (haze event)
//   4. sudden_escalation   — score jumped 10+ since the last snapshot
//   5. forecast_worsening  — clean now, CAMS says unhealthy within 48h
//   6. sensor_gap          — station silent for 6+ hours
//   7. data_quality        — stale/flatline/outlier/mismatch rollups
//
// All insights are observational heuristics with explicit thresholds in the
// knowledge base. They tell the operator what to look at, never replace
// official PCD/DOH advisories.
import { CONFIG } from './config.js'
import { sensorHealth } from './sensors.js'

const COMPOUND_PM25 = 37.5          // Thai "starts affecting health" line
const COMPOUND_STAGNATION = 60      // stagnation sub-score considered "stagnant"
const COMPOUND_RISE_UG = 8          // µg/m³ per 6h considered "climbing"
const SUDDEN_DELTA = 10
const REGIONAL_CLUSTER_MIN = 3
const FORECAST_WORSE_PM = 37.5
const SENSOR_GAP_HOURS = 6

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

export function buildInsights({ db, risk }) {
  const out = []
  out.push(...compoundEvents(db, risk))
  out.push(...washoutIncoming(db, risk))
  out.push(...regionalEscalation(db, risk))
  out.push(...suddenEscalation(db, risk))
  out.push(...forecastWorsening(db, risk))
  out.push(...sensorGap(db, risk))
  out.push(...dataQualityInsights(db, risk))
  // Sort by severity (critical > warn > info) then by score impact.
  out.sort((a, b) => sev(b.severity) - sev(a.severity) || (b.heat || 0) - (a.heat || 0))
  return out.slice(0, 24) // cap to 24 so the panel stays scannable
}

function sev(s) { return s === 'critical' ? 3 : s === 'warn' ? 2 : 1 }

const BAND_TH = { normal: 'ปกติ', watch: 'เฝ้าระวัง', elevated: 'เสี่ยงสูง', high: 'วิกฤต' }
const BAND_EN = { normal: 'Normal', watch: 'Watch', elevated: 'Elevated', high: 'Critical' }

// ── 1. Compound events: dust is loading and nothing will disperse it ─────
function compoundEvents(db, risk) {
  // A province triggers compound when 2+ of:
  //   PM2.5 ≥ 37.5 · stagnation sub-score ≥ 60 · rising ≥ 8 µg/6h
  const out = []
  for (const p of risk.provinces) {
    const pm = p.pm25 ?? 0
    const stagnant = (p.stagnation_comp ?? 0) >= COMPOUND_STAGNATION
    const rise = p.rise_6h_ug ?? 0
    const triggers = []
    if (pm >= COMPOUND_PM25) triggers.push({ th: `PM2.5 ${pm.toFixed(0)} µg/m³`, en: `PM2.5 ${pm.toFixed(0)} µg/m³` })
    if (stagnant) triggers.push({ th: 'อากาศนิ่ง ไม่ระบาย', en: 'stagnant air' })
    if (rise >= COMPOUND_RISE_UG) triggers.push({ th: `เพิ่ม +${rise.toFixed(0)} µg/6ชม.`, en: `climbing +${rise.toFixed(0)} µg/6h` })
    if (triggers.length < 2) continue
    out.push({
      id: `compound:${p.province_code}`,
      type: 'compound',
      severity: triggers.length >= 3 || pm >= 75 ? 'critical' : 'warn',
      heat: pm + rise * 2 + (stagnant ? 20 : 0),
      title_th: `จ.${p.province_th} — เหตุการณ์ซ้อน (${triggers.length} สัญญาณ)`,
      title_en: `${p.province_en} — compound event (${triggers.length} signals)`,
      body_th: `${triggers.map((t) => t.th).join(' · ')} · ${p.pm25_station_th ?? '—'}`,
      body_en: `${triggers.map((t) => t.en).join(' · ')} · ${p.pm25_station_en ?? '—'}`,
      province: p.province_code, lat: p.lat, lng: p.lng,
      links: ['/map'],
    })
  }
  return out
}

// ── 2. Washout incoming: relief is on the way for a dusty province ───────
function washoutIncoming(db, risk) {
  const out = []
  for (const p of risk.provinces) {
    if ((p.pm25 ?? 0) < CONFIG.thresholds.pm25Moderate) continue
    if (p.washout_band !== 'moderate' && p.washout_band !== 'strong') continue
    const prob = Math.round(p.precip_prob_24h ?? 0)
    const mm = Math.round(p.precip_fc_24h ?? 0)
    out.push({
      id: `washout:${p.province_code}`,
      type: 'washout_incoming',
      severity: 'info',
      heat: (p.pm25 ?? 0) + (p.washout_relief_pct ?? 0),
      title_th: `จ.${p.province_th} — ฝนกำลังมา ช่วยล้างฝุ่นได้ ~${p.washout_relief_pct}%`,
      title_en: `${p.province_en} — rain coming, expected to wash out ~${p.washout_relief_pct}% of the dust`,
      body_th: `PM2.5 ตอนนี้ ${Math.round(p.pm25)} µg/m³ · โอกาสฝน 24 ชม. ${prob}% (${mm} มม.) · คาดเหลือ ~${p.projected_pm25} µg/m³ หลังฝน`,
      body_en: `PM2.5 now ${Math.round(p.pm25)} µg/m³ · ${prob}% chance of ${mm} mm in 24h · ~${p.projected_pm25} µg/m³ expected after the rain`,
      province: p.province_code, lat: p.lat, lng: p.lng,
      links: ['/washout'],
    })
  }
  return out
}

// ── 3. Regional escalation: 3+ provinces elevated/high = haze event ──────
function regionalEscalation(db, risk) {
  const hot = risk.provinces.filter((p) => p.band === 'elevated' || p.band === 'high')
  if (hot.length < REGIONAL_CLUSTER_MIN) return []
  const names = hot.slice(0, 5).map((x) => x.province_en ?? x.province_th).join(', ')
  const namesTh = hot.slice(0, 5).map((x) => x.province_th).join(' · ')
  return [{
    id: 'regional:national',
    type: 'regional_escalation',
    severity: hot.length >= 5 || hot.some((p) => p.band === 'high') ? 'critical' : 'warn',
    heat: hot.reduce((s, x) => s + x.score, 0),
    title_th: `เหตุการณ์หมอกควันระดับภูมิภาค — ${hot.length} จังหวัดเสี่ยงสูงพร้อมกัน`,
    title_en: `Regional haze event — ${hot.length} provinces elevated at once`,
    body_th: namesTh,
    body_en: names,
    province: hot[0].province_code, lat: hot[0].lat, lng: hot[0].lng,
    links: ['/map'],
  }]
}

// ── 4. Sudden escalation: score delta ≥ 10 since the last snapshot ────────
function suddenEscalation(db, risk) {
  const prevRaw = db.kvGet('risk_prev')
  if (!prevRaw) return []
  const prev = safeJson(prevRaw)
  if (!prev?.scores) return []
  const out = []
  for (const p of risk.provinces) {
    const key = p.province_code ?? p.province_th
    const ps = prev.scores[key]
    if (typeof ps !== 'number') continue
    const d = p.score - ps
    if (d < SUDDEN_DELTA) continue
    out.push({
      id: `sudden:${key}`,
      type: 'sudden_escalation',
      severity: d >= 20 ? 'critical' : 'warn',
      heat: d,
      title_th: `จ.${p.province_th} เพิ่ม +${d} คะแนนใน 30 นาที`,
      title_en: `${p.province_en} jumped +${d} points in 30 min`,
      body_th: `คะแนน ${ps} → ${p.score} · ${BAND_TH[p.band] ?? p.band}`,
      body_en: `Score ${ps} → ${p.score} · ${BAND_EN[p.band] ?? p.band}`,
      province: key, lat: p.lat, lng: p.lng,
      links: ['/ranking'],
    })
  }
  return out
}

// ── 5. Forecast worsening: clean now, loading within 48h ─────────────────
// Pairs the CAMS PM2.5 outlook with the current ground state to flag
// provinces likely to cross the health line in the next 24–48h even though
// they look fine right now — the insight that gives an operator lead time.
function forecastWorsening(db, risk) {
  const out = []
  for (const p of risk.provinces) {
    const fcWorst = Math.max(p.pm25_fc_24h ?? 0, p.pm25_fc_48h ?? 0)
    if (fcWorst < FORECAST_WORSE_PM) continue
    if ((p.pm25 ?? 0) >= CONFIG.thresholds.pm25Moderate) continue // already dusty — compound covers it
    const stagnant = (p.stagnation_comp ?? 0) >= COMPOUND_STAGNATION
    const conditions = []
    conditions.push({ th: `CAMS คาด PM2.5 ~${Math.round(fcWorst)} µg/m³ ใน 24–48 ชม.`, en: `CAMS expects ~${Math.round(fcWorst)} µg/m³ within 24–48h` })
    if (stagnant) conditions.push({ th: 'อากาศนิ่ง ไม่มีลม/ฝนช่วยระบาย', en: 'stagnant — no wind or rain to disperse it' })
    if ((p.dust_fc_24h ?? 0) >= 20) conditions.push({ th: `ฝุ่นแขวนลอย (dust) ~${Math.round(p.dust_fc_24h)} µg/m³`, en: `advected dust ~${Math.round(p.dust_fc_24h)} µg/m³` })
    const severity = fcWorst >= 75 || (fcWorst >= FORECAST_WORSE_PM && stagnant) ? 'warn' : 'info'
    out.push({
      id: `air-fc:${p.province_code}`,
      type: 'forecast_worsening',
      severity,
      heat: fcWorst + (stagnant ? 25 : 0),
      title_th: `จ.${p.province_th ?? '—'} — อากาศยังดี แต่ฝุ่นกำลังมาใน 24–48 ชม.`,
      title_en: `${p.province_en ?? '—'} — clean now, dust loading within 24–48h`,
      body_th: `${conditions.map((c) => c.th).join(' · ')} · เตรียมแจ้งเตือนล่วงหน้า`,
      body_en: `${conditions.map((c) => c.en).join(' · ')} · pre-stage advisories`,
      province: p.province_code,
      lat: p.lat, lng: p.lng,
      links: ['/map'],
    })
  }
  return out
}

// ── 6. Sensor gap: a station has not reported in 6+ hours ────────────────
function sensorGap(db, risk) {
  // For each station, find max(obs_time) across all metrics in latest.
  // Anything older than SENSOR_GAP_HOURS ago is a gap.
  const rows = db.all(
    `SELECT s.source, s.station_key, s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.lat, s.lng,
            MAX(l.obs_time) AS last_seen
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
     GROUP BY s.source, s.station_key`
  )
  const out = []
  const cutoff = localCutoff(SENSOR_GAP_HOURS)
  for (const r of rows) {
    if (!r.last_seen || r.last_seen >= cutoff) continue
    const ageH = (Date.now() - new Date(r.last_seen + (r.last_seen.includes('T') ? '' : '+07:00')).getTime()) / 3_600_000
    if (ageH < SENSOR_GAP_HOURS) continue
    out.push({
      id: `gap:${r.source}:${r.station_key}`,
      type: 'sensor_gap',
      severity: ageH > 12 ? 'critical' : 'warn',
      heat: ageH,
      title_th: `${r.name_th} (${sourceNameTh(r.source)}) ไม่รายงานมา ${ageH.toFixed(0)} ชม.`,
      title_en: `${r.name_en} (${r.source}) silent for ${ageH.toFixed(0)}h`,
      body_th: r.province_th ? `จ.${r.province_th} — ข้อมูลอาจขาดช่วง` : 'ข้อมูลอาจขาดช่วง',
      body_en: r.province_en ? `${r.province_en} — possible data gap` : 'possible data gap',
      province: r.province_code, lat: r.lat, lng: r.lng,
      links: ['/'],
    })
    if (out.length >= 6) break // cap to keep panel scannable
  }
  return out
}

const SOURCE_NAME = {
  air4thai: 'วัดฝุ่น', thaiwater_rain: 'ฝน', openmeteo: 'พยากรณ์อากาศ',
  openmeteo_aq: 'พยากรณ์ฝุ่น', enso: 'ENSO', imerg: 'ดาวเทียมฝน',
}
function sourceNameTh(s) { return SOURCE_NAME[s] ?? s }

function safeJson(s) { try { return JSON.parse(s) } catch { return null } }

// ── 7. Data-quality insights: make sensor problems actionable ────────────
function dataQualityInsights(db, risk) {
  const health = sensorHealth(db)
  const out = []

  // Map province code → centroid from the risk payload so cards are clickable.
  const centroid = new Map()
  for (const p of risk.provinces) {
    if (p.province_code) centroid.set(p.province_code, { lat: p.lat, lng: p.lng })
  }

  // Overall quality score drop
  if (health.quality_score < 90) {
    out.push({
      id: `quality:national`,
      type: 'data_quality',
      severity: health.quality_score < 70 ? 'critical' : 'warn',
      heat: 100 - health.quality_score,
      title_th: `คุณภาพข้อมูล ${health.quality_score}/100 — มีสถานีน่าสงสัย ${health.summary.stale + health.summary.flatline + health.summary.outlier + health.summary.mismatch} แห่ง`,
      title_en: `Data quality ${health.quality_score}/100 — ${health.summary.stale + health.summary.flatline + health.summary.outlier + health.summary.mismatch} suspicious stations`,
      body_th: `เงียบ ${health.summary.stale} · ค้าง ${health.summary.flatline} · ผิดปกติ ${health.summary.outlier} · ไม่สอดคล้อง ${health.summary.mismatch}`,
      body_en: `stale ${health.summary.stale} · flatline ${health.summary.flatline} · outlier ${health.summary.outlier} · mismatch ${health.summary.mismatch}`,
      links: ['/sources'],
    })
  }

  // Worst provinces
  const worst = health.by_province.slice(0, 3).filter((p) => p.stale + p.flatline + p.outlier + p.mismatch > 0)
  for (const p of worst) {
    const name = p.province_th ?? p.province_en ?? '—'
    const c = centroid.get(p.province_code) ?? {}
    out.push({
      id: `quality:${p.province_code ?? name}`,
      type: 'data_quality',
      severity: p.stale > 2 ? 'warn' : 'info',
      heat: p.stale * 3 + p.flatline * 2 + p.outlier + p.mismatch,
      title_th: `จ.${name} — ข้อมูลน่าสงสัย ${p.stale + p.flatline + p.outlier + p.mismatch} สถานี`,
      title_en: `${p.province_en ?? name} — ${p.stale + p.flatline + p.outlier + p.mismatch} suspicious stations`,
      body_th: `เงียบ ${p.stale} · ค้าง ${p.flatline} · ผิดปกติ ${p.outlier} · ไม่สอดคล้อง ${p.mismatch}`,
      body_en: `stale ${p.stale} · flatline ${p.flatline} · outlier ${p.outlier} · mismatch ${p.mismatch}`,
      province: p.province_code,
      lat: c.lat, lng: c.lng,
      links: ['/map'],
    })
  }

  // Rain/PM mismatch stories — the most intuitive sensor check: rain fell
  // but a station's PM2.5 went UP instead of washing out.
  for (const m of health.by_flag.mismatch.slice(0, 3)) {
    const c = centroid.get(m.province_code) ?? {}
    out.push({
      id: `mismatch:${m.province_code ?? m.station_key}:${m.type}`,
      type: 'data_quality',
      severity: 'info',
      heat: m.value,
      title_th: `จ.${m.province_th ?? m.province_en ?? '—'} — ฝนตกแต่ค่าฝุ่นกลับเพิ่ม`,
      title_en: `${m.province_en ?? m.province_th ?? '—'} — rain fell but PM2.5 rose`,
      body_th: m.body_th,
      body_en: m.body_en,
      province: m.province_code,
      lat: c.lat, lng: c.lng,
      links: ['/map'],
    })
  }

  return out
}
