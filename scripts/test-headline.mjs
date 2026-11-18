// The top-bar headline speaks the measured PM2.5 in Thai AQI words.
//
// WHY THIS GUARD EXISTS
// On 18 Nov 2026 the chip read "49 · Dangerous · Highest: Nakhon Pathom" — a
// research composite — while Nakhon Pathom measured 35 µg/m³ (under the 37.5
// standard) and the panel next to it said no station was above the health
// line. This pins the replacement: the number is the measured PM2.5, the word
// is its Thai AQI 2023 level, and the province is the ranking's first row.
import { headlineReading, LEVEL_BAND } from '../public/js/headline.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const rows = [
  { province_code: '73', province_en: 'Nakhon Pathom', pm25: 35, pm25_source: 'air4thai', danger: { score: 49 } },
  { province_code: '10', province_en: 'Bangkok', pm25: 31, pm25_source: 'air4thai', danger: { score: 37 } },
  { province_code: '50', province_en: 'Chiang Mai', pm25: 12, pm25_source: 'gistda_satellite', danger: { score: 60 } },
  { province_code: '99', province_en: 'No data', pm25: null, danger: { score: 90 } },
]
const h = headlineReading(rows)
check('the worst MEASURED province leads, not the highest composite', h.province.province_code === '73', h?.province?.province_code)
check('the number is the PM2.5, not the composite', h.pm25 === 35)
check('35 µg/m³ is "moderate" in Thai AQI 2023 words', h.name?.en === 'moderate', h.name?.en)
check('35 µg/m³ is coloured as watch, never as elevated', h.band === 'watch', h.band)
check('35 µg/m³ is below the standard', h.overStandard === false)
check('a focused province is shown even when it is cleaner', headlineReading(rows, '50').province.province_code === '50')
check('a GISTDA value is flagged as an estimate', headlineReading(rows, '50').estimated === true)
check('a missing PM2.5 is never the headline', headlineReading([rows[3]]) === null)
check('ties go to the higher composite', headlineReading([{ province_code: 'a', pm25: 40, danger: { score: 50 } }, { province_code: 'b', pm25: 40, danger: { score: 70 } }]).province.province_code === 'b')
check('over 37.5 is over the standard and elevated', (() => { const x = headlineReading([{ province_code: 'a', pm25: 41 }]); return x.overStandard && x.band === 'elevated' })())
check('every Thai AQI level maps to a band the chip can colour', [1, 2, 3, 4, 5].every((l) => ['normal', 'watch', 'elevated', 'high'].includes(LEVEL_BAND[l])))

// wiring: the header uses it and no longer picks the province by the composite
const header = readFileSync(new URL('../public/js/panels/header.js', import.meta.url), 'utf8')
check('header.js paints the chip from headlineReading', /headlineReading\(snap\.risk\.provinces/.test(header))
check('header.js no longer ranks provinces by danger.score for the headline', !/d\.score > worstP\.danger\.score/.test(header))
const ops = readFileSync(new URL('../public/ops.html', import.meta.url), 'utf8')
check('the chip label says PM2.5, not DANGER', /id="danger-kind">PM2\.5</.test(ops) && !/data-i18n="ดัชนีอันตราย\|DANGER"/.test(ops))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
