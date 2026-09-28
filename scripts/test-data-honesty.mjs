// A missing forecast must read as "unknown", never as "no rain"; a quota
// park must end at the provider's reset, not a flat 24 h later.
import assert from 'node:assert/strict'
import { washoutBand, reliefEta, WASHOUT_LABELS } from '../server/washout.js'
import { parkUntil, bootDelayMs } from '../server/scheduler.js'
import { isFutureObs } from '../server/db.js'
import { correct, computeRatios } from '../server/forecastBias.js'
import { noiseDay } from '../server/sources/pcd-noise.js'

let passed = 0
const t = (name, fn) => { fn(); passed++; console.log('PASS', name) }

t('no forecast → unknown band, not none', () => assert.equal(washoutBand(null, null), 'unknown'))
t('real zero rain → none', () => assert.equal(washoutBand(0, 0), 'none'))
t('unknown band has TH + EN labels', () => {
  assert.ok(WASHOUT_LABELS.unknown.th && WASHOUT_LABELS.unknown.en)
})
t('reliefEta with no days → unknown, no day', () => {
  const r = reliefEta([{}, {}, {}])
  assert.equal(r.unknown, true)
  assert.equal(r.day, null)
})
t('reliefEta with forecast is not unknown', () => {
  assert.notEqual(reliefEta([{ mm: 20, prob: 90 }, {}, {}]).unknown, true)
})
t('daily quota park ends 00:05 UTC next day', () => {
  const now = Date.UTC(2026, 8, 27, 17, 0)
  assert.equal(parkUntil(new Error('open-meteo: daily quota exhausted'), now), Date.UTC(2026, 8, 28, 0, 5))
})
t('other rate limit parks 24 h', () => {
  const now = Date.UTC(2026, 8, 27, 17, 0)
  assert.equal(parkUntil(new Error('429 Too Many Requests'), now), now + 24 * 3600_000)
})
t('obs 6 h ahead of Bangkok now is future', () => {
  const now = Date.UTC(2026, 8, 27, 17, 43) // 00:43 Bangkok, 28 Sep
  assert.equal(isFutureObs('2026-09-28T06:00', now), true)
})
t('obs within 2 h slack is accepted', () => {
  const now = Date.UTC(2026, 8, 27, 17, 43)
  assert.equal(isFutureObs('2026-09-28T01:00', now), false)
  assert.equal(isFutureObs('2026-09-27T23:00', now), false)
})
t('boot: source fresh within its interval waits for its turn', () => {
  const now = Date.UTC(2026, 8, 28, 10, 0)
  assert.equal(bootDelayMs(new Date(now - 60 * 60_000).toISOString(), 6 * 3600_000, now), 5 * 3600_000)
})
t('boot: stale or never-run source runs now', () => {
  const now = Date.UTC(2026, 8, 28, 10, 0)
  assert.equal(bootDelayMs(new Date(now - 7 * 3600_000).toISOString(), 6 * 3600_000, now), 0)
  assert.equal(bootDelayMs(null, 6 * 3600_000, now), 0)
})
t('noise: wall-time-as-UTC encoding (2026-09-27 form) → same date', () => {
  assert.equal(noiseDay(Date.UTC(2026, 8, 27, 23, 0)), '2026-09-27')
})
t('noise: real-instant encoding (2026-09-28 form) → same date', () => {
  assert.equal(noiseDay(Date.UTC(2026, 8, 27, 16, 0)), '2026-09-27')
})
t('bias: inside the calibrated range the ratio scales', () => {
  assert.equal(correct(3, { ratio: 2, camsMean: 4 }), 6)
})
t('bias: beyond it only the calibrated offset is added (Rayong 2026-09-28: raw 14 was sent as 41)', () => {
  assert.ok(Math.abs(correct(14, { ratio: 2.93, camsMean: 3.5 }) - 20.755) < 0.01)
})
t('bias: ratios need MIN_DAYS paired days, else national', () => {
  const g = [1, 2, 3, 4, 5].map((d) => ({ code: '10', day: `2026-09-0${d}`, v: 20 }))
  const c = [1, 2, 3, 4, 5].map((d) => ({ code: '10', day: `2026-09-0${d}`, v: 10 }))
  const r = computeRatios(g, c)
  assert.equal(r.byCode.get('10').ratio, 2)
  assert.equal(computeRatios(g.slice(0, 2), c.slice(0, 2)).byCode.size, 0)
})
console.log(`\n${passed} passed, 0 failed`)
