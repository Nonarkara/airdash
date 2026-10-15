import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAYER_GROUPS } from '../public/js/layers/satellite.js'
import { interpolatePm } from '../public/js/layers/pollution-field.js'
import {
  AIR_COPY, PARTICLE_CAP, PLUME_MAX_KM, WIND_GRID, advect, chevron, components,
  decodeCurrents, hazeSources, openMeteoUrl, particleBudget, plumeTrack, pointsForGrid, sampleWind,
  windAsOf,
} from '../public/js/layers/wind-math.js'
import { createWindReader } from '../server/windField.js'

const points = pointsForGrid()
assert.equal(points.length, 100)
assert.ok(points.length <= 100)
assert.equal(WIND_GRID.nlat * WIND_GRID.nlng, 100)
const url = openMeteoUrl(points)
assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/)
assert.equal(new URL(url).searchParams.get('apikey'), null)
assert.equal(new URL(url).searchParams.has('key'), false)
assert.match(url, /current=wind_speed_10m%2Cwind_direction_10m|current=wind_speed_10m,wind_direction_10m/)

const grid = points.map((p) => ({
  latitude: p.lat, longitude: p.lng,
  current: { time: '2026-10-15T17:00', wind_speed_10m: 36, wind_direction_10m: 0 },
}))
const decoded = decodeCurrents(points, grid)
assert.equal(decoded.speed.filter((v) => v === 36).length, 100)
const bad = structuredClone(grid)
bad[0].current.wind_speed_10m = 5000
bad[1].latitude = 0
const rejected = decodeCurrents(points, bad)
assert.equal(rejected.speed[0], null)
assert.equal(rejected.speed[1], null)
assert.equal(rejected.speed[2], 36)

const field = { available: true, ...WIND_GRID, speed_kmh: decoded.speed, from_deg: decoded.from_deg }
const south = sampleWind(field, 13, 100)
assert.ok(south)
assert.ok(Math.abs(south.u) < 1)
assert.ok(south.v < -30)
assert.equal(sampleWind(field, 80, 100), null)
const hole = { ...field, speed_kmh: field.speed_kmh.map((v, i) => i < 4 ? null : v) }
assert.equal(sampleWind(hole, WIND_GRID.lat0 + 0.2, WIND_GRID.lng0 + 0.2), null)

const blow = components(0, 36)
const step = advect(15, 100, blow.u, blow.v, 1)
assert.ok(step.lat < 15)
assert.ok(Math.abs(step.lng - 100) < 0.01)
const track = plumeTrack(15, 100, components(0, 200))
assert.ok(track.km <= PLUME_MAX_KM + 0.01)
assert.ok(track.points[2][0] < track.points[0][0])
assert.equal(plumeTrack(15, 100, null), null)
assert.equal(plumeTrack(15, 100, { ...components(0, 1), speed_kmh: 1 }), null)
const head = chevron(track.points[1], track.points[2])
assert.deepEqual(head[1], track.points[2])

assert.equal(particleBudget({ hidden: true }), 0)
assert.equal(particleBudget({ reduce: true }), 0)
assert.equal(particleBudget({ narrow: true }), PARTICLE_CAP.phone)
assert.ok(particleBudget({ narrow: true }) < particleBudget({}))
assert.ok(particleBudget({}) <= PARTICLE_CAP.absolute)

const picks = hazeSources({
  field,
  fires: [{ lat: 18, lng: 99, detections: 8 }, { lat: 18.1, lng: 99.1, detections: 2 }, { lat: 19, lng: 101, detections: 4 }],
  stations: [
    { lat: 13.7, lng: 100.5, pm25: 80 },
    { lat: 13.72, lng: 100.52, pm25: 40 },
    { lat: 14.2, lng: 100.6, pm25: 10 },
  ],
})
assert.ok(picks.some((p) => p.kind === 'fire'))
assert.ok(picks.some((p) => p.kind === 'pm' && p.pm25 === 80))
assert.equal(picks.filter((p) => p.kind === 'pm' && Math.abs(p.lat - 13.7) < 0.2).length, 1)
assert.equal(hazeSources({ field: { available: false }, stations: [{ lat: 13, lng: 100, pm25: 90 }] }).length, 0)

