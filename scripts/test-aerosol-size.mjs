// The aerosol size reading, and the sentinel bug that made it unsafe.
//
// AirDash stored AERONET optical depth at seven wavelengths and never derived
// the one number that decides what precautions a person should take: the
// Ångström exponent, the aerosol-size indicator since 1929. Coarse (dust) and
// fine (smoke) need opposite advice, and PM2.5 cannot tell them apart.
//
// Two things are guarded here:
//   1. the physics — sign, guards, thresholds, withholding;
//   2. the sentinel bug — 158 rows were stored with a NEGATIVE optical depth
//      because the reader matched the string '-999.0' and not the number -999.
//      Negative optical depth inverts the size reading, which is the whole
//      basis of the advice.
//
// Real execution throughout. The sign check is not decoration: while building
// this I wrote the denominator as ln(λ₂/λ₁) and got α = −1.17 for a station
// that is plainly fine/mixed, because blue scatters more than red so τ₄₄₀ must
// exceed τ₅₀₀ and α must come out positive. A guard that only counts checks
// would not have noticed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  angstrom, sizeMode, aerosolProfile, validAod, guidanceFor,
  AOD_ALPHA_FLOOR, SIZE_MODE,
} from '../server/aerosol.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the formula ────────────────────────────────────────────────────────────
// Blue scatters more than red, so τ440 > τ500 for essentially every real
// aerosol. That fixes the sign of α without appeal to any reference.
check('blue scattering more than red gives a POSITIVE alpha', angstrom(0.24, 440, 0.21, 500) > 0)
check('the sign is the one Angstrom 1929 gives', Math.abs(angstrom(0.24, 440, 0.21, 500) - 1.04) < 0.05,
  `got ${angstrom(0.24, 440, 0.21, 500)}`)
check('the flipped denominator would give the opposite sign',
  -Math.log(0.24 / 0.21) / Math.log(500 / 440) < 0, 'the sign-error trap no longer trips on real data')
// The long baseline is preferred because it is far LESS sensitive to error in
// the short-wavelength reading, not because it yields a larger exponent. For
// the same optical-depth ratio a short baseline actually yields the larger
// alpha, because |ln(440/500)| is the smaller denominator.
check('the long baseline is far less sensitive to an error in the blue band', (() => {
  const spread = (l2, t2) => Math.abs(angstrom(0.25, 440, t2, l2) - angstrom(0.23, 440, t2, l2))
  const short = spread(500, 0.208017), long = spread(675, 0.130762)
  return long < short / 2
})(), '440/675 should damp a +/-0.01 error in tau440 at least twice as well as 440/500')
check('the long baseline is chosen even though it reads lower for the same ratio', (() => {
  const short = angstrom(0.30, 440, 0.10, 500), long = angstrom(0.30, 440, 0.10, 675)
  return short > long && aerosolProfile({ aod_440: 0.30, aod_500: 0.10, aod_675: 0.10 }).alpha_pair === '440/675'
})())
check('identical optical depth at two wavelengths is a flat spectrum',
  Math.abs(angstrom(0.20, 440, 0.20, 675)) < 1e-9)
check('the long baseline resolves a steeper exponent than the short one',
  angstrom(0.2416, 440, 0.1308, 675) > angstrom(0.2416, 440, 0.2080, 500))

// ── guards ────────────────────────────────────────────────────────────────
check('a missing band yields null, not NaN', angstrom(null, 440, 0.2, 675) === null)
check('a negative optical depth yields null — the sentinel bug cannot survive here',
  angstrom(-999, 440, 0.2, 675) === null)
check('a zero optical depth yields null (log of zero)', angstrom(0, 440, 0.2, 675) === null)
check('two identical wavelengths yield null', angstrom(0.2, 440, 0.2, 440) === null)
check('an implausibly large optical depth is rejected', validAod(999) === null)
check('a valid optical depth passes through', validAod(0.1936) === 0.1936)

// ── bands, against the cited literature ────────────────────────────────────
check('alpha below the near-pure-dust cut reads coarse', sizeMode(0.4) === 'coarse')
check('Gkikas 2021a dust cut (AE <= 0.75) is inside our coarse band', sizeMode(0.75) === 'coarse')
check('alpha just above the dust cut is not coarse', sizeMode(0.81) === 'mixed')
check('alpha above the biomass cut reads fine', sizeMode(1.6) === 'fine')
check('the classic Eck 1999 coarse boundary (alpha <= 1) is not coarse here',
  sizeMode(1.0) === 'mixed', '1.0 sits in our mixed band, which is deliberate: Deep Blue puts the crossover at 1 and pure dust at 0.75')
check('a negative alpha is unusable rather than sorted into coarse',
  sizeMode(-1.17) === null, 'the sign slip would otherwise report dust for a fine-mode day')
check('NaN yields no mode', sizeMode(NaN) === null)

// ── profile ────────────────────────────────────────────────────────────────
// The real live row for Chiang Mai Met Sta.
const chiangMai = aerosolProfile({
  aod_440: 0.241612, aod_500: 0.208017, aod_675: 0.130762, aod_870: 0.088371, aod_1020: 0.069424,
})
check('a real row yields an alpha', chiangMai.alpha !== null)
check('the preferred pair is the long 440/675 baseline', chiangMai.alpha_pair === '440/675')
check('October air reads mixed, not dust', chiangMai.mode === 'mixed', `mode=${chiangMai.mode}`)
check('the spread is published so a single alpha is not asked to carry everything',
  chiangMai.alpha_spread !== null && chiangMai.alpha_spread > 0)
