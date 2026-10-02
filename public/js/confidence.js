// Assumed display ranges, not statistically calibrated confidence intervals.
// These fixed allowances are UI heuristics; their constants do not establish
// a source-specific measurement accuracy or a probability of coverage.

const RISK_SIGMA = 5                // 0-100 score, ±5 = ±1 band width
const FORECAST_REL_SIGMA = 0.35     // 35% of rain forecast
const PM25_REL_SIGMA = 0.08         // 8% monitor noise at ambient PM2.5
const RISE_SIGMA_REL = 0.30         // 30% of 6h PM2.5 rise

/** Wrap a number with an assumed display range. Returns a shape
 *  the UI can render: "value (lo–hi)" in the right language. */
export function ci(value, sigma, { unit = '', precision = null } = {}) {
  if (value == null || !Number.isFinite(value)) return { value: null, lo: null, hi: null, unit }
  const sig = Math.max(Math.abs(sigma ?? 0), 0)
  const lo = value - sig
  const hi = value + sig
  const prec = precision ?? autoPrecision(sig, value)
  return {
    calibrated: false, kind: 'assumed-range',
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
export function pm25Ci(ug)      { return ci(ug, Math.abs(ug) * PM25_REL_SIGMA, { unit: 'µg/m³', precision: 0 }) }
export function riseCi(ug)      { return ci(ug, Math.abs(ug) * RISE_SIGMA_REL, { unit: 'µg', precision: 0 }) }
