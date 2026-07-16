// The "so what" layer — plain-language verdicts for people who don't read
// dashboards. Every rule here is a deliberate, auditable threshold over data
// the system already computes (same ethos as the watch score: heuristic
// indicator, not a forecast — and the text says so).
//
// Levels: safe → watch → prepare → danger. The verdict NEVER exceeds what an
// official advisory would say; it prioritises attention and always points to
// PCD / DOH / the province for the actual call.
//
// Thai AQI 2023 PM2.5 breakpoints anchor everything: 15 (very good) · 25
// (good) · 37.5 (start affecting health) · 75 (affecting health) µg/m³.

const PM_GOOD = 25
const PM_UNHEALTHY = 37.5
const PM_VERY_UNHEALTHY = 75

// One action verb per level — the JMA pattern. Sized to dominate the page.
const ACTIONS = {
  safe: {
    th: 'ใช้ชีวิตกลางแจ้งได้ตามปกติ — อากาศดี',
    en: 'Enjoy the outdoors — the air is good',
  },
  watch: {
    th: 'ติดตามค่าฝุ่นก่อนออกจากบ้าน — กลุ่มเสี่ยงพกหน้ากาก',
    en: 'Check PM2.5 before heading out — sensitive groups carry a mask',
  },
  prepare: {
    th: 'ลดกิจกรรมกลางแจ้ง สวมหน้ากาก N95 เมื่อออกนอกบ้าน',
    en: 'Limit outdoor time — wear an N95 when outside',
  },
  danger: {
    th: 'งดกิจกรรมกลางแจ้ง ปิดหน้าต่าง เปิดเครื่องฟอกอากาศ — ป้องกันทันที',
    en: 'Stay indoors, seal windows, run the purifier — protect now',
  },
}

// Operational checklist per level — written for the person RUNNING a
// municipality, not a resident: duty rosters, school advisories, clean-room
// staging, burn-ban enforcement, vulnerable-resident registry (respiratory
// and cardiac patients, children, elderly, pregnant women). The dashboard
// renders these as tickable boxes so a war-room screen doubles as a to-do board.
const CHECKLIST = {
  safe: [
    { th: 'ตรวจสถานีวัดฝุ่นในพื้นที่ให้ออนไลน์ครบ', en: 'Confirm every local AQ monitor is online' },
    { th: 'อัปเดตทะเบียนกลุ่มเปราะบาง (โรคปอด/หัวใจ เด็กเล็ก ผู้สูงอายุ หญิงตั้งครรภ์)', en: 'Update vulnerable-residents registry (respiratory/cardiac, infants, elderly, pregnant)' },
    { th: 'ตรวจนับสต๊อกหน้ากาก N95 และเครื่องฟอกของศูนย์ราชการ', en: 'Inventory N95 stock and public-building purifiers' },
  ],
  watch: [
    { th: 'มอบเวรติดตามค่าฝุ่นจากบอร์ดนี้ทุก 3 ชม.', en: 'Assign a duty officer to check this board every 3h' },
    { th: 'แจ้งโรงเรียน/ศูนย์เด็กเล็กให้เตรียมงดกิจกรรมกลางแจ้ง', en: 'Alert schools and childcare centres to prepare outdoor-activity limits' },
    { th: 'ตรวจจุดเผาในที่โล่ง/จุดความร้อนในพื้นที่', en: 'Patrol open-burning spots and local hotspots' },
    { th: 'เตรียมห้องปลอดฝุ่นใน รพ.สต./ศูนย์เด็กเล็กให้พร้อมเปิด', en: 'Ready clean rooms at health stations and childcare centres' },
  ],
  prepare: [
    { th: 'เปิดศูนย์ประสานงานสถานการณ์ฝุ่นระดับ อปท.', en: 'Open the municipal dust-situation coordination centre' },
    { th: 'สั่งงดกิจกรรมกลางแจ้งของโรงเรียนทุกแห่ง', en: 'Order all schools to suspend outdoor activities' },
    { th: 'แจกหน้ากาก N95 ให้กลุ่มเปราะบางตามทะเบียน', en: 'Distribute N95 masks to registered vulnerable residents' },
    { th: 'บังคับใช้ห้ามเผาเข้มงวด + ลาดตระเวนจุดความร้อน', en: 'Enforce the burn ban hard; patrol for hotspots' },
    { th: 'ประกาศเสียงตามสาย + LINE กลุ่มเมือง ทุก 6 ชม.', en: 'Broadcast via village PA + city LINE group every 6h' },
  ],
  danger: [
    { th: 'เปิดห้องปลอดฝุ่นสาธารณะทุกแห่ง รายงานยอดผู้ใช้ต่ออำเภอ', en: 'Open every public clean room; report usage to the district' },
    { th: 'พิจารณาปิดโรงเรียน/ให้ทำงานที่บ้านตามอำนาจท้องถิ่น', en: 'Consider school closures / work-from-home under local authority' },
    { th: 'ระดมกำลังตรวจ-ดับการเผาในที่โล่งทันที', en: 'Mobilise teams to stop and extinguish open burning now' },
    { th: 'เฝ้าระวังผู้ป่วยหอบหืด/หัวใจตามทะเบียน — อาการหนักส่งต่อ 1669', en: 'Monitor registered asthma/cardiac patients — escalate severe cases to 1669' },
    { th: 'สายด่วน: มลพิษ คพ. 1650 · กรมควบคุมโรค 1422 · แพทย์ฉุกเฉิน 1669', en: 'Hotlines: PCD 1650 · DDC 1422 · EMS 1669' },
  ],
}

