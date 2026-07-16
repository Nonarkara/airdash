// The "so what" layer — plain-language verdicts for people who don't read
// dashboards. Every rule here is a deliberate, auditable threshold over data
// the system already computes (same ethos as the watch score: heuristic
// indicator, not a forecast — and the text says so).
//
// Levels: safe → watch → prepare → danger. The verdict NEVER exceeds what an
// official warning would say; it prioritises attention and always points to
// DDPM/TMD for the actual call.
import { buildCascade } from './cascade.js'
import { REACHES } from './rivers.js'

const KM_PER_DEG_LAT = 111
const KM_PER_DEG_LNG = 101 // at Thailand's latitude

function distKm(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * KM_PER_DEG_LAT
  const dLng = (aLng - bLng) * KM_PER_DEG_LNG
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * Time-to-impact from the river network: if a GloFAS reach upstream of the
 * nearest reach is rising, report who is rising and how many days the flood
 * wave takes to arrive here (sum of link lags). Returns null when the point
 * is far from any monitored reach or nothing upstream is rising.
 */
export function riverEta(db, lat, lng, { maxReachKm = 80 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let nearest = null
  for (const r of REACHES) {
    const d = distKm(lat, lng, r.lat, r.lng)
    if (d <= maxReachKm && (!nearest || d < nearest.d)) nearest = { r, d }
  }
  if (!nearest) return null

  const cascade = buildCascade(db)
  const byId = new Map(cascade.reaches.map((x) => [x.id, x]))
  const here = byId.get(nearest.r.id)
  if (!here) return null

  // Walk upstream with Dijkstra's algorithm. Each link has a different
  // lagDays weight, so BFS (FIFO) doesn't guarantee the shortest path —
  // and when multiple reaches converge (e.g., Ping+Yom+Nan → Nakhon Sawan)
  // the first-discovered path may not be the soonest to arrive.
  const risers = []
  const finalized = new Set([here.id])
  const bestDays = new Map() // id → shortest cumulative lag found so far
  let pq = cascade.links
    .filter((l) => l.to === here.id)
    .map((l) => ({ id: l.from, days: l.lagDays }))
  while (pq.length) {
    pq.sort((a, b) => a.days - b.days) // simple priority queue
    const { id, days } = pq.shift()
    if (finalized.has(id)) continue
    finalized.add(id)
    const reach = byId.get(id)
    if (!reach) continue
    if (reach.trend === 'rising' || reach.band === 'warning' || reach.band === 'emergency') {
      risers.push({ id, name_th: reach.name_th, name_en: reach.name_en, days, band: reach.band, discharge: reach.discharge })
    }
    for (const l of cascade.links.filter((x) => x.to === id)) {
      const nd = days + l.lagDays
      if (!finalized.has(l.from) && (!bestDays.has(l.from) || nd < bestDays.get(l.from))) {
        bestDays.set(l.from, nd)
        pq.push({ id: l.from, days: nd })
      }
    }
  }

  const localRising = here.trend === 'rising'
  if (!risers.length && !localRising) return null
  risers.sort((a, b) => a.days - b.days)
  const soonest = risers[0] ?? null
  return {
    reach_th: here.name_th, reach_en: here.name_en,
    reach_km: Math.round(nearest.d),
    local_rising: localRising,
    local_band: here.band,
    upstream: soonest ? {
      name_th: soonest.name_th, name_en: soonest.name_en,
      days: Math.round(soonest.days * 10) / 10, band: soonest.band,
    } : null,
  }
}

const ACTIONS = {
  safe: {
    th: 'ไม่ต้องทำอะไรตอนนี้ — เปิดลิงก์เมืองนี้เช็กอีกครั้งวันพรุ่งนี้',
    en: 'Nothing to do right now — check your city link again tomorrow',
  },
  watch: {
    th: 'ติดตามฝนสะสมและระดับน้ำสถานีใกล้บ้านวันละ 2 ครั้ง',
    en: 'Check the rain and your nearest station levels twice a day',
  },
  prepare: {
    th: 'ยกของมีค่าขึ้นที่สูง เตรียมของจำเป็น และติดตามประกาศ ปภ./อปท. ใกล้ชิด',
    en: 'Move valuables up, prepare essentials, follow DDPM/municipal announcements closely',
  },
  danger: {
    th: 'ปฏิบัติตามประกาศทางการทันที — ถ้าอยู่พื้นที่เสี่ยง เตรียมอพยพตามคำแนะนำ ปภ.',
    en: 'Follow official instructions now — if in a risk zone, be ready to evacuate per DDPM guidance',
  },
}

// Operational checklist per level — written for the person RUNNING a
// municipality, not a resident: incident command, vulnerable-resident
// registry (immobile people take the longest to move — they go first),
// pump/sandbag staging, PA + LINE broadcasts. The dashboard renders these
// as tickable boxes so a war-room screen doubles as a to-do board.
const CHECKLIST = {
  safe: [
    { th: 'เดินตรวจท่อ/รางระบายน้ำจุดเสี่ยง — ลอกก่อนฝนมา', en: 'Walk drainage weak points — clear culverts before rain' },
    { th: 'อัปเดตทะเบียนกลุ่มเปราะบาง (ผู้ป่วยติดเตียง ผู้สูงอายุ ผู้พิการ)', en: 'Update vulnerable-residents registry (bed-bound, elderly, disabled)' },
    { th: 'ตรวจนับกระสอบทราย เครื่องสูบน้ำ เรือ ให้พร้อมใช้', en: 'Inventory sandbags, pumps, boats — confirm working order' },
  ],
  watch: [
    { th: 'มอบเวรติดตามระดับน้ำ/ฝนจากบอร์ดนี้ทุก 3 ชม.', en: 'Assign a duty officer to check this board every 3h' },
    { th: 'แจ้งกำนัน/ผู้ใหญ่บ้านโซนลุ่มต่ำให้เริ่มเฝ้าระวัง', en: 'Alert village heads in low-lying zones to start watching' },
    { th: 'ทดสอบเครื่องสูบน้ำและกำหนดจุดอพยพสำรอง', en: 'Test pumps; designate fallback evacuation points' },
    { th: 'โทรยืนยันผู้ดูแล + พาหนะของกลุ่มเปราะบางทุกราย', en: 'Call to confirm carer + transport for every vulnerable resident' },
  ],
  prepare: [
    { th: 'เปิดศูนย์บัญชาการเหตุการณ์ระดับ อปท. — คนเฝ้าตลอด', en: 'Open municipal incident command — staffed round the clock' },
    { th: 'ย้ายผู้ป่วยติดเตียง/ผู้สูงอายุโซนลุ่มต่ำ "ก่อน" — ใช้เวลานานที่สุด', en: 'Move immobile residents in low zones FIRST — they take longest' },
    { th: 'วางกระสอบทราย + เครื่องสูบน้ำที่จุดอ่อนที่รู้จัก', en: 'Stage sandbags + pumps at known weak points' },
    { th: 'ย้ายรถ เวชภัณฑ์ เอกสารสำคัญขึ้นที่สูง', en: 'Move vehicles, medicine, key documents to high ground' },
    { th: 'ประกาศเสียงตามสาย + LINE กลุ่มเมือง ทุก 6 ชม.', en: 'Broadcast via village PA + city LINE group every 6h' },
  ],
  danger: [
    { th: 'อพยพตามคำสั่ง ปภ. — กลุ่มเปราะบางออกก่อนเสมอ', en: 'Evacuate per DDPM orders — vulnerable residents always first' },
    { th: 'ตัดไฟฟ้าโซนน้ำถึงก่อนน้ำแตะแผงมิเตอร์', en: 'Cut power in flooded zones before water reaches meters' },
    { th: 'เปิดศูนย์พักพิง รายงานยอดผู้เข้าพักต่ออำเภอทุกรอบ', en: 'Open shelters; report headcounts to the district each cycle' },
    { th: 'ปิดทางลอด/จุดข้ามน้ำเชี่ยว ห้ามรถและคนผ่าน', en: 'Close underpasses and fast-water crossings to all traffic' },
    { th: 'สายด่วน: ปภ. 1784 · แพทย์ฉุกเฉิน 1669', en: 'Hotlines: DDPM 1784 · EMS 1669' },
  ],
}

/**
 * Honest "how much time do you have" window from the same signals that set
 * the level. Returns null when there is no time-bound threat (safe days).
 * hours is the lower edge of the window — the UI treats 0 as "NOW".
 */
function threatWindow(level, { eta, fc, nearestL5, provL5 }) {
  if (level === 'danger' && (nearestL5 || provL5)) {
    return { th: 'ตอนนี้ — น้ำล้นตลิ่งแล้ว', en: 'NOW — river already overflowing', hours: 0 }
  }
  const upstreamH = eta?.upstream ? Math.max(6, Math.round(eta.upstream.days * 24)) : null
  if (level === 'danger') {
    return upstreamH !== null
      ? { th: `~${fmtH(upstreamH)}`, en: `~${fmtHEn(upstreamH)}`, hours: upstreamH }
      : { th: 'ภายใน 24 ชม.', en: 'within 24h', hours: 24 }
  }
  if (level === 'prepare') {
    if (upstreamH !== null && upstreamH <= 72) return { th: `~${fmtH(upstreamH)}`, en: `~${fmtHEn(upstreamH)}`, hours: upstreamH }
    if ((fc ?? 0) >= 35) return { th: '24–48 ชม. ข้างหน้า', en: 'next 24–48h', hours: 24 }
    return { th: 'ภายใน 48 ชม.', en: 'within 48h', hours: 48 }
  }
  if (level === 'watch') {
    if (upstreamH !== null) return { th: `~${fmtH(upstreamH)}`, en: `~${fmtHEn(upstreamH)}`, hours: upstreamH }
    if ((fc ?? 0) >= 35) return { th: 'ช่วง 48 ชม. ข้างหน้า', en: 'over the next 48h', hours: 48 }
    return null
  }
  return null
}

function fmtH(h) { return h < 48 ? `${h} ชม.` : `${Math.round(h / 24)} วัน` }
function fmtHEn(h) { return h < 48 ? `${h}h` : `${Math.round(h / 24)} days` }

/**
 * Verdict for one province row from the risk engine (may be null for places
 * we can't attribute), optionally enriched with a riverEta. Pure and cheap —
 * called per place-card request.
 */
export function provinceVerdict(p, eta = null, sat = null, near = null) {
  const reasons = []
  const R = (th, en) => reasons.push({ th, en })

  const fc = p?.fc_48h ?? null
  const rain = p?.max_rain_24h ?? null

  // Local cross-check against the actual nearest stations. The place card's
  // nearest_water is a 30 km radius that CROSSES province borders, so a city
  // sitting just over a boundary from an overflowing river is caught here
  // even when its OWN province aggregate (p) looks calm. Life-safety rule:
  // over-warning is acceptable, under-warning is not. Only escalate on a
  // reading fresh enough to still describe reality (a station silent for days
  // is a data-quality matter, handled elsewhere — not a live danger signal).
  const NEAR_FRESH_MS = 12 * 3600_000
  const nearWater = Array.isArray(near) ? near : []
  const freshNear = nearWater.filter((s) =>
    s && Number.isFinite(s.situation_level) && s.lat != null &&
    (!s.obs_time || Date.now() - new Date(s.obs_time).getTime() < NEAR_FRESH_MS))
  const nearestL5 = freshNear.find((s) => Math.round(s.situation_level) >= 5)
  const nearestL4 = freshNear.find((s) => Math.round(s.situation_level) === 4)
  const provL5 = (p?.stations_l5 ?? 0) > 0
  const provL4 = (p?.stations_l4 ?? 0) > 0
  // Only surface the cross-border reason when the province aggregate DIDN'T
  // already flag that level (otherwise it just duplicates the province reason).
  if (nearestL5 && !provL5) R(
    `สถานีใกล้คุณล้นตลิ่ง: ${nearestL5.name_th} (~${Math.round(nearestL5.distance_km)} กม.)`,
    `Overflowing station near you: ${nearestL5.name_en ?? nearestL5.name_th} (~${Math.round(nearestL5.distance_km)} km)`)
  else if (nearestL4 && !provL4 && !provL5) R(
    `สถานีใกล้คุณน้ำมาก: ${nearestL4.name_th} (~${Math.round(nearestL4.distance_km)} กม.)`,
    `High water near you: ${nearestL4.name_en ?? nearestL4.name_th} (~${Math.round(nearestL4.distance_km)} km)`)
  // Satellite cross-check: IMERG sees ≥ 8 mm/h (heavy convective rain) while
  // gauges in the province report little — the classic ungauged-cell blind
  // spot. Stale satellite data (> 8 h) is ignored.
  const satFresh = sat && (Date.now() - new Date(sat.obs_time).getTime()) < 8 * 3600_000
  const satHeavy = satFresh && sat.value >= 8
  if (satHeavy && (rain ?? 0) < 20) {
    R(`ดาวเทียม GPM เห็นฝนหนัก ${Math.round(sat.value)} มม./ชม. ในจังหวัด — จุดที่ไม่มีสถานีวัด`,
      `GPM satellite sees heavy rain (${Math.round(sat.value)} mm/h) in the province — in an ungauged spot`)
  }

  if (p?.stations_l5 > 0) R(`มีสถานีล้นตลิ่ง ${p.stations_l5} จุดในจังหวัด`, `${p.stations_l5} station(s) overflowing in the province`)
  if (p?.stations_l4 > 0) R(`น้ำมาก (ระดับ 4) ${p.stations_l4} จุด`, `${p.stations_l4} station(s) at high water (L4)`)
  if (rain !== null && rain >= 90) R(`ฝนตกหนักมาก ${Math.round(rain)} มม./24ชม.`, `Very heavy rain: ${Math.round(rain)} mm/24h`)
  else if (rain !== null && rain >= 35) R(`ฝนตกหนัก ${Math.round(rain)} มม./24ชม.`, `Heavy rain: ${Math.round(rain)} mm/24h`)
  if (fc !== null && fc >= 90) R(`พยากรณ์ฝน 48 ชม. ข้างหน้า ${Math.round(fc)} มม.`, `48h forecast: ${Math.round(fc)} mm of rain coming`)
  else if (fc !== null && fc >= 35) R(`มีฝนกำลังมา ~${Math.round(fc)} มม. ใน 48 ชม.`, `Rain coming: ~${Math.round(fc)} mm in 48h`)
  if (p?.wetness_band === 'saturated') R('ดินอิ่มน้ำแล้ว — ฝนใหม่จะกลายเป็นน้ำท่าทันที', 'Ground is saturated — new rain runs straight off')
  if (eta?.upstream) R(
    `น้ำเหนือกำลังเพิ่มที่${eta.upstream.name_th} — ถึงแม่น้ำใกล้คุณใน ~${eta.upstream.days} วัน`,
    `Upstream water rising at ${eta.upstream.name_en} — reaches your river in ~${eta.upstream.days} days`)
  if (eta?.local_rising) R(`แม่น้ำใกล้คุณ (${eta.reach_th}) แนวโน้มเพิ่มขึ้น`, `Your nearest river reach (${eta.reach_en}) is trending up`)

  // Level: highest trigger wins, never lower than what the band says.
  let level = 'safe'
  if (p?.band === 'watch' || (rain ?? 0) >= 35 || (fc ?? 0) >= 35 || eta?.local_rising || eta?.upstream || satHeavy) level = 'watch'
  if (p?.band === 'elevated' || (fc ?? 0) >= 90 ||
      (p?.wetness_band === 'saturated' && (fc ?? 0) >= 35) ||
      nearestL4 ||
      (eta?.upstream && eta.upstream.days <= 2 && (eta.upstream.band === 'warning' || eta.upstream.band === 'emergency'))) level = 'prepare'
  // An overflowing river station — in this province OR near this city across a
  // border — is danger regardless of the province aggregate.
  if (p?.band === 'high' || provL5 || nearestL5) level = 'danger'

  const HEAD = {
    safe:    { th: 'วันนี้ยังปกติ', en: 'All clear today' },
    watch:   { th: 'เฝ้าระวัง', en: 'Keep watch' },
    prepare: { th: 'ควรเตรียมพร้อม', en: 'Prepare now' },
    danger:  { th: 'สถานการณ์วิกฤต', en: 'Critical situation' },
  }[level]

  return {
    level,
    head_th: HEAD.th, head_en: HEAD.en,
    reasons: reasons.slice(0, 3),
    window: threatWindow(level, { eta, fc, nearestL5, provL5 }),
    action_th: ACTIONS[level].th, action_en: ACTIONS[level].en,
    checklist: CHECKLIST[level],
    disclaimer_th: 'ดัชนีจัดลำดับความสนใจจากข้อมูลจริง — การเตือนภัยอย่างเป็นทางการคือ ปภ./กรมอุตุฯ',
    disclaimer_en: 'Attention indicator from live data — official warnings come from DDPM/TMD',
  }
}

/** One-sentence national verdict + action card for the overview panel.
 *  Returns a level (safe/watch/prepare/danger) that maps to ONE clear action
 *  verb, plus an operational checklist and a time-to-prepare window when
 *  applicable. When the raw band is "normal" but flood season is active
 *  (>=70% of provinces wet/saturated), the level stays "safe" but the head
 *  and action switch to the "STAY INFORMED" treatment so we don't lull
 *  residents into thinking "all clear" while 2 in 3 provinces are primed. */
export function nationalVerdict(risk) {
  const n = risk.national
  const hot = risk.provinces.filter((p) => p.band === 'elevated' || p.band === 'high')
  const top = hot.slice(0, 3).map((p) => p.province_th).join(' · ')
  const topEn = hot.slice(0, 3).map((p) => p.province_en ?? p.province_th).join(' · ')
  const soilPct = n.soilSaturationPct ?? 0
  const floodSeason = !!n.floodSeason

  // Flood-season "low" override: the raw band is normal but we're primed.
  if (n.band === 'normal' && floodSeason) {
    return {
      level: 'safe',
      th: `ต่ำ/LOW — ดินอิ่มตัว ${soilPct}% ของจังหวัด`,
      en: `LOW — soil saturated in ${soilPct}% of provinces`,
      reasons: [{ th: `ดินอิ่มตัว ${soilPct}% ของจังหวัด`, en: `Soil saturated in ${soilPct}% of provinces` }],
      action_th: 'ติดตามสถานการณ์วันละ 2 ครั้ง เก็บเอกสาร/ยา/ทรายพร้อมใช้',
      action_en: 'Check the dashboard twice a day. Keep documents, medicine, and sandbags ready',
      checklist: [
        { th: 'เปิดลิงก์จังหวัดตัวเองเช็กทุกเช้า-เย็น', en: 'Open your own province link morning and evening' },
        { th: 'เตรียมกระเป๋าฉุกเฉิน (บัตร ยา ที่ชาร์จ น้ำ)', en: 'Pack an emergency bag (ID, medicine, charger, water)' },
        { th: 'หมั่นตรวจท่อระบายน้ำรอบบ้าน เคลียร์ใบไม้/ขยะ', en: 'Clear drains and gutters around your home' },
        { th: 'แชร์ลิงก์นี้ให้ครอบครัว/เพื่อนบ้าน', en: 'Share this dashboard with family and neighbours' },
      ],
      window: null,
      disclaimer_th: 'ดินอิ่มตัว = ฝนเพิ่มอีกนิดจะกลายเป็นน้ำท่าทันที — อย่าด่วนสรุปว่า "ปกติ"',
      disclaimer_en: 'Saturated soil turns the next rain into runoff — "low" does not mean "no risk"',
    }
  }

  if (n.band === 'high') return {
    level: 'danger',
    th: `สถานการณ์ระดับประเทศ: วิกฤต — จับตา ${top || 'จังหวัดเสี่ยงสูง'}`,
    en: `National: critical — watching ${topEn || 'high-risk provinces'}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'ปฏิบัติตามประกาศ ปภ./อปท. ทันที — เตรียมอพยพหากอยู่ในพื้นที่เสี่ยง',
    action_en: 'Follow DDPM/municipal orders now — be ready to evacuate if in a risk zone',
    checklist: NATIONAL_CHECKLIST.danger,
    window: { th: 'ภายใน 24 ชม.', en: 'within 24h', hours: 24 },
    disclaimer_th: 'ดัชนีจัดลำดับความสนใจจากข้อมูลจริง — การเตือนภัยอย่างเป็นทางการคือ ปภ./กรมอุตุฯ',
    disclaimer_en: 'Attention indicator from live data — official warnings come from DDPM/TMD',
  }
  if (n.band === 'elevated') return {
    level: 'prepare',
    th: `สถานการณ์ยกระดับ — ${hot.length} จังหวัดเสี่ยงสูง${top ? ` (${top})` : ''}`,
    en: `Elevated — ${hot.length} provinces at high risk${topEn ? ` (${topEn})` : ''}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'ยกของขึ้นที่สูง เตรียมของจำเป็น ติดตามประกาศ ปภ./อปท. ใกล้ชิด',
    action_en: 'Move valuables up, prepare essentials, follow DDPM/municipal updates closely',
    checklist: NATIONAL_CHECKLIST.prepare,
    window: { th: '24–48 ชม. ข้างหน้า', en: 'next 24–48h', hours: 36 },
    disclaimer_th: 'ดัชนีจัดลำดับความสนใจจากข้อมูลจริง — การเตือนภัยอย่างเป็นทางการคือ ปภ./กรมอุตุฯ',
    disclaimer_en: 'Attention indicator from live data — official warnings come from DDPM/TMD',
  }
  if (n.band === 'watch') return {
    level: 'watch',
    th: `เฝ้าระวัง — มีบางจังหวัดต้องจับตา${top ? ` (${top})` : ''}`,
    en: `Watch — a few provinces need attention${topEn ? ` (${topEn})` : ''}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'ติดตามฝนสะสมและระดับน้ำสถานีใกล้บ้านวันละ 2 ครั้ง',
    action_en: 'Check rain totals and your nearest station levels twice a day',
    checklist: NATIONAL_CHECKLIST.watch,
    window: null,
    disclaimer_th: 'ดัชนีจัดลำดับความสนใจจากข้อมูลจริง — การเตือนภัยอย่างเป็นทางการคือ ปภ./กรมอุตุฯ',
    disclaimer_en: 'Attention indicator from live data — official warnings come from DDPM/TMD',
  }
  return {
    level: 'safe',
    th: 'ภาพรวมประเทศปกติ',
    en: 'Nationwide: normal',
    reasons: [],
    action_th: 'ไม่ต้องทำอะไรเป็นพิเศษ — เปิดลิงก์เช็กอีกครั้งพรุ่งนี้',
    action_en: 'Nothing to do right now — check your city link again tomorrow',
    checklist: NATIONAL_CHECKLIST.safe,
    window: null,
    disclaimer_th: 'ดินยังไม่อิ่มตัวมาก ฝนเล็กน้อยยังซึมลงดินได้',
    disclaimer_en: 'Soil is dry enough to absorb light rain',
  }
}

// National-level operational checklist — written for the public at large,
// not municipality operators (those use the province-level CHECKLIST in
// provinceVerdict). Each level maps to ONE action verb, plus 3-4 concrete
// steps a resident or community leader can do today.
const NATIONAL_CHECKLIST = {
  safe: [
    { th: 'เปิดลิงก์นี้เช็กอีกครั้งพรุ่งนี้', en: 'Check this dashboard again tomorrow' },
    { th: 'รู้เบอร์สายด่วน ปภ. 1784 / 1669 ไว้ติดบ้าน', en: 'Post hotlines at home: DDPM 1784 · EMS 1669' },
  ],
  watch: [
    { th: 'ติดตามฝนสะสมและระดับน้ำสถานีใกล้บ้านวันละ 2 ครั้ง', en: 'Check rain totals and nearest station levels twice a day' },
    { th: 'เตรียมกระเป๋าฉุกเฉิน (บัตร ยา ที่ชาร์จ น้ำดื่ม)', en: 'Pack an emergency bag (ID, medicine, charger, water)' },
    { th: 'ชาร์จแบตโทรศัพท์ให้เต็มทุกคืน', en: 'Charge your phone fully every night' },
  ],
  prepare: [
    { th: 'ยกของมีค่า/เอกสาร/เวชภัณฑ์ขึ้นที่สูง', en: 'Move valuables, documents, medicine to higher ground' },
    { th: 'วางกระสอบทราย/เครื่องสูบน้ำที่จุดอ่อนรอบบ้าน', en: 'Stage sandbags and pumps at known weak points' },
    { th: 'แจ้งครอบครัว/เพื่อนบ้านเรื่องแผนอพยพ', en: 'Tell family and neighbours about the evacuation plan' },
    { th: 'เติมน้ำมันรถ เตรียมเส้นทางอพยพสำรอง', en: 'Top up fuel; pre-plan alternate evacuation routes' },
  ],
  danger: [
    { th: 'หากทางการสั่งอพยพ ให้ผู้ที่อยู่พื้นที่ลุ่มต่ำ/ริมน้ำออกก่อน — ช่วยกลุ่มเปราะบางก่อน', en: 'If officials order evacuation, leave low-lying/riverside zones first — help vulnerable people first' },
    { th: 'ปิดไฟฟ้า/แก๊สก่อนออกจากบ้าน', en: 'Switch off electricity and gas before leaving' },
    { th: 'นำเอกสารสำคัญ ยา โทรศัพท์ ไปด้วย', en: 'Take key documents, medicine, phone' },
    { th: 'ติดตามประกาศ ปภ. 1784 / อปท. ทุกรอบ', en: 'Follow DDPM 1784 and municipal updates every cycle' },
    { th: 'ห้ามขับรถผ่านน้ำท่วม/น้ำไหลเชี่ยวเด็ดขาด', en: 'Never drive through flooded or fast-flowing water' },
  ],
}
