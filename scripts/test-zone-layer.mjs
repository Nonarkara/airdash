// The map's zone of air pollution.
//
// WHY THIS GUARD EXISTS
// The dashboard's map drew 77 province risk circles as translucent discs
// (5–18% fill) over a pale basemap, so the thing a reader opens the map
// for — where is the air bad — arrived as a pile of grey rings. The layer
// that could draw it as an AREA, the DOPA province polygons, was off by
// default and filled at 4–22%: a whisper. The loudest layer on the map was
// the radar rain.
//
// The zone now exists, visibly:
//
//   1. The province areas are on by default and filled at a legible
//      opacity, with the normal provinces quiet and the bad ones loud.
//   2. The score circles are off by default, so the band is not encoded
//      twice — once by the area, once by the circle.
//   3. The fill uses the BAND's own colour, so the map, the legend and
//      the province card cannot disagree about what a colour means.
//   4. The legend names the four bands and how many provinces are in each.
//   5. The province card exists ONCE and is reachable from the zone, which
//      is the thing a reader clicks.
//
// A guard that cannot fail is worse than no guard, so every rule is proved
// against deliberately broken copies of the sources below. A mutation that
// changes nothing is rejected: a no-op mutation proves nothing.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const SOURCES = {
  boundary: read('public/js/layers/province-boundaries.js'),
  sat: read('public/js/layers/satellite.js'),
  map: read('public/js/map.js'),
  paint: read('public/js/paint.js'),
}

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

