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
//
// ── SIZE MATTERS, AND THIS CURVE DID NOT KNOW IT (2026-10-17) ──────────────
// Every number above is accumulation-mode PM2.5. That is the WORST size for
// below-cloud removal: the "Greenfield gap" spans roughly 200–2000 nm, which
// is most of PM2.5, and inside it capture efficiency is low. Coarse particles
// sit outside it and are removed by inertial impaction and interception,
// which do not have that weakness — so they wash out markedly better:
//
//   · ACP 23, 7521 (2023): below-cloud mechanisms are size-dependent; "weak
//     below-cloud wet scavenging in the 200–2000 nm size range, which is the
//     so-called Greenfield gap"; for coarse-mode aerosols inertial impaction
//     and interception are the MAIN removal mechanism.
//   · ACP 21, 16797 (2021): the scavenging coefficient "varies strongly with
//     aerosol particle size, with the lowest values for aerosols in the
//     accumulation mode".
//   · Seoul, ~7 years of disdrometer data: "PM2.5−10 is more effectively
//     scavenged than PM2.5".
//   · Zhang & Vet (2006), via Tellus B: the size influence on wet deposition
//     "can reach up to several orders of magnitude".
//
// So during a DUST episode the 40% ceiling below is wrong in the conservative
// direction: rain is clearing more than the curve says, and the dashboard
// understates relief in exactly the season when relief is the whole question.
// The aerosol module (server/aerosol.js) now reads the Ångström exponent and
// can tell coarse from fine, so the curve can be told.
//
// HONESTY NOTE ON THE COARSE CONSTANT. Unlike the fine curve, COARSE_ASCENT is
// NOT a locally calibrated coefficient — AirDash has no PM10 instrument to fit
// against. It is an order-of-magnitude-informed, deliberately CONSERVATIVE
// adjustment of the same shape, not a measured one. It is reported alongside
// the fine figure wherever it applies, and `curve_basis` says which one a
// reader is looking at, so nobody has to guess which curve produced a number.
// Do not tighten it without a real coarse-fraction measurement to fit.
const FINE_ASCENT = 40
const COARSE_ASCENT = 60

/** The four anchor steps for a given asymptote, preserving the published shape. */
function ascentCurve(mm, ascent) {
  if (mm === null || !Number.isFinite(mm) || mm < 1) return 0
  if (mm < 5) return Math.round(ascent * 0.2)    // 8%  of 40
  if (mm < 15) return Math.round(ascent * 0.5)   // 20% of 40
  if (mm < 35) return Math.round(ascent * 0.75)  // 30% of 40
  return ascent
}

/**
 * Expected PM2.5 reduction (%) if the forecast rain amount actually falls.
 *
 * @param mm          24h rain total. null/undefined means "no forecast", which
 *                    is NOT zero rain — it returns 0 and callers must say so.
 * @param mode        aerosol size mode from server/aerosol.js: 'coarse' | 'mixed' | 'fine'.
 *                    Omitting it (or any unknown value) keeps the published
 *                    accumulation-mode curve EXACTLY as it was, so no existing
 *                    caller changes behaviour by accident.
 */
export function reliefPct(mm, mode) {
  return ascentCurve(mm, mode === 'coarse' ? COARSE_ASCENT : FINE_ASCENT)
}

/** Which curve produced a number — published so a reader never has to guess. */
export function reliefCurveBasis(mode) {
  return mode === 'coarse' ? 'coarse-elevated' : 'fine-published'
}

/** The ceiling, so the UI can say "even heavy rain leaves X% behind". */
export function reliefCeilingPct(mode) {
  return mode === 'coarse' ? COARSE_ASCENT : FINE_ASCENT
}

/** Same curve as a 0–0.40 fraction (for multiplicative score relief). */
export function reliefFraction(mm, mode) {
  return reliefPct(mm, mode) / 100
}
