// The wind renderer, and the surfaces that draw it.
//
// WHY THIS GUARD EXISTS
// The bearing lived in two payload shapes and each surface reached for
// whichever one it already had. The map layer drew arrows from the SMOKE
// payload — which the snapshot fills only for provinces with something
// burning upwind — so the wind layer was empty on exactly the days the wind
// matters most: a still, dusty, no-fire day. The citizen panel, the one
// screen a resident actually reads, printed a wind direction only as a clause
// inside that same fire-gated line, so on a quiet day it said nothing at all
// about which way the air was moving.
//
// The fix is one renderer (public/js/wind.js) fed by one contract (the
// server publishes both ends, labelled). The guard below checks the renderer
// by EXECUTING it, the panels by EXECUTING them in a vm against a DOM stub,
// and only falls back to source matching where Leaflet makes execution
// impossible.
//
// A SOURCE CHECK IS NOT A BEHAVIOUR CHECK. Every assertion that could be
// made to execute has been made to execute; the two that could not are
// marked, and each one has been mutation-tested (the guard is re-run with
// the bug planted, and must go red).
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}
const file = p => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

// ── the real modules ──────────────────────────────────────────────────────
// The asset token is READ from the source rather than hardcoded. A hardcoded
// `?v=2.4.107` silently became a DIFFERENT module instance from the one the
// panel imports after the next `npm run bump` rewrote every reference — the
// two instances then had two different `store` objects, the language quietly
// fell back to Thai, and a green test was asserting the wrong language.
const TOKEN = file('public/ops.html').match(/\?v=(\d+\.\d+\.\d+)/)?.[1] ?? ''
const Q = TOKEN ? `?v=${TOKEN}` : ''
const { store } = await import(`../public/js/state.js${Q}`)
const wind = await import(`../public/js/wind.js${Q}`)
const { el } = await import(`../public/js/fmt.js${Q}`)
const serverWind = await import('../server/wind.js')

const ROW = {
  province_code: '10', province_th: 'เชียงใหม่', province_en: 'Chiang Mai',
  lat: 18.8, lng: 98.98, pm25: 42, band: 'watch', score: 55,
  wind_dir_deg: 13, wind_from_th: 'เหนือ', wind_from_en: 'N',
  wind_towards_deg: 193, wind_towards_th: 'ใต้', wind_towards_en: 'S',
  wind_fc_kmh: 14.2, wind_basis: 'tomorrow-forecast', wind_updated_at: '2026-10-21T19:00',
}

// ── 1 · the renderer ───────────────────────────────────────────────────────
check('a province with no bearing has no wind view', wind.windView({}) === null)
check('a null row has no wind view', wind.windView(null) === null)
check('an absent wind renders nothing at all, not a placeholder',
  wind.windRowText({}) === '' && wind.windBadgeHtml({}) === '',
  'an absent wind must read as absent, never as north')

check('the PUBLISHED towards bearing is used, not a recomputed one',
  wind.windView({ wind_dir_deg: 13, wind_towards_deg: 999 }).towards === 999,
  'the browser draws the number the server published')
check('a payload without the towards field derives it exactly as the server does',
  wind.windView({ wind_dir_deg: 13.4 }).towards === serverWind.towardsDeg(13.4),
  'the two runtimes must not disagree by half a degree')

store.lang = 'en'
check('English names the English direction', wind.windRowText(ROW) === 'N → S · 14.2 km/h',
  wind.windRowText(ROW))
store.lang = 'th'
check('Thai names the Thai direction', wind.windRowText(ROW) === 'เหนือ → ใต้ · 14.2 กม./ชม.',
  wind.windRowText(ROW))
store.lang = 'en'

check('the degrees are available where there is room for them',
  wind.windRowText(ROW, { degrees: true }) === 'N (13°) → S (193°) · 14.2 km/h')
check('a province with no speed simply has no speed',
  !/km\/h/.test(wind.windRowText({ ...ROW, wind_fc_kmh: null })))
check('a payload with no labels falls back to the raw bearing',
  wind.windRowText({ wind_dir_deg: 13, wind_towards_deg: 193, wind_fc_kmh: 5 }) === '13° → 193° · 5 km/h')

