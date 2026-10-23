// The aerosol strip in the haze plan: it must add particle size WITHOUT
// overstating what it knows.
//
// The block it sits under gives PM2.5 advice — HEPA, an N95, a cleaner-air
// room. Particle-size evidence adds context; it cannot dismiss respirators
// or establish personal exposure. The risk in adding it is
// saying it too confidently: AERONET is five instruments publishing daily
// aggregates that often run a day or two behind, so an unqualified claim here
// would be worse than the silence it replaces.
//
// The module is evaluated whole in a vm with stubbed imports, so the real
// aerosolStrip runs unmodified — extracting it by string surgery was brittle
// because its body is almost entirely template literals full of `}`.
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

const file = p => readFileSync(join(import.meta.dirname, '..', p), 'utf8')
const src = file('public/js/panels/hazePlan.js')

const guidance = {
  coarse: { act_th: 'ฝุ่นหยาบรบกวนตาและคอ', act_en: 'close the car windows and bring laundry in early' },
  mixed: { act_th: 'มีทั้งสองชนิด', act_en: 'both sets of precautions' },
  fine: { act_th: 'ลงลึกถึงปอด', act_en: 'close windows, HEPA, N95 genuinely helps' },
}
const payload = (mode, alpha = 1.2, ageH = 30) => ({
  reading_age_h: ageH,
  aerosol: {
    Bangkok: { mode, alpha, observed_at: new Date(Date.now()-ageH*3600000).toISOString(), load: 0.24, alpha_pair: '440/675', guidance: guidance[mode] },
    Chiang_Mai: { mode, alpha, observed_at: new Date(Date.now()-ageH*3600000).toISOString(), load: 0.19, alpha_pair: '440/675', guidance: guidance[mode] },
  },
})

/** Build a context whose fetch returns `d`, and evaluate aerosolStrip() in it. */
function renderWith(d, lang = 'en') {
  const ctx = vm.createContext({
    console,
    setTimeout, clearTimeout, AbortSignal: { timeout: () => ({}) },
    store: { lang },
    esc: s => String(s ?? ''),
    escapeHtml: s => String(s ?? ''),
    document: { querySelector: () => null },
    window: { dispatchEvent() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o) } },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(d) }),
  })
  vm.runInContext(src.replace(/^import .*$/gm, '').replace(/\bexport /g, ''), ctx)
  return vm.runInContext('aerosolStrip()', ctx)
}

for (const mode of ['coarse', 'mixed', 'fine']) {
  const html = await renderWith(payload(mode))
  check(`${mode}: the mode is named`, new RegExp(mode).test(html) && html.includes(
    mode === 'coarse' ? 'Coarse-dominated' : mode === 'mixed' ? 'Mixed optical' : 'Fine-dominated'),
    html.slice(0, 160))
  check(`${mode}: the alpha and the pair it came from are shown`, /α = 1\.2/.test(html) && html.includes('440/675'))
  check(`${mode}: that mode's own advice is shown`, html.includes(guidance[mode].act_en))
  check(`${mode}: no µg/m³ number is invented`, !/\d+(\.\d+)?\s*µg\/m³/.test(html))
}

const fine = await renderWith(payload('fine'))
check('it says plainly this is not a concentration', /not a µg\/m³ concentration/i.test(fine))
check('it says the concentration still comes from the ground stations', /still comes from the ground stations/i.test(fine))
check('it says this is a national signal, not per-province', /not a per-province measurement/i.test(fine))
check('it names the instruments it read', /Bangkok/.test(fine) && !/Chiang_Mai|Chiang Mai/.test(fine))
check('it publishes how old the reading is', /read 30 h ago/.test(fine))

const coarse = await renderWith(payload('coarse', 0.4))
check('coarse does not dismiss respirators based on optical size',
  !/does very little|matter more than a respirator/i.test(coarse) && /filters both fine and coarse/i.test(coarse))
check('coarse protection explanation links official guidance', coarse.includes('https://www.cdc.gov/niosh/ppe/php/community-respirators-masks/'))
check('fine mode does not carry the coarse-only explanation', !/National particle-size evidence cannot determine/i.test(fine))

// The same claim, in the language most of the readers are using. The
// English check above cannot see the Thai string, and a Thai string
// dismissing the respirator shipped once without any guard noticing.
const coarseTh = await renderWith(payload('coarse', 0.4), 'th')
check('THAI coarse does not dismiss respirators based on optical size',
  !/ไม่ผ่านหน้ากาก|ช่วยได้น้อยมาก|แทบไม่ช่วย/.test(coarseTh)
  && /ทั้งละเอียดและหยาบ/.test(coarseTh),
  coarseTh.slice(0, 140))
const fineTh = await renderWith(payload('fine', 0.4), 'th')
check('THAI fine mode does not carry the coarse-only explanation',
  !/ระดับประเทศไม่ใช้ตัดสินว่าหน้ากากได้ผลหรือไม่/.test(fineTh))


