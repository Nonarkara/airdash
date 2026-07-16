// Real-time insights engine — the "super real-time analytics" layer on top
// of the 9 source pipelines. Each insight is a single sentence an operator
// can act on: "Chao Phraya at Nakhon Sawan is rising 40%; Bangkok will see
// it in ~3 days" or "Udon Thani is in a compound event — 35mm in 1h plus
// saturated soil plus 0.4m/6h rise".
//
// Pattern families (in priority order):
//   1. compound          — multi-source flash-flood recipe per province
//   2. cascade           — upstream GloFAS surge → downstream province ETA
//   3. basin_escalation  — geographic clustering (3+ provinces same basin)
//   4. sudden_escalation — score jumped 10+ in last 30 min
//   5. dam_spillway      — major dam storage ≥ 95% AND high outflow
//   6. sensor_gap        — station silent for 6+ hours
//
// All insights are observational heuristics with explicit thresholds in the
// knowledge base. They tell the operator what to look at, never replace
// official DDPM/TMD/ONWR warnings.
import { CONFIG } from './config.js'
import { REACHES, REACH_BY_ID, dischargeBand } from './rivers.js'
import { sensorHealth } from './sensors.js'

const COMPOUND_RAIN_1H_MM = 30
const COMPOUND_API_BANDS = new Set(['wet', 'saturated'])
const COMPOUND_RISE_M = 0.15
const SUDDEN_DELTA = 10
const BASIN_CLUSTER_MIN = 3
const BASIN_WINDOW_MIN = 60
const DAM_STORAGE_PCT = 95
const SENSOR_GAP_HOURS = 6

function localCutoff(hoursAgo) {
  return new Date(Date.now() + 7 * 3600_000 - hoursAgo * 3600_000).toISOString().slice(0, 16)
}

export function buildInsights({ db, risk }) {
  const out = []
  out.push(...compoundEvents(db, risk))
  out.push(...cascadeAlerts(db, risk))
  out.push(...basinEscalation(db, risk))
  out.push(...suddenEscalation(db, risk))
  out.push(...damSpillway(db, risk))
  out.push(...sensorGap(db, risk))
  out.push(...floodForecast(db, risk))
  out.push(...dataQualityInsights(db, risk))
  // Sort by severity (critical > warn > info) then by score impact.
  out.sort((a, b) => sev(b.severity) - sev(a.severity) || (b.heat || 0) - (a.heat || 0))
  return out.slice(0, 24) // cap to 24 so the panel stays scannable
}

function sev(s) { return s === 'critical' ? 3 : s === 'warn' ? 2 : 1 }

// ── 1. Compound events: multi-source flash-flood recipe ─────────────────
function compoundEvents(db, risk) {
  // A station triggers compound when:
  //   rain_1h >= 30 (flash signal) AND wetness in {wet, saturated} AND rise > 0.15m/6h
  // Group by province — at most 1 insight per province, the worst station.
  const rows = db.all(
    `SELECT s.station_key, s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.region_th, s.region_en, s.lat, s.lng,
            MAX(CASE WHEN l.metric = 'rain_1h'  THEN l.value END) AS rain_1h,
            MAX(CASE WHEN l.metric = 'rain_24h' THEN l.value END) AS rain_24h
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
     WHERE l.source = 'thaiwater_rain'
       AND l.metric IN ('rain_1h','rain_24h')
     GROUP BY s.station_key`
  )
  // Province wetness comes from risk payload (already aggregated).
  const wetByCode = new Map()
  for (const p of risk.provinces) {
    if (p.wetness_band) wetByCode.set(p.province_code, p.wetness_band)
  }
  // Rise (m/6h) per station — replicate the riseRateByProvince logic but per-station.
  const riseRows = db.all(
    `SELECT s.station_key,
            MAX(r.value) - MIN(r.value) AS rise_m
     FROM readings r
     JOIN stations s ON s.source = r.source AND s.station_key = r.station_key
     WHERE r.source = 'thaiwater_wl'
       AND r.metric = 'wl_msl'
       AND r.obs_time >= ?
     GROUP BY s.station_key`,
    localCutoff(6),
  )
  const riseByStation = new Map()
  for (const r of riseRows) riseByStation.set(r.station_key, r.rise_m ?? 0)

  const seen = new Set()
  const out = []
  for (const r of rows) {
    if (!r.province_code) continue
    const rain1 = r.rain_1h ?? 0
    const rain24 = r.rain_24h ?? 0
    const rise = riseByStation.get(r.station_key) ?? 0
    const wet = wetByCode.get(r.province_code)
    const triggers = []
    if (rain1 >= COMPOUND_RAIN_1H_MM) triggers.push(`ฝน 1 ชม. ${rain1.toFixed(0)} มม.`)
    if (wet && COMPOUND_API_BANDS.has(wet)) triggers.push(`ดิน${wet === 'saturated' ? 'อิ่มตัว' : 'ชุ่ม'}`)
    if (rise > COMPOUND_RISE_M) triggers.push(`น้ำเพิ่ม +${rise.toFixed(2)} ม./6 ชม.`)
    if (triggers.length < 2) continue // need 2+ signals to call it compound
    if (seen.has(r.province_code)) continue
    seen.add(r.province_code)
    out.push({
      id: `compound:${r.station_key}`,
      type: 'compound',
      severity: triggers.length >= 3 ? 'critical' : 'warn',
      heat: rain1 + rise * 100,
      title_th: `จ.${r.province_th} — เหตุการณ์ซ้อน (${triggers.length} สัญญาณ)`,
      title_en: `${r.province_en} — compound event (${triggers.length} signals)`,
      body_th: `${triggers.join(' · ')} · ${r.name_th ?? '—'}`,
      body_en: `${triggers.map(th => th
        .replace('ฝน 1 ชม.', 'rain 1h')
        .replace('ดินอิ่มตัว', 'soil saturated')
        .replace('ดินชุ่ม', 'soil moist')
        .replace('น้ำเพิ่ม', 'water rising')).join(' · ')} · ${r.name_en ?? '—'}`,
      station: r.station_key, province: r.province_code,
      lat: r.lat, lng: r.lng,
      links: ['/map'],
    })
  }
  return out
}

