// The wind that moves the zone: direction AND strength, on the same map.
//
// WHY THIS GUARD EXISTS
// The province wind arrows showed WHERE the air is going and nothing about
// how fast. "Which way" without "how strong" is half an answer — the speed
// decides whether the air carries anything — and the strength was only in a
// hover tooltip, one province at a time. The arrows were also OFF by
// default, so the map answered "where is the air bad" without the one
// thing that explains where it is going.
//
// The strength is now the arrow's SIZE, on a square-root scale so a still
// hour and a moving one look different. A missing speed is NOT a calm
// wind: it draws faded and says so.
//
// WHAT THIS GUARD IS POINTED AT
// 1. The geometry lives in wind.js (pure, Node-importable) and the guard
//    EXECUTES it. A pattern check cannot tell a size mapping that works from
//    one that is a constant.
// 2. The assertions use the module's OWN exported constants (WIND_ARROW),
//    not hand-typed copies of them. A guard that restates the number it
//    checks is a guard that drifts.
// 3. The rule that explains the arrow's size is stated ONCE, in wind.js, and
//    the legend asks for it. This guard exists because the rule used to be
//    written out in two places (the legend row and the layer panel note),
//    and a whole-file regex could not tell the legend had stopped saying it
//    — the other copy still matched. The legend block is now scoped, and
//    the second copy is required to be gone.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const SOURCES = {
  wind: read('public/js/wind.js'),
  map: read('public/js/map.js'),
  css: read('public/css/components.css'),
}

// The legend's body is one template literal. It is extracted (not matched
// loosely against the whole file) so a rule about the legend cannot be
// satisfied by an unrelated string elsewhere in map.js.
function legendBlock(src) {
  const start = src.indexOf('body.innerHTML = `')
  if (start < 0) return ''
  const marker = src.indexOf('// Close button at the BOTTOM')
  if (marker < 0) return ''
  const end = src.lastIndexOf('`', marker)
  if (end < start) return ''
  return src.slice(start + 'body.innerHTML = `'.length, end)
}

const windToggleBlock = src => src.match(/const windToggle = \{[^}]*\}/)?.[0] ?? ''

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the executed rules ─────────────────────────────────────────────────────
function sizeRules(M) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })
  const { windArrowSize, WIND_ARROW, WIND_ENCODING, windEncodingText } = M
  if (typeof windArrowSize !== 'function') {
    t('the module exports a wind arrow size mapping', false, 'windArrowSize is missing')
    return out
  }
  if (!WIND_ARROW || !Number.isFinite(WIND_ARROW.MIN) || !Number.isFinite(WIND_ARROW.MAX)
      || !Number.isFinite(WIND_ARROW.CEIL) || !Number.isFinite(WIND_ARROW.UNKNOWN)) {
    t('the module exports the drawn scale of the arrow', false, `WIND_ARROW is ${JSON.stringify(WIND_ARROW)}`)
    return out
  }
  t('the module exports the drawn scale of the arrow', true)

  const calm = windArrowSize(0)
  const light = windArrowSize(6)
  const brisk = windArrowSize(15)
  const strong = windArrowSize(WIND_ARROW.CEIL)
  t('a still wind is the smallest arrow', calm.size < light.size && light.size < brisk.size && brisk.size < strong.size,
    `${calm.size} / ${light.size} / ${brisk.size} / ${strong.size}`)
  t('the scale’s own ends are the sizes the function draws',
    calm.size === WIND_ARROW.MIN && strong.size === WIND_ARROW.MAX,
    `min ${calm.size}/${WIND_ARROW.MIN} · max ${strong.size}/${WIND_ARROW.MAX}`)
  // A DESIGN bound, not a copy of the scale: an arrow on the map is not
  // readable past ~32 px, and it must not shrink into a dot either.
  t('the sizes stay inside the drawn range', [calm, light, brisk, strong].every(s => s.size >= 10 && s.size <= 32),
    JSON.stringify([calm.size, light.size, brisk.size, strong.size]))
  t('the ceiling speed is the product decision (32 km/h)',
    WIND_ARROW.CEIL === 32, `got ${WIND_ARROW.CEIL}`)
  t('a wind beyond the ceiling is clamped, not scaled away',
    windArrowSize(400).size === strong.size, `got ${windArrowSize(400).size} vs ${strong.size}`)
  t('a negative speed does not produce a negative arrow',
    windArrowSize(-5).size === calm.size, `got ${windArrowSize(-5).size}`)

  const missing = windArrowSize(null)
  const nan = windArrowSize(undefined)
  t('a missing speed is marked as unknown, not calm',
    missing.known === false && nan.known === false && missing.size === nan.size,
    JSON.stringify({ missing, nan }))
  t('a measured speed is marked as known', calm.known === true && strong.known === true)
  t('an unknown speed is not smaller than a measured one',
    missing.size >= calm.size, `${missing.size} vs ${calm.size}`)

  // The sentence that explains the arrow, in both languages.
  if (!WIND_ENCODING || !WIND_ENCODING.th || !WIND_ENCODING.en) {
    t('the module states the encoding rule in both languages', false, 'WIND_ENCODING is missing')
  } else {
    t('the module states the encoding rule in both languages', true)
    t('the English rule says a longer arrow is a stronger wind',
      /longer the arrow/i.test(WIND_ENCODING.en) && /stronger the wind/i.test(WIND_ENCODING.en),
      WIND_ENCODING.en)
    t('the Thai rule says a longer arrow is a stronger wind',
      WIND_ENCODING.th.includes('ยาวขึ้น') && WIND_ENCODING.th.includes('ลมแรงขึ้น'),
      WIND_ENCODING.th)
    t('the rule says which way the arrow points',
      /where the air moves/i.test(WIND_ENCODING.en) && WIND_ENCODING.th.includes('ทางที่อากาศเคลื่อนไป'),
      WIND_ENCODING.en)
    t('the reader is given one of the two sentences, not a third wording',
      typeof windEncodingText === 'function'
        && (windEncodingText() === WIND_ENCODING.th || windEncodingText() === WIND_ENCODING.en),
      typeof windEncodingText === 'function' ? windEncodingText() : 'windEncodingText is missing')
  }
  return out
}