/**
 * Honest "how much time do you have" window from the same signals that set
 * the level. Returns null when there is no time-bound threat (safe days).
 * hours is the lower edge of the window — the UI treats 0 as "NOW".
 */
function threatWindow(level, { pm25, fc48, stagnant }) {
  if (level === 'danger') {
    return { th: 'ตอนนี้ — อากาศมีผลต่อสุขภาพแล้ว', en: 'NOW — the air is already affecting health', hours: 0 }
  }
  if (level === 'prepare') {
    if ((pm25 ?? 0) >= PM_UNHEALTHY) return { th: 'ตอนนี้', en: 'NOW', hours: 0 }
    return { th: 'ภายใน 24 ชม.', en: 'within 24h', hours: 24 }
  }
  if (level === 'watch') {
    if ((fc48 ?? 0) >= PM_UNHEALTHY || stagnant) return { th: 'ช่วง 24–48 ชม. ข้างหน้า', en: 'over the next 24–48h', hours: 48 }
    return null
  }
  return null
}

const DISCLAIMER = {
  th: 'ดัชนีจัดลำดับความสนใจจากข้อมูลจริง — ประกาศอย่างเป็นทางการคือ คพ./กรมอนามัย/จังหวัด',
  en: 'Attention indicator from live data — official guidance comes from PCD / DOH / your province',
}

/**
 * Verdict for one province row from the risk engine (may be null for places
 * we can't attribute), optionally enriched with satellite rain (IMERG — is
 * washout already underway?) and the nearest AQ stations (cross-border
 * check: a station just over the province line still poisons your lungs).
 * Pure and cheap — called per place-card request.
 */
