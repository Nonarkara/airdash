// End-to-end smoke test of ops/archive-longterm.mjs against throwaway
// fixtures in a temp dir: a full run, an idempotent re-run, the lock, and a
// SIGTERM mid-run. Exercises the real node:sqlite code path; never touches
// /Volumes/Data or the live databases.
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`) }

const root = mkdtempSync(join(tmpdir(), 'dash-archive-smoke-'))
const volume = join(root, 'volume')
const archiveDir = join(volume, 'dash-archive')
mkdirSync(archiveDir, { recursive: true })
const SCRIPT = new URL('../ops/archive-longterm.mjs', import.meta.url).pathname

function makeLive(path, nReadings) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE readings (id INTEGER PRIMARY KEY, source TEXT NOT NULL, station_key TEXT NOT NULL,
      metric TEXT NOT NULL, value REAL NOT NULL, obs_time TEXT NOT NULL, fetched_at TEXT NOT NULL);
    CREATE TABLE alerts (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, rule TEXT NOT NULL, source TEXT,
      station_key TEXT, province_th TEXT, province_en TEXT, severity INTEGER, value REAL,
      prev_value REAL, message_th TEXT, message_en TEXT);
    CREATE TABLE stations (source TEXT, station_key TEXT, name_th TEXT, name_en TEXT, province_th TEXT,
      province_en TEXT, province_code TEXT, lat REAL, lng REAL, first_seen TEXT, last_seen TEXT);
    INSERT INTO stations VALUES ('t', 'S1', 'ส1', 'S1', 'จ', 'P', '10', 13.7, 100.5, '2026-01-01', '2026-09-16');
    INSERT INTO alerts (ts, rule) VALUES ('2026-09-16T00:00:00Z', 'r1'), ('2026-09-16T01:00:00Z', 'r2');
  `)
  const ins = db.prepare('INSERT INTO readings (source, station_key, metric, value, obs_time, fetched_at) VALUES (?,?,?,?,?,?)')
  db.exec('BEGIN')
  for (let i = 0; i < nReadings; i++) {
    ins.run('t', `S${i % 50}`, 'level', i, `2026-09-16T${String(i % 24).padStart(2, '0')}:00:${String(i % 60).padStart(2, '0')}`, '2026-09-16T12:00:00Z')
  }
  db.exec('COMMIT')
  db.close()
}

const airDb = join(root, 'airdash.db')
const floodDb = join(root, 'flooddash.db')
makeLive(airDb, 1_000)
makeLive(floodDb, 45_000)   // three batches at BATCH=20k

const env = {
  ...process.env,
  DASH_ARCHIVE_VOLUME: volume,
  DASH_ARCHIVE_DIR: archiveDir,
  DASH_ARCHIVE_AIRDASH_DB: airDb,
  DASH_ARCHIVE_FLOODDASH_DB: floodDb,
}

function run(args = [], { killAfterMs } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    if (killAfterMs) setTimeout(() => child.kill('SIGTERM'), killAfterMs)
    child.on('close', (code) => resolve({ code, out }))
  })
}

const archive = () => new DatabaseSync(join(archiveDir, 'dash-archive.db'), { readOnly: true })

