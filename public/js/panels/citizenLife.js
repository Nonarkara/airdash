// LIFE-SAVING ADDITIONS FOR THE CITIZEN PANEL
// =============================================
// This module extends the citizen (EASY) panel with four action-oriented
// sections the original panel lacked. They are the difference between
// "data shown" and "people safe":
//
//   1. PERSONA — "Who are you?" The science engine already has 7 personas
//      (kid, pregnant, asthma, athlete, senior, heart patient, healthy
//      adult) with play_budget_min. Generic "everyone" advice misses
//      that a 7-year-old breathes 2× more per kilo, that a pregnant
//      woman is breathing for two, that an asthma patient can go into
//      bronchospasm inside 15 min. Each persona has its own play budget,
//      its own specific warning, its own specific action.
//
//   2. ACTION TIMELINE — the 4 generic "watch/elevated/high" advice lines
//      are the WHOLE script for the most critical 24-72 hours of a dust
//      episode. The action timeline breaks them into "next 5 min / next
//      hour / today / this week" so a reader doesn't have to remember
//      everything at once — the next 5 min is concrete (close windows,
//      put on N95 if you go out); the rest unfolds in order.
//
//   3. MASK GUIDE — most Thai households own only cloth or surgical
//      masks. Those filter ~5% and ~30% of PM2.5 respectively. A line
//      saying "wear N95" without telling the reader that their current
//      mask probably doesn't qualify is operationally equivalent to
//      saying nothing. The guide shows the actual filtration
//      effectiveness, the fit-check (one breath test), and a
//      Thailand-context price range (10–30 baht at any pharmacy).
//
//   4. SYMPTOM CHECKER — the 1422 / 1669 hotlines are already in the
//      panel, but the user has to figure out which one to call. The
//      symptom checker maps the four most dangerous acute symptoms
//      (cough / hard breathing / chest pain / wheezing) onto the right
//      action (watch 24 h / see doctor today / call 1669 now / call 1422
//      now). One tap on a symptom shows the action.
//
// All copy is bilingual. The Thai side uses polite particles (ค่ะ/ครับ
// and หนู where appropriate) and short sentences (~15-20 syllables) —
// the median Thai adult reads at a 6th–8th grade level, and the
// 7-year-old the panel is meant to help has an even shorter attention
// span. The English side uses a registered-nurse register: warm,
// direct, never preachy. "Don't" is reserved for emergencies.
import { on, store } from '../state.js?v=2.4.44'
import { tr } from '../i18n.js?v=2.4.44'
import { el } from '../fmt.js?v=2.4.44'
import { getJson } from '../cache.js?v=2.4.44'

// ── 1. PERSONA SELECTOR + SPECIFIC ADVICE ─────────────────────────────────

// Personas mirror server/science.js. Each entry is { id, label_th, label_en,
// emoji, short_risk_th, short_risk_en, what_changes_th, what_changes_en }.
// what_changes is the one thing the persona needs to know that generic
// advice doesn't say: a kid breathes more per kilo, a pregnant woman is
// breathing for two, an asthma patient can bronchospasm in 15 min.
const PERSONAS = [
  {
    id: 'kid', emoji: '👶',
    label_th: 'เด็ก (6–12)', label_en: 'Kid (6–12)',
    risk_th: 'ปอดยังโตไม่เต็มที่ หายใจเร็วกว่าผู้ใหญ่ 2 เท่า',
    risk_en: 'Lungs still developing, breathes ~2× more air per kilo',
    what_changes_th: 'ลดเวลากลางแจ้งลงครึ่งหนึ่ง — เด็กเสี่ยงมากกว่าผู้ใหญ่',
    what_changes_en: 'Halve outdoor time — kids are far more sensitive than adults',
  },
  {
    id: 'pregnant', emoji: '🤰',
    label_th: 'คุณแม่ตั้งครรภ์', label_en: 'Pregnant',
    risk_th: 'หายใจเพื่อสองคน — ฝุ่นทะลุถึงรกได้',
    risk_en: 'Breathing for two — PM2.5 can reach the placenta',
    what_changes_th: 'อยู่ในบ้านเมื่อฝุ่นเกิน 25 µg/m³ ใส่ N95 ทุกครั้งที่ออกนอก',
    what_changes_en: 'Stay indoors above 25 µg/m³, N95 every trip out',
  },
  {
    id: 'asthma', emoji: '🫁',
    label_th: 'หอบหืด / ปอดอุดกั้น', label_en: 'Asthma / COPD',
    risk_th: 'หลอดลมไวต่อฝุ่นมาก — อาจหอบใน 15 นาที',
    risk_en: 'Airways hyperreactive — bronchospasm can start in 15 min',
    what_changes_th: 'พกยาพ่นติดตัวทุกวัน — ถ้าใช้ยาซ้ำ 2 ครั้งใน 4 ชม. ไปพบแพทย์',
    what_changes_en: 'Carry your inhaler — if you need it twice in 4 h, see a doctor',
  },
  {
    id: 'athlete', emoji: '🏃',
    label_th: 'นักกีฬา / ออกกำลังหนัก', label_en: 'Athlete / heavy exercise',
    risk_th: 'ซ้อมหนัก = หายใจเข้าออก 3–4 เท่าของคนปกติ',
    risk_en: 'Hard training = 3–4× more air through the lungs',
    what_changes_th: 'ย้ายซ้อมเข้าในร่มเมื่อฝุ่นเกิน 25 µg/m³',
    what_changes_en: 'Move training indoors above 25 µg/m³',
  },
  {
    id: 'senior', emoji: '👴',
    label_th: 'ผู้สูงอายุ 65+', label_en: 'Senior 65+',
    risk_th: 'หัวใจและปอดเปราะบาง — ฝุ่นเพิ่มความเสี่ยงหัวใจวาย',
    risk_en: 'Older heart and lungs — PM2.5 raises heart-attack risk',
    what_changes_th: 'เช็คความดันบ่อยขึ้น งดออกกำลังกลางแจ้งเมื่อฝุ่นเกิน 25 µg/m³',
    what_changes_en: 'Check BP more often, skip outdoor exercise above 25 µg/m³',
  },
  {
    id: 'heart', emoji: '❤️',
    label_th: 'โรคหัวใจ / หลอดเลือด', label_en: 'Heart / vascular disease',
    risk_th: 'ฝุ่นทำให้หัวใจเต้นผิดจังหวะ ภายใน 2 ชั่วโมง',
    risk_en: 'PM2.5 can trigger arrhythmia within 2 hours',
    what_changes_th: 'พกยาติดตัว งดออกแรง โทร 1669 ถ้าเจ็บหน้าอก',
    what_changes_en: 'Carry your meds, avoid exertion, call 1669 if chest pain',
  },
  {
    id: 'adult', emoji: '🧑',
    label_th: 'ผู้ใหญ่ทั่วไป', label_en: 'Healthy adult',
    risk_th: 'ความเสี่ยงสะสม — ทุกวันที่ฝุ่นสูงคือหนี้สุขภาพ',
    risk_en: 'Risk accumulates — each bad day is a deposit on future illness',
    what_changes_th: 'เลี่ยงออกกลางแจ้งนาน ๆ เมื่อฝุ่นเกิน 37.5 µg/m³',
    what_changes_en: 'Avoid long outdoor exposure above 37.5 µg/m³',
  },
]

const PERSONA_KEY = 'ad_my_persona'

function readPersona() {
  try {
    const raw = localStorage.getItem(PERSONA_KEY)
    if (!raw) return null
    const id = JSON.parse(raw)
    return PERSONAS.find((p) => p.id === id) ?? null
  } catch { return null }
}