export function provinceVerdict(p, sat = null, near = null) {
  const reasons = []
  const R = (th, en) => reasons.push({ th, en })

  const pm25 = p?.pm25 ?? null
  const fc48 = Math.max(p?.pm25_fc_24h ?? 0, p?.pm25_fc_48h ?? 0) || null
  const stagnant = (p?.stagnation_comp ?? 0) >= 60

  // Local cross-check against the actual nearest stations. The place card's
  // nearest_air is a 30 km radius that CROSSES province borders, so a city
  // sitting just over a boundary from a smoky valley is caught here even when
  // its OWN province aggregate (p) looks calm. Health rule: over-warning is
  // acceptable, under-warning is not. Only escalate on a reading fresh enough
  // to still describe reality.
  const NEAR_FRESH_MS = 6 * 3600_000
  const nearAir = Array.isArray(near) ? near : []
  const freshNear = nearAir.filter((s) =>
    s && Number.isFinite(s.pm25) && s.lat != null &&
    (!s.obs_time || Date.now() - new Date(s.obs_time).getTime() < NEAR_FRESH_MS))
  const nearestVeryBad = freshNear.find((s) => s.pm25 >= PM_VERY_UNHEALTHY)
  const nearestBad = freshNear.find((s) => s.pm25 >= PM_UNHEALTHY)
  const provVeryBad = (p?.stations_very_unhealthy ?? 0) > 0
  const provBad = (p?.stations_unhealthy ?? 0) > 0
  // Only surface the cross-border reason when the province aggregate DIDN'T
  // already flag that level (otherwise it just duplicates the province reason).
  if (nearestVeryBad && !provVeryBad) R(
    `สถานีใกล้คุณฝุ่นสูงมาก: ${nearestVeryBad.name_th} ${Math.round(nearestVeryBad.pm25)} µg/m³ (~${Math.round(nearestVeryBad.distance_km)} กม.)`,
    `Very high PM2.5 near you: ${nearestVeryBad.name_en ?? nearestVeryBad.name_th} at ${Math.round(nearestVeryBad.pm25)} µg/m³ (~${Math.round(nearestVeryBad.distance_km)} km)`)
  else if (nearestBad && !provBad && !provVeryBad) R(
    `สถานีใกล้คุณฝุ่นเริ่มสูง: ${nearestBad.name_th} ${Math.round(nearestBad.pm25)} µg/m³ (~${Math.round(nearestBad.distance_km)} กม.)`,
    `Elevated PM2.5 near you: ${nearestBad.name_en ?? nearestBad.name_th} at ${Math.round(nearestBad.pm25)} µg/m³ (~${Math.round(nearestBad.distance_km)} km)`)

  if (pm25 !== null && pm25 >= PM_VERY_UNHEALTHY) R(
    `PM2.5 สูงสุดในจังหวัด ${Math.round(pm25)} µg/m³ — มีผลต่อสุขภาพ`,
    `Worst PM2.5 in the province: ${Math.round(pm25)} µg/m³ — affecting health`)
  else if (pm25 !== null && pm25 >= PM_UNHEALTHY) R(
    `PM2.5 สูงสุดในจังหวัด ${Math.round(pm25)} µg/m³ — เริ่มมีผลต่อสุขภาพ`,
    `Worst PM2.5 in the province: ${Math.round(pm25)} µg/m³ — starting to affect health`)
  if ((p?.rise_6h_ug ?? 0) >= 15) R(
    `ฝุ่นเพิ่มเร็ว +${Math.round(p.rise_6h_ug)} µg/m³ ใน 6 ชม.`,
    `PM2.5 climbing fast: +${Math.round(p.rise_6h_ug)} µg/m³ in 6h`)
  if (fc48 !== null && fc48 >= PM_UNHEALTHY) R(
    `แบบจำลอง CAMS คาดฝุ่น ~${Math.round(fc48)} µg/m³ ใน 24–48 ชม.`,
    `CAMS model expects ~${Math.round(fc48)} µg/m³ within 24–48h`)
  if (stagnant) R(
    'อากาศนิ่ง ลมอ่อน ไม่มีฝน — ฝุ่นสะสมไม่ระบาย',
    'Stagnant air: weak wind, no rain — nothing disperses the dust')
  if (p?.pollutant_worst && p.pollutant_worst.score >= 50) R(
    `ค่ามลพิษ ${p.pollutant_worst.metric.toUpperCase()} สูงผิดปกติ (${Math.round(p.pollutant_worst.value)})`,
    `Elevated ${p.pollutant_worst.metric.toUpperCase()} reading (${Math.round(p.pollutant_worst.value)})`)

  // Relief signals — the washout story. Rain already falling beats forecast.
  const satFresh = sat && (Date.now() - new Date(sat.obs_time).getTime()) < 8 * 3600_000
  if (satFresh && sat.value >= 2 && (pm25 ?? 0) >= PM_GOOD) R(
    `ดาวเทียม GPM เห็นฝนตกในจังหวัดตอนนี้ — กำลังช่วยล้างฝุ่น`,
    'GPM satellite sees rain falling in the province now — washout underway')
  else if (p?.washout_helps) R(
    `ฝนมีโอกาส ${Math.round(p.precip_prob_24h ?? 0)}% ใน 24 ชม. คาดช่วยลดฝุ่น ~${p.washout_relief_pct}%`,
    `${Math.round(p.precip_prob_24h ?? 0)}% chance of rain in 24h — could wash out ~${p.washout_relief_pct}% of the dust`)

  // Level: highest trigger wins, never lower than what the band says.
  let level = 'safe'
  if (p?.band === 'watch' || (pm25 ?? 0) >= PM_GOOD || (p?.rise_6h_ug ?? 0) >= 8 || (fc48 ?? 0) >= PM_GOOD) level = 'watch'
  if (p?.band === 'elevated' || (pm25 ?? 0) >= PM_UNHEALTHY || nearestBad ||
      ((fc48 ?? 0) >= PM_UNHEALTHY && stagnant)) level = 'prepare'
  // Air already at the "affecting health" line — in this province OR near this
  // city across a border — is danger regardless of the province aggregate.
  if (p?.band === 'high' || (pm25 ?? 0) >= PM_VERY_UNHEALTHY || nearestVeryBad) level = 'danger'

  const HEAD = {
    safe:    { th: 'วันนี้อากาศดี', en: 'Good air today' },
    watch:   { th: 'เฝ้าระวังฝุ่น', en: 'Keep watch' },
    prepare: { th: 'ควรป้องกันตัว', en: 'Protect yourself' },
    danger:  { th: 'ฝุ่นระดับวิกฤต', en: 'Critical dust level' },
  }[level]

  return {
    level,
    head_th: HEAD.th, head_en: HEAD.en,
    reasons: reasons.slice(0, 3),
    window: threatWindow(level, { pm25, fc48, stagnant }),
    action_th: ACTIONS[level].th, action_en: ACTIONS[level].en,
    checklist: CHECKLIST[level],
    disclaimer_th: DISCLAIMER.th,
    disclaimer_en: DISCLAIMER.en,
  }
}