// ── the source rules ───────────────────────────────────────────────────────
function sourceRules(s) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })
  const legend = legendBlock(s.map)
  const toggle = windToggleBlock(s.map)

  t('the map legend block was found', legend.length > 0, 'no legend template literal in map.js')
  const windToggle = toggle
  t('the province wind field is on by default', /on:\s*true/.test(windToggle), windToggle.slice(0, 90))

  t('the map sizes the arrow from the wind speed',
    /windArrowSize\(w\.speedKmh\)/.test(s.map), 'the arrow must not be drawn at a fixed size')
  t('the map does not pin the arrow’s size itself',
    !/iconSize:\s*\[\s*20\s*,\s*20\s*\]/.test(s.map) && !/windArrowSvg\(w\.towards,\s*\{\s*size:\s*18\s*\}\)/.test(s.map))
  t('the stylesheet does not flatten the arrow’s size',
    !/\.haze-wind-icon \.wind-arrow\s*\{[^}]*width:\s*\d+px/.test(s.css),
    'a fixed width in CSS would override the speed encoding')
  t('the stylesheet marks an arrow with no speed reading',
    /\.haze-wind-icon\.no-strength/.test(s.css))
  t('the map says when the speed is missing',
    /no wind speed reading|ไม่มีค่าความเร็วลม/.test(s.map))

  // The legend states the rule by ASKING for it — not by writing it out again.
  t('the legend states the encoding rule from the one canonical sentence',
    legend.includes('windEncodingText()'), 'the legend must call windEncodingText()')
  t('the legend does not write out its own copy of the rule',
    !/the longer the arrow|ยาวขึ้น\s*=\s*ลมแรงขึ้น/.test(legend),
    'a second wording of the rule is how two answers appear')
  t('the legend’s two example arrows are the scale’s own ends',
    /windArrowSvg\(90,\s*\{\s*size:\s*WIND_ARROW\.MIN\s*\}\)/.test(legend)
      && /windArrowSvg\(90,\s*\{\s*size:\s*WIND_ARROW\.MAX\s*\}\)/.test(legend),
    'the key must show the sizes the drawing actually uses')
  t('the map imports the canonical sentence and the scale',
    /import \{[^}]*windEncodingText[^}]*\} from '\.\/wind\.js/.test(s.map)
      && /import \{[^}]*WIND_ARROW[^}]*\} from '\.\/wind\.js/.test(s.map),
    'the legend would have no canonical text to ask for')

  // ONE answer to "how do I read the size": the legend. The layer panel's
  // note says what the layer IS; it must not restate the decoding rule.
  t('the size rule is stated in one place, not two',
    !/the longer the arrow|ยาวขึ้น/.test(toggle),
    'the layer note restates the rule the legend already states')
  return out
}