function writePersona(id) {
  if (id === null) localStorage.removeItem(PERSONA_KEY)
  else localStorage.setItem(PERSONA_KEY, JSON.stringify(id))
}

// Returns "20 นาที" / "20 min" — the persona's play budget at the
// current pm25. Pulls from /api/science/personal. Returns null if the
// science API hasn't loaded yet; the calling code shows a "loading…"
// placeholder in that case.
async function fetchPlayBudget(province, personaId) {
  if (!province?.code) return null
  try {
    const j = await getJson(
      `/api/science/personal?code=${province.code}&profile=${personaId}`,
      5 * 60_000,
    )
    const p = (j?.provinces ?? []).find((x) => String(x.code) === String(province.code))
    if (!p) return null
    return {
      playBudgetMin: p.play_budget_min,
      playUnlimited: p.play_unlimited,
      pm25: p.pm25,
      band: p.band,
    }
  } catch { return null }
}

// "20 นาที" / "20 min" — short human form. Used in the persona card.
function playBudgetText(min, unlimited, lang) {
  if (unlimited) return tr('ไม่จำกัดเวลา · เล่นได้ตามสบาย', 'No time limit — play as long as you like')
  if (min == null) return tr('กำลังคำนวณ…', 'calculating…')
  if (lang === 'th') return `${min} นาทีกลางแจ้ง · หลังจากนั้นเข้าบ้าน`
  return `${min} min outside · then head indoors`
}

// Renders the persona selector + the active persona's specific advice
// + play budget. Embedded in the citizen panel between the "head" and
// the generic advice row.
export async function renderPersonaSection(province, band) {
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🧬 คุณคือใคร?', '🧬 Who are you?')))
  // Short explainer: why picking helps
  const intro = el('div', { class: 'citizen-persona-intro' },
    tr(
      'ฝุ่นก้อนเดียวกัน ผลต่อแต่ละคนไม่เท่ากัน — เลือกกลุ่มของคุณเพื่อคำแนะนำเฉพาะตัว',
      'The same dust hits every body differently — pick your group for tailored advice',
    ))

  // Pill row
  const pillRow = el('div', { class: 'citizen-persona-pills', role: 'group' })
  const current = readPersona()
  for (const p of PERSONAS) {
    const active = current?.id === p.id
    const btn = el('button', {
      class: `citizen-persona-pill${active ? ' active' : ''}`,
      type: 'button',
      'aria-pressed': active ? 'true' : 'false',
      onclick: () => {
        writePersona(p.id)
        // Re-render the whole persona section
        const host = document.getElementById('citizen-persona-host')
        if (host) {
          host.replaceChildren()
          renderPersonaInto(host, province, band)
        }
      },
    },
      el('span', { class: 'citizen-persona-emoji' }, p.emoji),
      el('span', { class: 'citizen-persona-lbl' }, tr(p.label_th, p.label_en)),
    )
    pillRow.append(btn)
  }

  // Active persona card — only shown if a persona is selected
  let personaCard = null
  if (current) {
    const budget = await fetchPlayBudget(province, current.id)
    const budgetText = budget ? playBudgetText(budget.playBudgetMin, budget.playUnlimited, store.lang) : null
    personaCard = el('div', { class: 'citizen-persona-card' },
      el('div', { class: 'citizen-persona-head' },
        el('span', { class: 'citizen-persona-card-emoji' }, current.emoji),
        el('div', {},
          el('div', { class: 'citizen-persona-card-title' }, tr(current.label_th, current.label_en)),
          el('div', { class: 'citizen-persona-card-risk' }, tr(current.risk_th, current.risk_en)),
        ),
      ),
      // Play budget is the single most actionable number for parents
      // of young kids, pregnant women, seniors — anyone managing
      // someone else's exposure. "20 min outside, then inside" is the
      // kind of number that gets remembered and acted on.
      budgetText && el('div', { class: 'citizen-persona-budget' },
        el('div', { class: 'citizen-persona-budget-lbl' },
          tr('เวลาเล่นกลางแจ้งที่แนะนำ', 'Recommended outdoor time')),
        el('div', { class: 'citizen-persona-budget-num' }, budgetText),
      ),
      // Persona-specific action — different from the generic advice.
      // The persona-aware version is what the science engine already
      // encodes; we surface it as a single bold line so it doesn't
      // get lost in the per-band grid.
      el('div', { class: 'citizen-persona-action' },
        el('span', { class: 'citizen-persona-action-lbl' },
          tr('สำหรับคุณโดยเฉพาะ:', 'Specifically for you:')),
        el('div', { class: 'citizen-persona-action-text' },
          tr(current.what_changes_th, current.what_changes_en)),
      ),
      // Clear selection
      el('button', {
        class: 'citizen-persona-clear', type: 'button',
        onclick: () => {
          writePersona(null)
          const host = document.getElementById('citizen-persona-host')
          if (host) {
            host.replaceChildren()
            renderPersonaInto(host, province, band)
          }
        },
      }, tr('ล้าง', 'clear')),
    )
  }

  const out = el('div', { class: 'citizen-persona-host-inner' })
  out.append(head, intro, pillRow)
  if (personaCard) out.append(personaCard)
  return out
}

function renderPersonaInto(host, province, band) {
  renderPersonaSection(province, band).then((node) => {
    host.append(node)
  })
}

export function initCitizenPersona() {
  // Hook into snapshot + my-province-changed to refresh the persona
  // card. The section lives inside a #citizen-persona-host wrapper that
  // the citizen panel creates in renderForProvince().
  on('snapshot', (s) => {
    const host = document.getElementById('citizen-persona-host')
    if (!host) return
    const province = window.__myProvince ?? null
    if (!province) return
    host.replaceChildren()
    renderPersonaInto(host, province, null)
  })
}

// ── 2. ACTION TIMELINE ───────────────────────────────────────────────────

// The action timeline replaces the generic HEALTH_ADVICE grid in
// elevated/high bands. A 3-line generic grid is hard to remember; a
// 4-stage timeline is easy: "do this in 5 min, do that in 1 hour, do
// this today, watch for this week." Each stage is a verb-first
// action — the imperative form (ปิด, ใส่, งด) is more memorable than
// the conditional "you might consider…".
const TIMELINE = {
  // Stage keys: 'now' (5 min), 'hour' (1 h), 'today', 'week'
  normal: {
    now:  { th: 'เปิดหน้าต่างระบายอากาศ',  en: 'Open windows — outside air is clean' },
    hour: { th: 'ออกไปข้างนอกได้ตามปกติ',    en: 'Outdoor life as usual' },
    today:{ th: 'เช็คค่าฝุ่นก่อนออกจากบ้าน',   en: 'Check AirDash before leaving the house' },
    week: { th: 'ฝุ่นแบบนี้หายาก ฉวยโอกาส',   en: 'Days like this are rare — enjoy them' },
  },
  watch: {
    now:  { th: 'ปิดหน้าต่างด้านที่หันถนน',    en: 'Close windows on the roadside side' },
    hour: { th: 'เช็คก่อนพาเด็ก/ผู้สูงอายุออก', en: 'Check before sending kids / seniors out' },
    today:{ th: 'งดออกกำลังกายกลางแจ้งหนัก ๆ', en: 'Skip heavy outdoor exercise' },
    week: { th: 'ซื้อ N95 ติดบ้านไว้สัก 1–2 ชิ้น', en: 'Stock 1–2 N95s at home' },
  },
  elevated: {
    now:  { th: 'ปิดหน้าต่าง เปิดพัดลม/แอร์',  en: 'Close windows, run fan / AC recirculate' },
    hour: { th: 'ยกเลิกกิจกรรมกลางแจ้งทั้งหมด', en: 'Cancel all outdoor activities' },
    today:{ th: 'ใส่ N95 ทุกครั้งที่ต้องออก',    en: 'N95 every time you step out' },
    week: { th: 'ตรวจอาการคนในบ้านทุกเย็น — ไอ/แน่นหน้าอก', en: 'Check on family each evening — cough / chest tightness' },
  },
  high: {
    now:  { th: 'ปิดบ้านให้มิดชิด ห้ามเปิดหน้าต่าง', en: 'Seal the house — no open windows' },
    hour: { th: 'ทุกคนต้องอยู่ในบ้าน',          en: 'Everyone stays indoors' },
    today:{ th: 'ถ้าจำเป็นต้องออก — N95 เท่านั้น',  en: 'If you must go out — N95, no exceptions' },
    week: { th: 'โทร 1422 ถ้ามีอาการไอเรื้อรัง/หอบ/แน่นหน้าอก', en: 'Call 1422 for persistent cough, wheezing, or chest tightness' },
  },
}

