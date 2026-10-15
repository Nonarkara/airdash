// Read-only probe: is the per-camera haze baseline contaminated by frames
// already judged possible-haze?
//
// assessHaze (server/vision/hazeSignal.js:38) admits rows whose haze_status
// includes 'possible-haze' into the reference pool. If hazy frames enter the
// pool, the reference contrast falls, the measured loss shrinks, and a
// continuing haze event can flip back to 'unchanged'. Read-only.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })

const since = new Date(Date.now() - 14 * 86400_000).toISOString()
console.log(`baseline window: ${since} -> now\n`)

// Per-camera composition of the pool assessHaze would accept.
const comp = db.prepare(`
  SELECT camera_key,
         COUNT(*) pool,
         SUM(CASE WHEN haze_status='possible-haze' THEN 1 ELSE 0 END) hazy,
         SUM(CASE WHEN haze_status='unchanged'    THEN 1 ELSE 0 END) clear,
         SUM(CASE WHEN haze_status='changed-view' THEN 1 ELSE 0 END) changed,
         SUM(CASE WHEN haze_status='baseline-needed' THEN 1 ELSE 0 END) need
    FROM cctv_haze_frames
   WHERE obs_time >= ? AND haze_status IN ('baseline-needed','unchanged','possible-haze','changed-view')
   GROUP BY camera_key HAVING pool >= 3`).all(since)

const tot = comp.length
const contaminated = comp.filter(c => c.hazy / c.pool >= 0.5).length
console.log(`cameras with an eligible pool (>=3): ${tot}`)
console.log(`  >=50% of pool already judged possible-haze: ${contaminated} (${(contaminated/Math.max(1,tot)*100).toFixed(0)}%)`)
console.log(`  any hazy frame in pool:                       ${comp.filter(c=>c.hazy>0).length}\n`)

// Did any camera flip possible-haze -> unchanged while its contrast kept FALLING?
// That is the concrete symptom of a drifting baseline.
const flips = db.prepare(`
  SELECT a.camera_key, a.obs_time hazy_at, a.contrast hazy_c,
         b.obs_time unchanged_at, b.contrast unchanged_c
    FROM cctv_haze_frames a
    JOIN cctv_haze_frames b
      ON b.camera_key = a.camera_key
     AND b.haze_status = 'unchanged'
     AND b.obs_time > a.obs_time
   WHERE a.haze_status = 'possible-haze'
     AND a.obs_time >= ?
   ORDER BY a.camera_key, b.obs_time`).all(since)

// Keep only the FIRST unchanged row after each hazy row.
const byCam = new Map()
for (const r of flips) if (!byCam.has(r.camera_key)) byCam.set(r.camera_key, r)
console.log(`cameras that reported possible-haze then later reported unchanged:`)
console.log(`  ${byCam.size}`)

const regressions = [...byCam.values()].filter(r => r.unchanged_c < r.hazy_c)
console.log(`  ...of which the later 'unchanged' frame had LOWER contrast than the hazy one: ${regressions.length}`)
if (regressions.length) {
  console.log('\n  worst five (largest contrast drop while claiming no haze):')
  for (const r of regressions
    .map(r => ({ ...r, drop: (r.hazy_c - r.unchanged_c) / r.hazy_c }))
    .sort((a, b) => b.drop - a.drop).slice(0, 5)) {
    console.log(`    ${r.camera_key}  contrast ${r.hazy_c.toFixed(2)} -> ${r.unchanged_c.toFixed(2)}` +
      ` (-${(r.drop*100).toFixed(0)}%)  at ${r.unchanged_at}`)
  }
}
db.close()