// ── 2. Cascade: upstream GloFAS surge → downstream ETA ───────────────────
function cascadeAlerts(db, risk) {
  // A reach triggers cascade when:
  //   forecast_peak > today * 1.4 (significant surge) AND trend = 'rising'
  // Compute the downstream chain with cumulative lag, and surface as one insight
  // per upstream surge that affects a downstream province with score > 0.
  const rows = db.all(
    `SELECT station_key, metric, value FROM latest WHERE source = 'glofas'`,
  )
  const byReach = new Map()
  for (const r of rows) {
    let e = byReach.get(r.station_key)
    if (!e) byReach.set(r.station_key, e = {})
    e[r.metric] = r.value
  }
  // Province-centroid map for "downstream province" inference.
  const provByCentroid = []
  for (const p of risk.provinces) {
    if (p.lat != null && p.lng != null) provByCentroid.push(p)
  }
  function nearestProvince(lat, lng) {
    let best = null, bd = Infinity
    for (const p of provByCentroid) {
      const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
      if (d < bd) { bd = d; best = p }
    }
    return best
  }

  const out = []
  for (const r of REACHES) {
    const d = byReach.get(r.id) ?? {}
    const today = d.discharge ?? null
    const peak = d.discharge_fc_peak ?? null
    if (today === null || peak === null) continue
    if (peak < today * 1.4) continue
    // Walk downstream chain.
    let cur = r
    let cumLag = 0
    while (cur?.downstream && REACH_BY_ID.has(cur.downstream)) {
      const next = REACH_BY_ID.get(cur.downstream)
      cumLag += (cur.lagDays ?? 1)
      cur = next
      if (cumLag > 10) break
    }
    const downstreamProv = cur ? nearestProvince(cur.lat, cur.lng) : null
    if (!downstreamProv) continue
    out.push({
      id: `cascade:${r.id}`,
      type: 'cascade',
      severity: 'warn',
      heat: peak / Math.max(today, 1) * cumLag,
      title_th: `คลื่นน้ำ${r.name_th} เพิ่ม +${Math.round((peak/today - 1) * 100)}% — ${downstreamProv.province_th} จะถึงใน ~${cumLag} วัน`,
      title_en: `${r.name_en} surge +${Math.round((peak/today - 1) * 100)}% — reaches ${downstreamProv.province_en} in ~${cumLag} days`,
      body_th: `อัตราการไหลวันนี้ ${today.toFixed(0)} → คาดสูงสุด ${peak.toFixed(0)} ลบ.ม./วิ · เดินทางผ่านลำน้ำสาขาต่อเนื่อง`,
      body_en: `Discharge today ${today.toFixed(0)} → forecast peak ${peak.toFixed(0)} m³/s · transit through downstream reaches`,
      province: downstreamProv.province_code, lat: cur.lat, lng: cur.lng,
      links: ['/rivers'],
    })
  }
  return out
}

