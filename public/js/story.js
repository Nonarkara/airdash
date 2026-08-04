// ────────────────────────────────────────────────────────────────────────────
// AIR STORY — the new front door. A scroll narrative about TODAY's air for
// smart kids and curious adults. Not a dashboard: one question per chapter,
// every big number earns a "why should I care" line, and every figure traces
// back to /api/science (with an honestly-labelled fallback so the page never
// renders empty while the science API is still deploying).
// ────────────────────────────────────────────────────────────────────────────
import { store, on, setLang, emit } from './state.js?v=2.4.3'
import { tr, paintChrome, LEVEL_NAME, pm25Level } from './i18n.js?v=2.4.3'
import { getJson } from './cache.js?v=2.4.3'
import { fmtNum, escapeHtml } from './fmt.js?v=2.4.3'
import { initDataFreshness } from './dataFreshness.js?v=2.4.3'

const $ = (sel) => document.querySelector(sel)
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Breathing-circle tint per Thai AQI 2023 level — CSS vars so dark mode inverts.
const BREATH_VAR = { 1: 'var(--aqi-good)', 2: 'var(--aqi-moderate)', 3: 'var(--aqi-watch)', 4: 'var(--aqi-unhealthy)', 5: 'var(--aqi-hazardous)' }

// ── Embedded fallback sample ─────────────────────────────────────────────────
// Used ONLY when /api/science cannot be fetched (still deploying / offline).
// Clearly flagged: the page shows an "offline sample" banner whenever this
// object is what's on screen. Numbers follow the same formulas the server
// uses (Berkeley Earth 22 µg/m³·day ≈ 1 cigarette, ~11 min of life per
// cigarette, Koschmieder-style visibility estimate).
const FALLBACK_SCIENCE = {
  __fallback: true,
  generated_at: null,
  national: {
    pm25: 24, population: 71_800_000, band: 'watch',
    cigs_per_day: 24 / 22, life_minutes_per_day: (24 / 22) * 11,
    excess_mortality_pct: 4.8, aqli_years_lost: 1.8,
    attributable_deaths_per_day: 88, daily_cost_million_thb: 350,
    haze_tax_thb_per_person: 4.9, visibility_km: 250 / 24,
    air_breathed_m3_per_day: 11,
    o3_crop_stress: null, // honest null — ozone stations are sparse
  },
  provinces: [
    { code: '10', name_th: 'กรุงเทพมหานคร', name_en: 'Bangkok', population: 10_500_000, pm25: 24, band: 'watch', cigs_per_day: 24 / 22, life_minutes_per_day: (24 / 22) * 11, excess_mortality_pct: 4.8, aqli_years_lost: 1.8, visibility_km: 250 / 24, play_budget_min: 120, o3_aot40_week: null },
    { code: '50', name_th: 'เชียงใหม่', name_en: 'Chiang Mai', population: 1_800_000, pm25: 31, band: 'watch', cigs_per_day: 31 / 22, life_minutes_per_day: (31 / 22) * 11, excess_mortality_pct: 6.5, aqli_years_lost: 2.2, visibility_km: 250 / 31, play_budget_min: 60, o3_aot40_week: null },
    { code: '90', name_th: 'สงขลา', name_en: 'Songkhla', population: 1_700_000, pm25: 16, band: 'normal', cigs_per_day: 16 / 22, life_minutes_per_day: (16 / 22) * 11, excess_mortality_pct: 2.4, aqli_years_lost: 0.9, visibility_km: 250 / 16, play_budget_min: 240, o3_aot40_week: null },
  ],
  profiles: {
    kid:      { id: 'kid', label_th: 'เด็ก', label_en: 'Kid', blurb_th: 'ปอดยังโตไม่เต็มที่ และหายใจเร็วกว่าผู้ใหญ่ — ได้ฝุ่นมากกว่าต่อน้ำหนักตัว', blurb_en: 'Growing lungs breathe faster than adults — more dust per kilo of body.', ventilation: { rest: 0.35, moderate: 1.1, heavy: 1.9 }, guidance: [ { maxPm25: 15, th: 'ออกไปวิ่งเล่นได้เต็มที่เลย!', en: 'Go run around outside — full speed!' }, { maxPm25: 25, th: 'เล่นกลางแจ้งได้ แต่ถ้าไอก็กลับเข้าบ้านนะ', en: 'Outdoor play is fine — head inside if you start coughing.' }, { maxPm25: 37.5, th: 'เล่นในบ้านหรือในห้างดีกว่า เก็บตัวไว้ข้างใน', en: 'Better to play indoors today.' }, { maxPm25: 1e9, th: 'อยู่ในบ้าน ปิดหน้าต่าง ถ้าต้องออกไปให้ใส่หน้ากาก N95', en: 'Stay indoors, windows closed — N95 if you must go out.' } ] },
    teen:     { id: 'teen', label_th: 'วัยรุ่น', label_en: 'Teen', blurb_th: 'ร่างกายแข็งแรง แต่การเล่นกีฬาหนัก ๆ กลางฝุ่นดูดฝุ่นเข้าลึกกว่าที่คิด', blurb_en: 'Strong body — but hard sport in haze pulls dust deep into the lungs.', ventilation: { rest: 0.5, moderate: 1.6, heavy: 2.8 }, guidance: [ { maxPm25: 25, th: 'ออกกำลังกายกลางแจ้งได้ปกติ', en: 'Outdoor exercise is fine.' }, { maxPm25: 37.5, th: 'ลดความหนักลงหน่อย อย่าวิ่งมาราธอนกลางฝุ่น', en: 'Ease off — no hard runs in the haze.' }, { maxPm25: 1e9, th: 'ย้ายการออกกำลังกายเข้าบ้าน', en: 'Move your workout indoors.' } ] },
    adult:    { id: 'adult', label_th: 'ผู้ใหญ่', label_en: 'Adult', blurb_th: 'ความเสี่ยงสะสมทุกวัน — ฝุ่นวันนี้คือหนี้สุขภาพของอนาคต', blurb_en: 'Risk accumulates daily — today\'s dust is future-you\'s health debt.', ventilation: { rest: 0.55, moderate: 1.5, heavy: 2.7 }, guidance: [ { maxPm25: 25, th: 'ใช้ชีวิตปกติได้', en: 'Go about your day.' }, { maxPm25: 37.5, th: 'พกหน้ากากไว้ ลดเวลากลางแจ้งนาน ๆ', en: 'Carry a mask; shorten long outdoor stretches.' }, { maxPm25: 1e9, th: 'N95 เมื่อออกจากบ้าน ปิดหน้าต่างที่ทำงาน', en: 'N95 outside; keep windows closed at work.' } ] },
    athlete:  { id: 'athlete', label_th: 'นักกีฬา', label_en: 'Athlete', blurb_th: 'ซ้อมหนัก = หายใจเข้าออกมากกว่าคนปกติ 3–4 เท่า — ฝุ่นเข้าลึกถึงถุงลมปลายทาง', blurb_en: 'Hard training means 3–4× the air — dust reaches the deepest air sacs.', ventilation: { rest: 0.6, moderate: 2.2, heavy: 4.5 }, guidance: [ { maxPm25: 15, th: 'ซ้อมกลางแจ้งได้เต็มที่', en: 'Full outdoor training is fine.' }, { maxPm25: 25, th: 'ซ้อมได้แต่ลดความเข้ม หลีกเลี่ยงช่วงเช้ามืดที่ฝุ่นสะสม', en: 'Train easier; skip the early-morning inversion hours.' }, { maxPm25: 1e9, th: 'ย้ายเข้ายิม — ซ้อมกลางแจ้งวันนี้เสียเปรียบปอดตัวเอง', en: 'Move indoors — outdoor training today trades lung for nothing.' } ] },
    senior:   { id: 'senior', label_th: 'ผู้สูงอายุ', label_en: 'Senior', blurb_th: 'หัวใจและปอดเปราะบางกว่า — ฝุ่นแรงแค่ไม่กี่วันก็กระทบความดันและการหายใจ', blurb_en: 'Older hearts and lungs feel even a few hazy days — blood pressure and breathing both.', ventilation: { rest: 0.5, moderate: 1.2, heavy: 2.0 }, guidance: [ { maxPm25: 15, th: 'เดินออกกำลังกายเบา ๆ ได้ตามปกติ', en: 'Gentle walks are fine.' }, { maxPm25: 25, th: 'เลือกเดินในที่ร่ม หลีกเลี่ยงเช้ามืด', en: 'Walk in the shade; skip dawn outings.' }, { maxPm25: 1e9, th: 'อยู่ในบ้าน เปิดเครื่องฟอก ถ้าหายใจลำบากหรือแน่นหน้าอกให้บอกคนใกล้ตัวทันที', en: 'Stay in, purifier on — tell someone right away if breathing feels hard or the chest feels tight.' } ] },
    pregnant: { id: 'pregnant', label_th: 'คุณแม่ตั้งครรภ์', label_en: 'Pregnant', blurb_th: 'หายใจเพื่อสองคน — ฝุ่นที่เข้ากระแสเลือดแม่ไปถึงรกได้', blurb_en: 'Breathing for two — dust in a mother\'s bloodstream can reach the placenta.', ventilation: { rest: 0.65, moderate: 1.6, heavy: 2.4 }, guidance: [ { maxPm25: 15, th: 'ใช้ชีวิตปกติได้', en: 'Normal day.' }, { maxPm25: 25, th: 'ลดกิจกรรมกลางแจ้ง พก N95 ติดตัว', en: 'Cut outdoor time; carry an N95.' }, { maxPm25: 1e9, th: 'อยู่ในบ้านให้มากที่สุด ใส่ N95 ทุกครั้งที่ต้องออกไป', en: 'Stay home as much as possible — N95 for every trip out.' } ] },
    asthma:   { id: 'asthma', label_th: 'หอบหืด', label_en: 'Asthma', blurb_th: 'หลอดลมไวต่อฝุ่นกว่าคนทั่วไปหลายเท่า — PM2.5 คือตัวกระตุ้นอันดับต้น ๆ', blurb_en: 'Asthmatic airways react to dust far sooner — PM2.5 is a top trigger.', ventilation: { rest: 0.55, moderate: 1.5, heavy: 2.6 }, guidance: [ { maxPm25: 15, th: 'พกยาพ่นติดตัวเหมือนทุกวัน แล้วออกไปใช้ชีวิตได้', en: 'Carry your inhaler as usual and enjoy the day.' }, { maxPm25: 25, th: 'ยาพ่นต้องอยู่ในกระเป๋า ลดกิจกรรมกลางแจ้งลงครึ่งหนึ่ง', en: 'Inhaler in pocket — halve your outdoor time.' }, { maxPm25: 1e9, th: 'อยู่ในบ้าน ปิดหน้าต่าง ถ้าพ่นยาแล้วไม่ดีขึ้นให้รีบไปโรงพยาบาล', en: 'Stay indoors, windows shut — if the inhaler doesn\'t help, get to a hospital.' } ] },
  },
  meta: {
    formulas: [
      { id: 'cigs', title_th: 'บุหรี่เทียบเท่า', title_en: 'Cigarette equivalents', formula: 'cigarettes/day = PM2.5 (µg/m³) ÷ 22', constants: '22 µg/m³ ตลอด 24 ชม. ≈ บุหรี่ 1 มวน', source: 'Berkeley Earth (Muller & Muller, 2015)' },
      { id: 'minutes', title_th: 'นาทีชีวิตที่หายไปวันนี้', title_en: 'Life minutes lost today', formula: 'minutes lost/day ≈ cigarettes × 11 นาที', constants: 'บุหรี่ 1 มวน ≈ ชีวิตสั้นลง ~11 นาที (ค่าเฉลี่ยประชากร)', source: 'Liu et al., NEJM 2019 · การประมาณการเชิงประชากร' },
      { id: 'aqli', title_th: 'อายุขัยที่หายไป (AQLI)', title_en: 'Years of life lost (AQLI)', formula: 'years lost ≈ 0.098 × (PM2.5 − 5)  [เกณฑ์ WHO 2021 = 5 µg/m³]', constants: 'WHO 2021 guideline: PM2.5 เฉลี่ยปี 5 µg/m³', source: 'Air Quality Life Index · Energy Policy Institute, University of Chicago' },
      { id: 'dose', title_th: 'ปริมาณฝุ่นที่สูดเข้าไป', title_en: 'Inhaled dose', formula: 'dose (µg) = PM2.5 × อัตราหายใจ (m³/h) × เวลา (h)', constants: 'เด็กพักผ่อน ~0.35 m³/h · ผู้ใหญ่ออกกำลังหนัก ~2.7 m³/h', source: 'WHO 2021 Global Air Quality Guidelines · US EPA exposure factors' },
      { id: 'visibility', title_th: 'ระยะมองเห็น', title_en: 'Visibility', formula: 'V (km) ≈ K ÷ β  (Koschmieder)', constants: 'K = 3.912 · β (การกระจายแสง) เติบโตตาม PM2.5', source: 'Koschmieder (1924) · ใช้มาตรฐานในงานอุตุนิยมวิทยา' },
    ],
  },
}