/** One-sentence national verdict + action card for the overview panel.
 *  Returns a level (safe/watch/prepare/danger) that maps to ONE clear action
 *  verb, plus an operational checklist and a time-to-prepare window when
 *  applicable. When the raw band is "normal" but dust season is active
 *  (burning window + ≥30% of provinces past the moderate line), the level
 *  stays "safe" but the head and action switch to the "STAY INFORMED"
 *  treatment so residents don't read a clean morning as "season over". */
export function nationalVerdict(risk) {
  const n = risk.national
  const hot = risk.provinces.filter((p) => p.band === 'elevated' || p.band === 'high')
  const top = hot.slice(0, 3).map((p) => p.province_th).join(' · ')
  const topEn = hot.slice(0, 3).map((p) => p.province_en ?? p.province_th).join(' · ')
  const dustPct = n.dustLoadPct ?? 0
  const dustSeason = !!n.dustSeason

  // Dust-season "low" override: the raw band is normal but the season is on.
  if (n.band === 'normal' && dustSeason) {
    return {
      level: 'safe',
      th: `ต่ำ/LOW — ฤดูฝุ่น: ${dustPct}% ของจังหวัดเกินเกณฑ์ปานกลาง`,
      en: `LOW — dust season: ${dustPct}% of provinces past the moderate line`,
      reasons: [{ th: `ฝุ่นเกิน 25 µg/m³ ใน ${dustPct}% ของจังหวัด`, en: `PM2.5 above 25 µg/m³ in ${dustPct}% of provinces` }],
      action_th: 'เช็กค่าฝุ่นทุกเช้าก่อนออกจากบ้าน — กลุ่มเสี่ยงพกหน้ากากติดตัว',
      action_en: 'Check PM2.5 every morning before heading out — sensitive groups carry a mask',
      checklist: [
        { th: 'เปิดลิงก์จังหวัดตัวเองเช็กทุกเช้า', en: 'Open your own province link every morning' },
        { th: 'เตรียมหน้ากาก N95 ไว้ประจำบ้าน/รถ', en: 'Keep N95 masks at home and in the car' },
        { th: 'งดเผาขยะ/ใบไม้เด็ดขาดช่วงฤดูฝุ่น', en: 'No burning of waste or leaves during dust season' },
        { th: 'แชร์ลิงก์นี้ให้ครอบครัว/เพื่อนบ้าน', en: 'Share this dashboard with family and neighbours' },
      ],
      window: null,
      disclaimer_th: 'ฤดูฝุ่น = สภาพอากาศพร้อมสะสมฝุ่นได้ทุกเมื่อ — อย่าด่วนสรุปว่า "ปกติ"',
      disclaimer_en: 'Dust season means conditions can load up any day — "low" does not mean "no risk"',
    }
  }

  if (n.band === 'high') return {
    level: 'danger',
    th: `สถานการณ์ระดับประเทศ: วิกฤต — จับตา ${top || 'จังหวัดฝุ่นสูง'}`,
    en: `National: critical — watching ${topEn || 'high-dust provinces'}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'งดกิจกรรมกลางแจ้งในจังหวัดสีแดง — สวม N95 เมื่อต้องออกนอกบ้าน',
    action_en: 'Avoid outdoor activity in red provinces — N95 whenever you must go out',
    checklist: NATIONAL_CHECKLIST.danger,
    window: { th: 'ตอนนี้', en: 'NOW', hours: 0 },
    disclaimer_th: DISCLAIMER.th,
    disclaimer_en: DISCLAIMER.en,
  }
  if (n.band === 'elevated') return {
    level: 'prepare',
    th: `สถานการณ์ยกระดับ — ${hot.length} จังหวัดฝุ่นสูง${top ? ` (${top})` : ''}`,
    en: `Elevated — ${hot.length} provinces with high dust${topEn ? ` (${topEn})` : ''}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'ลดกิจกรรมกลางแจ้ง เตรียมหน้ากาก ติดตามประกาศจังหวัดใกล้ชิด',
    action_en: 'Limit outdoor time, keep masks ready, follow provincial advisories closely',
    checklist: NATIONAL_CHECKLIST.prepare,
    window: { th: '24–48 ชม. ข้างหน้า', en: 'next 24–48h', hours: 36 },
    disclaimer_th: DISCLAIMER.th,
    disclaimer_en: DISCLAIMER.en,
  }
  if (n.band === 'watch') return {
    level: 'watch',
    th: `เฝ้าระวัง — มีบางจังหวัดต้องจับตา${top ? ` (${top})` : ''}`,
    en: `Watch — a few provinces need attention${topEn ? ` (${topEn})` : ''}`,
    reasons: hot.slice(0, 3).map((p) => ({ th: `${p.province_th} ${p.score}/100`, en: `${p.province_en ?? p.province_th} ${p.score}/100` })),
    action_th: 'เช็กค่าฝุ่นจังหวัดตัวเองวันละ 2 ครั้ง เช้า-เย็น',
    action_en: 'Check your province PM2.5 twice a day, morning and evening',
    checklist: NATIONAL_CHECKLIST.watch,
    window: null,
    disclaimer_th: DISCLAIMER.th,
    disclaimer_en: DISCLAIMER.en,
  }
  return {
    level: 'safe',
    th: 'ภาพรวมประเทศ: อากาศดี',
    en: 'Nationwide: good air',
    reasons: [],
    action_th: 'ไม่ต้องทำอะไรเป็นพิเศษ — เปิดลิงก์เช็กอีกครั้งพรุ่งนี้',
    action_en: 'Nothing to do right now — check your city link again tomorrow',
    checklist: NATIONAL_CHECKLIST.safe,
    window: null,
    disclaimer_th: 'อากาศระบายได้ดี ฝุ่นไม่สะสม',
    disclaimer_en: 'The atmosphere is ventilating well — dust is not accumulating',
  }
}