// ── 3. Basin escalation: 3+ provinces same region escalated in last hour ─
function basinEscalation(db, risk) {
  // Use risk_prev (kv) for the 30-min baseline; for "last hour" we compare
  // the prev snapshot to a one-hour-old snapshot. If only 30-min is available
  // we approximate with that.
  const prevRaw = db.kvGet('risk_prev')
  if (!prevRaw) return []
  const prev = safeJson(prevRaw)
  if (!prev?.scores) return []
  // Group provinces by region; find regions where 3+ provinces moved up ≥ 3 points.
  const bumps = []
  for (const p of risk.provinces) {
    const key = p.province_code ?? p.province_th
    const prevScore = prev.scores[key]
    if (typeof prevScore !== 'number') continue
    const d = p.score - prevScore
    if (d >= 3) bumps.push({ p, d })
  }
  if (bumps.length < BASIN_CLUSTER_MIN) return []
  const byRegion = new Map()
  for (const { p, d } of bumps) {
    const r = p.region_en ?? p.region_th ?? '—'
    if (!byRegion.has(r)) byRegion.set(r, [])
    byRegion.get(r).push({ p, d })
  }
  const out = []
  for (const [region, list] of byRegion) {
    if (list.length < BASIN_CLUSTER_MIN) continue
    const names = list.slice(0, 5).map((x) => x.p.province_en).join(', ')
    out.push({
      id: `basin:${region}`,
      type: 'basin_escalation',
      severity: list.length >= 5 ? 'critical' : 'warn',
      heat: list.reduce((s, x) => s + x.d, 0),
      title_th: `ลุ่ม${region} — ${list.length} จังหวัดขึ้นพร้อมกัน`,
      title_en: `${region} basin — ${list.length} provinces escalating together`,
      body_th: names,
      body_en: names,
      province: list[0].p.province_code,
      links: ['/map'],
    })
  }
  return out
}

// ── 4. Sudden escalation: score delta > 10 in 30 min ─────────────────────
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

const BAND_TH = { normal: 'ปกติ', watch: 'เฝ้าระวัง', elevated: 'เสี่ยงสูง', high: 'วิกฤต' }
const BAND_EN = { normal: 'Normal', watch: 'Watch', elevated: 'Elevated', high: 'Critical' }

