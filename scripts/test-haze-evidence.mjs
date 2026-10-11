// Optical evidence → verdict: corroborate, never invent PM2.5, never override
// a working ground sensor; fog is not smoke.
import { provinceLevel, shouldFloorToWatch } from '../server/vision/hazeEvidence.js'
import { provinceVerdict } from '../server/verdict.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const f = (cam, status, t = '2026-10-11T03:00:00Z', loss = 40) => ({ camera_key: cam, haze_status: status, obs_time: t, contrast_loss: loss })
check('2 of 3 hazy → widespread', provinceLevel([f('a', 'possible-haze'), f('b', 'possible-haze'), f('c', 'unchanged')]).level === 'widespread')
check('1 of 4 hazy → some', provinceLevel([f('a', 'possible-haze'), f('b', 'unchanged'), f('c', 'unchanged'), f('d', 'unchanged')]).level === 'some')
check('one judged camera → insufficient', provinceLevel([f('a', 'possible-haze'), f('b', 'low-light')]).level === 'insufficient')
check('latest frame per camera wins', provinceLevel([f('a', 'possible-haze', '2026-10-11T01:00:00Z'), f('a', 'unchanged', '2026-10-11T02:00:00Z'), f('b', 'unchanged')]).cams_hazy === 0)

const wide = { level: 'widespread', cams_hazy: 4, cams_judged: 5, median_contrast_loss: 38, fog_likely: false }
check('no ground sensor + widespread haze → floor to watch', shouldFloorToWatch({ pm25: 9, pm25_source: 'gistda_satellite' }, wide))
check('working ground sensor is never overridden', !shouldFloorToWatch({ pm25: 9, pm25_source: 'air4thai' }, wide))
check('fog never floors', !shouldFloorToWatch({ pm25: null }, { ...wide, fog_likely: true }))
check('some-haze never floors', !shouldFloorToWatch({ pm25: null }, { ...wide, level: 'some' }))

const reasons = (p) => provinceVerdict(p).reasons?.map((r) => r.en).join(' | ') ?? ''
const r1 = reasons({ pm25: 8, pm25_source: 'air4thai', vision: wide })
check('verdict names the cameras', /4 of 5 cameras/.test(r1), r1)
check('verdict flags camera/sensor disagreement', /sensors read low/.test(r1), r1)
const r2 = reasons({ pm25: 30, pm25_source: 'air4thai', vision: { ...wide, fog_likely: true, humidity_pct: 96 } })
check('fog named as the likelier cause', /more likely fog/.test(r2) && !/haze-like/.test(r2), r2)
const r3 = reasons({ pm25: 30, vision: { level: 'clear', metar: { cause: 'aerosol', vis_km: 3.2, station_en: 'Mae Sot' } } })
check('airport haze report surfaces', /Mae Sot reports haze\/smoke — visibility 3.2 km/.test(r3), r3)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
