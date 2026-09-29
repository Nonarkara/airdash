// METAR visibility parsing, where two specific traps live.
//
// TRAP 1: the API's `visib` field is statute MILES and is the STRING "6+"
// whenever visibility is at or above 6 SM. A clear station returns no number
// at all, and 6 miles is 9.66 km. Anything that reads `visib` as kilometres
// understates a clear day and then fails to parse the common case. The parser
// must use the 4-digit metre group in `rawOb` instead.
//
// TRAP 2: visibility falls for rain, fog, mist, snow, smoke, blowing sand and
// volcanic ash. Only some of those are particulate air pollution. If a single
// number is stored, "Lamping is at 5 km because it is raining" is
// indistinguishable from a dust event — and on 2026-09-29 Lampang was at
// exactly 5 km because it was raining. The aerosol attribution must be
// withheld in that case, not zero.
//
// Pure: no network, no clock, no database.

import {
  parseVisibilityMetres, classifyCause, normalizeMetar, normalizeMetars,
  THAI_STATIONS, KOSCHMIEDER_BETA, AEROSOL_CODES, NON_AEROSOL_CODES,
} from '../server/sources/metarVisibility.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}


/** The visibility a report is asserting, read back out of its own text. Keeps
 *  the cause assertions honest: classifyCause needs the visibility to tell
 *  "2000 m with no weather code" (unknown) from "9999 with no weather code"
 *  (clear), so the tests must supply it. */
function visOf(ob) {
  const m = ob.match(/ (\d{4}) /)
  return m ? Number(m[1]) : null
}

console.log('\n── parseVisibilityMetres: the 4-digit metre group, not visib ──')
{
  const cases = [
    ['METAR VTCL 291200Z VRB02KT 5000 RA FEW020CB BKN090 25/24 Q1010', 5000, 'reduced visibility with rain'],
    ['METAR VTBS 291230Z 21007KT 9999 FEW020 29/25 Q1008', 9999, 'the 9999 clear-air ceiling'],
    ['METAR VTBO 291300Z 00000KT 8000 FEW030 27/27 Q1009', 8000, 'plain 8 km'],
    ['METAR VTUU 291200Z 36005KT 0600 FG OVC002 24/24 Q1010', 600, 'fog at 600 m'],
    ['METAR VTSP 291230Z VRB02KT M0050 FG VV002 20/20 Q1007', 50, 'M-prefixed under-50 m'],
    ['METAR VTST 291200Z VRB01KT 9000 FEW030 27/27 Q1006', 9000, '9 km'],
  ]
  for (const [ob, want, why] of cases) {
    check(`${want} m — ${why}`, parseVisibilityMetres(ob) === want, `got ${parseVisibilityMetres(ob)}`)
  }

  check('a temperature group is never mistaken for visibility',
    parseVisibilityMetres('METAR VTBD 291230Z 20006KT 9999 29/24 Q1008') === 9999)
  check('a report with no visibility group yields nothing, not a guess',
    parseVisibilityMetres('METAR VTBD 291230Z 20006KT FG OVC002 29/24 Q1008') === null,
    `got ${parseVisibilityMetres('METAR VTBD 291230Z 20006KT FG OVC002 29/24 Q1008')}`)
  check('a QNH is never read as visibility',
    parseVisibilityMetres('METAR VTBD 291230Z 20006KT 9999 29/24 Q1008') === 9999)
  check('a report with a //// visibility group yields nothing',
    parseVisibilityMetres('METAR VTBD 291230Z 20006KT //// FG 29/24 Q1008') === null)
  check('garbage in, null out — never a number',
    parseVisibilityMetres(null) === null && parseVisibilityMetres('') === null && parseVisibilityMetres('nope') === null)
}