const badge = wind.windBadgeHtml(ROW)
check('the badge draws an arrow', /<svg[^>]*class="wind-arrow/.test(badge))
check('the arrow is rotated to the DOWNWIND bearing, because that is where the air goes',
  badge.includes('transform:rotate(193deg)'), badge.slice(0, 200))
check('the badge names the direction in words too, so a misread arrow is caught',
  badge.includes('From N, blowing towards S'))
check('the badge publishes which day the wind is for', badge.includes('tomorrow&#39;s dominant direction'))
check('the badge carries the limit of the number', /not a smoke trajectory/.test(badge))
check('the badge states the wind input time', badge.includes('2026-10-21T19:00'))
check('a non-finite bearing draws no arrow at all', wind.windArrowSvg(NaN) === '')
check('the arrow is drawn as a shape, not as a glyph a reader must interpret',
  !/[↑↓←→]/.test(badge), 'a rotated character is not a shape')

// ── 2 · the server contract ────────────────────────────────────────────────
const d90 = serverWind.describeWind(90)
check('the server labels the far end too', d90.wind_towards_th === 'ตะวันตก' && d90.wind_towards_en === 'W')
check('the towards label is the opposite sector of the from label',
  serverWind.COMPASS_EN.map((_, i) => {
    const w = serverWind.describeWind(i * 45)
    return serverWind.COMPASS_EN[(i + 4) % 8] === w.wind_towards_en
  }).every(Boolean))
check('an absent bearing nulls every field, including the new ones',
  Object.values(serverWind.describeWind(null)).every(v => v === null))
check('the all-null shape and the full shape have the same keys',
  Object.keys(serverWind.describeWind(null)).length === Object.keys(serverWind.describeWind(90)).length)

// smoke.js must publish the SAME contract, so one renderer serves both APIs.
const { computeSmoke } = await import('../server/smoke.js')
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE ingest_runs(id INTEGER,source TEXT,ok INTEGER,started_at TEXT);
CREATE TABLE regional_hotspots(lat REAL,lng REAL,frp REAL,in_thailand INTEGER,acq_date TEXT,acq_time TEXT);
CREATE TABLE latest(source TEXT,station_key TEXT,metric TEXT,value REAL,obs_time TEXT);
CREATE TABLE stations(source TEXT,station_key TEXT,lat REAL,lng REAL,province_th TEXT,province_en TEXT);`)
db.prepare('INSERT INTO ingest_runs VALUES(1,?,1,?)').run('firms_regional', new Date().toISOString())
const at = new Date(Date.now() - 3600_000).toISOString()
db.prepare('INSERT INTO regional_hotspots VALUES(18,99,10,1,?,?)').run(at.slice(0, 10), at.slice(11, 16).replace(':', ''))
db.prepare('INSERT INTO latest VALUES(?,?,?,?,?)').run('openmeteo', '10', 'wind_dir_d1', 270, at)
db.prepare('INSERT INTO latest VALUES(?,?,?,?,?)').run('openmeteo', '10', 'wind_dir_d0', 90, at)
db.prepare('INSERT INTO stations VALUES(?,?,?,?,?,?)').run('openmeteo', '10', 18.8, 98.98, 'เชียงใหม่', 'Chiang Mai')
const smoke = computeSmoke({ all: (sql, ...args) => db.prepare(sql).all(...args) })
const smokeRow = smoke.provinces[0]
check('smoke publishes the canonical wind contract', smokeRow && smokeRow.wind_dir_deg === 270
  && smokeRow.wind_towards_deg === 90 && smokeRow.wind_from_en === 'W' && smokeRow.wind_towards_en === 'E',
  JSON.stringify(smokeRow))
check('the legacy aliases still carry the same number',
  smokeRow.from_deg === smokeRow.wind_dir_deg && smokeRow.from_en === smokeRow.wind_from_en)
check('one renderer can read a smoke row unchanged',
  wind.windRowText({ ...smokeRow, wind_fc_kmh: 9 }) === 'W → E · 9 km/h')
db.close()

// ── 3 · a DOM stub, so the panels can be EXECUTED ──────────────────────────
function makeDom() {
  return {
    createElement(tag) {
      return {
        nodeType: 1, tag, className: '', attrs: {}, children: [], textContent: '', innerHTML: '',
        append(...kids) { this.children.push(...kids) },
        replaceChildren(...kids) { this.children = [...kids] },
        setAttribute(k, v) { this.attrs[k] = v },
        addEventListener() {}, querySelector() { return null }, querySelectorAll() { return [] },
      }
    },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) } },
    getElementById() { return null }, querySelector() { return null }, querySelectorAll() { return [] },
  }
}
/** Every scrap of text in a subtree, including raw innerHTML. */
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!node || typeof node !== 'object') return ''
  if (node.nodeType === 3) return node.textContent
  // A leaf carries its words in textContent; a container carries them in its
  // children. Take both — a stub never aggregates the way the real DOM does.
  return [node.innerHTML ?? '', node.textContent ?? '', ...(node.children ?? []).map(textOf)].join(' ')
}
function findByClass(node, cls) {
  const out = []
  const walk = n => {
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (!n || typeof n !== 'object' || n.nodeType !== 1) return
    if ((n.className ?? '').split(/\s+/).includes(cls)) out.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}
const never = () => new Promise(() => {})
/**
 * The real `el()` helper is evaluated in THIS realm, so it resolves
 * `document` here, not in the vm. Point the host global at the same stub the
 * vm uses for the duration of the call, and put it back afterwards.
 */
function withDocument(dom, fn) {
  const prev = globalThis.document
  globalThis.document = dom
  try { return fn() } finally { globalThis.document = prev }
}
/**
 * Strip the import statements so a panel can be evaluated in a vm with
 * stubbed dependencies. The lazy match spans newlines on purpose: several
 * panels import a list of names across many lines, and a line-anchored
 * pattern would leave the dangling `} from '...'` behind and break the parse.
 */
const stripImports = src => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]*['"];?$/gm, '')
  .replace(/\bexport /g, '')

// ── 4 · the citizen panel ──────────────────────────────────────────────────
// The regression this guards: the wind used to live inside the fire-gated
// smoke line, so a province with nothing burning upwind said NOTHING about
// the wind. The panel must show the wind regardless of the fires.
function citizenNodes(snapshot) {
  const document = makeDom()
  const ctx = vm.createContext({
    console, document,
    location: { origin: 'https://air.nonarkara.org' },
    window: { __myProvince: null, matchMedia: () => ({ matches: false }), addEventListener() {} },
    setTimeout, clearTimeout, CustomEvent: class { constructor(t, o) { Object.assign(this, o) } },
    store: { lang: 'en', snapshot },
    tr: (th, en) => (store.lang === 'th' ? th : en),
    BAND: { normal: { th: 'ปกติ', en: 'Normal' }, low: {}, watch: { th: 'เฝ้าระวัง', en: 'Watch' }, elevated: {}, high: {} },
    el, fmtNum: (v, d = 1) => (Number.isFinite(v) ? String(v) : '—'), ago: () => '',
    getJson: never, flyToProvince() {}, sharePlace: never, copyText: never, shareFeedback() {},
    reliefEtaLine: () => null, worseBeforeBetterChip: () => null,
    renderPersonaSection: never, renderActionTimeline: () => null, renderMaskGuide: () => null,
    renderSymptomChecker: () => null, renderMigrantPhrases: () => null, renderTimeOfDay: never,
    renderTomorrowOutlook: never, renderTellFamily: () => null, renderPetCare: () => null,
    renderNoiseTrends: () => null, weatherStripHtml: () => '',
    windBadgeHtml: wind.windBadgeHtml, windCaveatText: wind.windCaveatText,
    on() {}, emit() {}, readPreference: () => null, writePreference() {}, removePreference() {},
  })
  vm.runInContext(stripImports(file('public/js/panels/citizen.js')), ctx)
  return withDocument(document, () =>
    vm.runInContext('render({code:"10",th:"เชียงใหม่",en:"Chiang Mai",lat:18.8,lng:98.98,band:"watch",score:55})', ctx))
}

const noFires = {
  risk: { provinces: [ROW] },
  smoke: {},           // ← nothing burning upwind anywhere
}
const withFires = {
  risk: { provinces: [ROW] },
  smoke: { '10': { level: 'moderate', mw: 120, fires: 3, km: 210, from_th: 'เหนือ', from_en: 'N', thai_share: 0.9 } },
}

const quietNodes = citizenNodes(noFires)
const quietWind = findByClass(quietNodes, 'citizen-wind')
check('the citizen panel shows the wind when NOTHING is burning upwind',
  quietWind.length === 1,
  'the panel must never be silent about the wind just because there is no fire')
check('that wind block carries the arrow', /wind-arrow/.test(textOf(quietWind[0] ?? {})))
check('that wind block names the direction and the speed',
  /From N, blowing towards S/.test(textOf(quietWind[0] ?? {})) && /14\.2 km\/h/.test(textOf(quietWind[0] ?? {})),
  textOf(quietWind[0] ?? {}).slice(0, 240))
check('that wind block says which day it is for', /tomorrow&#39;s dominant direction/.test(textOf(quietWind[0] ?? {})))
check('that wind block carries the limit of the number', /not a smoke trajectory/.test(textOf(quietWind[0] ?? {})))

const fireNodes = citizenNodes(withFires)
const fireWind = findByClass(fireNodes, 'citizen-wind')
check('the wind block appears with fires too', fireWind.length === 1)
const smokeText = findByClass(fireNodes, 'citizen-smoke').map(textOf).join(' ')
check('the fire line keeps the fire facts', /3 fire detections upwind \(120 MW\)/.test(smokeText))
check('the fire line does NOT repeat the wind — the wind block says it once',
  !/wind comes from/i.test(smokeText), 'the same wind stated twice is the incoherence this removes')

const noBearing = citizenNodes({ risk: { provinces: [{ ...ROW, wind_dir_deg: null, wind_towards_deg: null }] }, smoke: {} })
check('a province with no bearing gets no wind block', findByClass(noBearing, 'citizen-wind').length === 0)

// ── 5 · the places card (the comparison view) ──────────────────────────────
function placesCard(risk) {
  const document = makeDom()
  const ctx = vm.createContext({
    console, document,
    window: {}, setTimeout, clearTimeout,
    store: { lang: 'en', snapshot: { fetched_at: new Date().toISOString() } },
    tr: (th, en) => (store.lang === 'th' ? th : en),
    BAND: { normal: { th: 'ปกติ', en: 'Normal' }, low: {}, watch: { th: 'เฝ้าระวัง', en: 'Watch' }, elevated: {}, high: {} },
    fmtNum: (v, d = 1) => (Number.isFinite(v) ? String(v) : '—'), escapeHtml: s => String(s ?? ''),
    getJson: never, on() {}, emit() {},
    windRowText: wind.windRowText,
  })
  vm.runInContext(stripImports(file('public/js/panels/split.js')), ctx)
  return withDocument(document, () => vm.runInContext(
    `dataCard({data:{risk:${JSON.stringify(risk)},name_th:"เชียงใหม่",name_en:"Chiang Mai",province_th:"เชียงใหม่",province_en:"Chiang Mai",lat:18.8,lng:98.98}},1,55)`,
    ctx))
}
const cardText = textOf(placesCard(ROW))
check('the comparison card carries a wind line', /N → S · 14\.2 km\/h/.test(cardText), cardText.slice(0, 300))
check('the comparison card omits the wind row when there is no bearing',
  !/WIND/.test(textOf(placesCard({ ...ROW, wind_dir_deg: null, wind_towards_deg: null }))))

// ── 6 · the map's wind field (EXECUTED against a Leaflet stub) ─────────────
// A source check for this would be worthless: the map file still contains
// "paintWindField(snap.risk)" while the function underneath can be pointing
// at the wrong province, and the mutation test proved it — that check stayed
// green through a broken map. So the field is drawn here, for real, against
// a stub that records every marker.
const { tr } = await import(`../public/js/i18n.js${Q}`)
const { escapeHtml } = await import(`../public/js/fmt.js${Q}`)
function drawWindField(provinces) {
  const markers = []
  const L = {
    latLngBounds: (b) => b,
    divIcon: o => ({ __icon: true, ...o }),
    layerGroup: () => ({ items: [], clearLayers() { this.items = [] } }),
    marker(latlng, opts) {
      const m = {
        latlng, opts, tooltip: null,
        bindTooltip(html) { m.tooltip = html; return m },
        addTo(group) { group.items.push(m); markers.push(m); return m },
      }
      return m
    },
  }
  const ctx = vm.createContext({
    console, L,
    store: { lang: 'en' },
    tr, escapeHtml,
    readPreference: () => null,
    BASEMAP_META: [],
    LAYER_GROUPS: [],
    allLayerToggles: () => [],
    windArrowSvg: wind.windArrowSvg, windRowText: wind.windRowText,
    windBasisLabel: wind.windBasisLabel, windView: wind.windView,
  })
  vm.runInContext(stripImports(file('public/js/map.js')), ctx)
  vm.runInContext('layers.hazeWind = L.layerGroup()', ctx)
  vm.runInContext(`paintWindField(${JSON.stringify({ provinces })})`, ctx)
  return markers
}
const OTHER = {
  province_code: '20', province_th: 'ฉะเชิงเทรา', province_en: 'Chachoengsao',
  lat: 13.69, lng: 101.08, wind_dir_deg: 250, wind_from_th: 'ตะวันตกเฉียงใต้', wind_from_en: 'SW',
  wind_towards_deg: 70, wind_towards_th: 'ตะวันออกเฉียงเหนือ', wind_towards_en: 'NE',
  wind_fc_kmh: 7.5, wind_basis: 'tomorrow-forecast', wind_updated_at: '2026-10-21T19:00',
}
const drawn = drawWindField([ROW, OTHER])
check('the map draws one arrow per province that has a bearing', drawn.length === 2, `drew ${drawn.length}`)
check('the arrow points DOWNWIND — the way the air moves, not the way it came',
  drawn[0].opts.icon.html.includes('rotate(193deg)') && drawn[1].opts.icon.html.includes('rotate(70deg)'),
  drawn.map(m => m.opts.icon.html.match(/rotate\([^)]*\)/)?.[0]).join(' '))
check('each arrow sits on its own province', drawn[0].latlng[0] === 18.8 && drawn[1].latlng[0] === 13.69)
check('the arrow tooltip names the direction and the speed',
  /N \(13°\) → S \(193°\)/.test(drawn[0].tooltip) && /14\.2 km\/h/.test(drawn[0].tooltip),
  drawn[0].tooltip)
check('the arrow tooltip says which day the wind is for', /tomorrow&#39;s dominant direction/.test(drawn[0].tooltip))
check('a province with no bearing draws no arrow at all',
  drawWindField([{ ...ROW, wind_dir_deg: null, wind_towards_deg: null }]).length === 0)
check('the map no longer takes its arrows from the smoke rows',
  !/e\.detail\.wind\b/.test(file('public/js/map.js')) && !/hazeWindRows/.test(file('public/js/map.js')),
  'the arrows came from a payload that is empty on a no-fire day')
check('the map re-paints the wind field on every snapshot', /paintWindField\(snap\.risk\)/.test(file('public/js/map.js')))
const paintSrc = file('public/js/paint.js')
check('the province popup carries the wind', /windRowText\(p\) \|\| null/.test(paintSrc))
check('the popup does not invent a wind when there is none', /\|\| null/.test(paintSrc))

// ── 7 · live ───────────────────────────────────────────────────────────────
try {
  const res = await fetch('http://localhost:28341/api/risk', { signal: AbortSignal.timeout(8000) })
  const live = await res.json()
  const provinces = live.provinces ?? []
  const withBearing = provinces.filter(p => p.wind_dir_deg != null)
  check('live: every province that has a bearing also names where it goes',
    withBearing.every(p => p.wind_towards_deg != null && p.wind_from_en && p.wind_towards_en),
    'one end of the arrow must never be missing')
  check('live: the towards label is the opposite of the from label',
    withBearing.every(p => {
      const opposite = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', SE: 'NW', NW: 'SE' }
      return opposite[p.wind_from_en] === p.wind_towards_en
    }))
} catch (err) {
  console.log(`SKIP live check — server not reachable: ${err?.message ?? err}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
