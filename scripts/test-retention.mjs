// Retention must (1) produce EXACTLY the same hourly aggregates as the original
// all-at-once implementation, and (2) yield the event loop between batches.
// See server/retention.js for why (the 140k–225k rows/day wave hits the 90-day
// window around 2026-10-15). The pre-rewrite implementation is kept below
// verbatim as the reference.
import { openDb } from '../server/db.js'
import { runRetention, retentionCutoff } from '../server/retention.js'
import { CONFIG } from '../server/config.js'

let pass = 0, fail = 0
const check = (name, cond, why = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`) }

// Reference: the original implementation (2026-09-27), minus logging.
function referenceRetention(db, nowMs) {
  const cutoff = retentionCutoff(nowMs, CONFIG.retention.rawDays)
  for (;;) {
    let n = 0
    db.tx(() => {
      const ids = db.all('SELECT id FROM readings WHERE obs_time < ? LIMIT ?', cutoff, 50_000)
      n = ids.length
      if (n === 0) return
      const idList = ids.map((r) => r.id).join(',')
      db.run(`INSERT INTO readings_hourly (source, station_key, metric, hour, v_min, v_max, v_avg, n)
         SELECT source, station_key, metric, substr(obs_time, 1, 13) AS hour, MIN(value), MAX(value), AVG(value), COUNT(*)
         FROM readings WHERE id IN (${idList}) GROUP BY source, station_key, metric, hour
         ON CONFLICT(source, station_key, metric, hour) DO UPDATE SET
           v_min = MIN(v_min, excluded.v_min), v_max = MAX(v_max, excluded.v_max),
           v_avg = (v_avg * n + excluded.v_avg * excluded.n) / (n + excluded.n), n = n + excluded.n`)
      db.run(`DELETE FROM readings WHERE id IN (${idList})`)
    })
    if (n < 50_000) break
  }
}

const NOW = Date.parse('2026-10-20T12:00:00Z')
const cutoff = retentionCutoff(NOW, CONFIG.retention.rawDays)

// Deterministic seed: 3 sources × 40 stations × 2 metrics, 10-min cadence over
// 4 days straddling the cutoff, inserted in SHUFFLED order so one hour's rows
// land in different batches (exercises the cross-batch ON CONFLICT merge).
// A pre-existing readings_hourly row checks merging into history.
function seed(db) {
  let x = 12345; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
  const rows = []
  const start = Date.parse(cutoff + ':00Z') - 2 * 86_400_000
  for (let t = start; t < start + 4 * 86_400_000; t += 600_000) {
    const ts = new Date(t).toISOString().slice(0, 16)
    for (const src of ['a', 'b', 'c']) for (let s = 0; s < 40; s++) for (const m of ['pm25', 'rain'])
      rows.push([src, `st${s}`, m, Math.round(rnd() * 1000) / 10, ts])
  }
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]] }
  db.tx(() => {
    for (const r of rows) db.run(`INSERT INTO readings (source, station_key, metric, value, obs_time, fetched_at) VALUES (?,?,?,?,?,?)`, r[0], r[1], r[2], r[3], r[4], r[4])
    db.run(`INSERT INTO readings_hourly (source, station_key, metric, hour, v_min, v_max, v_avg, n) VALUES ('a','st0','pm25',?,1,99,50,4)`, rows.find((r) => r[4] < cutoff)[4].slice(0, 13))
  })
  return rows.length
}
const dump = (db) => db.all('SELECT source, station_key, metric, hour, v_min, v_max, round(v_avg, 9) AS v_avg, n FROM readings_hourly ORDER BY 1,2,3,4')

const A = openDb(':memory:'), B = openDb(':memory:')
const total = seed(A); seed(B)
const oldCount = A.get('SELECT COUNT(*) n FROM readings WHERE obs_time < ?', cutoff).n
check('seed straddles the cutoff', oldCount > 20_000 && oldCount < total, `${oldCount}/${total}`)

referenceRetention(A, NOW)

// Measure event-loop availability during the new run.
let ticks = 0; const ticker = setInterval(() => ticks++, 1)
const res = await runRetention(B, { nowMs: NOW, batch: 2_000, pauseMs: 5 })
clearInterval(ticker)

const a = dump(A), b = dump(B)
check('same number of hourly aggregate rows as the reference', a.length === b.length, `${a.length} vs ${b.length}`)
check('identical hourly aggregates (min/max/avg/n) to the reference', JSON.stringify(a) === JSON.stringify(b))
check('pre-existing hourly history was merged, not overwritten', b.some((r) => r.source === 'a' && r.station_key === 'st0' && r.metric === 'pm25' && r.n > 4 && r.v_max >= 99))
check('every row older than the cutoff was deleted', B.get('SELECT COUNT(*) n FROM readings WHERE obs_time < ?', cutoff).n === 0)
check('no row newer than the cutoff was touched', B.get('SELECT COUNT(*) n FROM readings').n === total - oldCount)
check('reported deleted count matches', res.deleted === oldCount, `${res.deleted} vs ${oldCount}`)
check(`ran in multiple batches (${res.batches})`, res.batches > 5)
check(`event loop ran other work between batches (${ticks} ticks)`, ticks >= res.batches - 1)
check('temp id table left empty', B.get('SELECT COUNT(*) n FROM temp.retention_ids').n === 0)
const res2 = await runRetention(B, { nowMs: NOW, batch: 2_000, pauseMs: 0 })
check('second run is a no-op', res2.deleted === 0 && JSON.stringify(dump(B)) === JSON.stringify(b))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