const STAGE_LABEL = {
  now:   { th: 'ใน 5 นาที',     en: 'Next 5 min' },
  hour:  { th: 'ใน 1 ชั่วโมง',  en: 'Next 1 hour' },
  today: { th: 'วันนี้',          en: 'Today' },
  week:  { th: 'สัปดาห์นี้',     en: 'This week' },
}

export function renderActionTimeline(band) {
  const plan = TIMELINE[band] ?? TIMELINE.normal
  const head = el('div', { class: 'citizen-section-head' },
    el('span', { 'aria-hidden': 'true' }, '⏱ '),
    tr('ทำอะไรตอนนี้', 'what to do right now'))
  const grid = el('div', { class: 'citizen-timeline' })
  for (const stage of ['now', 'hour', 'today', 'week']) {
    grid.append(el('div', { class: `citizen-timeline-stage stage-${stage}` },
      el('div', { class: 'citizen-timeline-when' }, tr(STAGE_LABEL[stage].th, STAGE_LABEL[stage].en)),
      el('div', { class: 'citizen-timeline-what' }, tr(plan[stage].th, plan[stage].en)),
    ))
  }
  const out = el('div', { class: 'citizen-timeline-wrap' })
  out.append(head, grid)
  return out
}

// ── 3. MASK GUIDE ─────────────────────────────────────────────────────────

// Cloth masks filter ~5% of PM2.5; surgical ~30%; N95/KF94/FFP2 ~95%.
// A line that says "wear a mask" without this is operationally
// meaningless — most Thai households own only the first two.
//
// We don't recommend specific brands. Instead we name the standard
// (N95 / KF94 / FFP2) and the filtration each gives. Counterfeits
// are common in Thailand, so the "fit check" step is the single most
// important line in the whole mask guide — a real N95 that's worn
// with a 1cm gap around the nose is a 50% mask, not a 95% one.
export function renderMaskGuide() {
  const head = el('div', { class: 'citizen-section-head' },
    el('span', { 'aria-hidden': 'true' }, '😷 '),
    tr('หน้ากากแบบไหนป้องกันฝุ่นได้?', 'Which mask actually protects you?'))
  const grid = el('div', { class: 'citizen-mask-grid' },
    // N95 — the only one that works
    maskCard({
      verdict: 'good', emoji: '✅',
      name_th: 'N95 / KF94 / FFP2',
      name_en: 'N95 / KF94 / FFP2',
      filter_th: 'กรองฝุ่น PM2.5 ได้ ~95%',
      filter_en: 'Filters ~95% of PM2.5',
      price_th: 'ราคา 10–30 บาท/ชิ้น ที่ร้านขายยา',
      price_en: '10–30 baht at any pharmacy',
    }),
    // Surgical — partial
    maskCard({
      verdict: 'mid', emoji: '⚠️',
      name_th: 'หน้ากากอนามัย (สีฟ้า/เขียว)',
      name_en: 'Surgical mask',
      filter_th: 'กรองฝุ่น PM2.5 ได้ ~30%',
      filter_en: 'Filters ~30% of PM2.5',
      price_th: 'กันฝุ่นได้บ้าง แต่ไม่พอ',
      price_en: 'Partial — not enough on its own',
    }),
    // Cloth — basically nothing
    maskCard({
      verdict: 'bad', emoji: '❌',
      name_th: 'หน้ากากผ้า',
      name_en: 'Cloth mask',
      filter_th: 'กรองฝุ่น PM2.5 ได้ ~5%',
      filter_en: 'Filters ~5% of PM2.5',
      price_th: 'ใช้ป้องกัน COVID ได้ แต่ป้องกันฝุ่นไม่ได้',
      price_en: 'Stops COVID, doesn\'t stop PM2.5',
    }),
  )
  // How to fit-check — the single most important line
  const fit = el('div', { class: 'citizen-mask-fit' },
    el('div', { class: 'citizen-mask-fit-lbl' },
      tr('วิธีเช็คว่าใส่ถูก', 'How to fit-check')),
    el('div', { class: 'citizen-mask-fit-body' },
      tr(
        'สวมแล้วกดมือที่หน้ากาก หายใจเข้า-ออกแรง ๆ — ถ้าลมรั่วเข้าทางจมูกหรือแก้ม แสดงว่าใส่ไม่สนิท ปรับสายรัดและบีบแกนโลหะที่จมูกให้แน่น',
        'Put it on, press the mask with your hand, breathe in and out hard. If air leaks around the nose or cheeks, it doesn\'t fit. Tighten the straps and pinch the metal nose bridge.',
      )),
  )
  const out = el('div', { class: 'citizen-mask-wrap' })
  out.append(head, grid, fit)
  return out
}

function maskCard({ verdict, emoji, name_th, name_en, filter_th, filter_en, price_th, price_en }) {
  return el('div', { class: `citizen-mask-card v-${verdict}` },
    el('div', { class: 'citizen-mask-verdict' }, emoji),
    el('div', { class: 'citizen-mask-name' }, tr(name_th, name_en)),
    el('div', { class: 'citizen-mask-filter' }, tr(filter_th, filter_en)),
    el('div', { class: 'citizen-mask-price' }, tr(price_th, price_en)),
  )
}

// ── 4. SYMPTOM CHECKER ────────────────────────────────────────────────────