const differentAges = payload('coarse', .4, 50)
differentAges.reading_age_h = 3
differentAges.aerosol.Chiang_Mai.observed_at = new Date(Date.now()-3*3600000).toISOString()
const selectedAge = await renderWith(differentAges)
check('fallback reports the selected station age, not the newest unrelated instrument', /2 days ago/.test(selectedAge) && !/3 h ago/.test(selectedAge))
for (const [name, patch] of Object.entries({missingTime:{observed_at:null},future:{observed_at:new Date(Date.now()+86400000).toISOString()},expired:{observed_at:new Date(Date.now()-8*86400000).toISOString()},badAlpha:{alpha:null},badLoad:{load:Infinity},badMode:{mode:'unknown'}})) {
  const d=payload('coarse');d.aerosol={Bangkok:{...d.aerosol.Bangkok,...patch}}
  check(`${name}: unusable optical context remains unavailable`, (await renderWith(d)).includes('data-state="unavailable"'))
}
check('optical context never claims mineral or combustion attribution', !/mineral dust|smoke and combustion/.test(selectedAge))
check('optical fallback names its national scope before the verdict', selectedAge.indexOf('National optical context') < selectedAge.indexOf('Coarse-dominated'))

const empty = await renderWith({ reading_age_h: null, aerosol: {} })
check('an empty aerosol block still renders something', empty.includes('haze-plan-aerosol'))
check('an empty block explains itself instead of going blank', /no usable reading|not reported/i.test(empty))
// Mutation-tested: adding `hidden` to the empty state left every text check
// green, which is exactly a guard that cannot fail. The reader needs the
// absence explained, not merely absent.
check('an empty block is VISIBLE, not hidden or display:none',
  !/\shidden[\s>=]/.test(empty) && !/display:\s*none/i.test(empty),
  'the empty state must tell the reader why it is empty, not vanish')
check('an empty block never reads as reassurance',
  !/\bsafe\b|clean air|good news/i.test(empty), 'silence must not look like safety')
const nullish = await renderWith({ reading_age_h: 40, aerosol: { X: { mode: null, load: 0.2 }, Y: {} } })
check('stations without a mode are skipped, not counted', nullish.includes('unavailable'))

// ── staleness ──────────────────────────────────────────────────────────────
const fresh = await renderWith(payload('fine', 1.2, 3))
check('a fresh reading does not claim days old', !/days ago/.test(fresh))
const old = await renderWith(payload('fine', 1.2, 50))
check('a two-day-old reading says so and explains the lag', /2 days ago/.test(old) && /lag/i.test(old))

// ── it cannot delay or blank the province plan ─────────────────────────────
// ORDER, not just presence. Making draw() async and awaiting aerosolStrip()
// before attaching the listeners left the province dropdown and the three map
// buttons dead for as long as the fetch takes — up to its 15 s timeout. The
// existing test-haze-plan.mjs caught it; this pins the ordering so it cannot
// come back. Compare positions inside draw() only.
const drawBody = src.slice(src.indexOf('const draw=async'), src.indexOf('\n  draw()'))
const at = (re) => { const m = drawBody.match(re); return m ? m.index : -1 }
const slotAt = at(/await aerosolStrip\(\)/)
check('the aerosol slot IS filled inside draw()', slotAt !== -1)
check('the slot is filled AFTER every listener is attached, never before',
  slotAt > at(/\[data-plan-province\]'\)\.onchange/) && slotAt > at(/\[data-view\]'\]\)\.onclick/),
  `slot at ${slotAt}, onchange at ${at(/\[data-plan-province\]'\)\.onchange/)}, onclick at ${at(/\[data-view\]'\]\)\.onclick/)}`)
check('a missing slot cannot throw the whole panel away',
  /if \(slot\) slot\.outerHTML/.test(drawBody), 'outerHTML on null would abort the remaining wiring')
// Bounded to the province loader only: a greedy match reaches past it and finds
// the AERONET fetch, which is exactly the coupling this check exists to catch.
const evidencePromise = src.match(/Promise\.allSettled\(\[[^\]]*\]/)?.[0] ?? ''
check('the AERONET fetch is not inside the province evidence promise',
  evidencePromise !== '' && !evidencePromise.includes('/api/aeronet'),
  `a slow AERONET must never delay or blank the province plan; found: ${evidencePromise.slice(0, 80)}`)
