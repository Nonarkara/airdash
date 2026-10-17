// The aerosol strip in the haze plan: it must add particle size WITHOUT
// overstating what it knows.
//
// The block it sits under gives PM2.5 advice — HEPA, an N95, a cleaner-air
// room. That is right for fine smoke and close to useless for coarse mineral
// dust, which is what loads the air every dry season. So the strip earns its
// place by saying what the PM2.5 advice cannot. The risk in adding it is
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
    Bangkok: { mode, alpha, load: 0.24, alpha_pair: '440/675', guidance: guidance[mode] },
    Chiang_Mai: { mode, alpha, load: 0.19, alpha_pair: '440/675', guidance: guidance[mode] },
  },
})

/** Build a context whose fetch returns `d`, and evaluate aerosolStrip() in it. */
function renderWith(d) {
  const ctx = vm.createContext({
    console,
    setTimeout, clearTimeout, AbortSignal: { timeout: () => ({}) },
    store: { lang: 'en' },
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
    mode === 'coarse' ? 'Coarse particles' : mode === 'mixed' ? 'Mixed particles' : 'Fine particles'),
    html.slice(0, 160))
  check(`${mode}: the alpha and the pair it came from are shown`, /α = 1\.2/.test(html) && html.includes('440/675'))
  check(`${mode}: that mode's own advice is shown`, html.includes(guidance[mode].act_en))
  check(`${mode}: no µg/m³ number is invented`, !/\d+(\.\d+)?\s*µg\/m³/.test(html))
}

const fine = await renderWith(payload('fine'))
check('it says plainly this is not a concentration', /not a µg\/m³ concentration/i.test(fine))
check('it says the concentration still comes from the ground stations', /still comes from the ground stations/i.test(fine))
check('it says this is a national signal, not per-province', /not a per-province measurement/i.test(fine))
check('it names the instruments it read', /Bangkok/.test(fine) && /Chiang_Mai|Chiang Mai/.test(fine))
check('it publishes how old the reading is', /read 30 h ago/.test(fine))

const coarse = await renderWith(payload('coarse', 0.4))
check('coarse explicitly warns the N95 advice above does little',
  /N95 recommended above does very little/i.test(coarse), 'that is the entire point of the block')
check('fine mode does NOT carry the coarse-only warning',
  !/N95 recommended above does very little/i.test(fine))

const empty = await renderWith({ reading_age_h: null, aerosol: {} })
check('an empty aerosol block still renders something', empty.includes('haze-plan-aerosol'))
check('an empty block explains itself instead of going blank', /no reading yet|not reported/i.test(empty))
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
  /\$\{esc\(g\?\.act_th \?\? ''\)\}/.test(src) && /\$\{esc\(g\?\.act_en \?\? ''\)\}/.test(src)
  && /\$\{esc\(mode\.alpha_pair \?\? ''\)\}/.test(src))
// tr(th, en) returns `en` unless Thai is selected, so passing a single argument
// renders `undefined` in English. This caught exactly that.
check('no tr() call is handed a single argument',
  !/tr\(\.\.\.\[[^\]]*\]\)/.test(src) || !/\[\s*g\?\.act_/.test(src),
  'tr(...[x]) passes one arg, so the English branch returns undefined')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)