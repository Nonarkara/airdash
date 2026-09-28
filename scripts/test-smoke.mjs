// Smoke-upwind geometry: a fire counts only if the wind blows FROM it.
import { bearingDeg, distanceKm, gridFires, smokeFor } from '../server/smoke.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const chiangMai = { lat: 18.79, lng: 98.98 }
check('bearing due north ≈ 0°', Math.abs(bearingDeg(18, 99, 19, 99)) < 0.5)
check('bearing due west ≈ 270°', Math.abs(bearingDeg(18, 99, 18, 98) - 270) < 1)
check('1° latitude ≈ 111 km', Math.abs(distanceKm(18, 99, 19, 99) - 111) < 1.5)

// A big fire 200 km WEST of Chiang Mai (Myanmar side).
const west = gridFires([{ lat: 18.79, lng: 97.08, frp: 800, in_thailand: 0 }])
const fromWest = smokeFor(chiangMai, west, 270)
check('wind from the west carries the western fire', fromWest.upwind_frp_mw > 300 && fromWest.level !== 'none', JSON.stringify(fromWest))
check('border share: all upwind fire is outside Thailand', fromWest.thai_share === 0)
check('compass label W', fromWest.from_en === 'W')
const fromEast = smokeFor(chiangMai, west, 90)
check('wind from the east does not', fromEast.upwind_frp_mw === 0 && fromEast.level === 'none')
const far = gridFires([{ lat: 18.79, lng: 92.5, frp: 5000, in_thailand: 0 }])
check('fire beyond 500 km ignored', smokeFor(chiangMai, far, 270).upwind_frp_mw === 0)
const local = gridFires([{ lat: 18.80, lng: 98.99, frp: 100, in_thailand: 1 }])
check('fire in the province counts whatever the wind', smokeFor(chiangMai, local, 90).upwind_frp_mw > 0)
check('no wind direction → no claim', smokeFor(chiangMai, west, null) === null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
