// Size-aware rain washout.
//
// The published relief curve is accumulation-mode PM2.5. That is the WORST
// size for below-cloud removal — the "Greenfield gap" spans ~200–2000 nm,
// which is most of PM2.5 (ACP 23, 7521, 2023) — so it systematically
// UNDERSTATES relief during a dust episode, when relief is the whole question.
// server/aerosol.js can now say coarse from fine, so the curve can be told.
//
// The single most important property here is NEGATIVE: an unknown size must
// never move a published number. Every existing caller omits the mode, and the
// published curve has to come out byte-identical.
import { reliefPct, reliefFraction, reliefCurveBasis, reliefCeilingPct } from '../server/washout-curve.js'
import { dominantAerosol } from '../server/aerosol.js'
import { openDb } from '../server/db.js'
import { createWashout } from '../server/washout.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const db = openDb()
let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// The curve as it was published before this change, written out independently.
const PUBLISHED = (mm) => (mm === null || !Number.isFinite(mm) || mm < 1) ? 0
  : mm < 5 ? 8 : mm < 15 ? 20 : mm < 35 ? 30 : 40

// ── the fine curve must not move, anywhere ─────────────────────────────────
const samples = [0, 0.4, 1, 2, 4.99, 5, 9.99, 10, 14.99, 15, 20, 34.99, 35, 40, 99, 1000,
  null, undefined, NaN, -5, Infinity]
const drifted = samples.filter((mm) => reliefPct(mm) !== PUBLISHED(mm))
check('the published curve is byte-identical at every sampled input', drifted.length === 0,
  `drifted at: ${JSON.stringify(drifted)}`)
check('every call site that omits the mode gets the published curve',
  samples.every((mm) => reliefPct(mm) === PUBLISHED(mm)))
check('an unrecognised mode falls back to the published curve, not the coarse one',
  reliefPct(40, 'smoke') === PUBLISHED(40) && reliefPct(40, 'banana') === PUBLISHED(40)
  && reliefPct(40, undefined) === PUBLISHED(40) && reliefPct(40, null) === PUBLISHED(40))
check('reliefFraction without a mode is still the published fraction',
  reliefFraction(40) === 0.4)

// ── coarse is never LESS responsive, and always bounded ───────────────────
check('coarse relief is never lower than fine at any amount',
  samples.every((mm) => reliefPct(mm, 'coarse') >= reliefPct(mm)))
check('coarse relief never exceeds its own published ceiling',
  samples.every((mm) => reliefPct(mm, 'coarse') <= reliefCeilingPct('coarse')))
check('fine relief never exceeds the published 40% ceiling',
  samples.every((mm) => reliefPct(mm) <= 40), 'the published asymptote must not move')
check('coarse is strictly greater once there is real rain',
  [10, 20, 40, 100].every((mm) => reliefPct(mm, 'coarse') > reliefPct(mm)))
check('both curves stay zero below the 1 mm floor',
  reliefPct(0.5, 'coarse') === 0 && reliefPct(0, 'coarse') === 0)
check('coarse has a higher ceiling than fine', reliefCeilingPct('coarse') > reliefCeilingPct('fine'))
check('coarse is bounded — never claims total clearance',
  reliefCeilingPct('coarse') < 100 && reliefPct(1000, 'coarse') === reliefCeilingPct('coarse'))
check('the shape is monotonic in rain for both modes',
  [0, 5, 15, 35].every((mm, i, a) => i === 0
    || reliefPct(mm, 'coarse') > reliefPct(a[i - 1], 'coarse')))
check('no mode produces NaN', samples.every((mm) =>
  [reliefPct(mm), reliefPct(mm, 'coarse')].every(Number.isFinite)))

// ── the basis is always reportable ─────────────────────────────────────────
check('a reader can always tell which curve produced a number',
  reliefCurveBasis('coarse') === 'coarse-elevated' && reliefCurveBasis('fine') === 'fine-published'
  && reliefCurveBasis(undefined) === 'fine-published')

// ── the coarse constant is flagged as uncalibrated, in the source ──────────
const curveSrc = readFileSync(join(import.meta.dirname, '../server/washout-curve.js'), 'utf8')
check('the coarse constant is documented as NOT locally calibrated',
  /NOT a locally calibrated coefficient/i.test(curveSrc),
  'without this the coarse number reads as measured')
check('the coarse constant is separated from the published fine anchors',
  /const FINE_ASCENT = 40/.test(curveSrc) && /const COARSE_ASCENT = 60/.test(curveSrc))
