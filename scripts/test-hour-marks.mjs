// The hour marks on the regional map: clustering, and the zoom the focus
// action chooses.
//
// WHY THIS GUARD EXISTS
// The regional page draws a six-hour air-movement path with three hour
// marks on it (+1h, +3h, +6h). The marks were placed by a de-collision
// loop that SKIPPED any mark within 42 px of one already placed, and the
// marks were placed in reverse order, so the last one (+6h) won. On a
// country-scale map an 18 km path is a few pixels across, so two of the
// three marks were always dropped — silently. The map showed one chip
// labelled "+6h" while the panel beside it listed three steps, and a reader
// had no way to tell that the map had thrown two of them away.
//
// The second half of the bug was the promise. The page ships a "Zoom to
// +hour path" button, and the 2.4.120 changelog said the marks "separate
// once the path fills the view". They could not: the focus capped the zoom
// at 8, where an 18 km path is about 30 px across — smaller than the
// separation — so the button could never deliver what it said.
//
// The contract this holds:
//
//   1. NO MARK IS EVER DROPPED. Marks too close to read apart are
//      clustered into ONE chip that names every hour it covers.
//   2. THE FOCUS SEPARATES THEM. The zoom it picks is the zoom at which
//      the closest pair of marks clears the separation, or the zoom at
//      which the path fills the view — whichever is closer — and never
//      past the map's own maximum.
//
// A guard that cannot fail is worse than no guard, so every rule above is
// proved against deliberately broken copies of the module below. A mutation
// that changes nothing is rejected: a no-op mutation proves nothing.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const MODULE_PATH = join(ROOT, 'public/js/hour-marks.js')
const SOURCE = readFileSync(MODULE_PATH, 'utf8')
const VIEW = readFileSync(join(ROOT, 'public/js/regional-wind-view.js'), 'utf8')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the assertions, written against a module namespace ────────────────────
// They take the module as an argument so the same rules can be run against
// a deliberately broken copy.
function assertions(M) {
  const out = []
  const t = (name, cond, why = '') => out.push({ name, ok: !!cond, why })
  const { HOUR_STEPS, MARK_SEPARATION_PX, clusterMarks, minSeparationPx, zoomForSeparation, focusZoom, chipLabel, chipWidth, hoursInLabel } = M

  t('the module declares the three hour steps', Array.isArray(HOUR_STEPS) && HOUR_STEPS.join(',') === '1,3,6')

  // ── readable marks stay readable ────────────────────────────────────────
  const apart = clusterMarks([{ hours: 1, x: 100, y: 100 }, { hours: 3, x: 300, y: 100 }, { hours: 6, x: 600, y: 100 }])
  t('three readable marks stay three marks', apart.length === 3, `got ${apart.length}`)
  t('a readable mark keeps its own hour', apart.flatMap(g => g.hours).sort().join() === '1,3,6')
  t('a readable mark is labelled with its hour', apart.every(g => g.hours.length === 1 && g.label === `+${g.hours[0]}h`),
    apart.map(g => g.label).join(' '))

  // ── unreadable marks are clustered, never dropped ────────────────────────
  const together = clusterMarks([{ hours: 1, x: 100, y: 100 }, { hours: 3, x: 102, y: 101 }, { hours: 6, x: 99, y: 103 }])
  t('overlapping marks become one chip', together.length === 1, `got ${together.length}`)
  t('the cluster names every hour it covers', together[0]?.hours.join() === '1,3,6', `got ${together[0]?.hours.join()}`)
  t('the cluster label names every hour it covers', hoursInLabel(together[0]?.label ?? '').join() === '1,3,6', `got ${together[0]?.label}`)
  t('a cluster chip is wider than a single chip', chipWidth([1, 3, 6]) > chipWidth([6]))
  t('a cluster chip is wide enough for its own text', chipWidth([1, 3, 6]) >= chipLabel([1, 3, 6]).length * 5,
    `width ${chipWidth([1, 3, 6])} for "${chipLabel([1, 3, 6])}"`)

  // ── no hour is ever dropped, whatever the geometry ───────────────────────
  let dropped = null
  for (let n = 0; n < 500 && !dropped; n++) {
    const pts = HOUR_STEPS.map(h => ({ hours: h, x: Math.random() * 900, y: Math.random() * 600 }))
    const seen = clusterMarks(pts).flatMap(g => g.hours).sort().join()
    if (seen !== HOUR_STEPS.join()) dropped = seen
  }
  t('no hour is ever dropped, whatever the geometry', dropped === null, `saw "${dropped}"`)

  // ── two chips never overlap on screen ───────────────────────────────────
  let overlap = null
  for (let n = 0; n < 500 && !overlap; n++) {
    const pts = HOUR_STEPS.map(h => ({ hours: h, x: Math.random() * 900, y: Math.random() * 600 }))
    const gs = clusterMarks(pts)
    for (let i = 0; i < gs.length && !overlap; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const d = Math.hypot(gs[i].x - gs[j].x, gs[i].y - gs[j].y)
        if (d < (gs[i].width + gs[j].width) / 2) overlap = `${d.toFixed(1)}px between ${gs[i].label} and ${gs[j].label}`
      }
    }
  }
  t('two chips never overlap on screen', overlap === null, overlap ?? '')

  // ── the separation zoom ─────────────────────────────────────────────────
  t('the closest pair is the smallest gap between marks',
    Math.abs(minSeparationPx([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 100, y: 0 }]) - 50) < 1e-9,
    `got ${minSeparationPx([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 100, y: 0 }])}`)
  t('a single mark has no closest pair', minSeparationPx([{ x: 5, y: 5 }]) === Infinity)
  t('at exactly the separation no zoom is needed', Math.abs(zoomForSeparation(6, MARK_SEPARATION_PX) - 6) < 1e-9,
    `got ${zoomForSeparation(6, MARK_SEPARATION_PX)}`)
  t('half the separation costs one zoom level', Math.abs(zoomForSeparation(6, MARK_SEPARATION_PX / 2) - 7) < 1e-9,
    `got ${zoomForSeparation(6, MARK_SEPARATION_PX / 2)}`)
  t('a separation that cannot be measured asks for the map maximum',
    !Number.isFinite(zoomForSeparation(6, 0)) || !Number.isFinite(zoomForSeparation(6, Infinity)),
    `got ${zoomForSeparation(6, 0)}`)

  // ── the focus zoom ──────────────────────────────────────────────────────
  t('the focus zoom separates the marks', focusZoom({ fitZoom: 8, sepZoom: 11, maxZoom: 12 }) === 11)
  t('the focus zoom keeps the path in view when that is closer', focusZoom({ fitZoom: 11, sepZoom: 8, maxZoom: 12 }) === 11)
  t('the focus zoom never passes the map maximum', focusZoom({ fitZoom: 11, sepZoom: 20, maxZoom: 12 }) === 12)
  t('the focus zoom never drops below the map minimum',
    focusZoom({ fitZoom: 1, sepZoom: 1, maxZoom: 12, minZoom: 3 }) === 3 && focusZoom({ fitZoom: 1, sepZoom: 20, maxZoom: 12, minZoom: 3 }) >= 3,
    `got ${focusZoom({ fitZoom: 1, sepZoom: 1, maxZoom: 12, minZoom: 3 })}`)
  t('the focus zoom is a whole level', Number.isInteger(focusZoom({ fitZoom: 8.4, sepZoom: 10.2, maxZoom: 12 })),
    `got ${focusZoom({ fitZoom: 8.4, sepZoom: 10.2, maxZoom: 12 })}`)

  // ── the case that was broken: an 18 km path at zoom 8 ───────────────────
  // At zoom 8 the closest pair of an 18 km path is about 10 px apart, so
  // the marks could never be read apart and the old cap of 8 could never
  // separate them. The computed zoom has to leave that level behind.
  const sepAt8 = 10
  const needed = zoomForSeparation(8, sepAt8)
  const chosen = focusZoom({ fitZoom: 8, sepZoom: needed, maxZoom: 12 })
  t('the focus zoom leaves the zoom where an 18 km path cannot separate its marks', chosen > 8, `chose ${chosen}`)
  t('at the focus zoom the closest pair clears the separation', sepAt8 * 2 ** (chosen - 8) >= MARK_SEPARATION_PX - 1e-9,
    `${sepAt8 * 2 ** (chosen - 8)}px at zoom ${chosen}`)
  t('the focus zoom stays within the map maximum', chosen <= 12)

  return out
}

