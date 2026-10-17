// Read-only: what does the stored AERONET AOD actually look like?
// Needed before choosing any confidence floor for the Angstrom exponent —
// the literature is clear that alpha becomes unstable at low turbidity, so a
// floor has to come from this project's own distribution, not a guess.
import { DatabaseSync } from 'node:sqlite'
import { CONFIG } from '../server/config.js'

const db = new DatabaseSync(CONFIG.dbPath, { readOnly: true })
const rows = db.prepare(
  `SELECT station, ts, aod_440, aod_500, aod_675, aod_870, aod_1020
     FROM aeronet_readings WHERE aod_440 IS NOT NULL AND aod_500 IS NOT NULL
    ORDER BY ts DESC LIMIT 4000`).all()

console.log(`rows with both 440 and 500: ${rows.length}`)
const a500 = rows.map(r => r.aod_500).filter(Number.isFinite).sort((a, b) => a - b)
const pct = (p) => a500[Math.min(a500.length - 1, Math.floor(a500.length * p))]
console.log(`aod_500 distribution: min=${a500[0]?.toFixed(4)} p10=${pct(0.1)?.toFixed(4)} ` +
  `p25=${pct(0.25)?.toFixed(4)} median=${pct(0.5)?.toFixed(4)} p75=${pct(0.75)?.toFixed(4)} max=${a500.at(-1)?.toFixed(4)}`)

for (const floor of [0.02, 0.05, 0.08, 0.10, 0.15]) {
  const keep = rows.filter(r => r.aod_500 >= floor).length
  console.log(`  floor aod_500 >= ${floor.toFixed(2)}: keeps ${keep}/${rows.length} (${(keep / rows.length * 100).toFixed(0)}%)`)
}

// Per-band alpha spread: how much do the three pairs disagree? A wide spread
// means curvature is present and a single alpha would mislead.
const alpha = (t1, l1, t2, l2) =>
  (t1 > 0 && t2 > 0 && l1 !== l2) ? -Math.log(t1 / t2) / Math.log(l1 / l2) : null

const spreads = []
for (const r of rows) {
  if (!(r.aod_500 >= 0.05)) continue
  const a1 = alpha(r.aod_440, 440, r.aod_500, 500)
  const a2 = alpha(r.aod_440, 440, r.aod_675, 675)
  const a3 = alpha(r.aod_440, 440, r.aod_870, 870)
  if ([a1, a2, a3].every(Number.isFinite)) spreads.push(Math.max(a1, a2, a3) - Math.min(a1, a2, a3))
}
spreads.sort((a, b) => a - b)
console.log(`\nalpha spread across the three 440-based pairs (aod_500 >= 0.05, n=${spreads.length}):`)
console.log(`  median=${spreads[Math.floor(spreads.length / 2)]?.toFixed(3)}  p90=${spreads[Math.floor(spreads.length * 0.9)]?.toFixed(3)}  max=${spreads.at(-1)?.toFixed(3)}`)

// Which band pair separates the most? (Longer baseline is less noisy.)
const byPair = [[440, 500], [440, 675], [440, 870]].map(([l1, l2]) => {
  const vals = rows.filter(r => r.aod_500 >= 0.05)
    .map(r => alpha(r[`aod_${l1}`], l1, r[`aod_${l2}`], l2)).filter(Number.isFinite)
  const neg = vals.filter(v => v < 0).length
  return { pair: `${l1}/${l2}`, n: vals.length, mean: vals.reduce((a, b) => a + b, 0) / vals.length, negatives: neg }
})
console.log('\nper-pair alpha at the 0.05 floor:')
for (const p of byPair) console.log(`  ${p.pair}: n=${p.n} mean=${p.mean.toFixed(2)} negative=${p.negatives} (${(p.negatives / p.n * 100).toFixed(0)}%)`)

// Coverage: which stations actually report, and how recently.
console.log('\nstations and their last reading:')
for (const s of db.prepare(
  `SELECT station, MAX(ts) last_ts, COUNT(*) n FROM aeronet_readings GROUP BY station ORDER BY last_ts DESC`).all()) {
  const ageH = ((Date.now() - Date.parse(s.last_ts)) / 36e5).toFixed(0)
  console.log(`  ${String(s.station).padEnd(26)} last=${String(s.last_ts).slice(0, 16)} (${ageH}h ago)  rows=${s.n}`)
}
db.close()