// ── run both ───────────────────────────────────────────────────────────────
const tmp = join(tmpdir(), `airdash-wind-${process.pid}`)
mkdirSync(tmp, { recursive: true })
async function loadWind(source, tag) {
  const dir = join(tmpdir(), `airdash-wind-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `wind-${tag}.mjs`)
  // Every relative import is rewritten to an absolute URL: from a temp
  // directory the module's own siblings cannot be resolved.
  const rewritten = source.replace(/'\.\/([\w.-]+\.js)(\?v=[^']*)?'/g, (_m, file) => `'${pathToFileURL(join(ROOT, 'public/js', file)).href}'`)
  writeFileSync(file, rewritten)
  return import(pathToFileURL(file).href)
}

const real = await loadWind(SOURCES.wind, 'real')
for (const r of sizeRules(real)) check(r.name, r.ok, r.why)
for (const r of sourceRules(SOURCES)) check(r.name, r.ok, r.why)

// ── and against deliberately broken copies ────────────────────────────────
const M = [
  ['the arrow size stops following the wind', 'wind', 'export function windArrowSize(speedKmh) {', 'export function windArrowSize(speedKmh) { return { size: 18, known: true }'],
  ['a missing speed is drawn as a calm wind', 'wind', 'if (!Number.isFinite(speedKmh)) return { size: UNKNOWN, known: false }', 'if (!Number.isFinite(speedKmh)) return { size: 12, known: true }'],
  ['the ceiling is removed', 'wind', 'const s = Math.max(0, Math.min(CEIL, speedKmh))', 'const s = Math.max(0, speedKmh)'],
  ['the drawn maximum drifts away from the scale', 'wind', 'export const WIND_ARROW = { MIN: 12, MAX: 30, CEIL: 32, UNKNOWN: 18 }', 'export const WIND_ARROW = { MIN: 12, MAX: 44, CEIL: 32, UNKNOWN: 18 }'],
  ['the ceiling speed moves', 'wind', 'export const WIND_ARROW = { MIN: 12, MAX: 30, CEIL: 32, UNKNOWN: 18 }', 'export const WIND_ARROW = { MIN: 12, MAX: 30, CEIL: 40, UNKNOWN: 18 }'],
  ['the scale stops being exported', 'wind', 'export const WIND_ARROW = {', 'const WIND_ARROW = {'],
  ['the canonical sentence loses the size rule', 'wind', "en: 'arrow points where the air moves — the longer the arrow, the stronger the wind',", "en: 'arrow points where the air moves',"],
  ['the map draws a fixed-size arrow', 'map', 'windArrowSize(w.speedKmh)', '{ size: 18, known: true }'],
  ['the stylesheet pins the arrow size', 'css', '.haze-wind-icon .wind-arrow {\n  display: block;', '.haze-wind-icon .wind-arrow {\n  display: block; width:18px; height:18px;'],
  ['the wind field is switched off again', 'map', "en:'Province wind field + upwind fire counts',on:true", "en:'Province wind field + upwind fire counts',on:false"],
  ['the legend stops explaining the size', 'map', '</span>${windEncodingText()} (', "</span>${'arrow points where the air moves'} ("],
  ['the layer panel states the size rule a second time', 'map', "note_en:'Arrows point where the wind blows. Daily dominant forecast, not current wind.'", "note_en:'Arrows point where the wind blows; the longer the arrow, the stronger the wind. Daily dominant forecast, not current wind.'"],
  ['the legend’s example arrows drift from the scale', 'map', 'windArrowSvg(90, { size: WIND_ARROW.MIN })', 'windArrowSvg(90, { size: 14 })'],
]
let caught = 0
for (const [name, file, from, to] of M) {
  const src = SOURCES[file]
  if (!src.includes(from)) {
    check(`mutation "${name}" applies to the source`, false, `not found: ${from.slice(0, 60)}`)
    continue
  }
  const mutated = { ...SOURCES, [file]: src.replace(from, to) }
  if (mutated[file] === src) {
    check(`mutation "${name}" changes the source`, false, 'the replacement produced an identical file')
    continue
  }
  let failed = sourceRules(mutated).filter(r => !r.ok)
  if (file === 'wind') {
    const mod = await loadWind(mutated.wind, name.replace(/\W+/g, '-'))
    failed = failed.concat(sizeRules(mod).filter(r => !r.ok))
  }
  if (failed.length) caught++
  check(`mutation "${name}" is caught by the guard`, failed.length > 0,
    failed.length ? failed.map(r => r.name).join('; ') : 'the broken source passed every rule')
}
rmSync(tmp, { recursive: true, force: true })
check(`every mutation was caught (${caught}/${M.length})`, caught === M.length)

// ── live: the provinces the map can actually place ─────────────────────────
// A province the map cannot place cannot have its arrow drawn. Nine provinces
// used to sit in exactly that state — they had a wind bearing and no
// position, because a single coordinate-less station was the first row that
// mentioned them. The map showed 68 arrows and 77 province areas, and the
// nine missing ones looked like a gap in the data rather than a bug.
try {
  const res = await fetch('http://localhost:28341/api/risk', { signal: AbortSignal.timeout(8000) })
  const live = await res.json()
  const provinces = live.provinces ?? []
  const unplaced = provinces.filter(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))
  check('live: every province in the risk payload can be placed on the map',
    unplaced.length === 0,
    `${unplaced.length} provinces have no position: ${unplaced.map(p => p.province_en).join(', ')}`)
  const withBearing = provinces.filter(p => p.wind_dir_deg != null)
  check('live: every province with a bearing has somewhere to draw its arrow',
    withBearing.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    `${withBearing.filter(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng)).length} provinces have a bearing but no position`)
  check('live: the provinces with a bearing are the whole country',
    withBearing.length === provinces.length,
    `${withBearing.length} of ${provinces.length} provinces carry a bearing`)
} catch (err) {
  console.log(`SKIP live check — server not reachable: ${err?.message ?? err}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