// ── run the assertions against the real module ────────────────────────────
const real = await import(pathToFileURL(MODULE_PATH).href)
const results = assertions(real)
for (const r of results) check(r.name, r.ok, r.why)

// ── and against deliberately broken copies ────────────────────────────────
// Each mutation must (a) actually change the source and (b) be caught.
const MUTATIONS = [
  ['the cluster label drops the hours it covers', 'return hours.map(h => `+${h}h`).join(\'·\')', 'return `+${hours[0]}h`'],
  ['the separation is removed', 'export const MARK_SEPARATION_PX = 42', 'export const MARK_SEPARATION_PX = 0'],
  ['the separation zoom stops asking for more', 'return currentZoom + Math.log2(sep / minSepPx)', 'return currentZoom'],
  ['the separation zoom lands one level short', 'return currentZoom + Math.log2(sep / minSepPx)', 'return currentZoom + Math.log2(sep / minSepPx) - 1'],
  ['the closest pair is never measured', 'let min = Infinity', 'let min = Infinity; return Infinity'],
  ['the focus zoom ignores the separation', 'Math.max(fit, sep)', 'fit'],
  ['the focus zoom ignores the map maximum', 'Math.min(hi, Math.max(fit, sep))', 'Math.max(fit, sep)'],
  ['the cluster drops the last hour of a group', 'const hours = members.map(m => m.hours)', 'const hours = members.slice(0, 1).map(m => m.hours)'],
  ['every mark gets its own chip', 'const g = groups.find(', 'const g = null && groups.find('],
  ['the chip is always 30 px wide', 'return Math.max(CHIP_MIN_PX, Math.ceil(chipLabel(hours).length * CHAR_PX) + CHIP_PAD_PX)', 'return CHIP_MIN_PX'],
]