console.log('\n── classifyCause: a drop is not automatically dust ──')
{
  const aerosol = [
    ['METAR VTPM 291100Z 34003KT 4000 DU BKN030 26/24 Q1008', 'DU'],
    ['METAR VTPM 291100Z 34003KT 5000 SA OVC020 26/24 Q1008', 'SA'],
    ['METAR VTBD 291100Z 18007KT 3000 HZ SKC 30/27 Q1008', 'HZ'],
    ['METAR VTCL 291100Z 27005KT 2000 FU SKC 25/24 Q1008', 'FU'],
    ['METAR VTCL 291100Z 27005KT 1000 DS OVC010 25/24 Q1008', 'DS'],
  ]
  for (const [ob, code] of aerosol) {
    const { cause } = classifyCause(ob, visOf(ob))
    check(`${code} → aerosol`, cause === 'aerosol', `got ${cause}`)
    check(`${code} is mapped in AEROSOL_CODES`, AEROSOL_CODES[code] !== undefined)
  }

  const notAerosol = [
    ['METAR VTCL 291200Z VRB02KT 5000 RA FEW020CB BKN090 25/24 Q1010', 'RA', 'precip'],
    ['METAR VTCL 291200Z VRB02KT 2000 -RA OVC010 25/24 Q1010', '-RA', 'precip'],
    ['METAR VTUU 291200Z 36005KT 0600 FG OVC002 24/24 Q1010', 'FG', 'obscure'],
    ['METAR VTST 291200Z VRB01KT 1000 BR OVC002 27/27 Q1010', 'BR', 'obscure'],
    ['METAR VTYY 291200Z 00000KT 2000 TSRA OVC010 25/24 Q1010', 'TSRA', 'precip'],
  ]
  for (const [ob, code, want] of notAerosol) {
    const { cause } = classifyCause(ob, visOf(ob))
    check(`${code} → ${want} (NOT aerosol)`, cause === want, `got ${cause}`)
  }

  check('a station id is not read as a weather code (VTST contains TS)',
    classifyCause('METAR VTST 291200Z VRB01KT 9999 FEW030 27/27 Q1010', 9999).cause === 'clear')
  check('a clear report is clear, not unknown',
    classifyCause('METAR VTBS 291230Z 21007KT 9999 FEW020 29/25 Q1008', visOf('METAR VTBS 291230Z 21007KT 9999 FEW020 29/25 Q1008')).cause === 'clear')
  check('reduced visibility with no explanation is unknown, not clean air',
    classifyCause('METAR VTBS 291230Z 21007KT 2000 FEW020 29/25 Q1008', visOf('METAR VTBS 291230Z 21007KT 2000 FEW020 29/25 Q1008')).cause === 'unknown')
  check('a dust storm with residual rain is still a dust storm',
    classifyCause('METAR VTPM 291100Z 34003KT 3000 DSHRA BKN030 26/24 Q1008', visOf('METAR VTPM 291100Z 34003KT 3000 DSHRA BKN030 26/24 Q1008')).cause === 'aerosol')
  check('the non-aerosol cause is preserved alongside the aerosol one',
    classifyCause('METAR VTPM 291100Z 34003KT 3000 DSHRA BKN030 26/24 Q1008').codes.includes('RA'))
  check('every code name is a real two-letter METAR group',
    Object.keys(AEROSOL_CODES).every((k) => k.length === 2) &&
    Object.keys(NON_AEROSOL_CODES).every((k) => k.length === 2))
  check('no code is classified as both aerosol and non-aerosol',
    Object.keys(AEROSOL_CODES).every((k) => NON_AEROSOL_CODES[k] === undefined))
}

