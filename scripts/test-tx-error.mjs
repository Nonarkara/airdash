// A transaction failure must report the failure that actually happened.
//
// WHY THIS GUARD EXISTS
// On 2026-10-24 the internal disk filled up. The nightly hot-tier trim ran
// inside db.tx() and the COMMIT failed with SQLITE_FULL. The old wrapper was
//
//   BEGIN; try { fn(); COMMIT } catch { ROLLBACK; throw }
//
// — one catch for two failures. The catch ran a ROLLBACK against a
// transaction that no longer existed, that ROLLBACK threw "cannot rollback -
// no transaction is active", and THAT replaced the real error. The log said
// "cannot rollback" for a day and a half while the disk was the problem. The
// operator read the wrong sentence and spent the time on the wrong fix.
//
// This guard EXECUTES the transaction helper — it does not read it. A check
// that only greps the source cannot see which error escapes; a check that
// only stubs the database cannot see a real commit-time failure. So it does
// both: a stubbed exec for the error-precedence rules, and a REAL SQLite
// database where the COMMIT is made to fail by a deferred foreign key
// (SQLite defers the check to COMMIT time — a genuine commit-time failure).
import { runInTx, openDb } from '../server/db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond, why = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${why}`}`)
}

/** A stub `exec` that records the SQL and can be told to fail on a statement. */
function stubExec({ failOn = null, error = null } = {}) {
  const calls = []
  const exec = (sql) => {
    calls.push(sql)
    if (sql === failOn) throw error ?? new Error(`stub failure on ${sql}`)
  }
  return { exec, calls }
}

// ── 1 · a failing COMMIT surfaces the COMMIT error ────────────────────────
// This is the incident shape exactly: the COMMIT fails (disk full) and the
// follow-up ROLLBACK then finds no transaction to roll back.
{
  const full = new Error('SQLITE_FULL: database or disk is full')
  const calls = []
  const exec = (sql) => {
    calls.push(sql)
    if (sql === 'COMMIT') throw full
    if (sql === 'ROLLBACK') throw new Error('cannot rollback - no transaction is active')
  }
  let thrown = null
  try { runInTx(exec, () => 'work') } catch (e) { thrown = e }
  check('a failing COMMIT throws the commit error itself',
    thrown === full, `thrown: ${thrown?.message}`)
  check('a failing COMMIT is not reported as a rollback problem',
    !/cannot rollback/i.test(String(thrown?.message ?? '')),
    String(thrown?.message))
  check('a failing COMMIT still tries to close the transaction',
    calls.includes('ROLLBACK'), calls.join(' | '))
}

// ── 2 · a failing work step surfaces the WORK error ───────────────────────
{
  const boom = new Error('the delete failed')
  const { exec } = stubExec({ failOn: 'ROLLBACK', error: new Error('no transaction is active') })
  let thrown = null
  try { runInTx(exec, () => { throw boom }) } catch (e) { thrown = e }
  check('a failing work step throws the work error',
    thrown === boom, `thrown: ${thrown?.message}`)
  check('a failing ROLLBACK does not replace the work error',
    !/no transaction is active/i.test(String(thrown?.message ?? '')),
    String(thrown?.message))
}

// ── 3 · the happy path still behaves ─────────────────────────────────────
{
  const { exec, calls } = stubExec()
  const out = runInTx(exec, () => 'result')
  check('a successful transaction returns the work result', out === 'result', String(out))
  check('a successful transaction is BEGIN then COMMIT',
    calls.join(',') === 'BEGIN,COMMIT', calls.join(','))
}

// ── 4 · a REAL commit-time failure keeps its own message ─────────────────
// A deferred foreign key is checked at COMMIT time, so this is a real
// commit-time failure on a real database — not a stub pretending.
{
  const dir = mkdtempSync(join(tmpdir(), 'airdash-tx-test-'))
  let db = null
  try {
    db = openDb(join(dir, 'tx.db'))
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)')
    db.exec(`CREATE TABLE child (id INTEGER PRIMARY KEY,
               pid INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)`)
    db.run('INSERT INTO parent (id) VALUES (1)')
    let thrown = null
    try {
      db.tx(() => { db.run('INSERT INTO child (id, pid) VALUES (1, 999)') })
    } catch (e) { thrown = e }
    check('a real commit-time failure is thrown', !!thrown, 'no error was thrown')
    check('the real commit-time message survives',
      /FOREIGN KEY constraint failed/i.test(String(thrown?.message ?? '')),
      String(thrown?.message))
    check('the real commit-time failure is not masked by a rollback problem',
      !/cannot rollback/i.test(String(thrown?.message ?? '')),
      String(thrown?.message))
    // The connection must still be usable: a failed transaction must not
    // leave the DB stuck inside one.
    let after = null
    try { db.tx(() => { db.run('INSERT INTO parent (id) VALUES (2)') }) } catch (e) { after = e }
    check('the connection is usable again after a failed transaction', !after,
      String(after?.message))
    check('the failed transaction left nothing behind',
      Number(db.get('SELECT COUNT(*) AS n FROM child')?.n) === 0,
      JSON.stringify(db.get('SELECT COUNT(*) AS n FROM child')))
  } finally {
    try { db?.raw.close() } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
