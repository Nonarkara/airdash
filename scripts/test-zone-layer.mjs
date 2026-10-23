// The map's zone of air pollution.
//
// WHY THIS GUARD EXISTS
// The dashboard's map drew 77 province risk circles as translucent discs
// (5–18% fill) over a pale basemap, so the thing a reader opens the map
// for — where is the air bad — arrived as a pile of grey rings. The layer
// that could draw it as an AREA, the DOPA province polygons, was off by
// default and filled at 4%: a whisper. The loudest layer on the map was
// the radar rain.
//
// 2.4.122 turned the zone on and filled it with the band's own colour —
// and painted every province BLACK, because `bandColor` is a function and
// `bandColor[band]` is undefined. A pattern-matching guard cannot see
// that: the source said "BAND_COLOR[band]" and looked deliberate. So the
// style now lives in public/js/zone-style.js, and THIS GUARD EXECUTES it.
//
// The contract:
//
//   1. The province areas are on by default and filled at a legible
//      opacity, with the normal provinces quiet and the bad ones loud.
//   2. The score circles are off by default, so the band is not encoded
//      twice — once by the area, once by the circle.
//   3. The fill is the BAND's own colour, resolved by CALLING bandColor.
//      A province with no band gets the neutral reference style, never a
//      band's colour.
//   4. The legend names the four bands and how many provinces are in each.
//   5. The province card exists ONCE and is reachable from the zone.
//
// Every rule is proved against deliberately broken copies. A mutation that
// changes nothing is rejected: a no-op mutation proves nothing.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const SOURCES = {
  style: read('public/js/zone-style.js'),
  boundary: read('public/js/layers/province-boundaries.js'),
  sat: read('public/js/layers/satellite.js'),
  map: read('public/js/map.js'),
  paint: read('public/js/paint.js'),
}
const I18N_URL = pathToFileURL(join(ROOT, 'public/js/i18n.js')).href

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the executed rules ─────────────────────────────────────────────────────
// These run the REAL module. A mutation of the module is a mutation of the
// shipped behaviour, not of a string.
async function loadStyle(source, tag) {
  const dir = join(tmpdir(), `airdash-zone-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  // The module imports ./i18n.js relatively; from a temp dir that would not
  // resolve, so the import is rewritten to an absolute URL.
  const file = join(dir, `zone-style-${tag}.mjs`)
  const rewritten = source.replace(/'\.\/i18n\.js(\?v=[^']*)?'/, `'${I18N_URL}'`)
  writeFileSync(file, rewritten)
  const mod = await import(pathToFileURL(file).href)
  return { mod, dir }
}

function styleRules(M) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })
  const { zoneStyle, ZONE_OPACITY, ZONE_FALLBACK } = M

  for (const band of ['normal', 'watch', 'elevated', 'high']) {
    const s = zoneStyle(band)
    t(`${band}: the zone is painted with a colour`, typeof s.fillColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(s.fillColor),
      `fillColor is ${JSON.stringify(s.fillColor)}`)
    t(`${band}: the colour is not a neutral grey`, s.fillColor && s.fillColor !== '#000000' && s.fillColor !== '#fff' && s.fillColor !== '#ffffff',
      `fillColor is ${s.fillColor}`)
    t(`${band}: the stroke and the fill are the same colour`, s.color === s.fillColor,
      `stroke ${s.color} vs fill ${s.fillColor}`)
    t(`${band}: the fill opacity matches the map's ladder`, Math.abs(s.fillOpacity - ZONE_OPACITY[band]) < 1e-9,
      `style says ${s.fillOpacity}, ladder says ${ZONE_OPACITY[band]}`)
  }

  const none = zoneStyle(null)
  const bogus = zoneStyle('not-a-band')
  t('a province with no band gets the neutral reference style',
    none.fillColor === ZONE_FALLBACK.fillColor && none.fillOpacity === ZONE_FALLBACK.fillOpacity && none.dashArray === ZONE_FALLBACK.dashArray,
    JSON.stringify(none))
  t('an unknown band never borrows a band’s colour',
    bogus.fillColor === ZONE_FALLBACK.fillColor && bogus.fillOpacity === ZONE_FALLBACK.fillOpacity,
    JSON.stringify(bogus))

  const opac = Object.values(ZONE_OPACITY)
  t('every band is legible on a pale basemap (fill ≥ 0.10)', opac.every(v => v >= 0.10), JSON.stringify(ZONE_OPACITY))
  t('the worst band is loud (fill ≥ 0.34)', (ZONE_OPACITY.high ?? 0) >= 0.34, `got ${ZONE_OPACITY.high}`)
  t('the fill grows with severity',
    ZONE_OPACITY.normal <= ZONE_OPACITY.watch && ZONE_OPACITY.watch <= ZONE_OPACITY.elevated && ZONE_OPACITY.elevated <= ZONE_OPACITY.high,
    JSON.stringify(ZONE_OPACITY))
  return out
}

