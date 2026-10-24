// The zone's horizon: the model says this province will get worse. Or better.
//
// WHY THIS GUARD EXISTS
// The horizon is the one thing on the map that paints a MODEL. Everything
// else on the zone is measured or observed. A model painted like a
// measurement is the most dangerous thing this dashboard could do: it
// carries a forecast into the one surface a reader trusts at a glance.
//
// So the rules here are about HONESTY, not about pixels:
//
//   1. The comparison is MODEL TO MODEL. The model's value now against the
//      model's value later. Never the ground reading — a 25 km cell average
//      beside a station peak would say "everything improves tomorrow" and
//      that is an artefact of the model's smoothing, not a forecast.
//   2. A horizon the model cannot reach is NOTHING, not the last frame.
//   3. A province with no model value is UNKNOWN, and it is painted
//      differently from a province the model says is steady.
//
// The logic lives in public/js/horizon.js (pure, Node-importable) and this
// guard EXECUTES it. A pattern check cannot tell a horizon that reaches the
// model's own "now" from one that reaches for the ground.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const SOURCES = {
  horizon: read('public/js/horizon.js'),
  map: read('public/js/map.js'),
  layer: read('public/js/layers/province-boundaries.js'),
}

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the executed rules ─────────────────────────────────────────────────────
function horizonRules(M) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })
  const { deltaState, changeStyle, horizonFrames, outlookByProvince, STEADY_BAND, CHANGE_COLOR, HORIZONS } = M

  if (typeof deltaState !== 'function' || typeof outlookByProvince !== 'function') {
    t('the module exports the horizon logic', false, 'deltaState/outlookByProvince missing')
    return out
  }
  t('the module exports the horizon logic', true)

  // The three states, and the band around zero.
  t('a rise beyond the steady band is "worse"',
    deltaState(STEADY_BAND + 0.1) === 'worse' && deltaState(20) === 'worse',
    `deltaState(${STEADY_BAND + 0.1}) = ${deltaState(STEADY_BAND + 0.1)}`)
  t('a fall beyond the steady band is "better"',
    deltaState(-STEADY_BAND - 0.1) === 'better' && deltaState(-20) === 'better')
  t('a change inside the steady band is "steady"',
    deltaState(0) === 'steady' && deltaState(STEADY_BAND) === 'steady' && deltaState(-STEADY_BAND) === 'steady',
    `band = ${STEADY_BAND}`)
  t('an absent change is "unknown", never "steady"',
    deltaState(null) === 'unknown' && deltaState(undefined) === 'unknown' && deltaState(NaN) === 'unknown',
    `deltaState(null) = ${deltaState(null)}`)

  // A province the model says nothing about must LOOK different.
  const unknownStyle = changeStyle('unknown')
  t('a province with no model value still gets a style',
    unknownStyle && typeof unknownStyle.fillColor === 'string' && unknownStyle.fillColor.length > 0,
    'a null style paints the province like an unpainted one, which reads as missing')
  t('the unknown style is not the steady style',
    unknownStyle && changeStyle('steady') && unknownStyle.fillColor !== changeStyle('steady').fillColor,
    'no data and no change must not look alike')
  t('the three states have three different colours',
    new Set(['worse', 'steady', 'better'].map(s => changeStyle(s).fillColor)).size === 3)
  t('the palette has a colour for every state',
    ['worse', 'steady', 'better', 'unknown'].every(s => CHANGE_COLOR[s]),
    JSON.stringify(CHANGE_COLOR))

  // The frames.
  const NOW = Date.parse('2026-10-24T03:00:00Z')
  const frames = Array.from({ length: 49 }, (_, i) => ({
    index: i,
    time: new Date(NOW + i * 3600_000).toISOString(),
  }))
  const pair = horizonFrames(frames, 24, NOW)
  t('the base frame is the model’s own now',
    pair && pair.base.index === 0, `base index ${pair?.base?.index}`)
  t('a 24 h horizon finds the frame 24 h later',
    pair && pair.target.index === 24, `target index ${pair?.target?.index}`)
  t('a horizon the model cannot reach is NOTHING, not the last frame',
    horizonFrames(frames, 96, NOW) === null,
    'painting the last frame for a +96 h horizon would be a lie')
  t('an outlook with no frames yields no horizon',
    horizonFrames([], 24, NOW) === null && horizonFrames(null, 24, NOW) === null)
  t('horizon 0 compares the frame with itself',
    horizonFrames(frames, 0, NOW).target.index === horizonFrames(frames, 0, NOW).base.index)

  // The per-province change.
  const outlook = {
    available: true,
    frames,
    points: [
      { code: '10', name: 'Bangkok', values: Array.from({ length: 49 }, (_, i) => 10 + i) },
      { code: '20', name: 'Chachoengsao', values: Array.from({ length: 49 }, (_, i) => 40 - i) },
      // A province the model says nothing about: its values are absent.
      { code: '30', name: 'No model', values: [null, null, null] },
    ],
  }
  const rows = outlookByProvince(outlook, 24, NOW)
  t('the change is computed between two MODEL values',
    rows.get('10')?.now === 10 && rows.get('10')?.then === 34 && rows.get('10')?.delta === 24,
    JSON.stringify(rows.get('10')))
  t('a falling model reads as "better"',
    rows.get('20')?.state === 'better', JSON.stringify(rows.get('20')))
  t('a province with no model value is ABSENT, not steady',
    !rows.has('30'), 'an absent reading must not become a measurement')
  t('an unavailable outlook yields no provinces',
    outlookByProvince({ available: false, frames, points: outlook.points }, 24, NOW).size === 0)
  t('the horizons on offer include now and the days ahead',
    Array.isArray(HORIZONS) && HORIZONS[0] === 0 && HORIZONS.includes(24) && HORIZONS.includes(48),
    JSON.stringify(HORIZONS))
  return out
}

