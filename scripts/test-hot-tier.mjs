// The SSD keeps only a hot window of high-volume sources; everything older
// lives in the long-term archive on the external drive. The one rule that
// must never break: a row leaves the SSD only if the archive receipt covers it.
import { openDb } from '../server/db.js'
import { runRetention, trimArchivedHot, retentionCutoff, readArchiveReceipt } from '../server/retention.js'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

const NOW = Date.parse('2026-10-20T12:00:00Z')
const HOT = { thaiwater_rain: 14 }
const hotCut = retentionCutoff(NOW, 14)
const localIso = (daysAgo, h = 0) => new Date(NOW + 7 * 3600_000 - daysAgo * 86_400_000 + h * 3600_000).toISOString().slice(0, 16)

function seed() {
  const db = openDb(':memory:')
  let id = 0
  const add = (source, key, metric, obs) => db.run(
    'INSERT INTO readings (id, source, station_key, metric, value, obs_time, fetched_at) VALUES (?,?,?,?,?,?,?)',
    ++id, source, key, metric, 1 + (id % 7), obs, '2026-10-20T00:00:00Z')
  // Interleave sources in time so the keyset scan must skip non-hot rows.
  for (let d = 30; d >= 0; d--) {
    for (let s = 0; s < 20; s++) {
      add('thaiwater_rain', `g${s}`, 'rain_1h', localIso(d, s % 24))
      add('air4thai', `a${s}`, 'pm25', localIso(d, s % 24))
    }
  }
  return db
}
const count = (db, where, ...a) => db.get(`SELECT COUNT(*) AS n FROM readings WHERE ${where}`, ...a).n

// 1. No receipt → nothing leaves the SSD.
{
  const db = seed()
  const before = count(db, '1')
  const r = await trimArchivedHot(db, { nowMs: NOW, receipt: null, hotDays: HOT, pauseMs: 0 })
  check('no receipt: nothing deleted', r.deleted === 0 && count(db, '1') === before)
}

// 2. Full receipt → only OLD rows of the HOT source go; recent rain and all air stay.
{
  const db = seed()
  const maxId = db.get('SELECT MAX(id) AS m FROM readings').m
  const oldRain = count(db, "source='thaiwater_rain' AND obs_time < ?", hotCut)
  const air = count(db, "source='air4thai'")
  const recentRain = count(db, "source='thaiwater_rain' AND obs_time >= ?", hotCut)
  const r = await trimArchivedHot(db, { nowMs: NOW, receipt: { readings_src_id: maxId }, hotDays: HOT, batch: 17, pauseMs: 0 })
  check('archived old rain deleted', r.deleted === oldRain && count(db, "source='thaiwater_rain' AND obs_time < ?", hotCut) === 0, `${r.deleted} vs ${oldRain}`)
  check('recent rain kept', count(db, "source='thaiwater_rain' AND obs_time >= ?", hotCut) === recentRain)
  check('other sources untouched', count(db, "source='air4thai'") === air)
  check('ran in many small batches', r.batches > 5, String(r.batches))
}

// 3. Partial receipt → rows the archive does not hold yet stay, even if old.
{
  const db = seed()
  const half = Math.floor(db.get('SELECT MAX(id) AS m FROM readings').m / 4)
  await trimArchivedHot(db, { nowMs: NOW, receipt: { readings_src_id: half }, hotDays: HOT, batch: 13, pauseMs: 0 })
  check('no row above the receipt was deleted', count(db, "source='thaiwater_rain' AND id > ? AND obs_time < ?", half, hotCut) > 0
    && count(db, "source='thaiwater_rain' AND id <= ? AND obs_time < ?", half, hotCut) === 0)
}

// 4. Receipt ahead of the live DB (restored DB) → refuse.
{
  const db = seed()
  const r = await trimArchivedHot(db, { nowMs: NOW, receipt: { readings_src_id: 10 ** 9 }, hotDays: HOT, pauseMs: 0 })
  check('receipt ahead of live ids: refused', r.deleted === 0 && r.skipped === 'receipt-ahead')
}

// 5. runRetention never rolls hot sources into readings_hourly.
{
  const db = seed()
  await runRetention(db, { nowMs: NOW + 80 * 86_400_000, receipt: null, pauseMs: 0 })
  check('hot source never rolled up', db.get("SELECT COUNT(*) AS n FROM readings_hourly WHERE source='thaiwater_rain'").n === 0)
  check('non-hot source still rolled up', db.get("SELECT COUNT(*) AS n FROM readings_hourly WHERE source='air4thai'").n > 0)
}

// 6. Receipt file parsing.
{
  const dir = mkdtempSync(join(tmpdir(), 'hot-'))
  const good = join(dir, 'r.json'); writeFileSync(good, JSON.stringify({ readings_src_id: 42 }))
  const bad = join(dir, 'b.json'); writeFileSync(bad, '{"readings_src_id": "x"')
  check('receipt parsed', readArchiveReceipt(good)?.readings_src_id === 42)
  check('corrupt receipt → null', readArchiveReceipt(bad) === null)
  check('missing receipt → null', readArchiveReceipt(join(dir, 'nope.json')) === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