console.log('\n── normalizeMetar: three metrics, and the third is the point ──')
{
  const st = THAI_STATIONS.find((s) => s.icao === 'VTCL')
  check('the station list has a Lampang entry with Thai and English names',
    !!st && st.name_th === 'ลำปาง' && st.name_en === 'Lamping')
  check('the three dust corridors are all in the list',
    ['VTPM', 'VTBO', 'VTUW'].every((i) => THAI_STATIONS.some((s) => s.icao === i)))

  // The real observed case: Lampang at 5 km, raining.
  const rainy = normalizeMetar({
    icaoId: 'VTCL', lat: 18.277, lon: 99.502, temp: 25,
    rawOb: 'METAR VTCL 291100Z 27005KT 5000 RA FEW020CB BKN090 25/24 Q1010',
  }, st)
  check('vis_km is recorded whatever the cause', rainy.vis_km === 5)
  check('beta is computed from it (3.912/5)', Math.abs(rainy.beta_km1 - KOSCHMIEDER_BETA / 5) < 1e-9)
  check('aerosol_vis_km is WITHHELD when the cause is rain — not zero', rainy.aerosol_vis_km === null)
  check('the cause is recorded as precip', rainy.cause === 'precip')

  // A genuine dust report.
  const dusty = normalizeMetar({
    icaoId: 'VTPM', lat: 16.703, lon: 98.542, temp: 26,
    rawOb: 'METAR VTPM 291100Z 34003KT 4000 DU BKN030 26/24 Q1008',
  }, THAI_STATIONS.find((s) => s.icao === 'VTPM'))
  check('a dust report DOES populate aerosol_vis_km', dusty.aerosol_vis_km === 4)
  check('and is classified aerosol', dusty.cause === 'aerosol')

  // The 9999 ceiling.
  const clear = normalizeMetar({
    icaoId: 'VTBS', lat: 13.686, lon: 100.767, temp: 29,
    rawOb: 'METAR VTBS 291230Z 21007KT 9999 FEW020 29/25 Q1008',
  }, THAI_STATIONS.find((s) => s.icao === 'VTBS'))
  check('9999 is flagged as the reporting ceiling', clear.at_ceiling === true)
  check('beta is null at the ceiling — "10 km or more" bounds nothing',
    clear.beta_km1 === null,
    `got ${clear.beta_km1}`)
  check('vis_km still reports 9.999 so the raw reading is not lost', clear.vis_km === 9.999)

  check('a record with no parseable visibility is dropped, not zeroed',
    normalizeMetar({ icaoId: 'VTBS', rawOb: 'METAR VTBS /////' },
      THAI_STATIONS.find((s) => s.icao === 'VTBS')) === null)
  check('coordinates fall back to the station when upstream omits them',
    normalizeMetar({ icaoId: 'VTCL', rawOb: 'METAR VTCL 291100Z 27005KT 5000 RA 25/24 Q1010' }, st).lat === 18.277)
}

console.log('\n── normalizeMetars: unknown stations are counted, not silently kept ──')
{
  const { rows, unknownStation } = normalizeMetars([
    { icaoId: 'VTCL', rawOb: 'METAR VTCL 291100Z 27005KT 5000 RA 25/24 Q1010', lat: 18.277, lon: 99.502 },
    { icaoId: 'VVZZ', rawOb: 'METAR VVZZ 291100Z 00000KT 9999 20/20 Q1010' },
    { icaoId: 'VTBS', rawOb: 'METAR VTBS 291230Z 21007KT 9999 FEW020 29/25 Q1008', lat: 13.686, lon: 100.767 },
  ])
  check('only known Thai stations are kept', rows.length === 2, `got ${rows.length}`)
  check('the unknown one is counted so it is visible in the log', unknownStation === 1)
  check('a non-array payload yields no rows rather than throwing',
    normalizeMetars(null).rows.length === 0 && normalizeMetars({}).rows.length === 0)
}

console.log('\n── the station list itself ──')
{
  const icaos = THAI_STATIONS.map((s) => s.icao)
  check('no duplicate ICAO codes', new Set(icaos).size === icaos.length)
  check('every station has a Thai AND an English name',
    THAI_STATIONS.every((s) => s.name_th && s.name_en))
  check('every station is inside the Thai bbox',
    THAI_STATIONS.every((s) => s.lat >= 5 && s.lat <= 21 && s.lng >= 97 && s.lng <= 106))
  check('every ICAO code is a real 4-letter VT code',
    icaos.every((i) => /^VT[A-Z]{2}$/.test(i)))
  check('the list is big enough to be a network, not a demo', THAI_STATIONS.length >= 25,
    `got ${THAI_STATIONS.length}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