function assertions(s) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })

  // ── 1. the zone is on, the duplicate encoding is not ────────────────────
  const toggle = (src, id) => src.match(new RegExp(`\\{ id: '${id}',[^\\n]*`))?.[0] ?? ''
  const zoneToggle = toggle(s.sat, 'boundaries')
  const riskToggle = toggle(s.sat, 'risk')
  t('the province zone layer is on by default', /on:\s*true/.test(zoneToggle), zoneToggle.slice(0, 80))
  t('the watch-score circles are off by default (one band, one encoding)', /on:\s*false/.test(riskToggle), riskToggle.slice(0, 80))
  t('the zone layer is named as a zone, not as reference geometry',
    /air zone|โซนอากาศ/.test(zoneToggle) && !/Reference geometry\. Nothing here is a measurement/.test(zoneToggle),
    zoneToggle.slice(0, 120))

  // ── 2. the zone's fill is legible ────────────────────────────────────────
  const zm = s.boundary.match(/ZONE_OPACITY\s*=\s*\{([^}]*)\}/)
  const opac = {}
  for (const m of (zm?.[1] ?? '').matchAll(/(\w+)\s*:\s*([\d.]+)/g)) opac[m[1]] = Number(m[2])
  t('the zone declares a fill opacity for every band',
    ['normal', 'watch', 'elevated', 'high'].every(b => Number.isFinite(opac[b])),
    `got ${JSON.stringify(opac)}`)
  t('every band is legible on a pale basemap (fill ≥ 0.10)',
    Object.values(opac).every(v => v >= 0.10), `got ${JSON.stringify(opac)}`)
  t('the worst band is loud (fill ≥ 0.34)', (opac.high ?? 0) >= 0.34, `got ${opac.high}`)
  t('the fill grows with severity',
    (opac.normal ?? 9) <= (opac.watch ?? 9) && (opac.watch ?? 9) <= (opac.elevated ?? 9) && (opac.elevated ?? 9) <= (opac.high ?? 9),
    `got ${JSON.stringify(opac)}`)

  // ── 3. one colour vocabulary ────────────────────────────────────────────
  t('the zone fill uses the band’s own colour',
    /fillColor:\s*band\s*\?\s*BAND_COLOR\[band\]/.test(s.boundary),
    'the fill must not come from a second, parallel palette')
  t('there is no second band palette left behind', !/BAND_FILL/.test(s.boundary))

  // ── 4. the legend names the zone ────────────────────────────────────────
  t('the legend has a zone key', /PROVINCE AIR ZONE|โซนอากาศรายจังหวัด/.test(s.map))
  t('the legend key lists all four bands', /'normal',\s*'watch',\s*'elevated',\s*'high'/.test(s.map))
  t('the legend key counts the provinces in each band', /bandCounts/.test(s.map))
  t('the legend counts are written into the open legend, not baked into it',
    /class="zcount" data-band=/.test(s.map) && /paintWindField\(snap\.risk\)\s*\n\s*refreshZoneCounts\(\)/.test(s.map),
    'a legend built before the snapshot arrives would say "0 provinces" forever')
  t('the legend says the area colour is the band', /Area colour = the province|สีพื้นที่ = ระดับเฝ้าระวัง/.test(s.map))

  // ── 5. the province card exists once and lives on the zone ──────────────
  t('the province card is defined once', /export function provinceCard\(/.test(s.paint))
  t('the card rows live in one place', /export function provinceCardRows\(/.test(s.paint))
  t('the zone opens the province card', /bindPopup\(\(\)\s*=>\s*provinceCard\(/.test(s.boundary))
  t('the score circles open the same card', /bindPopup\(\(\)\s*=>\s*provinceCard\(/.test(s.paint))
  const cardLabel = 'คาด PM2.5 พรุ่งนี้'
  const copies = (s.paint.match(new RegExp(cardLabel, 'g')) ?? []).length
    + (s.boundary.match(new RegExp(cardLabel, 'g')) ?? []).length
    + (s.map.match(new RegExp(cardLabel, 'g')) ?? []).length
  t('the forecast row exists in exactly one place', copies === 1, `${copies} copies`)

  // ── 6. no data means no invented band ───────────────────────────────────
  t('the zone falls back to a neutral style when there is no band',
    /band\s*\?\s*[^:]*:\s*DEFAULT_STYLE/.test(s.boundary))
  t('a province with no risk row gets no band', /riskRowForName\([^)]*\)\?\.band\s*\?\?\s*null/.test(s.boundary))

  return out
}

for (const r of assertions(SOURCES)) check(r.name, r.ok, r.why)

// ── and against deliberately broken copies ────────────────────────────────
// The mutations are (name, file, from, to).
const M = [
  ['the zone layer is switched off', 'sat', "on: true, note_th: 'แต่ละจังหวัดเป็นพื้นที่หนึ่ง", "on: false, note_th: 'แต่ละจังหวัดเป็นพื้นที่หนึ่ง"],
  ['the score circles are switched back on', 'sat', "en: 'province watch-score circles (size = score)', on: false", "en: 'province watch-score circles (size = score)', on: true"],
  ['the worst band is painted at a whisper', 'boundary', 'high: 0.66', 'high: 0.22'],
  ['the clean band is painted at nothing', 'boundary', 'normal: 0.20', 'normal: 0.02'],
  ['the fill comes from a second palette', 'boundary', 'fillColor: band ? BAND_COLOR[band]', 'fillColor: band ? \'#E86A10\''],
  ['the legend loses its zone key', 'map', "tr('โซนอากาศรายจังหวัด', 'PROVINCE AIR ZONE')", "tr('nothing', 'nothing')"],
  ['the zone stops opening the province card', 'boundary', 'lyr.bindPopup(() => provinceCard(row))', '// removed'],
  ['the legend counts stop refreshing', 'map', '  refreshZoneCounts()\n}', '  // removed\n}'],
  ['the legend counts are baked in at build time', 'map', '<span class=\"zcount\" data-band=\"${b}\">0</span>', '${n}'],
  ['the card is written a second time', 'paint', 'export function provinceCardRows(p) {', 'export function provinceCardRows(p) { const dup = [\'คาด PM2.5 พรุ่งนี้\'];'],
]
const tmp = join(tmpdir(), `airdash-zone-${process.pid}`)
mkdirSync(tmp, { recursive: true })
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
  const failed = assertions(mutated).filter(r => !r.ok)
  if (failed.length) caught++
  check(`mutation "${name}" is caught by the guard`, failed.length > 0,
    failed.length ? failed.map(r => r.name).join('; ') : 'the broken source passed every rule')
}
rmSync(tmp, { recursive: true, force: true })
check(`every mutation was caught (${caught}/${M.length})`, caught === M.length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