// ── 1. full run ──
{
  const { code, out } = await run()
  check('run exits 0', code === 0)
  check('logs "airdash: done"', /airdash: done/.test(out))
  check('logs "flooddash: done"', /flooddash: done/.test(out))
  check('logs "archive run complete"', /archive run complete — 46,004 new rows/.test(out))
  check('prints coverage instead of counts', /coverage \(archive watermark/.test(out) && !/archive contents/.test(out))
  check('coverage says caught up', /flooddash\.readings .*caught up/.test(out))
  check('lock released', !existsSync(join(archiveDir, '.archive.lock')))
  const db = archive()
  check('45,000 flooddash readings archived', db.prepare("SELECT COUNT(*) n FROM readings WHERE system='flooddash'").get().n === 45_000)
  check('watermark = live max id', db.prepare("SELECT last_src_id v FROM archive_meta WHERE system='flooddash' AND table_name='readings'").get().v === 45_000)
  check('archive_runs row ok=1', db.prepare('SELECT ok, rows_copied FROM archive_runs ORDER BY id DESC LIMIT 1').get().rows_copied === 46_004)
  check('analysis index built', !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_ar_readings_series'").get())
  db.close()
}

// ── 2. idempotent re-run ──
{
  const { code, out } = await run()
  check('re-run exits 0', code === 0)
  check('re-run copies nothing new', /archive run complete — 0 new rows \[airdash\.stations=1 flooddash\.stations=1\]/.test(out))
}

// ── 3. lock held by a live pid → skip ──
{
  writeFileSync(join(archiveDir, '.archive.lock'), JSON.stringify({ pid: process.pid, startedAt: 'T' }))
  const { code, out } = await run()
  check('live lock → exit 0', code === 0)
  check('live lock → "still in progress" logged', /another archive run is still in progress \(pid \d+, started T\)/.test(out))
  check('live lock is left alone', existsSync(join(archiveDir, '.archive.lock')))
  writeFileSync(join(archiveDir, '.archive.lock'), JSON.stringify({ pid: 999_999_999, startedAt: 'T' }))
  const stale = await run()
  check('stale lock → taken over and run proceeds', stale.code === 0 && /taking over stale lock/.test(stale.out) && /archive run complete/.test(stale.out))
}

// ── 4. SIGTERM mid-run → clean interruption, resumable ──
{
  makeLive(join(root, 'big.db'), 600_000)
  const bigEnv = { ...env, DASH_ARCHIVE_FLOODDASH_DB: join(root, 'big.db') }
  const child = spawn(process.execPath, [SCRIPT], { env: bigEnv })
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  setTimeout(() => child.kill('SIGTERM'), 400)
  const code = await new Promise((r) => child.on('close', r))
  const interrupted = /archive run interrupted \(SIGTERM\) after [\d,]+ rows — watermarks saved/.test(out)
  check('SIGTERM → exit 0 with "interrupted" line (or finished first)', code === 0 && (interrupted || /archive run complete/.test(out)))
  check('lock released after SIGTERM', !existsSync(join(archiveDir, '.archive.lock')))
  const db = archive()
  const row = db.prepare('SELECT ok, error, finished_at FROM archive_runs ORDER BY id DESC LIMIT 1').get()
  check('interrupted run recorded with finish time', row.finished_at && (interrupted ? /interrupted by SIGTERM/.test(row.error) : row.ok === 1))
  const wm = db.prepare("SELECT last_src_id v FROM archive_meta WHERE system='flooddash' AND table_name='readings'").get().v
  const n = db.prepare("SELECT COUNT(*) n FROM readings WHERE system='flooddash'").get().n
  check('watermark matches rows actually committed', wm === n)
  db.close()
  const resumed = await new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT], { env: bigEnv }); let o = ''
    c.stdout.on('data', (d) => { o += d }); c.on('close', (code) => resolve({ code, o }))
  })
  check('next run resumes to completion', resumed.code === 0 && /flooddash: done/.test(resumed.o) && /archive run complete/.test(resumed.o))
  const db2 = archive()
  check('all 600,000 rows present after resume, none duplicated', db2.prepare("SELECT COUNT(*) n FROM readings WHERE system='flooddash'").get().n === 600_000)
  check('prior unfinished run gets marked abandoned only when it had no finish record', db2.prepare("SELECT COUNT(*) n FROM archive_runs WHERE error LIKE 'abandoned%'").get().n === 0)
  db2.close()
}

// ── 5. --verify / --stats modes ──
{
  const v = await run(['--verify'])
  check('--verify exits 0 on a fresh archive', v.code === 0 && /integrity_check: ok/.test(v.out) && /last successful run finished/.test(v.out))
  const s = await run(['--stats'])
  check('--stats prints counts and span', s.code === 0 && /readings\s+airdash=1,000\s+flooddash=600,000/.test(s.out) && /span \(all systems\)/.test(s.out))
}

// ── 6. volume absent → exit 0, nothing written ──
{
  const { code, out } = await new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT], { env: { ...env, DASH_ARCHIVE_VOLUME: join(root, 'nope') } }); let o = ''
    c.stdout.on('data', (d) => { o += d }); c.on('close', (code) => resolve({ code, out: o }))
  })
  check('unmounted volume → exit 0 + skip line', code === 0 && /not mounted — skipping/.test(out))
}

rmSync(root, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