// ── Page state ───────────────────────────────────────────────────────────────
let science = null       // /api/science payload (or FALLBACK_SCIENCE)
let offline = false      // true when the fallback sample is on screen
let snapshot = null      // /api/snapshot payload (may stay null)
let province = localStorage.getItem('ad_story_province') ?? ''   // '' = national
let persona = localStorage.getItem('ad_story_persona') ?? 'kid'  // kid first — parents look for their kids

const PERSONA_ORDER = ['kid', 'teen', 'adult', 'athlete', 'senior', 'pregnant', 'asthma']
const PERSONA_FALLBACK_LABEL = {
  kid: ['เด็ก', 'Kid'], teen: ['วัยรุ่น', 'Teen'], adult: ['ผู้ใหญ่', 'Adult'],
  athlete: ['นักกีฬา', 'Athlete'], senior: ['ผู้สูงอายุ', 'Senior'],
  pregnant: ['คุณแม่ตั้งครรภ์', 'Pregnant'], asthma: ['หอบหืด', 'Asthma'],
}

// ── Data helpers ─────────────────────────────────────────────────────────────
function row() {
  if (province && science?.provinces?.length) {
    return science.provinces.find((p) => p.code === province) ?? science.national
  }
  return science?.national
}

function currentPm25() {
  const v = row()?.pm25 ?? science?.national?.pm25
  return Number.isFinite(v) ? v : null
}