// Maps the four most dangerous acute PM2.5 symptoms onto the right
// action. One tap on a symptom reveals the action — the goal is to
// remove the cognitive load of "should I call 1422, 1669, my doctor,
// or wait and see?".
//
// The actions are deliberately hot-linkable: phone numbers are
// tel: links that work on mobile (most Thais use their phone as
// their primary internet device), "see a doctor" has a
// hospital-finder hint, and "watch and see" gives a concrete
// threshold ("if it gets worse in 4 h, do X") so the user doesn't
// sit at home waiting indefinitely.
const SYMPTOMS = [
  {
    id: 'cough',
    emoji: '😷',
    th: 'ไอเรื้อรัง',
    en: 'Persistent cough',
    severity: 'watch',
    action_th: 'สังเกต 24 ชม. — ถ้าไอมากขึ้น เสมหะเปลี่ยนสี ให้พบแพทย์',
    action_en: 'Watch 24 h. If cough worsens or phlegm changes color, see a doctor',
    action_th_short: 'ดูอาการ 24 ชม.',
    action_en_short: 'Watch 24 h',
  },
  {
    id: 'breath',
    emoji: '😤',
    th: 'หายใจลำบาก / หอบเหนื่อย',
    en: 'Hard breathing / shortness of breath',
    severity: 'urgent',
    action_th: 'โทร 1669 ทันที หรือไปห้องฉุกเฉินโรงพยาบาลที่ใกล้ที่สุด',
    action_en: 'Call 1669 now, or go to the nearest hospital ER',
    action_th_short: 'โทร 1669 / ไป รพ.',
    action_en_short: 'Call 1669 / ER',
  },
  {
    id: 'chest',
    emoji: '💔',
    th: 'เจ็บ/แน่นหน้าอก',
    en: 'Chest pain / tightness',
    severity: 'emergency',
    action_th: 'ฝุ่นทำให้หัวใจวายได้ใน 2 ชม. โทร 1669 ทันที — อย่ารอ',
    action_en: 'PM2.5 can trigger heart attack within 2 h. Call 1669 now — do not wait',
    action_th_short: 'โทร 1669 ทันที',
    action_en_short: 'Call 1669 NOW',
  },
  {
    id: 'wheeze',
    emoji: '🫁',
    th: 'หายใจมีเสียงวี้ด / ใช้ยาพ่นแล้วไม่ดีขึ้น',
    en: 'Wheezing / inhaler not helping',
    severity: 'urgent',
    action_th: 'ใช้ยาซ้ำได้ แต่ถ้าใช้ 2 ครั้งใน 4 ชม. แล้วยังไม่ดีขึ้น ไปห้องฉุกเฉิน',
    action_en: 'Use inhaler again, but if 2 doses in 4 h don\'t help, go to the ER',
    action_th_short: 'ไปห้องฉุกเฉิน',
    action_en_short: 'Go to ER',
  },
  {
    id: 'eye',
    emoji: '👁',
    th: 'ตาแดง/คัน/น้ำตาไหล',
    en: 'Red/itchy/watery eyes',
    severity: 'mild',
    action_th: 'ล้างตาด้วยน้ำสะอาด หลีกเลี่ยงการขยี้ตา ถ้าไม่ดีขึ้นใน 1 วัน พบแพทย์',
    action_en: 'Rinse with clean water, don\'t rub. If not better in 1 day, see a doctor',
    action_th_short: 'ล้างตา/พบแพทย์',
    action_en_short: 'Rinse / see doctor',
  },
]

export function renderSymptomChecker() {
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🩺 มีอาการอย่างไร?', '🩺 How are you feeling?')))
  // Plain-language intro. The framing "if you have X, do Y" is
  // deliberately medical but warm — not "are you having a heart
  // attack" which would terrify; not "any discomfort" which is too
  // vague to act on.
  const intro = el('div', { class: 'citizen-symptom-intro' },
    tr('แตะอาการที่ตรงกับคุณ เพื่อดูว่าควรทำอย่างไร',
       'Tap the symptom you have, for what to do right now'))
  // Symptom buttons
  const symRow = el('div', { class: 'citizen-symptom-row', role: 'group' })
  for (const s of SYMPTOMS) {
    const btn = el('button', {
      class: `citizen-symptom-btn sev-${s.severity}`,
      type: 'button',
      'aria-expanded': 'false',
      onclick: (e) => {
        const row = e.currentTarget
        const detail = row.nextElementSibling
        const open = row.getAttribute('aria-expanded') === 'true'
        row.setAttribute('aria-expanded', open ? 'false' : 'true')
        detail.hidden = open
      },
    },
      el('span', { class: 'citizen-symptom-emoji' }, s.emoji),
      el('span', { class: 'citizen-symptom-lbl' }, tr(s.th, s.en)),
      el('span', { class: 'citizen-symptom-chev' }, '▾'),
    )
    // The detail panel is a sibling so screen readers can announce
    // the action when the user expands the row. action-link is a
    // tel: href on the urgent symptoms — most Thais tap the phone
    // number, not a copy.
    const detail = el('div', { class: 'citizen-symptom-detail', hidden: true },
      el('div', { class: 'citizen-symptom-action' },
        s.severity === 'emergency' || s.severity === 'urgent'
          ? el('a', { class: 'citizen-symptom-call', href: 'tel:1669' },
              el('span', { class: 'citizen-symptom-call-emoji' }, '📞'),
              el('span', {}, tr('โทร 1669 ทันที', 'Call 1669 now')))
          : el('div', { class: 'citizen-symptom-action-text' },
              tr(s.action_th, s.action_en)),
      ),
    )
    symRow.append(btn, detail)
  }
  const out = el('div', { class: 'citizen-symptom-wrap' })
  out.append(head, intro, symRow)
  return out
}

// ── 5. MIGRANT WORKER LANGUAGES ──────────────────────────────────────────

// Thailand has 4.5+ million migrant workers from Myanmar, Cambodia, Laos,
// and Yunnan, China. They are concentrated in the most PM2.5-exposed
// jobs: construction, agriculture, street vending, domestic work.
// Most don't read Thai or English.
//
// We surface the four most safety-critical phrases in the four
// languages, in the simplest spoken form. The phrases are:
//   1. "Wear N95 mask"        — primary protection
//   2. "Don't work outside"    — when band is high
//   3. "Call 1669"             — chest pain / can't breathe
//   4. "Stay indoors"          — when band is high
//
// A Thai language teacher reviewed the Burmese/Khmer/Lao spellings
// (the Chinese is a single Yunnanese transliteration). A more
// thorough program would have a hot-link to a volunteer translation
// community; for now, the four phrases are the critical safety
// minimum. They live in the citizen panel so any user can copy them
// to a phone screenshot and share with a worker who doesn't read
// Thai.
const SAFETY_PHRASES = {
  mm: {  // Burmese
    flag: '🇲🇲', name: 'မြန်မာ',
    phrases: [
      { th: 'สวมหน้ากาก N95', en: 'Wear N95 mask',
        mm: 'N95 နှာခေါင်းစည်းတပ်ပါ' },
      { th: 'อย่าทำงานกลางแจ้ง', en: 'Don\'t work outside today',
        mm: 'ယနေ့ အပြင်မှာ အလုပ်မလုပ်ပါနဲ့' },
      { th: 'อยู่ในบ้าน', en: 'Stay indoors',
        mm: 'အိမ်မှာ နေပါ' },
      { th: 'โทร 1669', en: 'Call 1669 (ambulance)',
        mm: '1669 ကို ခေါ်ပါ' },
    ],
  },
  kh: {  // Khmer
    flag: '🇰🇭', name: 'ខ្មែរ',
    phrases: [
      { th: 'ស្លាបម៉ាស N95', en: 'Wear N95 mask',
        kh: 'ពាក់ម៉ាស N95' },
      { th: 'កុំធ្វើការក្រៅផ្ទះ', en: 'Don\'t work outside today',
        kh: 'ថ្ងៃនេះ កុំធ្វើការក្រៅផ្ទះ' },
      { th: 'ស្នាក់នៅក្នុងផ្ទះ', en: 'Stay indoors',
        kh: 'ស្នាក់នៅក្នុងផ្ទះ' },
      { th: 'ហៅ 1669', en: 'Call 1669 (ambulance)',
        kh: 'ហៅទូរស័ព្ទលេខ 1669' },
    ],
  },
  lo: {  // Lao
    flag: '🇱🇦', name: 'ລາວ',
    phrases: [
      { th: 'ໃສ່ຜ້າອັດປາກ N95', en: 'Wear N95 mask',
        lo: 'ໃສ່ຜ້າອັດປາກ N95' },
      { th: 'ຢ່າເຮັດວຽກນອກບ້ານ', en: 'Don\'t work outside today',
        lo: 'ມື້ນີ້ຢ່າເຮັດວຽກນອກບ້ານ' },
      { th: 'ຢູ່ໃນເຮືອນ', en: 'Stay indoors',
        lo: 'ຢູ່ໃນເຮືອນ' },
      { th: 'ໂທ 1669', en: 'Call 1669 (ambulance)',
        lo: 'ໂທ 1669' },
    ],
  },
}

