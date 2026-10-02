import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { CONFIG } from '../server/config.js'
import { EXPORT_TABLES, buildWeeklyExport, listWeeklyExports, getBuildState } from '../server/weeklyExport.js'
const originalCwd = process.cwd(), originalPath = CONFIG.dbPath
const dir = mkdtempSync(join(tmpdir(), 'airdash-export-'))
const database = new DatabaseSync(join(dir, 'fixture.db'))
let passed = 0
const check = (name, fn) => { fn(); console.log('PASS', name); passed++ }
try {
  process.chdir(dir); CONFIG.dbPath = join(dir, 'fixture.db')
  for (const {name} of EXPORT_TABLES) {
    database.exec(`CREATE TABLE ${name}(id INTEGER PRIMARY KEY, text TEXT)`)
    database.prepare(`INSERT INTO ${name}(text) VALUES (?)`).run('quoted, "value"\nsecond line')
  }
  const db = {all: (sql, ...args) => database.prepare(sql).all(...args)}
  const result = await buildWeeklyExport({db, startedAt: new Date().toISOString()})
  check('quoted newlines do not inflate public CSV row counts', () => assert.ok(Object.values(result.rowCounts).every(n => n === 1)))
  check('only a completed archive appears in the public list', () => {assert.equal(listWeeklyExports().length, 1); assert.deepEqual(readdirSync('data/exports'), ['airdash-' + result.date + '.tar.gz'])})
  check('archive contains every public table and valid metadata', () => {
    const names = execFileSync('tar', ['-tzf', result.file], {encoding:'utf8'})
    for (const {name} of EXPORT_TABLES) assert.ok(names.includes(name+'.csv'))
    assert.equal(JSON.parse(execFileSync('tar', ['-xOzf', result.file, './meta.json'], {encoding:'utf8'})).row_counts.readings, 1)
  })
  const original = readFileSync(result.file)
  database.exec('DROP TABLE readings')
  await assert.rejects(buildWeeklyExport({db, startedAt: new Date().toISOString()}), /export readings failed/)
  check('a failed dump retains the previous archive and reports failure', () => {assert.deepEqual(readFileSync(result.file), original); assert.equal(getBuildState().running, false); assert.match(getBuildState().error, /readings/); assert.equal(readdirSync('data/exports').length, 1)})
} finally {
  database.close(); process.chdir(originalCwd); CONFIG.dbPath = originalPath
  rmSync(dir, {recursive:true, force:true})
}
console.log(`\n${passed} passed, 0 failed`)