function currentLevel() {
  return pm25Level(currentPm25()) ?? 3
}

/** Thai AQI level → the bilingual band name from i18n.js (single source). */
function bandLabel(level) {
  const b = LEVEL_NAME[level] ?? LEVEL_NAME[3]
  return tr(b.th, b.en)
}

// ── Count-up (wallet) — eased cubic, skipped entirely under reduced motion ──
function countUp(node, target, format, dur = 1400) {
  if (!node) return
  if (REDUCED || !Number.isFinite(target)) { node.textContent = format(target); return }
  const t0 = performance.now()
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur)
    const eased = 1 - Math.pow(1 - k, 3)
    node.textContent = format(target * eased)
    if (k < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ── 1 · HERO ─────────────────────────────────────────────────────────────────
function renderHero() {
  const pm = currentPm25()
  const level = currentLevel()
  const r = row() ?? {}
  const cigs = r.cigs_per_day ?? (pm != null ? pm / 22 : null)
  const lifeMin = r.life_minutes_per_day ?? (cigs != null ? cigs * 11 : null)

  // Breathing tint follows the live band.
  const tint = BREATH_VAR[level] ?? BREATH_VAR[3]
  document.documentElement.style.setProperty('--breath-now', tint)
  const breath = $('#breath')
  if (breath) breath.style.setProperty('--breath', tint)

  const cigNode = $('#cig-num')
  if (cigNode) {
    cigNode.innerHTML = cigs == null
      ? '—'
      : `${fmtNum(cigs, 1)} <span class="unit">${tr('มวน', 'cigarettes')}</span>`
  }
  const lifeNode = $('#life-min')
  if (lifeNode) lifeNode.textContent = lifeMin == null ? '—' : fmtNum(lifeMin, 0)
  const pmNode = $('#hero-pm')
  if (pmNode) pmNode.textContent = pm == null ? '—' : `${fmtNum(pm, 0)} µg/m³`

  const chip = $('#bandchip')
  if (chip) {
    chip.style.setProperty('--breath', tint)
    chip.querySelector('.txt').textContent = tr(
      `ตอนนี้อากาศ: ${bandLabel(level)} · PM2.5 ${pm == null ? '—' : fmtNum(pm, 0)} µg/m³`,
      `Right now: ${bandLabel(level)} · PM2.5 ${pm == null ? '—' : fmtNum(pm, 0)} µg/m³`)
  }
}

// ── Alert strip (under the hero) ─────────────────────────────────────────
// Shows a slim bilingual banner when /api/alerts has any active sev≥2 alert
// in the last 24h, or when the viewed province/national band is ≥ unhealthy
// (Thai AQI level 4+). The message links to /ops.html for details; the
// trailing CTA jumps to the subscribe links in the ACT chapter. 5-min TTL
// via getJson keeps it cheap; failures leave the strip hidden.
async function renderAlertStrip() {
  const strip = $('#alert-strip')
  const msg = $('#alert-strip-msg')
  if (!strip || !msg) return

  let severe = false
  try {
    const data = await getJson('/api/alerts?limit=100', 300_000)
    const cutoff = Date.now() - 24 * 3600_000
    severe = (data?.alerts ?? []).some((a) =>
      (a.severity ?? 0) >= 2 && Date.parse(a.ts ?? '') > cutoff)
  } catch { severe = false }

  const unhealthyHere = currentLevel() >= 4
  if (!severe && !unhealthyHere) { strip.hidden = true; return }

  strip.classList.toggle('severe', severe)
  msg.textContent = severe
    ? tr('🔴 อากาศอันตรายในบางพื้นที่ — ดูรายละเอียด', '🔴 Hazardous air in some areas — details')
    : tr('🟠 อากาศมีผลต่อสุขภาพในพื้นที่นี้ — ดูรายละเอียด', '🟠 Unhealthy air in this area — details')
  strip.hidden = false
}

// ── 2 · PERSONA ──────────────────────────────────────────────────────────────
function renderPersonaChips() {
  const host = $('#persona-chips')
  if (!host) return
  host.innerHTML = ''
  for (const id of PERSONA_ORDER) {
    const prof = science?.profiles?.[id]
    const [fbTh, fbEn] = PERSONA_FALLBACK_LABEL[id]
    const label = store.lang === 'th' ? (prof?.label_th ?? fbTh) : (prof?.label_en ?? fbEn)
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.persona = id
    b.textContent = label
    const active = id === persona
    b.classList.toggle('active', active)
    b.setAttribute('aria-pressed', active ? 'true' : 'false')
    b.addEventListener('click', () => {
      persona = id
      localStorage.setItem('ad_story_persona', id)
      renderPersonaChips()
      renderPersonal()
    })
    host.append(b)
  }
}

/** Client-side estimate used only when /api/science/personal is unreachable. */
function fallbackPersonal() {
  const pm = currentPm25() ?? science?.national?.pm25 ?? 24
  const prof = science?.profiles?.[persona] ?? FALLBACK_SCIENCE.profiles[persona] ?? FALLBACK_SCIENCE.profiles.kid
  const vent = prof?.ventilation ?? { rest: 0.5, moderate: 1.5, heavy: 2.5 }
  // A day ≈ 20 h at rest + 2 h moderate + outdoor minutes at moderate.
  const doseUg = pm * (vent.rest * 20 + vent.moderate * 2)
  const cigs = pm / 22
  const g = (prof?.guidance ?? []).find((x) => pm <= x.maxPm25)
  const level = pm25Level(pm) ?? 3
  const budgetTable = { 1: 300, 2: 240, 3: 90, 4: 30, 5: 0 }
  const personaFactor = { kid: 0.8, teen: 1, adult: 1, athlete: 1.2, senior: 0.7, pregnant: 0.7, asthma: 0.6 }
  return {
    pm25: pm, band: science?.national?.band ?? 'watch',
    dose_ug: Math.round(doseUg),
    cigs_per_day: cigs, life_minutes_per_day: cigs * 11,
    play_budget_min: Math.round((budgetTable[level] ?? 60) * (personaFactor[persona] ?? 1)),
    guidance_th: g?.th ?? 'ติดตามค่าฝุ่นก่อนออกจากบ้าน',
    guidance_en: g?.en ?? 'Check the dust level before heading out',
    profile: persona, __estimate: true,
  }
}

async function renderPersonal() {
  const card = $('#persona-card')
  if (!card || !science) return

  const prof = science?.profiles?.[persona]
  const [fbTh, fbEn] = PERSONA_FALLBACK_LABEL[persona]
  const who = store.lang === 'th' ? (prof?.label_th ?? fbTh) : (prof?.label_en ?? fbEn)
  const blurb = store.lang === 'th' ? (prof?.blurb_th ?? '') : (prof?.blurb_en ?? '')

  let d = null
  try {
    const q = new URLSearchParams({ profile: persona, outdoorMin: '60', activity: 'moderate' })
    if (province) q.set('province', province)
    const pm = currentPm25()
    if (pm != null) q.set('pm25', String(pm))
    d = await getJson(`/api/science/personal?${q.toString()}`, 30_000)
  } catch {
    d = fallbackPersonal()
  }

  // Live payload: { dose_ug, cigs_equiv, life_minutes, play_budget_min,
  // play_unlimited, guidance: {th,en} }. Draft-contract/fallback shape used
  // cigs_per_day / life_minutes_per_day / guidance_th — accept both.
  const cigs = d.cigs_equiv ?? d.cigs_per_day ?? null
  const lifeMin = d.life_minutes ?? d.life_minutes_per_day ?? null
  const guideTh = d.guidance?.th ?? d.guidance_th ?? d.guidance_en ?? d.guidance?.en ?? ''
  const guideEn = d.guidance?.en ?? d.guidance_en ?? d.guidance_th ?? d.guidance?.th ?? ''
  const playTxt = d.play_unlimited
    ? tr('ไม่จำกัด', 'unlimited')
    : (d.play_budget_min == null ? '—' : fmtNum(d.play_budget_min, 0))

  card.innerHTML = `
    <div class="who">${escapeHtml(who)}</div>
    <div class="blurb">${escapeHtml(blurb)}</div>
    <div class="numrow">
      <div class="numcell dose">
        <div class="n">${d.dose_ug == null ? '—' : fmtNum(d.dose_ug, 1)}</div>
        <div class="l">${tr('µg ฝุ่นจากกิจกรรมกลางแจ้ง 60 นาทีวันนี้ — ฟังดูน้อย แต่คืออนุภาคหลายพันล้านตัว', 'µg of dust from 60 outdoor minutes today — sounds tiny, but it\'s hundreds of billions of particles')}</div>
      </div>
      <div class="numcell">
        <div class="n">${playTxt}</div>
        <div class="l">${tr('นาที — งบเล่นกลางแจ้งที่เหลือวันนี้ ก่อนถึงเกณฑ์ที่ควรเข้าบ้าน', 'minutes — your remaining outdoor-play budget today before it\'s better to head inside')}</div>
      </div>
      <div class="numcell">
        <div class="n">${cigs == null ? '—' : fmtNum(cigs, 2)}</div>
        <div class="l">${tr('มวนเทียบเท่าจากชั่วโมงที่เล่นอยู่ข้างนอก · เสียไป', 'cigarette-equivalents from that outdoor hour · costing')}${lifeMin == null ? '' : ` ${fmtNum(lifeMin, 1)} ${tr('นาทีของชีวิต', 'minutes of life')}`}</div>
      </div>
    </div>
    <div class="guidance"><b>${tr('คำแนะนำวันนี้:', 'Today\'s advice:')}</b> ${escapeHtml(store.lang === 'th' ? guideTh : guideEn)}</div>
    ${d.__estimate ? `<div class="blurb" style="margin-top:10px">${tr('· ประมาณการฝั่งเบราว์เซอร์ (API วิทยาศาสตร์ยังไม่พร้อม)', '· browser-side estimate (science API not ready yet)')}</div>` : ''}`
}

// ── 3 · BODY ─────────────────────────────────────────────────────────────────
function renderBody() {
  const m3 = science?.national?.air_breathed_m3_per_day ?? 11
  const cars = m3 / 3 // a sedan's cabin ≈ 3 m³ of air
  const m3Node = $('#body-m3')
  if (m3Node) m3Node.textContent = fmtNum(m3, 0)
  const carsNode = $('#body-cars')
  if (carsNode) carsNode.textContent = fmtNum(cars, 1)

  // Red PM2.5 particles drifting down the airway path — SMIL, skipped for
  // reduced-motion readers (the static path + captions carry the story).
  const svg = $('#bodymap')
  if (svg && !REDUCED && !svg.dataset.particles) {
    svg.dataset.particles = '1'
    const ns = 'http://www.w3.org/2000/svg'
    for (let i = 0; i < 4; i++) {
      const c = document.createElementNS(ns, 'circle')
      c.setAttribute('r', '3')
      c.setAttribute('class', 'particle')
      const m = document.createElementNS(ns, 'animateMotion')
      m.setAttribute('dur', `${7 + i * 1.7}s`)
      m.setAttribute('repeatCount', 'indefinite')
      m.setAttribute('path', 'M180,18 C120,70 240,110 180,160 C120,210 240,250 180,300 C140,340 220,380 180,420 C160,450 200,470 180,496')
      c.append(m)
      svg.append(c)
    }
  }
}

// ── 4 · WALLET ───────────────────────────────────────────────────────────────
function renderWallet() {
  const n = science?.national ?? {}
  const costM = n.daily_cost_million_thb
    ?? (n.haze_tax_thb_per_person != null && n.population != null
      ? (n.haze_tax_thb_per_person * n.population) / 1e6 : null)
  const tax = n.haze_tax_thb_per_person

  countUp($('#bill-num'), costM, (v) => v == null ? '—' : `฿${fmtNum(v, 0)}`)
  const taxNode = $('#tax-num')
  if (taxNode) taxNode.textContent = tax == null ? '—' : `฿${fmtNum(tax, 2)}`

  if (costM != null) {
    const lunches = (costM * 1e6) / 25       // a Thai school lunch ≈ ฿25
    const masks = (costM * 1e6) / 30         // an N95 ≈ ฿30
    const cmKids = 200_000                   // ≈ school-age kids in Chiang Mai
    const perKid = masks / cmKids
    const cmp = $('#wallet-compare')
    if (cmp) cmp.innerHTML = `
      <li>${tr(`= อาหารกลางวันนักเรียน ${fmtNum(lunches / 1e6, 1)} ล้านมื้อ (มื้อละ ~฿25)`, `= ${fmtNum(lunches / 1e6, 1)} million school lunches (~฿25 each)`)}</li>
      <li>${tr(`= หน้ากาก N95 ${fmtNum(masks / 1e6, 1)} ล้านชิ้น — พอแจกเด็กทุกคนในเชียงใหม่ (≈2 แสนคน) คนละ ${fmtNum(perKid, 0)} ชิ้น`, `= ${fmtNum(masks / 1e6, 1)} million N95 masks — enough for every kid in Chiang Mai (~200k) to get ${fmtNum(perKid, 0)} each`)}</li>`
  }
}

// ── 5 · SKY ──────────────────────────────────────────────────────────────────
function matchSnapshotProvince() {
  const provs = snapshot?.risk?.provinces
  if (!provs?.length) return null
  if (province) return provs.find((p) => p.province_code === province) ?? null
  // national view → the worst-scoring province drives the sky story
  return [...provs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
}

/** Cause info shape is server-defined; accept {th,en}, a string, or an array. */
function causeText(cause) {
  if (!cause) return null
  if (typeof cause === 'string') return cause
  if (Array.isArray(cause)) return cause.map(causeText).filter(Boolean).join(' · ') || null
  return cause[store.lang === 'th' ? 'th' : 'en'] ?? cause.th ?? cause.en ?? null
}

function renderSky() {
  const r = row() ?? {}
  const pm = currentPm25()
  const vis = r.visibility_km ?? (pm != null ? Math.min(40, 250 / pm) : null)
  const visNode = $('#vis-km')
  if (visNode) visNode.textContent = vis == null ? '—' : fmtNum(vis, 0)

  const sp = matchSnapshotProvince()
  const nat = snapshot?.risk?.national ?? {}
  const provs = snapshot?.risk?.provinces ?? []
  const avgStag = provs.length
    ? Math.round(provs.reduce((s, p) => s + (p.stagnation_comp ?? 0), 0) / provs.length)
    : null

  const trap = $('#sky-trap')
  if (trap) {
    const verdict = snapshot?.risk?.national_verdict
    const verdictTxt = verdict ? (store.lang === 'th' ? verdict.th : (verdict.en ?? verdict.th)) : null
    const bits = []
    if (nat.dustSeason) bits.push(tr('อยู่ช่วงฤดูฝุ่น (มกราคม–เมษายน) — อากาศนิ่งสะสมทุกวัน', 'It\'s dust season (Jan–Apr) — stagnant air accumulates daily'))
    if (avgStag != null) bits.push(tr(
      `ดัชนีอากาศนิ่งทั่วประเทศ ${avgStag}/100 ${avgStag >= 50 ? '— ลมอ่อน ฝุ่นไม่มีทางออก' : '— ลมยังพาไหลอยู่บ้าง'}`,
      `National stagnation index ${avgStag}/100 ${avgStag >= 50 ? '— weak winds, the dust has no way out' : '— some wind is still moving things along'}`))
    if (!bits.length && verdictTxt) bits.push(verdictTxt)
    if (!bits.length) bits.push(tr('กำลังรอข้อมูลลมและการระบายอากาศ…', 'Waiting for wind and ventilation data…'))
    trap.textContent = bits.join(' · ')
  }

  const chips = $('#cause-chips')
  if (chips) {
    chips.innerHTML = ''
    const name = sp ? (store.lang === 'th' ? sp.province_th : (sp.province_en ?? sp.province_th)) : null
    const cause = causeText(sp?.cause)
    // Province cause first; on good-air days (cause: null) fall back to the
    // national verdict's reason list so the chips never read as broken.
    const reasons = (snapshot?.risk?.national_verdict?.reasons ?? []).map(causeText).filter(Boolean)
    if (cause && name) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.innerHTML = `<b>${escapeHtml(name)}</b> · ${escapeHtml(cause)}`
      chips.append(chip)
    } else if (reasons.length) {
      for (const r of reasons.slice(0, 4)) {
        const chip = document.createElement('span')
        chip.className = 'chip'
        chip.textContent = r
        chips.append(chip)
      }
    } else {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = tr('ยังไม่มีข้อมูลสาเหตุรายจังหวัดในตอนนี้', 'No per-province cause data right now')
      chips.append(chip)
    }
  }

  // 72h outlook — today / +24h / +48h from the snapshot's own forecast fields.
  const out = $('#outlook')
  if (out) {
    const cells = sp ? [
      { d: tr('วันนี้', 'today'), v: sp.pm25 },
      { d: tr('+24 ชม.', '+24h'), v: sp.pm25_fc_24h },
      { d: tr('+48 ชม.', '+48h'), v: sp.pm25_fc_48h },
    ] : []
    out.innerHTML = cells.length
      ? cells.map((c) => `<div class="day"><div class="d">${c.d}</div><div class="v">${c.v == null ? '—' : fmtNum(c.v, 0)}</div><div class="u">µg/m³</div></div>`).join('')
      : `<div class="day"><div class="d">${tr('พยากรณ์', 'outlook')}</div><div class="v">—</div><div class="u">${tr('รอข้อมูล', 'waiting')}</div></div>`
  }
}

// ── Dust Engines — the structural "why does this place get dusty at all?"
// Complements the live cause chips, which are correctly empty whenever the
// air is clean. This never is: the winter inversion over Bangkok and the
// cane calendar in the central plains are true in July too. Collapsed by
// default so the Sky chapter stays scannable; the summary line always
// shows, the mechanisms open on tap.
async function renderDustEngines() {
  const host = $('#dust-engines')
  const sumEl = $('#engines-summary')
  const bodyEl = $('#engines-body')
  const toggle = $('#engines-toggle')
  if (!host || !sumEl || !bodyEl || !toggle) return

  // Province from the current selection; with no province chosen fall back
  // to Bangkok's archetype — it is the one most readers are asking about.
  const code = province || '10'
  let data = null
  try {
    data = await getJson(`/api/dust-engines?province=${encodeURIComponent(code)}`, 3600_000)
  } catch { host.hidden = true; return }
  if (!data?.engines?.length) { host.hidden = true; return }

  sumEl.textContent = tr(data.summary_th, data.summary_en)
  bodyEl.innerHTML = data.engines.map((e) => `
    <div class="engine${e.active_now ? ' is-now' : ''}">
      <div class="engine-t">${escapeHtml(tr(e.title_th, e.title_en))}${
        e.active_now ? `<span class="engine-now">${tr('ช่วงนี้', 'in season')}</span>` : ''}</div>
      <div class="engine-m">${escapeHtml(tr(e.mechanism_th, e.mechanism_en))}</div>
    </div>`).join('') +
    `<div class="engine-note">${escapeHtml(tr(data.method_th, data.method_en))}</div>`

  if (!toggle.dataset.bound) {
    toggle.dataset.bound = '1'
    toggle.addEventListener('click', () => {
      const open = bodyEl.hidden
      bodyEl.hidden = !open
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggle.classList.toggle('open', open)
    })
  }
  host.hidden = false
}

// ── 6 · FOREST ───────────────────────────────────────────────────────────────
function renderForest() {
  const host = $('#forest-body')
  if (!host) return
  const o3 = science?.national?.o3_crop_stress
  if (!o3 || o3.aot40_week_ppbh == null) {
    host.innerHTML = `<div class="nullstate">${tr(
      'สถานีวัดโอโซนในประเทศไทยยังมีน้อย — สัปดาห์นี้เราไม่มีข้อมูลพอจะคำนวณดัชนีความเครียดของพืช เราแสดงเท่าที่วัดได้จริง ไม่เดาตัวเลข',
      'Thailand has few ozone monitors — this week there isn\'t enough data for a plant-stress index. We show only what we actually measure, never guesses.')}</div>`
    return
  }
  host.innerHTML = `
    <div class="numrow">
      <div class="numcell">
        <div class="n">${fmtNum(o3.aot40_week_ppbh, 0)}</div>
        <div class="l">${tr('ppb·ชม. — ดัชนี AOT40 สะสม 7 วัน (โอโซนที่พืชต้องทน)', 'ppb·h — 7-day AOT40 index (the ozone plants had to endure)')}</div>
      </div>
      <div class="numcell">
        <div class="n">${escapeHtml(String(o3.band ?? '—'))}</div>
        <div class="l">${tr('ระดับความเครียดของพืช — โอโซนแผดเผารูรับแสงบนใบ ข้าวโตช้าลง', 'plant-stress level — ozone burns leaf pores; rice grows slower')}</div>
      </div>
    </div>`
}

// ── 7 · RECEIPTS ─────────────────────────────────────────────────────────────
function renderReceipts() {
  const host = $('#formula-wall')
  if (!host) return
  const formulas = science?.meta?.formulas ?? []
  if (!formulas.length) {
    host.innerHTML = `<div class="nullstate">${tr('กำลังรอสูตรจากเซิร์ฟเวอร์…', 'Waiting for the formula wall from the server…')}</div>`
    return
  }
  host.innerHTML = formulas.map((f) => {
    // constants arrives as a { key: value } object from the live API, but
    // the fallback sample uses plain strings — render either honestly.
    const consts = f.constants == null ? ''
      : typeof f.constants === 'string' ? f.constants
      // A constant's value can itself be an object — the AOT40 receipt
      // carries bands: {low, moderate, elevated}. Interpolating that
      // directly rendered a literal "[object Object]" on the wall, so
      // flatten one level into "bands: low <210, moderate 210–700".
      : Object.entries(f.constants).map(([k, v]) =>
          v !== null && typeof v === 'object' && !Array.isArray(v)
            ? `${k}: ${Object.entries(v).map(([bk, bv]) => `${bk} ${bv}`).join(', ')}`
            : `${k} = ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')
    return `
    <div class="formula-card">
      <h3>${escapeHtml(store.lang === 'th' ? (f.title_th ?? f.title_en ?? f.id) : (f.title_en ?? f.title_th ?? f.id))}</h3>
      <pre class="fx">${escapeHtml(f.formula ?? '')}</pre>
      ${consts ? `<div class="consts">${escapeHtml(consts)}</div>` : ''}
      ${f.source ? `<div class="src">${escapeHtml(f.source)}</div>` : ''}
    </div>`
  }).join('')
}

// ── 8 · ACT ──────────────────────────────────────────────────────────────────
function renderAct() {
  const host = $('#checklist')
  if (!host) return
  const level = currentLevel()
  const plans = {
    good: [
      { t: ['ออกไปเล่น ไปวิ่งได้เต็มที่', 'Go play, go run — full speed'], d: ['อากาศแบบนี้หายใจได้เต็มปอด', 'Days like this are made for deep breaths.'] },
      { t: ['เปิดหน้าต่างรับลม', 'Open the windows'], d: ['อากาศข้างนอกดีกว่าในบ้านวันนี้', 'Outside air beats indoor air today.'] },
      { t: ['ไม่ต้องใส่หน้ากาก', 'No mask needed'], d: ['เก็บ N95 ไว้ในตู้ก่อน', 'Keep the N95 in the drawer.'] },
    ],
    mid: [
      { t: ['กลุ่มเปราะบางพกหน้ากาก', 'Sensitive groups: carry a mask'], d: ['เด็กเล็ก ผู้สูงอายุ คนหอบหืด — N95 ในกระเป๋า', 'Little kids, seniors, asthma — an N95 in the bag.'] },
      { t: ['เล่นกลางแจ้งได้ แต่ฟังร่างกาย', 'Outdoor play OK — listen to your body'], d: ['ไอหรือหายใจลำบาก = สัญญาณกลับเข้าบ้าน', 'Coughing or tight breathing = time to head in.'] },
      { t: ['เช็กค่าฝุ่นก่อนออกจากบ้าน', 'Check the dust level before leaving'], d: ['ตัวเลขเปลี่ยนได้ทุกชั่วโมง', 'The number can change hour to hour.'] },
    ],
    bad: [
      { t: ['ใส่ N95 ทุกครั้งที่ออกจากบ้าน', 'N95 every time you step out'], d: ['หน้ากากผ้าและหน้ากากอนามัยกัน PM2.5 ไม่อยู่', 'Cloth and surgical masks can\'t stop PM2.5.'] },
      { t: ['เล่นและออกกำลังกายในบ้าน', 'Play and exercise indoors'], d: ['ปิดหน้าต่าง เปิดเครื่องฟอกถ้ามี', 'Windows closed, purifier on if you have one.'] },
      { t: ['เฝ้าดูอาการตัวเองและคนใกล้ตัว', 'Watch symptoms — yours and others\''], d: ['ไอเรื้อรัง หายใจลำบาก แน่นหน้าอก = พบแพทย์', 'Persistent cough, hard breathing, chest tightness = see a doctor.'] },
    ],
  }
  const plan = level <= 2 ? plans.good : level === 3 ? plans.mid : plans.bad
  host.innerHTML = plan.map((item, i) => `
    <div class="item">
      <div class="box">${i + 1}</div>
      <div><div class="t">${tr(item.t[0], item.t[1])}</div><div class="d">${tr(item.d[0], item.d[1])}</div></div>
    </div>`).join('')
}

// ── Location: province select + geolocation ──────────────────────────────────
function buildProvinceSelect() {
  const sel = $('#province-select')
  if (!sel || !science) return
  sel.innerHTML = ''
  const optAll = document.createElement('option')
  optAll.value = ''
  optAll.textContent = tr('ทั้งประเทศ', 'All Thailand')
  sel.append(optAll)
  for (const p of science.provinces ?? []) {
    const o = document.createElement('option')
    o.value = p.code
    o.textContent = store.lang === 'th' ? (p.name_th ?? p.name_en) : (p.name_en ?? p.name_th)
    sel.append(o)
  }
  sel.value = province
}

/** Try GPS → nearest station → province. Silent no-op on any failure. */
function resolveLocation() {
  if (province || !('geolocation' in navigator)) return
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude: lat, longitude: lng } = pos.coords
      const near = await getJson(`/api/stations/nearest?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, 60_000)
      // Live shape: { stations: [ { province_th, province_en, … } ] }.
      const st = near?.stations?.[0] ?? near
      const name = st?.province_th ?? near?.province_th ?? near?.province ?? st?.province_en ?? null
      if (!name) return
      const hit = (science?.provinces ?? []).find((p) =>
        (p.name_th && name.includes(p.name_th)) || (p.name_th && p.name_th.includes(name)) ||
        (p.name_en && String(name).toLowerCase().includes(p.name_en.toLowerCase())))
      if (hit) {
        province = hit.code
        localStorage.setItem('ad_story_province', province)
        buildProvinceSelect()
        renderAll()
      }
    } catch { /* location is a bonus — the manual select is the contract */ }
  }, () => {}, { timeout: 6000, maximumAge: 900_000 })
}