// ── the source rules ───────────────────────────────────────────────────────
function sourceRules(s) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })

  const toggle = (src, id) => src.match(new RegExp(`\\{ id: '${id}',[^\\n]*`))?.[0] ?? ''
  const zoneToggle = toggle(s.sat, 'boundaries')
  const riskToggle = toggle(s.sat, 'risk')
  t('the province zone layer is on by default', /on:\s*true/.test(zoneToggle), zoneToggle.slice(0, 80))
  t('the watch-score circles are off by default (one band, one encoding)', /on:\s*false/.test(riskToggle), riskToggle.slice(0, 80))
  t('the zone layer is named as a zone, not as reference geometry',
    /air zone|โซนอากาศ/.test(zoneToggle) && !/Reference geometry\. Nothing here is a measurement/.test(zoneToggle),
    zoneToggle.slice(0, 120))

  t('the map paints the zone through the shared style module',
    /import \{ zoneStyle \}/.test(s.boundary) && /const style = zoneStyle\(band\)/.test(s.boundary),
    'the layer must not hand-roll the style — that is how a province ends up black')
  t('the layer resolves the band colour by calling it, never by indexing it',
    !/BAND_COLOR\[/.test(s.boundary) && /bandColor\(band\)/.test(s.boundary))

  t('the legend has a zone key', /PROVINCE AIR ZONE|โซนอากาศรายจังหวัด/.test(s.map))
  t('the legend key lists all four bands', /'normal',\s*'watch',\s*'elevated',\s*'high'/.test(s.map))
  t('the legend key counts the provinces in each band', /bandCounts/.test(s.map))
  t('the legend counts are written into the open legend, not baked into it',
    /class="zcount" data-band=/.test(s.map) && /paintWindField\(snap\.risk\)\s*\n\s*refreshZoneCounts\(\)/.test(s.map),
    'a legend built before the snapshot arrives would say "0 provinces" forever')
  t('the legend says the area colour is the band', /Area colour = the province|สีพื้นที่ = ระดับเฝ้าระวัง/.test(s.map))

  t('the province card is defined once', /export function provinceCard\(/.test(s.paint))
  t('the card rows live in one place', /export function provinceCardRows\(/.test(s.paint))
  t('the zone opens the province card', /bindPopup\(\(\)\s*=>\s*provinceCard\(/.test(s.boundary))
  t('the score circles open the same card', /bindPopup\(\(\)\s*=>\s*provinceCard\(/.test(s.paint))
  const cardLabel = 'คาด PM2.5 พรุ่งนี้'
  const copies = (s.paint.match(new RegExp(cardLabel, 'g')) ?? []).length
    + (s.boundary.match(new RegExp(cardLabel, 'g')) ?? []).length
    + (s.map.match(new RegExp(cardLabel, 'g')) ?? []).length
  t('the forecast row exists in exactly one place', copies === 1, `${copies} copies`)
  t('a province with no risk row gets no band', /riskRowForName\([^)]*\)\?\.band\s*\?\?\s*null/.test(s.boundary))
  return out
}

// ── run both ───────────────────────────────────────────────────────────────
const tmp = join(tmpdir(), `airdash-zone-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const real = await loadStyle(SOURCES.style, 'real')
for (const r of styleRules(real.mod)) check(r.name, r.ok, r.why)
for (const r of sourceRules(SOURCES)) check(r.name, r.ok, r.why)

// ── and against deliberately broken copies ────────────────────────────────
// Each mutation must (a) change the source and (b) be caught — by the
// executed rules when the module is mutated, by the source rules otherwise.
const M = [
  ['the fill colour is dropped', 'style', 'fillColor: color,', 'fillColor: undefined,'],
  ['the band colour is indexed instead of called', 'style', 'const color = bandColor(band)', 'const color = bandColor[band]'],
  ['the zone is painted black', 'style', 'const color = bandColor(band)', "const color = '#000000'"],
  ['the worst band is painted at a whisper', 'style', 'high: 0.66', 'high: 0.22'],
  ['the clean band is painted at nothing', 'style', 'normal: 0.20', 'normal: 0.02'],
  ['an unknown band borrows a colour', 'style', 'if (!band || !(band in ZONE_OPACITY)) return { ...ZONE_FALLBACK }', 'if (!band) return { ...ZONE_FALLBACK }'],
  ['the map hand-rolls the zone style', 'boundary', 'const style = zoneStyle(band)', "const style = { color: bandColor[band], fillColor: bandColor[band], fillOpacity: 0.2 }"],
  ['the zone layer is switched off', 'sat', "on: true, note_th: 'แต่ละจังหวัดเป็นพื้นที่หนึ่ง", "on: false, note_th: 'แต่ละจังหวัดเป็นพื้นที่หนึ่ง"],
  ['the score circles are switched back on', 'sat', "en: 'province watch-score circles (size = score)', on: false", "en: 'province watch-score circles (size = score)', on: true"],
  ['the legend loses its zone key', 'map', "tr('โซนอากาศรายจังหวัด', 'PROVINCE AIR ZONE')", "tr('nothing', 'nothing')"],
  ['the legend counts stop refreshing', 'map', '  refreshZoneCounts()\n}', '  // removed\n}'],
  ['the zone stops opening the province card', 'boundary', 'lyr.bindPopup(() => provinceCard(row))', '// removed'],
  ['the card is written a second time', 'paint', 'export function provinceCardRows(p) {', "export function provinceCardRows(p) { const dup = ['คาด PM2.5 พรุ่งนี้'];"],
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
  if (file === 'style') {
    const mod = await loadStyle(mutated.style, name.replace(/\W+/g, '-'))
    failed = failed.concat(styleRules(mod.mod).filter(r => !r.ok))
  }
  if (failed.length) caught++
  check(`mutation "${name}" is caught by the guard`, failed.length > 0,
    failed.length ? failed.map(r => r.name).join('; ') : 'the broken source passed every rule')
}
rmSync(tmp, { recursive: true, force: true })
check(`every mutation was caught (${caught}/${M.length})`, caught === M.length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
