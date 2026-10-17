// Wind direction, stated the same way by every engine that publishes it.
//
// /api/risk published a wind SPEED for all 77 provinces and no direction at
// all, while /api/smoke published direction for the same 77 from the same
// Open-Meteo columns. Speed without a bearing is close to useless for the
// question people ask in the dry season: is this wind bringing dust in from
// the north-west, or clearing it out to sea. Two features answering that
// differently is worse than one of them staying quiet — hence one shared
// compass (server/wind.js) and the coherence check at the bottom.
import { describeWind, compassIndex, towardsDeg, pickWindDir, COMPASS_EN, COMPASS_TH } from '../server/wind.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

// ── the compass itself ─────────────────────────────────────────────────────
check('there are eight sectors', COMPASS_EN.length === 8 && COMPASS_TH.length === 8)
check('north is 0°, east 90°, south 180°, west 270°',
  compassIndex(0) === 0 && compassIndex(90) === 2 && compassIndex(180) === 4 && compassIndex(270) === 6)
check('the quadrants land on the right letters',
  compassIndex(45) === 1 && COMPASS_EN[1] === 'NE' && COMPASS_EN[5] === 'SW')
check('360° wraps back to north rather than falling off the end', compassIndex(360) === 0)
check('359° is still north-ish, not east', compassIndex(359) === 0)

// ── an absent wind must read as absent, never as a default ────────────────
for (const bad of [null, undefined, NaN, -1, 361, 'east', Infinity, -Infinity]) {
  const d = describeWind(bad)
  check(`describeWind(${String(bad)}) returns all-null, not a default compass`,
    d.wind_dir_deg === null && d.wind_from_th === null && d.wind_from_en === null
    && d.wind_towards_deg === null && d.wind_basis === null && d.wind_updated_at === null,
    JSON.stringify(d))
}
check('the all-null shape still has every key, so a caller cannot half-render',
  Object.keys(describeWind(null)).length === Object.keys(describeWind(90)).length)

// ── direction is meteorological: it names where the air comes FROM ─────────
check('0° north means the wind comes FROM the north',
  describeWind(0).wind_from_en === 'N')
check('it blows towards the opposite bearing', towardsDeg(0) === 180 && towardsDeg(90) === 270)
check('towards wraps at the north', towardsDeg(180) === 0 && towardsDeg(350) === 170)
check('towards is null for an absent bearing', towardsDeg(null) === null && towardsDeg(NaN) === null)
check('the two endpoints of an axis agree on the axis', (() => {
  const n = describeWind(350), s = describeWind(170)
  return n.wind_towards_deg === 170 && s.wind_from_en === 'S'
})())

// ── tomorrow wins, because tomorrow is the day being prepared for ──────────
const tmrw = pickWindDir(10, 90, '2026-10-18T00:00Z', '2026-10-17T00:00Z')
check('tomorrow\u2019s bearing wins when it exists',
  tmrw.wind_from_en === 'E' && tmrw.wind_basis === 'tomorrow-forecast' && tmrw.wind_updated_at === '2026-10-18T00:00Z')
const today = pickWindDir(10, null, null, '2026-10-17T00:00Z')
check('today\u2019s bearing is used, and SAYS it is today\u2019s, when tomorrow is absent',
  today.wind_from_en === 'N' && today.wind_basis === 'today-forecast' && today.wind_updated_at === '2026-10-17T00:00Z')
check('with neither, the result is all-null rather than today\u2019s',
  pickWindDir(null, null, null, null).wind_dir_deg === null && pickWindDir(null, null, null, null).wind_basis === null)
check('a garbage tomorrow bearing falls back to today rather than reading north',
  pickWindDir(90, NaN, 'x', 'y').wind_from_en === 'E')

// ── one compass, not two copies ───────────────────────────────────────────
const smokeSrc = readFileSync(join(import.meta.dirname, '../server/smoke.js'), 'utf8')
const riskSrc = readFileSync(join(import.meta.dirname, '../server/risk.js'), 'utf8')
check('smoke.js no longer keeps a private compass table',
  !/const COMPASS_TH = \[/.test(smokeSrc), 'a duplicated table is how the two engines drift')
check('smoke.js imports the shared compass', /from '\.\/wind\.js'/.test(smokeSrc))
check('risk.js imports the shared wind helper', /pickWindDir/.test(riskSrc) && /from '\.\/wind\.js'/.test(riskSrc))
check('risk asks Open-Meteo for the direction columns',
  /'wind_dir_d0'/.test(riskSrc) && /'wind_dir_d1'/.test(riskSrc))
check('risk publishes the bearing fields a reader needs',
  /wind_dir_deg: null, wind_from_th: null, wind_from_en: null/.test(riskSrc)
  && /wind_towards_deg: null, wind_basis: null, wind_updated_at: null/.test(riskSrc))
check('the private direction temporaries are deleted before publishing',
  /delete p\._wind_d0; delete p\._wind_d1/.test(riskSrc),
  'an _wind_d0 key reaching the API is a leaked implementation detail')

// ── live coherence: the two endpoints must not contradict each other ───────
const base = 'http://localhost:28341'
try {
  const [risk, smoke] = await Promise.all([
    fetch(`${base}/api/risk`).then((r) => r.json()),
    fetch(`${base}/api/smoke`).then((r) => r.json()),
  ])
  const P = risk.provinces ?? []
  const S = smoke.provinces ?? []
  const byCode = new Map(P.map((p) => [p.province_code, p]))
  let agree = 0; const differ = []
  for (const s of S) {
    const r = byCode.get(s.code)
    if (!r) { differ.push(`${s.code}: missing from risk`); continue }
    if ((r.wind_dir_deg == null) !== (s.from_deg == null)) { differ.push(`${s.code}: one has a bearing, the other does not`); continue }
    if (r.wind_dir_deg == null) { agree++; continue }
    if (r.wind_from_en === s.from_en) agree++
    else differ.push(`${s.code}: risk=${r.wind_from_en} smoke=${s.from_en}`)
  }
  console.log(`\n  live: ${P.length} risk provinces, ${S.length} smoke, ${agree} agree`)
  check('every province that has a bearing in one endpoint has the same one in the other',
    differ.length === 0, differ.slice(0, 5).join('; '))
  check('no province leaks an underscore-prefixed wind key',
    P.every((p) => !Object.keys(p).some((k) => k.startsWith('_wind'))))
  check('a province with a bearing also says whether it is today or tomorrow',
    P.filter((p) => p.wind_dir_deg != null).every((p) => p.wind_basis === 'today-forecast' || p.wind_basis === 'tomorrow-forecast'))
} catch (e) {
  check('the live coherence check ran', false, `could not reach ${base}: ${e.message}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)