// ── Chrome: language toggle, offline banner ──────────────────────────────────
function wireChrome() {
  const toggle = $('#langtoggle')
  if (toggle) {
    const paint = () => toggle.querySelectorAll('button').forEach((b) => {
      const active = b.dataset.lang === store.lang
      b.classList.toggle('active', active)
      b.setAttribute('aria-pressed', active ? 'true' : 'false')
    })
    toggle.addEventListener('click', (e) => {
      const lang = e.target?.dataset?.lang
      if (lang) { setLang(lang); paint() }
    })
    paint()
  }

  const sel = $('#province-select')
  if (sel) sel.addEventListener('change', () => {
    province = sel.value
    localStorage.setItem('ad_story_province', province)
    renderAll()
  })

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

function renderOfflineBanner() {
  const host = $('#offline-banner')
  if (!host) return
  host.hidden = !offline
  if (offline) {
    host.textContent = tr(
      '⚠ เซิร์ฟเวอร์วิทยาศาสตร์กำลังติดตั้ง — ตัวเลขด้านล่างเป็น “ข้อมูลตัวอย่าง” ที่คำนวณด้วยสูตรจริง ไม่ใช่ค่าสด',
      '⚠ The science server is still deploying — the numbers below are a clearly-marked SAMPLE computed with the real formulas, not live readings.')
  }
}

// ── Render everything (also the language-switch entry point) ─────────────────
function renderAll() {
  if (!science) return
  renderOfflineBanner()
  buildProvinceSelect()
  renderHero()
  renderAlertStrip()
  renderPersonaChips()
  renderPersonal()
  renderBody()
  renderWallet()
  renderSky()
  renderDustEngines()
  renderForest()
  renderReceipts()
  renderAct()
}

async function boot() {
  wireChrome()
  try {
    science = await getJson('/api/science', 60_000)
    if (!science || typeof science !== 'object' || !science.national) throw new Error('bad science payload')
  } catch {
    science = FALLBACK_SCIENCE
    offline = true
  }
  renderAll()
  paintChrome()

  // Snapshot powers the sky chapter (stagnation, causes, 72h outlook).
  // Arrives whenever it arrives — never blocks the story. The emit also
  // wakes up the data-freshness pill in the footer so the story's
  // freshness signal comes from the same source the operator dashboard
  // uses.
  getJson('/api/snapshot', 60_000)
    .then((s) => { snapshot = s; store.snapshot = s; renderSky(); emit('snapshot', s) })
    .catch(() => {})

  // Start the freshness pill immediately in "connecting" state so the
  // footer line is honest while the snapshot is in flight. initDataFreshness
  // is idempotent; calling it more than once is fine.
  try { initDataFreshness() } catch {}

  resolveLocation()
}

on('lang', () => { paintChrome(); renderAll() })

boot()