const tmp = join(tmpdir(), `airdash-hour-marks-${process.pid}`)
mkdirSync(tmp, { recursive: true })
let mutationsCaught = 0
for (const [name, from, to] of MUTATIONS) {
  if (!SOURCE.includes(from)) {
    check(`mutation "${name}" applies to the module`, false, `the source no longer contains: ${from}`)
    continue
  }
  const mutated = SOURCE.replace(from, to)
  if (mutated === SOURCE) {
    check(`mutation "${name}" changes the module`, false, 'the replacement produced an identical file')
    continue
  }
  const file = join(tmp, `mutant-${mutationsCaught}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, mutated)
  let broken
  try {
    broken = await import(pathToFileURL(file).href)
  } catch (err) {
    check(`mutation "${name}" is caught by the guard`, true, `the mutant failed to load: ${err.message}`)
    mutationsCaught++
    continue
  }
  const caught = assertions(broken).filter(r => !r.ok)
  const ok = caught.length > 0
  if (ok) mutationsCaught++
  check(`mutation "${name}" is caught by the guard`, ok,
    ok ? caught.map(r => r.name).join('; ') : 'the broken module passed every rule')
}
rmSync(tmp, { recursive: true, force: true })
check(`every mutation was caught (${mutationsCaught}/${MUTATIONS.length})`, mutationsCaught === MUTATIONS.length)

// ── the map itself must use this module ───────────────────────────────────
check('the map imports the hour-mark geometry', /from '\.\/hour-marks\.js\?v=/.test(VIEW))
check('the map clusters the marks instead of dropping them', /clusterMarks\(/.test(VIEW) && !/labelPositions/.test(VIEW))
check('the map computes the focus zoom', /focusZoom\(/.test(VIEW) && /zoomForSeparation\(/.test(VIEW))
check('the map does not cap the focus zoom at 8', !/maxZoom\s*:\s*8\b/.test(VIEW), 'the cap that made the marks unseparatable is still there')
check('the map says why the marks overlap', /zoom to separate/.test(VIEW) && /cannot be separated here/.test(VIEW))
check('the map still refuses to draw a path without wind', /No path drawn with missing or stale winds/.test(VIEW))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