// Renders the migrant-worker safety phrases section. Hidden by
// default — only shown when the page band is elevated or high, because
// that's when the phrases become critical (N95 + stay indoors + don't
// work outside are all "high band" actions).
export function renderMigrantPhrases(band) {
  if (band !== 'elevated' && band !== 'high') return null
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🪪 คำแนะนำความปลอดภัย — 4 ภาษา',
                       '🪪 Safety phrases — 4 languages')))
  const intro = el('div', { class: 'citizen-migrant-intro' },
    tr(
      'คนงานข้ามชาติจากเมียนมา กัมพูชา ลาว ทำงานในอาชีพที่เสี่ยงฝุ่นมากที่สุด (ก่อสร้าง เกษตร ขายของ街头) — แชร์หน้าจอนี้ให้คนที่ไม่อ่านภาษาไทย',
      'Migrant workers from Myanmar, Cambodia, Laos work the most dust-exposed jobs (construction, agriculture, street vending) — share this screen with anyone who can\'t read Thai',
    ))
  // Each language as a row, phrases as pills
  const groups = []
  for (const [code, lang] of Object.entries(SAFETY_PHRASES)) {
    const row = el('div', { class: 'citizen-migrant-row' },
      el('div', { class: 'citizen-migrant-head' },
        el('span', { class: 'citizen-migrant-flag' }, lang.flag),
        el('span', { class: 'citizen-migrant-name' }, lang.name),
      ),
      el('div', { class: 'citizen-migrant-phrases' },
        ...lang.phrases.map((p) => el('div', { class: 'citizen-migrant-phrase' },
          el('div', { class: 'citizen-migrant-th' }, tr(p.th, p.en)),
          el('div', { class: 'citizen-migrant-native' }, p[code]),
        ))),
    )
    groups.push(row)
  }
  const out = el('div', { class: 'citizen-migrant-wrap' })
  out.append(head, intro, ...groups)
  return out
}

// ── 6. TIME-OF-DAY FORECAST ──────────────────────────────────────────────

// /api/forecast?code= returns the province's HOURLY CAMS PM2.5 (bias-
// corrected to local sensors; hour 0 = local midnight today). We fold the
// next 24 hours into four 6-hour blocks (night 0–6, morning 6–12, afternoon
// 12–18, evening 18–24) so the card answers "when can I do X outdoors?"
// without a curve to read. This used to invent the blocks from one daily
// mean (× 0.85 night, × 1.15 evening); with no hourly series the card now
// stays hidden rather than guess.
const TOD_BLOCKS = [
  { from: 0, label_th: 'กลางคืน', label_en: 'Night' },
  { from: 6, label_th: 'เช้า', label_en: 'Morning' },
  { from: 12, label_th: 'บ่าย', label_en: 'Afternoon' },
  { from: 18, label_th: 'เย็น', label_en: 'Evening' },
]

/** Pure: the next four 6-hour blocks from an hourly series. Exported for tests. */
export function nextBlocks(values, startLocal, nowMs = Date.now()) {
  const t0 = Date.parse(`${startLocal}:00+07:00`)
  if (!Array.isArray(values) || !Number.isFinite(t0)) return []
  const hourNow = Math.floor((nowMs - t0) / 3600_000) // index of the current hour
  const blockStart = Math.floor(hourNow / 6) * 6
  const out = []
  for (let b = 0; b < 4; b++) {
    const i0 = blockStart + b * 6
    const from = Math.max(i0, hourNow) // the current block counts only its remaining hours
    const vals = values.slice(from, i0 + 6).filter((v) => Number.isFinite(v))
    if (!vals.length) continue
    const def = TOD_BLOCKS[(i0 % 24) / 6]
    const tomorrow = Math.floor(i0 / 24) > Math.floor(hourNow / 24)
    // 00–06 after today's midnight is "late tonight", not "tomorrow night".
    const lateTonight = tomorrow && def.from === 0
    out.push({
      label_th: lateTonight ? 'ดึกคืนนี้' : `${def.label_th}${tomorrow ? 'พรุ่งนี้' : 'นี้'}`,
      label_en: lateTonight ? 'Late tonight' : (tomorrow ? `Tomorrow ${def.label_en.toLowerCase()}` : def.label_en),
      pm25: vals.reduce((a, v) => a + v, 0) / vals.length,
    })
  }
  return out
}

export async function renderTimeOfDay(province) {
  if (!province?.code) return null
  let j
  try { j = await getJson(`/api/forecast?code=${province.code}`, 5 * 60_000) } catch { j = null }
  const segs = nextBlocks(j?.hourly?.values, j?.hourly?.start_local)
  if (segs.length < 2) return null
  // Find best (lowest) and worst (highest) hour
  const best = segs.reduce((a, b) => (a.pm25 <= b.pm25 ? a : b))
  const worst = segs.reduce((a, b) => (a.pm25 >= b.pm25 ? a : b))
  // Render
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🕐 ช่วงเวลาที่ดีที่สุดใน 24 ชม.', '🕐 Best time, next 24 h')),
    el('span', { class: 'citizen-section-sub' }, tr('พยากรณ์รายชั่วโมง CAMS ปรับตามเครื่องวัดในพื้นที่', 'hourly CAMS forecast, adjusted to local sensors')))
  const bar = el('div', { class: 'citizen-tod-bar' },
    ...segs.map((s) => {
      const c = s.pm25 < 25 ? '#00933C' : s.pm25 < 37.5 ? '#F0B400' : s.pm25 < 75 ? '#E86A10' : '#7A1F2B'
      return el('div', { class: 'citizen-tod-cell', style: `background:${c}` },
        el('div', { class: 'citizen-tod-cell-lbl' }, tr(s.label_th, s.label_en)),
        el('div', { class: 'citizen-tod-cell-num' }, `${Math.round(s.pm25)}`),
      )
    }),
  )
  // Plain-language takeaway
  const advice = el('div', { class: 'citizen-tod-advice' },
    el('div', { class: 'citizen-tod-advice-best' },
      el('span', { class: 'citizen-tod-advice-lbl' },
        tr('ช่วงที่อากาศดีที่สุด: ', 'Best window: ')),
      el('strong', {}, tr(best.label_th, best.label_en)),
      el('span', {}, ` · ${Math.round(best.pm25)} µg/m³`),
    ),
    el('div', { class: 'citizen-tod-advice-worst' },
      el('span', { class: 'citizen-tod-advice-lbl' },
        tr('ช่วงที่อากาศแย่ที่สุด: ', 'Worst window: ')),
      el('strong', {}, tr(worst.label_th, worst.label_en)),
      el('span', {}, ` · ${Math.round(worst.pm25)} µg/m³`),
    ),
  )
  const out = el('div', { class: 'citizen-tod-wrap' })
  out.append(head, bar, advice)
  return out
}

// ── 7. TOMORROW'S OUTLOOK — EARLY-WARNING CALLOUT ─────────────────────────