// ── 5. Dam spillway: storage >= 95% AND outflow > inflow threshold ───────
function damSpillway(db, risk) {
  const rows = db.all(
    `SELECT s.station_key, s.name_th, s.name_en, s.province_th, s.province_en,
            s.province_code, s.lat, s.lng,
            MAX(CASE WHEN l.metric = 'dam_storage_pct' THEN l.value END) AS storage_pct,
            MAX(CASE WHEN l.metric = 'dam_inflow_mcm'  THEN l.value END) AS inflow,
            MAX(CASE WHEN l.metric = 'dam_released_mcm' THEN l.value END) AS release
     FROM latest l
     JOIN stations s ON s.source = l.source AND s.station_key = l.station_key
     WHERE l.source = 'thaiwater_dam'
     GROUP BY s.station_key`
  )
  const out = []
  for (const d of rows) {
    const sp = d.storage_pct ?? 0
    const inflow = d.inflow ?? 0
    const release = d.release ?? 0
    if (sp < DAM_STORAGE_PCT) continue
    // Spillway event = high storage AND release >= inflow (active discharge)
    if (release < inflow * 0.8) continue
    out.push({
      id: `dam:${d.station_key}`,
      type: 'dam_spillway',
      severity: sp >= 99 ? 'critical' : 'warn',
      heat: sp + release / 10,
      title_th: `เขื่อน${d.name_th} — เก็บ ${sp.toFixed(0)}% · ระบาย ${release.toFixed(1)} ล้าน ลบ.ม./วัน`,
      title_en: `Dam ${d.name_en} — ${sp.toFixed(0)}% full · releasing ${release.toFixed(1)} Mm³/day`,
      body_th: `น้ำเข้า ${inflow.toFixed(1)} ล้าน ลบ.ม./วัน · จังหวัดปลายน้ำควรเฝ้าระวัง`,
      body_en: `Inflow ${inflow.toFixed(1)} Mm³/day · downstream provinces should be on alert`,
      province: d.province_code, lat: d.lat, lng: d.lng,
      links: ['/rivers'],
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
  thaiwater_wl: 'ระดับน้ำ', thaiwater_rain: 'ฝน', thaiwater_dam: 'เขื่อน',
  rid_reservoir: 'อ่างเก็บน้ำ', air4thai: 'อากาศ', openmeteo: 'พยากรณ์', glofas: 'GloFAS',
}
function sourceNameTh(s) { return SOURCE_NAME[s] ?? s }

function safeJson(s) { try { return JSON.parse(s) } catch { return null } }

// ── 7. Predicted flood area: forecast rain × current state ───────────
// Pair openmeteo's 48h rain forecast with current wetness + L4/L5 stations
// to flag provinces that are LIKELY to flood in the next 24-48h even
// though they look calm right now. This is the "predicted flood area"
// insight — the one that gives an operator lead time.
//
//   - heavy forecast rain (>= 35mm/48h) AND wetness in {wet, saturated}
//   - OR heavy forecast + already-L4/L5 stations
//   - OR forecast >= 90mm + any wetness signal
function floodForecast(db, risk) {
  const out = []
  for (const p of risk.provinces) {
    const fc = p.fc_48h ?? 0
    const wet = p.wetness_band
    const l5 = p.stations_l5 ?? 0
    const l4 = p.stations_l4 ?? 0
    if (fc < 35) continue
    // Severity: how many conditions line up
    const conditions = []
    if (fc >= 90) conditions.push(`พยากรณ์ฝน 48 ชม. ${Math.round(fc)} มม.`)
    else if (fc >= 35) conditions.push(`พยากรณ์ฝน 48 ชม. ${Math.round(fc)} มม.`)
    if (wet === 'saturated') conditions.push('ดินอิ่มตัว')
    else if (wet === 'wet') conditions.push('ดินชุ่ม')
    if (l5 > 0) conditions.push(`สถานีล้นตลิ่ง ${l5} แห่ง`)
    else if (l4 > 0) conditions.push(`สถานีน้ำมาก ${l4} แห่ง`)
    let severity = 'info'
    if ((fc >= 90 && wet === 'saturated') || l5 > 0) severity = 'critical'
    else if (fc >= 90 || (fc >= 35 && wet === 'saturated') || (fc >= 35 && l4 > 0)) severity = 'warn'
    if (severity === 'info') continue
    out.push({
      id: `flood-fc:${p.province_code}`,
      type: 'flood_forecast',
      severity,
      heat: fc + (wet === 'saturated' ? 50 : wet === 'wet' ? 25 : 0) + l5 * 30 + l4 * 10,
      title_th: `จ.${p.province_th ?? '—'} — แนวโน้มน้ำท่วม 24-48 ชม.`,
      title_en: `${p.province_en ?? '—'} — likely flood area in 24-48h`,
      body_th: `${conditions.join(' · ')} · เตรียมพร้อมอพยพล่วงหน้า`,
      body_en: `${conditions.map(th => th
        .replace('พยากรณ์ฝน 48 ชม.', '48h rain forecast')
        .replace('ดินอิ่มตัว', 'soil saturated')
        .replace('ดินชุ่ม', 'soil moist')
        .replace('สถานีล้นตลิ่ง', 'overflowing stations')
        .replace('สถานีน้ำมาก', 'high water stations')
        .replace('แห่ง', 'stns')).join(' · ')} · pre-stage evacuation`,
      province: p.province_code,
      lat: p.lat, lng: p.lng,
      links: ['/map'],
    })
  }
  return out
}

// ── 8. Data-quality insights: make sensor problems actionable ────────────
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

  // Rain/water mismatch stories — the most intuitive sensor check
  for (const m of health.by_flag.mismatch.slice(0, 3)) {
    const c = centroid.get(m.province_code) ?? {}
    out.push({
      id: `mismatch:${m.province_code ?? m.station_key}:${m.type}`,
      type: 'data_quality',
      severity: 'info',
      heat: m.value,
      title_th: `จ.${m.province_th ?? m.province_en ?? '—'} — ${m.type === 'rain_without_rise' ? 'ฝนตกแต่น้ำไม่ขึ้น' : 'น้ำขึ้นโดยไม่มีฝน'}`,
      title_en: `${m.province_en ?? m.province_th ?? '—'} — ${m.type === 'rain_without_rise' ? 'rain but no water rise' : 'water rising without rain'}`,
      body_th: m.body_th,
      body_en: m.body_en,
      province: m.province_code,
      lat: c.lat, lng: c.lng,
      links: ['/map'],
    })
  }

  return out
}
