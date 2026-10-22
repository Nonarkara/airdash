// THE MEASURED PARTICLE-SIZE SIGNAL — what it may claim, and what it may not.
//
// Every health band in AirDash is keyed to PM2.5, the fine fraction. The
// measured coarse fraction (1 − PM2.5/PM10) says what the REST of the
// particulate is, and the precautions differ: coarse dust is what you see
// and what stings your eyes and throat, and it settles out of the air
// quickly.
//
// Four things had to be true, and three of them are easy to get wrong:
//
//   1. The bands are the MEASURED bands. The Ångström exponent already has
//      bands (0.8 / 1.5) for a DIFFERENT quantity — an optical size
//      distribution. Reusing them on a mass ratio would read a number as if
//      it were a different number.
//   2. An absent PM10 reads as ABSENT, never as "fine".
//   3. The national rollup is a MEDIAN of per-province fractions, so it has
//      no concentration of its own. The obvious way to build it reuses
//      measuredSize() with a synthetic pair — which published "PM10 1 µg/m³",
//      a number no instrument measured. The national payload carries the
//      fraction and the province count, and nothing else.
//   4. The label says what was measured and stops. A PM10/PM2.5 ratio
//      cannot tell mineral dust from biomass salt from resuspended road
//      grit, so the source of the dust is not claimed.
//
// Plus: the story page must render NOTHING when the signal is absent — an
// absent measurement must not become a claim.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { measuredSize, measuredSizeMode, MEASURED_SIZE_BANDS, MEASURED_SIZE_LABEL, MODE_GUIDANCE } from '../server/aerosol.js'

const ROOT = join(import.meta.dirname, '..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const science = read('server/science.js')
const story = read('public/js/story.js')

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the measurement ──────────────────────────────────────────────────────
// The published values are ROUNDED (3dp for the fraction, 2dp for the
// ratio) — so the comparison is against the rounded number, not an exact
// one. The BAND, though, must be decided on the raw value: a fraction of
// 0.4996 is "mixed", and rounding it to 0.500 for publication must not
// promote it to "coarse".
check('the coarse fraction is 1 − PM2.5/PM10',
  measuredSize(8.2, 21).coarse_fraction === Math.round((1 - 8.2 / 21) * 1000) / 1000,
  `got ${measuredSize(8.2, 21).coarse_fraction}`)
check('the PM10/PM2.5 ratio is published',
  measuredSize(8.2, 21).ratio === Math.round((21 / 8.2) * 100) / 100,
  `got ${measuredSize(8.2, 21).ratio}`)
check('the band is decided on the RAW fraction, not the rounded one',
  measuredSizeMode(0.4996) === 'mixed' && measuredSize(50, 99.95).mode === 'mixed',
  'a value that rounds up to the 0.50 boundary must not be promoted to coarse')

// ── the bands, and that they are the MEASURED bands ─────────────────────
check('a coarse-dominant province reads as coarse',
  measuredSizeMode(0.54) === 'coarse', `0.54 → ${measuredSizeMode(0.54)}`)
check('a mixed province reads as mixed',
  measuredSizeMode(0.4) === 'mixed', `0.40 → ${measuredSizeMode(0.4)}`)
check('a fine-dominant province reads as fine',
  measuredSizeMode(0.1) === 'fine', `0.10 → ${measuredSizeMode(0.1)}`)
check('the measured bands are 0.50 and 0.25',
  MEASURED_SIZE_BANDS.coarse_min === 0.5 && MEASURED_SIZE_BANDS.mixed_min === 0.25,
  JSON.stringify(MEASURED_SIZE_BANDS))
check('the Ångström bands are NOT reused for the mass ratio',
  !/COARSE_MAX\s*=\s*0\.8/.test(science) && !/MIXED_MAX/.test(science),
  'the aerosol module keeps its own optical bands; the mass ratio has its own')
check('the aerosol module still owns the Ångström bands',
  /COARSE_MAX/.test(read('server/aerosol.js')),
  'the optical bands must survive')

// ── an absent measurement ────────────────────────────────────────────────
check('a missing PM10 is absent, not "fine"',
  measuredSize(12, null) === null && measuredSize(null, 40) === null,
  'an absent measurement must not become a claim')
check('a zero or missing PM10 is absent',
  measuredSize(12, 0) === null, 'PM10 of 0 is not a measurement')
check('a non-finite coarse fraction is absent',
  measuredSizeMode(NaN) === null && measuredSizeMode(Infinity) === null,
  'NaN must not fall through to a band')

// ── what the label may say ───────────────────────────────────────────────
const labels = Object.values(MEASURED_SIZE_LABEL).map(l => `${l.th} ${l.en}`).join(' ')
check('the label does not claim where the dust came from',
  !/ฝุ่นดิน|ทราย|mineral dust|soil|salt/i.test(labels),
  `labels say: ${labels}`)
check('the label does claim the measurement',
  /coarse|fine/i.test(labels) && /2\.5/.test(labels),
  `labels say: ${labels}`)
check('every mode has a label and an action',
  ['coarse', 'mixed', 'fine'].every(m => MEASURED_SIZE_LABEL[m] && MODE_GUIDANCE[m]?.act_th && MODE_GUIDANCE[m]?.act_en),
  'a mode with no precautions is a mode with nothing to say')

// ── the payloads ─────────────────────────────────────────────────────────
const nationalBlock = science.match(/const nationalParticle[\s\S]*?\n    \}\)\(\) : null/)?.[0] ?? ''
check('the national rollup publishes no concentration of its own',
  !/pm10\s*:/i.test(nationalBlock.replace(/measuredSize\([^)]*\)/g, '')) && !/measuredSize\(/.test(nationalBlock),
  'a median of fractions has no µg/m³ — publishing a synthetic pair invents a measurement')
// The count must be TIED to the data, not merely mentioned: a bare /provinces/
// match passes whether the payload says 34 or 0, and a national figure that
// silently claims "0 provinces" is exactly the kind of number that reads
// fine and means nothing.
check('the national rollup publishes the fraction and the province count',
  /coarse_fraction/.test(nationalBlock) && /provinces:\s*sized\.length/.test(nationalBlock),
  'the count must be the number of provinces that actually carry a measurement')
check('the province count is the number of provinces WITH a measurement',
  /const sized = provinces\.filter\(\(p\) => p\.particle\)/.test(science),
  'the count must be derived from the measured provinces')
check('the province rows publish the station and the observation time',
  /particle:\s*sizeByProvince\.get\(code\)/.test(science) && /observed_at/.test(science),
  'a size signal with no station and no time is not auditable')
check('the province pm25 is not taken from the size station',
  /const pm25 = ground\.get\(code\)/.test(science),
  'the published pm25 must stay the worst station\'s value')

// ── the story page ───────────────────────────────────────────────────────
check('the story page reads the signal from the science payload',
  /row\(\)\?\.particle/.test(story), 'the lens must come from the published payload')
check('the story page renders nothing without a signal',
  /if \(!pa \|\| !pa\.mode\) return ''/.test(story),
  'an absent measurement must not become a claim')
check('the story page shows a concentration only when a station measured it',
  /pa\.station && Number\.isFinite\(pa\.pm10\)/.test(story),
  'the national figure has no concentration and must not print one')
check('the story page never prints an undefined station',
  !/วัดที่สถานีพื้นดิน \$\{th \? pa\.station/.test(story),
  'the national payload has no station')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