check('the load is reported independently of the size', Math.abs(chiangMai.load - 0.208) < 1e-9)
check('nothing is emitted calibrated', chiangMai.calibrated === false)

// ── withholding ───────────────────────────────────────────────────────────
const thin = aerosolProfile({ aod_440: 0.01, aod_500: 0.009, aod_675: 0.008 })
check('an optically thin day withholds the size reading', thin.mode === null)
check('withholding states why rather than going quiet',
  typeof thin.withheld === 'string' && thin.withheld.length > 0)
check('a thin day still reports its load', thin.load !== null, 'AOD is valid on its own even when alpha is not')
check('no row at all withholds cleanly', aerosolProfile({}).mode === null && aerosolProfile({}).load === null)
check('a row of sentinels produces nulls everywhere, never NaN', (() => {
  const p = aerosolProfile({ aod_440: -999, aod_500: -999, aod_675: -999, aod_870: -999 })
  return [p.alpha, p.load, p.alpha_spread, p.mode].every(v => v === null || typeof v === 'string')
})())
check('a sentinel-only row is never calibrated-looking', aerosolProfile({ aod_440: -999 }).calibrated === false)

// every field is finite or null — NaN reaching a chart is how a series vanishes
const fields = ['aod_440', 'aod_500', 'aod_675', 'aod_870', 'load', 'alpha', 'alpha_spread']
check('no field is ever NaN or Infinity', (() => {
  const cases = [
    {}, { aod_440: 0.2 }, { aod_440: 0.2, aod_500: 0.2 }, { aod_440: 0.2, aod_500: 0.2, aod_675: 0.2, aod_870: 0.2 },
    { aod_440: -999, aod_500: -999 }, { aod_440: 0, aod_500: 0 },
    { aod_440: 1e9, aod_500: 1e9 }, { aod_440: 'x', aod_500: 'y' },
  ]
  return cases.every(c => fields.every(f => {
    const v = aerosolProfile(c)[f]
    return v === null || Number.isFinite(v)
  }))
})())

// ── the floor is stated, not magic ─────────────────────────────────────────
check('the floor is a real threshold', AOD_ALPHA_FLOOR > 0 && AOD_ALPHA_FLOOR <= 0.2, `${AOD_ALPHA_FLOOR}`)
check('a row at the floor is read, one below it is withheld', (() => {
  const at = aerosolProfile({ aod_440: AOD_ALPHA_FLOOR, aod_500: AOD_ALPHA_FLOOR, aod_675: AOD_ALPHA_FLOOR })
  const below = aerosolProfile({ aod_440: 0.001, aod_500: 0.001, aod_675: 0.001 })
  return at.mode !== null && below.mode === null
})())
check('the published bands match the code', SIZE_MODE.COARSE_MAX === 0.8 && SIZE_MODE.MIXED_MAX === 1.5)

// ── guidance ──────────────────────────────────────────────────────────────
const dustProfile = aerosolProfile({ aod_440: 0.60, aod_500: 0.62, aod_675: 0.55, aod_870: 0.50 })
const dustGuidance = guidanceFor(dustProfile)
check('a near-flat long baseline reads coarse', dustProfile.mode === 'coarse', `mode=${dustProfile.mode} alpha=${dustProfile.alpha}`)
check('dust guidance keeps respirator protection and optical exposure limits honest',
  /well-fitting, approved N95 filters fine and coarse/i.test(dustGuidance?.act_en ?? '') && /not personal exposure/i.test(dustGuidance?.act_en ?? '') && !/does little/i.test(dustGuidance?.act_en ?? ''))
check('fine smoke guidance tells the reader an N95 helps', /N95\/FFP2|respirator genuinely helps/i.test(
  guidanceFor(aerosolProfile({ aod_440: 0.40, aod_500: 0.38, aod_675: 0.10, aod_870: 0.05 })).act_en))
check('coarse and fine guidance are genuinely different advice',
  guidanceFor({ mode: 'coarse' }).act_en !== guidanceFor({ mode: 'fine' }).act_en)
check('no guidance is invented when the size is unknown', guidanceFor(aerosolProfile({ aod_440: 0.001, aod_500: 0.001 })) === null)
check('every mode has both Thai and English copy', ['coarse', 'mixed', 'fine'].every(m => {
  const g = guidanceFor({ mode: m })
  return g && g.th && g.en && g.act_th && g.act_en
}))

// ── the writer that caused the sentinel bug ────────────────────────────────
const src = readFileSync(join(import.meta.dirname, '../server/sources/aeronet.js'), 'utf8')
check('the reader no longer string-matches a single sentinel spelling',
  !/v === '-999\.0'/.test(src), "the '-999.0' string test is back")
check('the reader rejects by physical range instead', /n < 0 \|\| n > max/.test(src))
check('precipitable water gets its own bound, not the AOD one',
  /numOrNull\(c\[iPW\], PRECIPITABLE_WATER_MAX_CM\)/.test(src))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)