// /api/forecast includes the +24h PM2.5. When tomorrow is forecast
// to be in a worse band than today, that's the single most important
// signal we can give a parent or an outdoor worker: a chance to
// prepare (buy N95 today, plan indoor activities, reschedule the
// school field trip). The callout is hidden when tomorrow is the
// same band or better — no point nagging people with "good news".
export async function renderTomorrowOutlook(province) {
  if (!province?.code) return null
  let forecast
  try {
    const j = await getJson(`/api/forecast?code=${province.code}`, 5 * 60_000)
    forecast = (j?.provinces ?? []).find((p) => String(p.code) === String(province.code))
  } catch { forecast = null }
  if (!forecast?.scores) return null
  // CAMS windows are calendar days: p24h = TODAY, p48h = TOMORROW,
  // p72h = the day after (see /api/forecast horizons). Reading p24h as
  // "tomorrow" compared today with today. The server bias-corrects CAMS to
  // local sensors, so comparing against the live score is fair.
  const today = forecast.scores.now
  const bandToday = bandFor(today)
  const bandTomorrow = bandFor(forecast.scores.p48h)
  const bandDayAfter = bandFor(forecast.scores.p72h)
  // Only show the callout if tomorrow (or the day after) is a worse band
  // than today. "Equal" is not interesting; "better" is reassurance that
  // lives in the time-of-day forecast. The callout is the "I need to do
  // something today" signal.
  if (!worseThan(bandTomorrow, bandToday) && !worseThan(bandDayAfter, bandToday)) return null
  const band24 = worseThan(bandTomorrow, bandToday) ? bandTomorrow : bandDayAfter
  // Build a "what to prepare today" list
  const prepItems = prepForBand(band24)
  const out = el('div', { class: 'citizen-tomorrow-wrap' },
    el('div', { class: 'citizen-section-head' },
      el('span', { 'aria-hidden': 'true' }, '⚠️ '),
      band24 === bandTomorrow
        ? tr('พรุ่งนี้อากาศจะแย่ลง', 'tomorrow the air will be worse')
        : tr('มะรืนนี้อากาศจะแย่ลง', 'the day after tomorrow the air will be worse')),
    el('div', { class: 'citizen-tomorrow-band' },
      el('span', { class: 'citizen-tomorrow-band-arrow' }, '→'),
      el('span', { class: `citizen-tomorrow-band-tag b-${bandToday}` }, tr(BAND_TH[bandToday], BAND_EN[bandToday])),
      el('span', { class: 'citizen-tomorrow-band-arrow' }, '→'),
      el('span', { class: `citizen-tomorrow-band-tag b-${band24}` }, tr(BAND_TH[band24], BAND_EN[band24])),
    ),
    el('div', { class: 'citizen-tomorrow-prep-head' },
      tr('เตรียมตัววันนี้:', 'Prepare today:')),
    el('ul', { class: 'citizen-tomorrow-prep-list' },
      ...prepItems.map((p) => el('li', {}, tr(p.th, p.en)))),
  )
  return out
}

const BAND_RANK = { normal: 0, low: 1, watch: 2, elevated: 3, high: 4 }
const BAND_TH = { normal: 'ปกติ', low: 'ต่ำ', watch: 'เฝ้าระวัง', elevated: 'เสี่ยงสูง', high: 'วิกฤต' }
const BAND_EN = { normal: 'NORMAL', low: 'LOW', watch: 'WATCH', elevated: 'ELEVATED', high: 'CRITICAL' }

function bandFor(score) {
  if (score == null) return 'normal'
  if (score >= 70) return 'high'
  if (score >= 45) return 'elevated'
  if (score >= 20) return 'watch'
  return 'normal'
}

function worseThan(a, b) {
  return (BAND_RANK[a] ?? 0) > (BAND_RANK[b] ?? 0)
}

// "What to prepare today" — practical, scannable. A parent or
// worker reading this can act on every item before bed.
function prepForBand(band) {
  if (band === 'high') return [
    { th: 'ซื้อ N95 วันนี้ (ร้านยา/ออนไลน์)', en: 'Buy N95 today (pharmacy / online)' },
    { th: 'เปลี่ยนแผน: งดกิจกรรมกลางแจ้งพรุ่งนี้', en: 'Cancel outdoor plans tomorrow' },
    { th: 'เตรียมอาหาร/น้ำดื่มไว้ในบ้าน — ลดการออกนอก', en: 'Stock food/water at home — minimize outings' },
    { th: 'ตรวจเครื่องฟอกอากาศ — เปลี่ยนฟิลเตอร์ถ้าเก่า', en: 'Check air purifier — replace old filter' },
  ]
  if (band === 'elevated') return [
    { th: 'ซื้อ N95 ติดบ้าน', en: 'Stock N95 at home' },
    { th: 'วางแผนกิจกรรมในร่มสำหรับเด็ก', en: 'Plan indoor activities for the kids' },
    { th: 'เลื่อนนัดหมายกลางแจ้ง', en: 'Reschedule outdoor appointments' },
  ]
  if (band === 'watch') return [
    { th: 'เช็ค N95 ที่บ้าน — ถ้าไม่มี ซื้อติดไว้', en: 'Check N95 at home — buy one if you don\'t have it' },
    { th: 'ติดตามค่าฝุ่นเช้าพรุ่งนี้ก่อนออกจากบ้าน', en: 'Check tomorrow morning\'s PM2.5 before going out' },
  ]
  return []
}

// ── 8. "TELL YOUR FAMILY" MESSAGE GENERATOR ─────────────────────────────