const nearPts = [{ lat: 13, lng: 100, pm25: 10 }, { lat: 13.05, lng: 100, pm25: 30 }, { lat: 13, lng: 100.05, pm25: 20 }]
const close = interpolatePm(13.01, 100.01, nearPts)
const away = interpolatePm(13.18, 100.18, nearPts)
assert.ok(close && away)
assert.ok(away.alpha < close.alpha)
assert.equal(interpolatePm(13.4, 100.4, nearPts), null)

function memoryDb() {
  const store = new Map()
  return { kvGet: (k) => store.get(k) ?? null, kvSet: (k, v) => store.set(k, v) }
}
const db = memoryDb()
let calls = 0
let fail = false
const fetchImpl = async (asked) => {
  calls += 1
  assert.match(asked, /api\.open-meteo\.com/)
  if (fail) throw new Error('upstream down')
  return grid
}
let now = Date.parse('2026-10-15T12:00:00Z')
const read = createWindReader({ fetchImpl, now: () => now })
const first = await read(db)
const second = await read(db)
assert.equal(calls, 1)
assert.equal(first.available, true)
assert.equal(second.stale, false)
assert.equal(first.cells, 100)
assert.equal(first.note_en, AIR_COPY.wind_en)
now += 60 * 1000
await read(db)
assert.equal(calls, 1)
const parallel = createWindReader({
  fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(grid), 20)),
  now: () => now,
})
const empty = memoryDb()
const [a, b] = await Promise.all([parallel(empty), parallel(empty)])
assert.equal(a.available, true)
assert.equal(b.fetched_at, a.fetched_at)

now += 31 * 60 * 1000
await read(db)
assert.equal(calls, 2)
fail = true
now += 31 * 60 * 1000
const stale = await read(db)
assert.equal(stale.stale, true)
assert.equal(stale.available, true)
assert.equal(calls, 3)
const revived = createWindReader({ fetchImpl, now: () => now })
const fromKv = await revived(db)
assert.equal(fromKv.available, true)
assert.equal(calls, 3)

fail = false
const burner = memoryDb()
const burnNow = { t: Date.parse('2026-10-16T00:00:00Z') }
let burns = 0
const burnRead = createWindReader({
  fetchImpl: async () => { burns += 1; return grid },
  now: () => burnNow.t,
})
for (let n = 0; n < 36; n++) {
  burnNow.t += 31 * 60 * 1000
  await burnRead(burner)
}
assert.equal(burns, 36)
burnNow.t += 31 * 60 * 1000
const capped = await burnRead(burner)
assert.equal(burns, 36)
assert.equal(capped.capped, true)
assert.equal(capped.stale, true)

const toggles = LAYER_GROUPS.flatMap((g) => g.layers)
for (const id of ['heatmap', 'windFlow']) {
  assert.equal(toggles.find((t) => t.id === id).on, true, id)
}
assert.ok(toggles.some((t) => t.id === 'hazeDrift'))
assert.equal(new Set(toggles.map((t) => t.id)).size, toggles.length)

