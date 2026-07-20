// The ONE rain-washout relief curve — every engine that turns a forecast or
// observed 24h rain amount into an expected PM2.5 reduction uses this mapping
// so the numbers agree across /api/washout, /api/danger, /api/forecast and
// /api/whatif.
//
// Anchors (below-cloud scavenging of accumulation-mode PM2.5, Henzing et al.
// 2006 Λ = a·R^b; Asian field studies summarised in knowledge/rain-washout.md):
//   1–5 mm   →  ~8%   reduction
//   5–15 mm  →  ~20%
//   15–35 mm →  ~30%
//   35+ mm   →  ~40%  (asymptote — sustained heavy rain scavenes no more
//                      than ~40% of the column in practice)
export function reliefPct(mm) {
  if (mm === null || !Number.isFinite(mm) || mm < 1) return 0
  if (mm < 5) return 8
  if (mm < 15) return 20
  if (mm < 35) return 30
  return 40
}

/** Same curve as a 0–0.40 fraction (for multiplicative score relief). */
export function reliefFraction(mm) {
  return reliefPct(mm) / 100
}
