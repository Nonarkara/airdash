// Read-only: has the camera evidence ever actually moved a verdict?
//
// hazeEvidence.shouldFloorToWatch is the ONLY thing this whole CV pipeline can
// do to a province's risk band, and it requires level === 'widespread', which
// provinceLevel only awards at share >= 0.5 AND cams_hazy >= 2. If provinces
// sit at or just above MIN_VALID (2 judged cameras), 'widespread' is
// near-unreachable. This replays the real provinceLevel() over every
// (province, 2h-window) pair ever recorded.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'
import { provinceLevel } from '../server/vision/hazeEvidence.js'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })
const WINDOW_MS = 2 * 3600_000

const frames = db.prepare(
  `SELECT camera_key, province_code, haze_status, contrast_loss, obs_time
     FROM cctv_haze_frames
    WHERE province_code IS NOT NULL AND obs_time >= ?`)
  .all(new Date(Date.now() - 30 * 86400_000).toISOString())
console.log(`frames with a province in the last 30 days: ${frames.length}`)

const byCode = new Map()
for (const f of frames) {
  if (!byCode.has(f.province_code)) byCode.set(f.province_code, [])
  byCode.get(f.province_code).push(f)
}

// Walk the same 2h windows the live endpoint uses.
const levels = new Map()
let windows = 0
for (const [code, rows] of byCode) {
  const times = [...new Set(rows.map(r => Date.parse(r.obs_time)))].sort((a, b) => a - b)
  for (const t of times) {
    const slice = rows.filter(r => {
      const d = Date.parse(r.obs_time)
      return d > t - WINDOW_MS && d <= t
    })
    if (!slice.length) continue
    windows++
    const lv = provinceLevel(slice).level
    levels.set(lv, (levels.get(lv) ?? 0) + 1)
  }
}
console.log(`\n${windows} province-windows evaluated over 30 days:`)
for (const [lv, n] of [...levels].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(7)}  ${lv}${lv === 'widespread' ? '   <-- the only level that can move a verdict' : ''}`)
}
console.log(`\nshare of windows reaching 'widespread': ` +
  `${(((levels.get('widespread') ?? 0) / windows) * 100).toFixed(3)}%`)

// How close does it get? Distribution of judged-camera counts.
const judgedHist = new Map()
for (const [code, rows] of byCode) {
  const times = [...new Set(rows.map(r => Date.parse(r.obs_time)))].sort((a, b) => a - b)
  for (const t of times) {
    const slice = rows.filter(r => {
      const d = Date.parse(r.obs_time)
      return d > t - WINDOW_MS && d <= t
    })
    if (!slice.length) continue
    const n = provinceLevel(slice).cams_judged
    judgedHist.set(n, (judgedHist.get(n) ?? 0) + 1)
  }
}
console.log('\njudged-camera count per province-window:')
for (const [n, c] of [...judgedHist].sort((a, b) => a[0] - b[0]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(3)} judged: ${String(c).padStart(7)} windows${n === 2 ? '   <-- exactly MIN_VALID' : ''}`)
}
db.close()