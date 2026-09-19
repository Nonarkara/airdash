// CCTV x air: pair every camera with the PM2.5 reading nearest to it, and pick
// the live cameras that look at the worst air right now. Pure functions — no
// DB, no network. The point is "see the haze where the number says haze".
import { pm25Band, pairAir, hazeEyes } from '../server/airCctv.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}
const NOW = Date.parse('2026-09-20T10:00:00+07:00')
const st = (key, prov, lat, lng, pm25, obs = '2026-09-20T09:00') => ({ station_key: key, name_th: key, name_en: key, province_th: prov, lat, lng, pm25, obs_time: obs })
const cam = (id, lat, lng, status = 'live', extra = {}) => ({ id, source: 's', lat, lng, name_th: id, stream_status: status, online: status !== 'down', ...extra })

// ── Thai AQI 2023 PM2.5 bands (15 / 25 / 37.5 / 75) ──
check('band edges', pm25Band(15) === 'excellent' && pm25Band(15.1) === 'good' && pm25Band(25) === 'good' && pm25Band(25.1) === 'moderate'
  && pm25Band(37.5) === 'moderate' && pm25Band(37.6) === 'sensitive' && pm25Band(75) === 'sensitive' && pm25Band(75.1) === 'unhealthy')
check('no reading has no band', pm25Band(null) === null && pm25Band(NaN) === null && pm25Band(-3) === null)

// ── pairAir ──
{
  const stations = [st('A', 'ชม', 18.80, 98.95, 90), st('B', 'กท', 13.75, 100.50, 12)]
  const cams = [cam('c1', 18.79, 98.96), cam('c2', 13.76, 100.51), cam('far', 8.0, 99.0)]
  const out = pairAir(cams, stations, { now: NOW })
  check('camera gets its nearest station', out[0].air?.station_key === 'A' && out[1].air?.station_key === 'B')
  check('pairing carries pm25, band and distance', out[0].air.pm25 === 90 && out[0].air.band === 'unhealthy' && out[0].air.km < 3)
  check('a camera with no station within reach has air: null (never a far guess)', out[2].air === null)
  check('inputs are not mutated', cams[0].air === undefined)
  const stale = pairAir([cam('c1', 18.79, 98.96)], [st('A', 'ชม', 18.80, 98.95, 90, '2026-09-19T01:00')], { now: NOW })
  check('a stale reading (>6 h old) is not paired', stale[0].air === null)
  const nearer = pairAir([cam('c1', 18.79, 98.96)], [st('far', 'x', 18.9, 99.1, 10), st('near', 'x', 18.80, 98.96, 50)], { now: NOW })
  check('the nearest station wins, not the first', nearer[0].air.station_key === 'near')
}

// ── hazeEyes ──
{
  const stations = [
    st('worst', 'เชียงใหม่', 18.80, 98.95, 140), st('second', 'ลำปาง', 18.30, 99.50, 95),
    st('third', 'ตาก', 16.90, 99.10, 60), st('clean', 'ภูเก็ต', 7.9, 98.4, 8),
  ]
  const cams = [
    cam('down-near-worst', 18.801, 98.951, 'down'), cam('live-worst', 18.83, 98.97), cam('live-second', 18.31, 99.51),
    cam('embed-third', 16.91, 99.11, 'embed'), cam('live-clean', 7.91, 98.41),
  ]
  const eyes = hazeEyes(cams, stations, { now: NOW, limit: 3 })
  check('worst air first', eyes[0].air.station_key === 'worst' && eyes[0].camera.id === 'live-worst')
  check('a dead stream is never chosen, even if it is the closest', !eyes.some((e) => e.camera.id === 'down-near-worst'))
  check('ordered by PM2.5 descending', eyes.map((e) => e.air.pm25).join() === '140,95,60')
  check('link-only cameras are allowed but live video is preferred when both exist', eyes[2].camera.id === 'embed-third')
  const flakyOnly = hazeEyes([cam('f', 18.801, 98.951, 'flaky')], stations, { now: NOW, limit: 3 })
  check('an unstable (flaky) stream is never picked — fewer eyes beat a black box', flakyOnly.length === 0)
  check('limit is respected', hazeEyes(cams, stations, { now: NOW, limit: 1 }).length === 1)
  const twoCams = [cam('a', 18.80, 98.951), cam('b', 18.801, 98.952)]
  const dup = hazeEyes(twoCams, [st('s1', 'p', 18.80, 98.95, 100), st('s2', 'p', 18.803, 98.953, 90)], { now: NOW, limit: 5 })
  check('the same camera is never shown twice', new Set(dup.map((e) => e.camera.id)).size === dup.length)
  const hazeless = hazeEyes(cams, [st('clean', 'ภูเก็ต', 7.9, 98.4, 8)], { now: NOW, limit: 3, minPm25: 25 })
  check('clean air is not "haze eyes" — nothing to show', hazeless.length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
