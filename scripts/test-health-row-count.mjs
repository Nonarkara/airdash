// /api/health must not publish an approximate value under a key that reads as
// an exact one.
//
// The `readings` field was `MAX(id)`, sitting in a db block whose other six
// fields are all exact COUNT(*). Ids are never reused, so after the first
// retention prune MAX(id) is a high-water mark that only ever climbs, while
// the table itself is held flat by retention. On production that gap was
// 18,720,908 published vs 4,777,758 actual — 3.9x — and it is precisely the
// number an operator reads to decide whether the hot tier needs shrinking.
//
// These checks execute real SQL rather than pattern-matching the source, so
// the divergence they guard is demonstrated, not assumed: the point is that
// MAX(id) and COUNT(*) genuinely diverge once rows are pruned.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

const apiSrc = readFileSync(join(import.meta.dirname, '../server/api.js'), 'utf8')

// ── The divergence, executed ────────────────────────────────────────────────
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE readings (id INTEGER PRIMARY KEY AUTOINCREMENT, v REAL)')
const ins = db.prepare('INSERT INTO readings (v) VALUES (?)')
for (let i = 0; i < 10; i++) ins.run(i)
db.exec('DELETE FROM readings WHERE id BETWEEN 3 AND 7')   // retention-like prune

const maxId = db.prepare('SELECT MAX(id) AS n FROM readings').get().n
const count = db.prepare('SELECT COUNT(*) AS n FROM readings').get().n

check('MAX(id) and COUNT(*) really do diverge after a prune', maxId === 10 && count === 5,
  `max_id=${maxId} count=${count}`)
check('the divergence is an over-count, never an under-count', maxId > count)
check('pruning does not pull MAX(id) down toward the true count', (() => {
  // Deleting an INTERIOR row is what retention does. MAX(id) must not move.
  db.exec('DELETE FROM readings WHERE id = 2')
  return db.prepare('SELECT MAX(id) AS n FROM readings').get().n === 10
    && db.prepare('SELECT COUNT(*) AS n FROM readings').get().n === 4
})(), 'MAX(id) moved when an interior row was pruned, so the gap can close')

// ── The published name ──────────────────────────────────────────────────────
// A reader scanning the JSON sees six exact counts. Any key among them that
// holds MAX(id) is a lie about its own kind.
check('health publishes the high-water mark under an explicit name',
  /dbStats\.readings_max_id\s*=/.test(apiSrc))
check('health no longer publishes it under a bare count-like name',
  !/dbStats\.readings\s*=/.test(apiSrc), 'found the old `dbStats.readings =` assignment')
check('the exact-count tables keep using COUNT(*)',
  /SELECT COUNT\(\*\) AS n FROM \$\{table\}/.test(apiSrc))
check('the high-water mark is still O(1) — no COUNT(*) reintroduced for readings',
  !/dbStats[\s\S]{0,200}COUNT\(\*\)[\s\S]{0,60}FROM readings/.test(apiSrc),
  'an exact COUNT(*) on readings would reintroduce the 8s event-loop freeze')

// ── Nothing consumes the old name ──────────────────────────────────────────
// If a reader exists, renaming breaks it silently. There is none. This file is
// excluded because it necessarily contains the pattern it searches for.
const SELF = import.meta.filename
const consumers = ['scripts', 'server', 'ops', 'public/js', 'functions']
  .flatMap((d) => {
    try { return readdirDeep(join(import.meta.dirname, '..', d)) } catch { return [] }
  })
  .filter((f) => /\.(mjs|js|sh|html)$/.test(f) && !f.includes('inspect-db') && f !== SELF)
  .filter((f) => {
    const s = safeRead(f)
    return /\.db\??\.(readings)\b|\["readings"\]|db\.readings\b/.test(s)
  })
check('no file reads the old db.readings key (renaming is safe)', consumers.length === 0,
  `consumers: ${consumers.join(', ')}`)

// ── The comment must not re-claim it is a count ─────────────────────────────
const comment = apiSrc.slice(0, apiSrc.indexOf('dbStats.readings_max_id'))
check('the old "harmless over-count" claim is gone',
  !/harmless over-count/.test(apiSrc),
  'an over-count that is read as a row count is not harmless')
check('the comment states why the name is what it is',
  /high-water mark/.test(comment))

function safeRead(f) { try { return readFileSync(f, 'utf8') } catch { return '' } }
function readdirDeep(dir, out = []) {
  for (const e of readdirSyncSafe(dir)) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name[0] !== '.') readdirDeep(p, out) }
    else out.push(p)
  }
  return out
}
function readdirSyncSafe(d) {
  try { return readdirSync(d, { withFileTypes: true }) } catch { return [] }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)