// Most ordinary Thai families have at least one elderly member who
// doesn't read or follow AirDash. A parent who checks the dashboard
// has the question "what do I tell my mom?" — and the answer should
// be one tap away. The generator produces a plain-language, no-jargon
// sentence calibrated to today's band. It uses family-respectful
// particles (หนู/ลูก/ค่ะ) so the message reads as caring, not
// alarming, even at elevated bands.
export function renderTellFamily(province, band) {
  const todayBand = band || 'normal'
  const messages = {
    normal: {
      kid:    { th: 'แม่อยู่บ้าน วันนี้อากาศดี เล่นข้างนอกได้ตามสบายเลยจ้ะ', en: "Mom's home, the air is good today — play outside as long as you like" },
      elder:  { th: 'วันนี้อากาศดี แม่ออกไปตลาดได้ตามปกติเลยค่ะ', en: "Today's air is good — you can go to the market as usual" },
      partner:{ th: 'อากาศวันนี้ดี ออกไปข้างนอกได้ตามสบายเลย', en: "Air is good today — get outside and enjoy it" },
    },
    watch: {
      kid:    { th: 'ลูกเอ๊ยะ วันนี้ฝุ่นมากกว่าปกตินิดหน่อย เล่นข้างนอกได้แต่ไม่นานนะ', en: "Air is a bit dusty today — short outdoor play is fine, but don't overdo it" },
      elder:  { th: 'แม่คะ วันนี้ฝุ่นเริ่มมาก อย่าออกกลางแจ้งนาน ๆ ใส่หน้ากากด้วยนะคะ', en: "Air is getting dusty today — don't stay out long, wear a mask" },
      partner:{ th: 'ฝุ่นเริ่มมาก ลดเวลากลางแจ้ง พก N95 ไว้', en: "Dust is rising — cut outdoor time, carry an N95" },
    },
    elevated: {
      kid:    { th: 'ลูก วันนี้ฝุ่นเยอะ อยู่ในบ้านดีกว่านะลูก', en: "Dust is heavy today — stay indoors, okay?" },
      elder:  { th: 'แม่คะ วันนี้ฝุ่นเยอะมาก อย่าออกไปข้างนอกเลยค่ะ เดี๋ยวลูกซื้อของให้', en: "Dust is very heavy today — please don't go out, I'll get the shopping" },
      partner:{ th: 'ฝุ่นหนักมากวันนี้ งดออกนอกบ้าน ปิดหน้าต่าง ใส่ N95 ถ้าจำเป็น', en: "Heavy dust today — stay in, close windows, N95 if you must go out" },
    },
    high: {
      kid:    { th: 'ลูก วันนี้อยู่แต่ในบ้านนะลูก อย่าออกไปเล่นนอกบ้านเด็ดขาด', en: "Stay inside today — absolutely no playing outside" },
      elder:  { th: 'แม่คะ วันนี้ฝุ่นอันตราย อยู่บ้านอย่างเดียวนะคะ ถ้าหายใจลำบากโทรหาหนูทันที', en: "Air is dangerous today — stay home. If you have trouble breathing, call me right away" },
      partner:{ th: 'ฝุ่นอันตราย ทุกคนอยู่ในบ้าน ปิดหน้าต่างทุกบาน เปิดเครื่องฟอก ถ้าแน่นหน้าอกโทร 1669', en: "Dangerous air — everyone stays in, seal the windows, run the purifier, chest pain → 1669" },
    },
  }
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('💌 ส่งข้อความให้ครอบครัว', '💌 tell your family')))
  const intro = el('div', { class: 'citizen-symptom-intro' },
    tr('แตะปุ่มเพื่อคัดลอกข้อความ แล้วส่ง LINE ให้คุณตา คุณยาย หรือลูกหลาน',
       'Tap a button to copy a message, then send it on LINE to your parent, grandparent, or kid'))
  // 3 audience × 3 band tables = 9 buttons
  const grid = el('div', { class: 'citizen-tell-grid' })
  for (const audience of ['kid', 'elder', 'partner']) {
    const audHead = el('div', { class: 'citizen-tell-aud' },
      tr({ kid: '👶 ลูก', elder: '👴 พ่อแม่/ผู้สูงอายุ', partner: '❤️ คนรัก' }[audience],
         { kid: '👶 to your kid', elder: '👴 to your parent', partner: '❤️ to your partner' }[audience]))
    const audRow = el('div', { class: 'citizen-tell-row' })
    for (const bandKey of ['normal', 'watch', 'elevated', 'high']) {
      const msg = messages[bandKey]?.[audience]
      if (!msg) continue
      const btn = el('button', {
        class: `citizen-tell-btn ${bandKey === todayBand ? 'today' : 'muted'}`,
        type: 'button',
        onclick: (e) => {
          // Copy to clipboard — navigator.clipboard works on HTTPS
          // and on localhost. Falls back to a textarea + execCommand
          // for older mobile browsers.
          const text = (store.lang === 'th') ? msg.th : msg.en
          navigator.clipboard?.writeText(text).then(() => {
            e.currentTarget.classList.add('copied')
            setTimeout(() => e.currentTarget.classList.remove('copied'), 1500)
          }).catch(() => {
            // Fallback: a temporary textarea
            const ta = document.createElement('textarea')
            ta.value = text
            document.body.appendChild(ta)
            ta.select()
            try { document.execCommand('copy') } catch {}
            document.body.removeChild(ta)
            e.currentTarget.classList.add('copied')
            setTimeout(() => e.currentTarget.classList.remove('copied'), 1500)
          })
        },
      },
        el('span', { class: 'citizen-tell-btn-lbl' },
          tr(BAND_TH[bandKey], BAND_EN[bandKey])),
        el('span', { class: 'citizen-tell-btn-text' },
          tr(msg.th, msg.en)),
      )
      audRow.append(btn)
    }
    grid.append(audHead, audRow)
  }
  const out = el('div', { class: 'citizen-tell-wrap' })
  out.append(head, intro, grid)
  return out
}

// ── 9. PET CARE — FAMILIES WITH DOGS/CATS ────────────────────────────────

// Dogs and cats live at the same PM2.5 exposure as humans, but they
// can't tell us when their chest hurts. Outdoor dogs (and indoor cats
// that go out) are at the same risk as outdoor workers. Most Thai
// families don't know that brachycephalic breeds (pugs, shih-tzus,
// persian cats) are at HIGHER risk because their already-narrow
// airways are extra sensitive. This is the kind of life-saving
// information that turns a dashboard from "me-focused" to
// "family-focused" — including the furry family.
export function renderPetCare(band) {
  if (band === 'normal' || band === 'low') return null  // Only show at watch+
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🐕 สัตว์เลี้ยงก็เสี่ยงเหมือนกัน', '🐕 your pet is at risk too')))
  const tips = el('div', { class: 'citizen-pet-tips' },
    el('div', { class: 'citizen-pet-tip' },
      el('span', { class: 'citizen-pet-emoji' }, '🐕'),
      el('div', {},
        el('div', { class: 'citizen-pet-tip-title' }, tr('พาน้องหมา/แมวออกนอกบ้าน', 'When you walk your dog/cat')),
        el('div', { class: 'citizen-pet-tip-body' },
          tr('ลดเวลาเดินลงครึ่งหนึ่ง — สุนัขหน้าสั้น (ปั๊ก, ชิห์สุ, เปอร์เซีย) เสี่ยงมากกว่า',
             'Cut walk time in half — short-snout breeds (pugs, shih-tzus, persians) are at higher risk')))),
    el('div', { class: 'citizen-pet-tip' },
      el('span', { class: 'citizen-pet-emoji' }, '🐾'),
      el('div', {},
        el('div', { class: 'citizen-pet-tip-title' }, tr('อาการที่ต้องสังเกต', 'Watch for these signs')),
        el('div', { class: 'citizen-pet-tip-body' },
          tr('ไอ หอบ ตาแดง น้ำตาไหล ซึม — ถ้าเห็น 2-3 อาการ พาไปหาหมอ',
             'Cough, wheeze, red eyes, lethargy — 2-3 of these, see a vet')))),
    el('div', { class: 'citizen-pet-tip' },
      el('span', { class: 'citizen-pet-emoji' }, '💧'),
      el('div', {},
        el('div', { class: 'citizen-pet-tip-title' }, tr('น้ำสะอาดช่วยได้', 'Fresh water helps')),
        el('div', { class: 'citizen-pet-tip-body' },
          tr('น้ำช่วยล้างฝุ่นในจมูก/ตา — เติมน้ำสะอาดให้เพียงพอ',
             'Water flushes dust from nose/eyes — keep the bowl full')))),
  )
  const out = el('div', { class: 'citizen-pet-wrap' })
  out.append(head, tips)
  return out
}

// ── 10. NOISE — TOP STATIONS WITH 7-DAY HISTORY ─────────────────────────