const root = new URL('../', import.meta.url)
const mapSrc = readFileSync(new URL('public/js/map.js', root), 'utf8')
const regionSrc = readFileSync(new URL('public/js/region.js', root), 'utf8')
const apiSrc = readFileSync(new URL('server/api.js', root), 'utf8')
const edgeSrc = readFileSync(new URL('functions/api/[[path]].js', root), 'utf8')
assert.match(mapSrc, /layers\.windFlow\s*=/)
assert.match(mapSrc, /layers\.hazeDrift\s*=/)
assert.match(mapSrc, /AIR_COPY/)
assert.match(regionSrc, /createWindFlowLayer/)
assert.match(regionSrc, /createHazeDriftLayer/)
assert.match(apiSrc, /'GET \/api\/wind-field'/)
assert.match(edgeSrc, /\/api\/wind-field/)
assert.match(edgeSrc, /__wind_field_v1__/)
assert.equal(AIR_COPY.drift_en, 'Wind carries haze this way, not a forecast')
assert.match(AIR_COPY.drift_th, /ไม่ใช่พยากรณ์/)
assert.match(AIR_COPY.drift_zh, /不是到达时间预报/)
assert.equal(windAsOf('2026-10-15T10:30:00Z', 'en'), 'wind as of 17:30')
assert.equal(windAsOf('2026-10-15T10:30:00Z', 'th'), 'ลม ณ 17:30')
assert.equal(windAsOf('2026-10-15T10:30:00Z', 'zh'), '风截至 17:30')
assert.equal(windAsOf('not-a-time', 'en'), null)
assert.match(mapSrc, /tr\(AIR_COPY\.heat_th,\s*AIR_COPY\.heat_en\)/)
assert.match(mapSrc, /tr\(AIR_COPY\.wind_th,\s*AIR_COPY\.wind_en\)/)
assert.match(mapSrc, /tr\(AIR_COPY\.drift_th,\s*AIR_COPY\.drift_en\)/)
assert.doesNotMatch(mapSrc, /AIR_COPY\.heat_zh/)
assert.match(mapSrc, /Province forecast wind \(daily, not the live grid\)/)
assert.match(mapSrc, /Not the live grid/)
assert.match(mapSrc, /if \(document\.hidden \|\| !hazeDriftOn\(\)\) return/)
assert.match(mapSrc, /if \(t\.id === 'hazeDrift'\) refreshHazeFires\(\)/)
const flowSrc = readFileSync(new URL('public/js/layers/wind-flow.js', root), 'utf8')
const stepSrc = flowSrc.slice(flowSrc.indexOf('step(t)'), flowSrc.indexOf('spawn(bounds'))
assert.match(stepSrc, /!field\?\.available/)
assert.match(stepSrc, /this\.halt\(\)/)
assert.match(flowSrc, /if \(this\.raf \|\| !this\.map \|\| !this\.field\?\.available\) return/)
assert.match(flowSrc, /setLineDash\(stale \? \[4, 4\] : \[\]\)/)
assert.match(flowSrc, /windAsOf\(/)
const hazeSrc = readFileSync(new URL('public/js/layers/haze-drift.js', root), 'utf8')
assert.match(hazeSrc, /syncLang/)
assert.doesNotMatch(hazeSrc, /drift_en,\s*AIR_COPY\.drift_th/)
assert.match(regionSrc, /paintAirCaption/)
assert.doesNotMatch(regionSrc, /credit_zh/)
const ci = readFileSync(new URL('.github/workflows/air-layers.yml', root), 'utf8')
assert.match(ci, /node scripts\/test-air-layers\.mjs/)
assert.match(readFileSync(new URL('package.json', root), 'utf8'), /test-air-layers\.mjs/)
const freshFiles = ['public/js/layers/wind-math.js', 'public/js/layers/wind-flow.js', 'public/js/layers/haze-drift.js', 'public/js/layers/wind-client.js', 'server/windField.js']
for (const file of freshFiles) {
  const text = readFileSync(new URL(file, root), 'utf8')
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), false, file)
}
assert.equal(/gradient/.test(readFileSync(new URL('public/js/layers/wind-flow.js', root), 'utf8')), false)
assert.match(readFileSync(new URL('public/js/layers/wind-flow.js', root), 'utf8'), /document\.hidden/)
assert.match(readFileSync(new URL('public/js/layers/wind-flow.js', root), 'utf8'), /PARTICLE_CAP|particleBudget/)

console.log('PASS wind grid cap, IDW fade, haze drift disclaimer, particle budget, layer defaults')