// ── the source rules ───────────────────────────────────────────────────────
function sourceRules(s) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })

  // MODEL TO MODEL. The module must not reach for a ground concentration —
  // a cell average beside a station peak is the false-reassurance bug.
  t('the horizon never reads a ground concentration',
    !/\.pm25\b/.test(s.horizon), 'the comparison must be model to model')
  t('the zone paints the band at the present',
    /zoneStyle\(band\)/.test(s.layer), 'the present must still carry the band')
  t('the zone paints the change in a forecast horizon',
    /changeStyle\(change\?\.state \?\? 'unknown'\)/.test(s.layer),
    'the areas must carry the change when a horizon is selected')
  t('the layer listens for the horizon',
    /on\('horizon', draw\)/.test(s.layer))
  // The legend's zone key is ONE expression with two branches. The rule is
  // scoped to that expression: a whole-file check is satisfied by the OTHER
  // branch, which is how "the key still names the bands" once passed.
  const zoneKeyExpr = s.map.split('const zoneKey =')[1]?.split('const zoneEyebrow')[0] ?? ''
  t('the legend key changes with the horizon',
    /data-change=/.test(zoneKeyExpr) && /data-band=/.test(zoneKeyExpr),
    'a key that still names the bands would describe something not on screen')
  t('the legend’s change branch names the change states',
    /worse/.test(zoneKeyExpr) && /better/.test(zoneKeyExpr) && /steady/.test(zoneKeyExpr),
    zoneKeyExpr.slice(0, 160))
  t('the legend states that the horizon is a model',
    /changeCaption\(\)/.test(s.map))
  t('the map offers now and the days ahead',
    /HORIZONS/.test(s.map) && /horizonLabel\(/.test(s.map))
  t('the outlook is fetched only when a horizon is asked for',
    /if \(hours > 0 && !store\.outlook\)/.test(s.map),
    'the default page must not pay for a horizon nobody used')
  t('a failed outlook leaves the map on the present',
    /model unavailable|ไม่พร้อม/.test(s.map),
    'no model, no future field invented')
  t('the fetch is bounded',
    /AbortSignal\.timeout/.test(s.map), 'a hung request must not freeze the control')
  return out
}