// National-level checklist — written for the public at large, not municipality
// operators (those use the province-level CHECKLIST in provinceVerdict).
const NATIONAL_CHECKLIST = {
  safe: [
    { th: 'เปิดลิงก์นี้เช็กอีกครั้งพรุ่งนี้', en: 'Check this dashboard again tomorrow' },
    { th: 'รู้เบอร์สายด่วน มลพิษ 1650 · แพทย์ฉุกเฉิน 1669 ไว้ติดบ้าน', en: 'Post hotlines at home: PCD 1650 · EMS 1669' },
  ],
  watch: [
    { th: 'เช็กค่าฝุ่นจังหวัดตัวเองก่อนออกจากบ้านทุกเช้า', en: 'Check your province PM2.5 every morning before heading out' },
    { th: 'กลุ่มเสี่ยง (เด็ก ผู้สูงอายุ โรคปอด/หัวใจ หญิงตั้งครรภ์) พกหน้ากาก', en: 'Sensitive groups (children, elderly, respiratory/cardiac, pregnant) carry a mask' },
    { th: 'เลี่ยงออกกำลังกายกลางแจ้งช่วงเช้ามืดที่ฝุ่นสะสม', en: 'Avoid pre-dawn outdoor exercise when dust pools' },
  ],
  prepare: [
    { th: 'สวมหน้ากาก N95 เมื่ออยู่กลางแจ้ง', en: 'Wear an N95 outdoors' },
    { th: 'ปิดหน้าต่าง เปิดเครื่องฟอก — จัดห้องปลอดฝุ่นไว้ 1 ห้อง', en: 'Close windows, run the purifier — set up one clean room' },
    { th: 'เลื่อนกิจกรรม/กีฬากลางแจ้งออกไปก่อน', en: 'Postpone outdoor events and sports' },
    { th: 'ดูแลเด็ก ผู้สูงอายุ และผู้ป่วยทางเดินหายใจใกล้ชิด', en: 'Watch children, elderly, and respiratory patients closely' },
  ],
  danger: [
    { th: 'งดออกนอกบ้านถ้าไม่จำเป็น — ถ้าต้องออก N95 เท่านั้น', en: 'Stay in unless necessary — N95 only when you must go out' },
    { th: 'อยู่ในห้องปลอดฝุ่น/อาคารที่มีเครื่องฟอกอากาศ', en: 'Stay in a clean room or a building with filtration' },
    { th: 'แน่นหน้าอก หายใจลำบาก เวียนหัว → โทร 1669 ทันที', en: 'Chest tightness, breathing trouble, dizziness → call 1669 now' },
    { th: 'ห้ามเผาในที่โล่งเด็ดขาด — พบเห็นแจ้ง 1650', en: 'Absolutely no open burning — report it to 1650' },
    { th: 'ติดตามประกาศจังหวัด/ศูนย์ฝุ่นทุกรอบ', en: 'Follow provincial dust-centre announcements every cycle' },
  ],
}
