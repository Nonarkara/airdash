// Confidence intervals — calibrated uncertainty for every number on the
// dashboard. A citizen seeing "76/100 ACT NOW" who finds out later it was
// 71 should not conclude "the dashboard lies." A ±5 next to the number
// costs nothing and earns
// decades of credibility.
//
// Calibration: from empirical data we have available.
//   - risk score: ±5 (heuristic — bands are 30/40 wide; ±5 is the
//     practical noise floor from sensor drift + rounding)
//   - rain forecast 48h: ±35% of value (Open-Meteo typical 24-48h
//     forecast RMSE for Thailand is in this range)
//   - water level (m MSL): sensor accuracy is ~5cm; show ±0.05m
//   - rise rate (m/6h): ±30% (computed from 2 readings, propagates
//     the sensor noise)
//   - shelter capacity: trust the source (no ±)
//
// Format: every helper returns { value, lo, hi, label } so the caller
// can render either a tight `76 (±5)` or a wide `47 mm (±16)` depending
// on the relative uncertainty.

const RISK_SIGMA = 5                // 0-100 score, ±5 = ±1 band width
const FORECAST_REL_SIGMA = 0.35     // 35% of rain forecast
const WL_SIGMA_M = 0.05             // 5cm sensor noise
const RISE_SIGMA_REL = 0.30         // 30% of rise

/** Wrap a number with a 1-sigma confidence interval. Returns a shape
 *  the UI can render: "value (lo–hi)" in the right language. */
export function ci(value, sigma, { unit = '', precision = null } = {}) {
  if (value == null || !Number.isFinite(value)) return { value: null, lo: null, hi: null, unit }
  const sig = Math.max(Math.abs(sigma ?? 0), 0)
  const lo = value - sig
  const hi = value + sig
  const prec = precision ?? autoPrecision(sig, value)
  return {
    value: round(value, prec),
    lo: round(lo, prec),
    hi: round(hi, prec),
    sigma: round(sig, prec),
    unit,
    precision: prec,
    /** Returns a small "±N" suffix, e.g. "76 (±5)" or "47 mm (±16 mm)". */
    suffix: sig > 0 ? `±${round(sig, prec)}${unit ? ' ' + unit : ''}` : '',
    /** Returns a tight range "(71–81)" for tooltips / hover. */
    range: sig > 0 ? `(${round(lo, prec)}–${round(hi, prec)})` : '',
  }
}

function autoPrecision(sigma, value) {
  if (sigma >= 10) return 0
  if (sigma >= 1) return 1
  if (sigma >= 0.1) return 2
  return 1
}
function round(n, p) {
  const k = 10 ** p
  return Math.round(n * k) / k
}

// ── Specialised helpers (per-metric) ────────────────────────────────────
export function riskCi(score)   { return ci(score, RISK_SIGMA, { precision: 0 }) }
export function forecastCi(mm)  { return ci(mm, Math.abs(mm) * FORECAST_REL_SIGMA, { unit: 'mm', precision: 0 }) }
export function waterCi(m)      { return ci(m, WL_SIGMA_M, { unit: 'm', precision: 2 }) }
export function riseCi(m)       { return ci(m, Math.abs(m) * RISE_SIGMA_REL, { unit: 'm', precision: 2 }) }