check('a failed AERONET degrades instead of throwing',
  /\.catch\(\(\) => \{ aero = \{ empty_note: 'unavailable' \}/.test(src))
check('interpolated server copy is escaped, not injected raw',
  src.includes("esc(tr(g?.act_th ?? '', g?.act_en ?? ''))")
  && /\$\{esc\(mode\.alpha_pair \?\? ''\)\}/.test(src))
// tr(th, en) returns `en` unless Thai is selected, so passing a single argument
// renders `undefined` in English. This caught exactly that.
check('no tr() call is handed a single argument',
  !/tr\(\.\.\.\[[^\]]*\]\)/.test(src) || !/\[\s*g\?\.act_/.test(src),
  'tr(...[x]) passes one arg, so the English branch returns undefined')

// ── the MEASURED size, per province ───────────────────────────────────────
//
// The optical strip above answers "what is the aerosol regime?" for the whole
// country. Air4Thai publishes PM10 as well as PM2.5, so the coarse fraction
// of PM10 is a DIRECT measurement at a ground station — and it is per-province,
// which the optical signal is not.
//
// The danger this creates is two answers to one question. The panel picks ONE:
// the measured size where the province has one, the optical signal where it
// does not. These checks hold that, and that the measured strip claims only
// what was measured.
const particle = (over = {}) => ({
  mode: 'coarse',
  coarse_fraction: 0.558,
  pm25: 15.9,
  pm10: 36,
  ratio: 2.26,
  label_th: 'ส่วนใหญ่ของมวลฝุ่นที่วัดได้เป็นฝุ่นหยาบ (ใหญ่กว่า 2.5 ไมครอน)',
  label_en: 'Most of the measured particulate mass is coarse (larger than 2.5 µm)',
  act_th: 'ฝุ่นหยาบจะไม่ผ่านหน้ากาก แต่จะรบกวนตา คอ และจมูกมาก',
  act_en: 'Coarse dust does not reach deep into the lungs, but it irritates eyes, throat and nose hard.',
  station: '25t',
  observed_at: '2026-10-22T20:00',
  ...over,
})

/** Evaluate measuredSizeStrip(pa) in the same vm context. */
function renderMeasured(pa) {
  const ctx = vm.createContext({
    console,
    setTimeout, clearTimeout, AbortSignal: { timeout: () => ({}) },
    store: { lang: 'en' },
    esc: s => String(s ?? ''),
    escapeHtml: s => String(s ?? ''),
    document: { querySelector: () => null },
    window: { dispatchEvent() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o) } },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  })
  vm.runInContext(src.replace(/^import .*$/gm, '').replace(/\bexport /g, ''), ctx)
  return vm.runInContext(`measuredSizeStrip(${JSON.stringify(pa)})`, ctx)
}

const measured = renderMeasured(particle())
check('the measured strip names the mode it measured', /data-state="coarse"/.test(measured) && measured.includes('Most of the measured particulate mass is coarse'))
check('the measured strip publishes the coarse fraction', /coarse fraction 56%/.test(measured), measured.slice(0, 200))
check('the measured strip shows the two numbers it was made from', /PM10 36 µg\/m³ = 2\.3× PM2\.5/.test(measured), measured.slice(0, 200))
check('the measured strip names the station it was measured at', /ground station 25t/.test(measured))
check('the measured strip publishes when the reading was taken', /2026-10-22 20:00/.test(measured))
check('the measured strip says it is NOT a provincial average', /not a provincial average/i.test(measured))
check('the measured strip does NOT claim where the dust came from',
  !/mineral dust|volcanic|biomass|salt/i.test(measured),
  'a mass ratio cannot identify the source of the coarse mass')
check('the measured strip does NOT carry the optical alpha', !/α|440\/675/i.test(measured),
  'alpha is a different quantity; showing it here would be a second answer')
check('the measured strip does NOT carry the optical national-scope claim',
  !/national-scale signal/i.test(measured), 'that sentence describes the optical strip, not this one')
check('the measured strip says it is measured IN this province',
  /measured at a ground station in this province/i.test(measured))
const optical = await renderWith(payload('coarse'))
const headingOf = s => (s.match(/<h4>([^<]*)</) || [])[1]
check('the measured strip and the optical strip have DIFFERENT headings',
  headingOf(measured) && headingOf(optical) && headingOf(measured) !== headingOf(optical),
  `measured "${headingOf(measured)}" vs optical "${headingOf(optical)}"`)

// An absent measurement must render NOTHING, so the optical strip stands in.
// "Absent" must never read as "fine".
check('a province with no measurement renders no strip at all', renderMeasured(null) === '')
check('a measurement with no mode renders no strip', renderMeasured(particle({ mode: null })) === '')
check('a measurement with no label renders no strip', renderMeasured(particle({ label_en: null })) === '')
check('a measurement with no station renders no strip', renderMeasured(particle({ station: null })) === '')

// ── the wiring: one answer, never two ─────────────────────────────────────
const loadBody = src.slice(src.indexOf('async function load('), src.indexOf('\n  draw()'))
check('the science payload is fetched', /\/api\/science/.test(src))
check('the science fetch is NOT inside the province evidence promise',
  (src.match(/Promise\.allSettled\(\[[^\]]*\]/)?.[0] ?? '').includes('/api/science') === false,
  'a science outage must not make the panel declare its evidence incomplete')
check('a failed science fetch degrades instead of throwing',
  /\.catch\(\(\) => \{ science = \{ provinces: \[\] \}/.test(src))
check('the measured size is looked up by the SELECTED province code',
  /measuredByCode\.get\(selected\)/.test(loadBody),
  'the reading must belong to the province on screen')
check('the measured strip is preferred and the optical signal is the FALLBACK',
  /measuredSizeStrip\(measuredByCode\.get\(selected\)\)\s*\|\|\s*await aerosolStrip\(\)/.test(loadBody),
  'one question must get one answer')
check('the two strips are never rendered together',
  !/measuredSizeStrip\([^)]*\)\s*\+\s*await aerosolStrip\(\)/.test(loadBody))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)