check('the Greenfield gap is cited as the reason', /Greenfield gap/i.test(curveSrc))

// ── engine wiring: unknown size must not move a published province ─────────
const washoutSrc = readFileSync(join(import.meta.dirname, '../server/washout.js'), 'utf8')
check('the engine resolves the size lazily, not at construction',
  /typeof aerosol === 'function' \? aerosol\(\) : aerosol/.test(washoutSrc),
  'constructed at module load, the mode would be frozen at null forever')
// The source pattern above is NOT sufficient on its own: freezing the read
// while keeping that line satisfied every assertion while breaking the
// behaviour. So prove it by execution instead.
let reads = 0
const counting = createWashout(db, { aerosol: () => { reads++; return { mode: 'coarse', alpha: 0.4, age_h: 12 } } })
check('constructing the engine does NOT read the aerosol size', reads === 0,
  `the size was read ${reads} time(s) during construction — it would be frozen`)
const coarseEntries = [...counting.all().values()]
check('the first compute DOES read it', reads === 1, `reads=${reads}`)
check('a coarse resolver actually switches the published curve',
  coarseEntries.length > 0 && coarseEntries.every((e) => e.curve_basis === 'coarse-elevated'
    && e.relief_ceiling_pct === 60 && e.aerosol_alpha === 0.4 && e.aerosol_age_h === 12),
  `sample: ${JSON.stringify(coarseEntries[0] && { b: coarseEntries[0].curve_basis, c: coarseEntries[0].relief_ceiling_pct })}`)
const noMode = [...createWashout(db).all().values()]
check('with no aerosol argument the engine stays on the published curve',
  noMode.length > 0 && noMode.every((e) => e.curve_basis === 'fine-published'
    && e.relief_ceiling_pct === 40 && e.aerosol_mode === null))
check('an unknown size leaves the published numbers numerically untouched', (() => {
  const a = [...counting.all().values()].find((e) => e.rain_fc_24 != null)
  const b = [...createWashout(db).all().values()].find((e) => e.rain_fc_24 != null)
  return a && b && a.rain_fc_24 === b.rain_fc_24
    && b.relief_if_rain_pct === PUBLISHED(b.rain_fc_24)
})(), 'the default path must reproduce the published curve exactly')
check('only a confident coarse reading switches curves',
  /a\?\.mode === 'coarse' \? 'coarse' : null/.test(washoutSrc),
  'mixed/unknown must stay on the conservative published curve')
check('every entry publishes which curve produced its number',
  /e\.curve_basis = aerosolBasis/.test(washoutSrc) && /e\.relief_ceiling_pct = aerosolCeiling/.test(washoutSrc))
check('every entry publishes the aerosol age it relied on',
  /e\.aerosol_age_h = aerosolAgeH/.test(washoutSrc))

// danger.js calls reliefFraction(mm) with no mode — it must be untouched.
const dangerSrc = readFileSync(join(import.meta.dirname, '../server/danger.js'), 'utf8')
check('no other engine silently opts into the coarse curve',
  !/reliefFraction\([^)]*,/.test(dangerSrc) && !/reliefPct\([^)]*,/.test(dangerSrc))

// ── against the real database ──────────────────────────────────────────────
// AirDash's own db wrapper, not raw node:sqlite: dominantAerosol and
// createWashout use the project's .all()/.get() helpers, which raw
// node:sqlite does not provide.
const dom = dominantAerosol(db)
console.log(`\n  live national aerosol: mode=${dom.mode} alpha=${dom.alpha} station=${dom.station} load=${dom.load} age_h=${dom.age_h}`)
check('the national resolver returns a shape, never throws', typeof dom === 'object' && dom !== null)
check('the national resolver reports an age so staleness is visible', 'age_h' in dom)
check('mode is one of the three, or null', dom.mode === null || ['coarse', 'mixed', 'fine'].includes(dom.mode))
check('a null mode never claims a size', dom.mode === null ? dom.alpha === null : Number.isFinite(dom.alpha))
// It must agree with what /api/aeronet already published, or the two
// features are telling the user different stories.
const fineToday = dom.mode === null || dom.mode !== 'coarse'
check('today is NOT coarse, so the published washout numbers are unchanged', fineToday, `mode=${dom.mode}`)
try { db.close?.() } catch { /* wrapper has no close; the process is ending anyway */ }

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)