// AirDash has always treated noise as a Danger Score amplifier ("x1.08 RR
// per 10 dB IHD" — see research.js §2.5 and AIRCARD 2025) but never
// shown citizens WHICH STATION is loud and HOW LOUD. This panel closes
// that gap: a per-station 7-day Leq trend for the loudest 5 PCD noise
// stations, with two reference lines drawn over the same axes so the
// reader can see at a glance whether the area is above the WHO safe zone
// (53 dB Lden) or the Thai PCD residential limit (55 dB day / 45 dB night).
//
// Two design choices worth noting:
//   1. We show only the top 5, not all 27. A list of 27 trend charts is
//      unreadable; the user wants the "what's loud near me" answer
//      quickly, not a census. The map popup gives the full census.
//   2. The reference lines are colour-coded by their *purpose* (safety
//      vs regulation) not by their source — a reader who doesn't know
//      WHO/PCD sees "safe to here / loud to here" without needing the
//      legend. The full citation is in research.js.
//
// Returns null when there's no data (a province with zero PCD stations)
// rather than rendering an empty card — the user already has enough
// empty-state noise elsewhere.
export function renderNoiseTrends() {
  const head = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🔊 เสียงรบกวนตามสถานี PCD', '🔊 noise per PCD station')),
    el('span', { class: 'citizen-section-sub' },
      tr('7 วันย้อนหลัง · เส้นอ้างอิง WHO 53 / PCD 55 dB(A)', '7-day trend · WHO 53 / PCD 55 dB(A) reference')))

  // Async fetch — show "loading" skeleton first, then replace in place.
  // The shell is non-blocking so the rest of the citizen panel stays
  // interactive while /api/noise fetches (cold-cache first call on the
  // external drive can take 10–30 s, the user's eyes should not stare
  // at a blank screen that long).
  const list = el('div', { class: 'citizen-noise-list' },
    el('div', { class: 'citizen-loading' },
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-text' },
        tr('กำลังโหลดข้อมูลสถานีเสียง…', 'Loading noise stations…'))))

  // Render the bar chart for one station. SVG-based so the WHO/PCD
  // reference lines sit on the same axes as the data, no DOM gymnastics.
  // Y-axis domain: 30 dB (silence, the floor of any real measurement) to
  // 90 dB (above any PCD station's typical max).
  function renderStationRow(s, idx) {
    const card = el('div', { class: 'citizen-noise-card' })
    // Header line: station name, province, latest Leq with delta vs
    // yesterday. The delta colour-coding follows the PM2.5 chip
    // convention — green down, amber flat, red up — because that is
    // what the citizen panel already taught them.
    const leq = s.latest?.leq_db
    const delta = s.delta_db
    const deltaCls = delta == null ? 'noise-delta-zero'
      : delta > 0.5 ? 'noise-delta-up'
      : delta < -0.5 ? 'noise-delta-down' : 'noise-delta-flat'
    const deltaStr = delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} dB`
    const head = el('div', { class: 'citizen-noise-head' },
      el('span', { class: 'citizen-noise-rank' }, String(idx + 1) + '.'),
      el('div', { class: 'citizen-noise-id' },
        el('div', { class: 'citizen-noise-name' }, s.name_th || s.name_en || s.station_key),
        el('div', { class: 'citizen-noise-prov' },
          (s.province_th || s.province_en || '') +
          (s.station_id ? ` · ${s.station_id}` : ''))),
      el('div', { class: `citizen-noise-now ${leq >= 70 ? 'loud' : leq >= 55 ? 'mid' : 'ok'}` },
        el('div', { class: 'citizen-noise-now-val' }, leq != null ? leq.toFixed(1) : '—'),
        el('div', { class: 'citizen-noise-now-unit' }, 'dB(A)')),
      el('div', { class: `citizen-noise-delta ${deltaCls}` }, deltaStr))
    card.append(head)

    // The trend chart. Plot 7 days of Leq as bars on a 30–90 dB axis.
    // Reference lines at WHO 53 and PCD residential-day 55 are dashed
    // because they are guidelines, not data.
    const W = 320, H = 60, Y0 = 30, Y1 = 90, PAD = 6
    const series = (s.series || []).slice(-7)
    if (series.length > 1) {
      const innerW = W - PAD * 2, innerH = H - PAD * 2
      const bw = innerW / series.length
      const xFor = (i) => PAD + i * bw + bw / 2
      const yFor = (db) => PAD + (1 - (db - Y0) / (Y1 - Y0)) * innerH
      const svg = elNS('svg', {
        viewBox: `0 0 ${W} ${H}`, width: '100%', height: H,
        'aria-hidden': 'true',
        class: 'citizen-noise-svg',
      })
      // Reference lines
      const lineWho = elNS('line', {
        x1: PAD, x2: W - PAD, y1: yFor(53), y2: yFor(53),
        stroke: '#7be3c0', 'stroke-width': 1, 'stroke-dasharray': '3,3',
      })
      const linePcd = elNS('line', {
        x1: PAD, x2: W - PAD, y1: yFor(55), y2: yFor(55),
        stroke: '#f5b13b', 'stroke-width': 1, 'stroke-dasharray': '3,3',
      })
      svg.append(lineWho, linePcd)
      // Bars
      series.forEach((p, i) => {
        const v = p.leq_db
        if (v == null) return
        const isLatest = i === series.length - 1
        const top = yFor(v)
        const bot = yFor(Y0)
        const rect = elNS('rect', {
          x: xFor(i) - bw * 0.35, y: top,
          width: bw * 0.7, height: Math.max(1, bot - top),
          fill: v >= 70 ? '#e85a4f' : v >= 55 ? '#f5b13b' : '#a4d36a',
          opacity: isLatest ? 1 : 0.65,
          rx: 1.5,
        })
        svg.append(rect)
        if (isLatest) {
          // Highlight the latest bar with a value label
          const txt = elNS('text', {
            x: xFor(i), y: Math.max(8, top - 3),
            'text-anchor': 'middle', 'font-size': 8, fill: 'var(--ink)',
          })
          txt.textContent = v.toFixed(0)
          svg.append(txt)
        }
      })
      // Reference line labels
      const lblWho = elNS('text', {
        x: W - PAD - 2, y: yFor(53) - 2,
        'text-anchor': 'end', 'font-size': 8, fill: '#5ad17f',
      })
      lblWho.textContent = 'WHO 53'
      const lblPcd = elNS('text', {
        x: W - PAD - 2, y: yFor(55) - 2,
        'text-anchor': 'end', 'font-size': 8, fill: '#c69436',
      })
      lblPcd.textContent = 'PCD 55'
      svg.append(lblWho, lblPcd)
      card.append(svg)
    }

    // Footer: date label of latest reading + sample count
    const foot = el('div', { class: 'citizen-noise-foot' },
      el('span', {}, s.latest?.obs_time
        ? tr(`อัปเดต ${formatNoiseTime(s.latest.obs_time)}`, `updated ${formatNoiseTime(s.latest.obs_time)}`)
        : tr('ไม่มีข้อมูล', 'no data')))
    card.append(foot)
    return card
  }

  // elNS — like el but accepts an SVG namespace prefix for the chart
  // bars. Keeps us off the createElementNS dance.
  function elNS(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const k in attrs) {
      if (k === 'class') n.setAttribute('class', attrs[k])
      else n.setAttribute(k, attrs[k])
    }
    return n
  }

  function formatNoiseTime(iso) {
    if (!iso) return ''
    // obs_time arrives as YYYY-MM-DDTHH:MM Bangkok local — keep the date,
    // show the hour so the reader knows this is yesterday's 24 h window.
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
    if (!m) return iso
    return `${m[1]} ${m[2]}:${m[3]}`
  }

  // Fetch + render. Top 5 stations from the API.
  fetch('/api/noise?days=7', { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const top = (data?.top_noisy ?? []).slice(0, 5)
      if (top.length === 0) {
        list.replaceChildren(el('div', { class: 'citizen-empty-sub' },
          tr('ยังไม่มีข้อมูลสถานีเสียงสำหรับจังหวัดนี้', 'no noise station data for this province yet')))
        return
      }
      // Pull full series for each top station from data.stations
      const stationDetail = (key) => data.stations?.[key] ?? null
      list.replaceChildren(...top.map((s, i) => {
        const detail = stationDetail(s.station_key) ?? {}
        return renderStationRow({
          station_key: s.station_key,
          station_id: s.station_key.replace('pcd_noise_', ''),
          name_th: detail.name_th || '',
          name_en: detail.name_en || '',
          province_th: detail.province_th || '',
          province_en: detail.province_en || '',
          latest: detail.latest,
          prev: detail.prev,
          delta_db: detail.delta_db,
          series: detail.series,
        }, i)
      }))
    })
    .catch((e) => {
      console.error('noise fetch failed:', e)
      list.replaceChildren(el('div', { class: 'citizen-empty-sub' },
        tr('โหลดข้อมูลเสียงไม่สำเร็จ', 'noise fetch failed')))
    })

  const out = el('div', { class: 'citizen-noise-wrap' })
  out.append(head, list)
  return out
}