// ── run both ───────────────────────────────────────────────────────────────
const tmp = join(tmpdir(), `airdash-horizon-${process.pid}`)
mkdirSync(tmp, { recursive: true })
async function loadHorizon(source, tag) {
  const dir = join(tmpdir(), `airdash-horizon-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `horizon-${tag}.mjs`)
  const rewritten = source.replace(/'\.\/([\w.-]+\.js)(\?v=[^']*)?'/g, (_m, f) => `'${pathToFileURL(join(ROOT, 'public/js', f)).href}'`)
  writeFileSync(file, rewritten)
  return import(pathToFileURL(file).href)
}

const real = await loadHorizon(SOURCES.horizon, 'real')
for (const r of horizonRules(real)) check(r.name, r.ok, r.why)
for (const r of sourceRules(SOURCES)) check(r.name, r.ok, r.why)

// ── and against deliberately broken copies ────────────────────────────────
const M = [
  ['the steady band swallows every change', 'horizon', 'export const STEADY_BAND = 2', 'export const STEADY_BAND = 1000'],
  ['an absent change is read as steady', 'horizon', "if (!Number.isFinite(delta)) return 'unknown'", "if (!Number.isFinite(delta)) return 'steady'"],
  ['a horizon beyond the model falls back to the last frame', 'horizon', 'if (!target || best > 3 * 3600_000) return null', 'if (!target) return { base, target: timed.at(-1) }'],
  ['the unknown state is painted like a missing area', 'horizon', "  unknown: '#8A7F72',", ''],
  ['the comparison reaches for the ground reading', 'horizon', 'const delta = Math.round((then - now) * 10) / 10', 'const delta = Math.round((then - (p.pm25 ?? now)) * 10) / 10'],
  ['a province with no model value is painted steady', 'horizon', 'if (!Number.isFinite(now) || !Number.isFinite(then)) continue', 'if (!Number.isFinite(now) || !Number.isFinite(then)) { out.set(String(p.code), { now: 0, then: 0, delta: 0, state: "steady" }); continue }'],
  ['the zone keeps painting the band in a forecast horizon', 'layer', "const style = changes\n        ? changeStyle(change?.state ?? 'unknown')\n        : zoneStyle(band)", 'const style = zoneStyle(band)'],
  ['the legend key still names the bands in a forecast horizon', 'map', "['worse', 'steady', 'better', 'unknown'].map(s =>", "['normal', 'watch', 'elevated', 'high'].map(s =>"],
  ['the horizon is fetched for every visitor', 'map', 'if (hours > 0 && !store.outlook) {', 'if (!store.outlook) {'],
  ['the fetch is left unbounded', 'map', "fetch('/api/outlook', { signal: AbortSignal.timeout(15000) })", "fetch('/api/outlook')"],
]
let caught = 0
for (const [name, file, from, to] of M) {
  const src = SOURCES[file]
  if (!src.includes(from)) {
    check(`mutation "${name}" applies to the source`, false, `not found: ${from.slice(0, 70)}`)
    continue
  }
  const mutated = { ...SOURCES, [file]: src.replace(from, to) }
  if (mutated[file] === src) {
    check(`mutation "${name}" changes the source`, false, 'the replacement produced an identical file')
    continue
  }
  let failed = sourceRules(mutated).filter(r => !r.ok)
  if (file === 'horizon') {
    const mod = await loadHorizon(mutated.horizon, name.replace(/\W+/g, '-'))
    failed = failed.concat(horizonRules(mod).filter(r => !r.ok))
  }
  if (failed.length) caught++
  check(`mutation "${name}" is caught by the guard`, failed.length > 0,
    failed.length ? failed.map(r => r.name).join('; ') : 'the broken source passed every rule')
}
rmSync(tmp, { recursive: true, force: true })
check(`every mutation was caught (${caught}/${M.length})`, caught === M.length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
