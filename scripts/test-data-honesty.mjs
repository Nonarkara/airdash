// A missing forecast must read as "unknown", never as "no rain"; a quota
// park must end at the provider's reset, not a flat 24 h later.
import assert from 'node:assert/strict'
import { washoutBand, reliefEta, WASHOUT_LABELS } from '../server/washout.js'
import { parkUntil } from '../server/scheduler.js'
import { isFutureObs } from '../server/db.js'

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
console.log(`\n${passed} passed, 0 failed`)
