// What KIND of particles are in the air, from the spectral shape of AERONET
// aerosol optical depth.
//
// WHY THIS EXISTS. AirDash speaks PM2.5, and PM2.5 is a fine-particle measure.
// But the hazard people prepare for in Thailand is not one thing: the Dec–Apr
// dust season loads the air with COARSE mineral particles, while crop-residue
// burning and diesel put FINE particles there. The two need different
// precautions, and a PM2.5 number cannot tell them apart — a reading of 80 can
// be mostly fine smoke (stay in, close windows, a respirator works) or largely
// coarse dust (a respirator barely helps; the problem is eyes, laundry, cars
// and driving).
//
// AERONET measures optical depth at seven wavelengths and AirDash already
// stores all of them. The single most standard summary of that spectrum is the
// Ångström exponent, which has been the aerosol-size indicator since Ångström
// (1929): α is inversely related to particle size, so low α means coarse.
//
// WHAT IT MAY CLAIM, AND WHAT IT MAY NOT. Like everything else in this
// project, α is a QUALITATIVE size indicator, never a concentration. It is
// computed from a daily AERONET aggregate at a handful of stations, so it says
// what the air is made of, not how bad it is today, and not what it will be
// tomorrow. PM2.5 concentration still comes from the ground stations.
//
// Thresholds are taken from the literature rather than invented here:
//   · Eck et al. 1999 / Westphal & Toon 1991 / NASA Deep Blue: α ≲ 1 indicates
//     coarse-mode dominance (dust, sea salt); α ≳ 1 indicates fine-mode
//     dominance (urban pollution, biomass burning); α ≳ 2 is small-particle.
//   · Gkikas et al. 2021a use AE(440–870) ≤ 0.75 for near-pure dust.
//   · NASA Deep Blue and Bond et al. 2013 place biomass burning around 1.5+.
// The 440/675 pair is preferred over 440/500: the two-wavelength exponent is
// sensitive to fine-mode FRACTION on the long baseline, while 440/500 also
// responds to fine-mode effective radius and is noticeably noisier.

// ── physical gates ─────────────────────────────────────────────────────────
// Optical depth is dimensionless and cannot be negative. AERONET Level 2 marks
// unusable cells with sentinels, and this project was storing them as
// measurements: 154 rows carried aod_1020 = -999 and 4 carried aod_500 = -999,
// because the reader matched the literal string '-999.0' and nothing else.
// A negative optical depth is not a small error — it makes the log-ratio
// undefined and would invert the size reading.
export const AOD_MAX_PLAUSIBLE = 5   // τ beyond ~5 is a retrieval failure, not weather
export const PRECIPITABLE_WATER_MAX_CM = 10

/** Valid physical range for a stored measurement. Null means "no reading". */
export function validAod(v) {
  return Number.isFinite(v) && v >= 0 && v <= AOD_MAX_PLAUSIBLE ? v : null
}

/**
 * Ångström exponent for two (optical depth, wavelength) pairs.
 * α = −ln(τ₁/τ₂) / ln(λ₁/λ₂)     (Ångström, 1929)
 *
 * The denominator's sign is the whole ballgame: written as ln(λ₂/λ₁) it comes
 * out NEGATIVE for every real aerosol and flips a fine/mixed reading into a
 * dust reading. I made that mistake while building this and the live data
 * caught it — aod_440 > aod_500 is normal (blue scatters more), so α must be
 * positive. There is a check for that below because the sign error is silent.
 */
export function angstrom(tau1, lam1, tau2, lam2) {
  const t1 = validAod(tau1), t2 = validAod(tau2)
  if (t1 === null || t2 === null) return null
  if (!(t1 > 0 && t2 > 0)) return null
  if (!(lam1 > 0 && lam2 > 0) || lam1 === lam2) return null
  const alpha = -Math.log(t1 / t2) / Math.log(lam1 / lam2)
  return Number.isFinite(alpha) ? alpha : null
}

/** Size mode from α. Bands are inclusive-low, exclusive-high, except the top. */
export const SIZE_MODE = {
  COARSE_MAX: 0.8,   // ≤ 0.75 is near-pure dust (Gkikas et al. 2021a)
  MIXED_MAX: 1.5,    // > 1 is fine-dominant (Eck 1999, Deep Blue); 1.5 ≈ biomass (Bond 2013)
}

/**
 * Coarse / mixed / fine, or null when α is missing or unphysical.
 * A negative α means AOD rose with wavelength, which real fine-mode and
 * coarse-mode aerosols do not do over 440–675 nm; treat it as unusable rather
 * than sorting it into "coarse", which is where a sign slip would put it.
 */
export function sizeMode(alpha) {
  if (!Number.isFinite(alpha)) return null
  if (alpha < 0) return null
  if (alpha <= SIZE_MODE.COARSE_MAX) return 'coarse'
  if (alpha <= SIZE_MODE.MIXED_MAX) return 'mixed'
  return 'fine'
}

// Minimum optical depth before α is reported at all. Below this the
// log-ratio is dominated by retrieval noise. Chosen from this project's own
// stored distribution rather than a rule of thumb: AERONET AOD_500 here runs
// p10 = 0.11, median 0.19, so a 0.05 floor keeps 100% of the real record and
// only rejects the invalid cells. Reported alongside the alpha so a reader can
// see when it was withheld.
export const AOD_ALPHA_FLOOR = 0.05

/**
 * The full aerosol picture for one AERONET row.
 * Pure. Returns null-safe output: every field is either a real number or null,
 * never NaN, because NaN reaching a chart is how a series silently vanishes.
 */
export function aerosolProfile(row = {}) {
  const aod440 = validAod(row.aod_440)
  const aod500 = validAod(row.aod_500)
  const aod675 = validAod(row.aod_675)
  const aod870 = validAod(row.aod_870)

  // Reported even when the α floor is not met: AOD is what "how much" means,
  // and it is valid on its own.
  const load = aod500 ?? aod440

  const floorMet = aod500 !== null && aod500 >= AOD_ALPHA_FLOOR

  // Long baseline first: it is the one sensitive to fine-mode fraction.
  const alpha675 = angstrom(aod440, 440, aod675, 675)
  const alpha870 = angstrom(aod440, 440, aod870, 870)
  const alpha500 = angstrom(aod440, 440, aod500, 500)

  // The primary is the first pair that exists, longest baseline preferred.
  const alpha = alpha675 ?? alpha870 ?? alpha500
  const alpha_pair = alpha675 !== null ? '440/675'
    : alpha870 !== null ? '440/870'
      : alpha500 !== null ? '440/500' : null

  // Curvature: the literature is explicit that a two-wavelength α depends on
  // which pair you pick, and that the disagreement is itself a size signal
  // (fine mode has negative spectral curvature, coarse positive). Publishing
  // the spread means a reader can see when a single α is being asked to carry
  // too much, instead of trusting a number that is really a range.
  const pairs = [alpha675, alpha870, alpha500].filter(Number.isFinite)
  const spread = pairs.length > 1 ? Math.max(...pairs) - Math.min(...pairs) : null

  const withheld = !floorMet
    ? (aod500 === null ? 'no optical depth' : 'optical depth too thin for a size reading')
    : null

  return {
    aod_440: aod440, aod_500: aod500, aod_675: aod675, aod_870: aod870,
    load: load === null ? null : Math.round(load * 1000) / 1000,
    alpha: alpha === null ? null : Math.round(alpha * 100) / 100,
    alpha_pair: alpha_pair,
    alpha_spread: spread === null ? null : Math.round(spread * 100) / 100,
    mode: withheld ? null : sizeMode(alpha),
    // Stated on every result so no caller can mistake α for a concentration.
    calibrated: false,
    kind: 'qualitative particle size, not a concentration',
    withheld,
  }
}

/**
 * What to do about it, given the size mode. Bilingual, and deliberately
 * qualitative: this routes the reader to precautions that differ by particle
 * size, never to a number it did not measure.
 */
export const MODE_GUIDANCE = {
  coarse: {
    th: 'อนุภาคเกือบหนา — ฝุ่นดิน/ทราย',
    en: 'Coarse particles — mineral dust',
    act_th: 'ฝุ่นหยาบจะไม่ผ่านหน้ากาก แต่จะรบกวนตา คอ และจมูกมาก — ปิดหน้าต่างรถเวลาขับ คลุมรถ/ตากรั้งให้เสร็จก่อนฝุ่นมา และล้างตาถ้ารู้สึกร้อน',
    act_en: 'Coarse dust does not reach deep into the lungs, but it irritates eyes, throat and nose hard. Close the car windows while driving, get laundry and anything drying outside in before it arrives, and rinse your eyes if they sting. A PM2.5 respirator does little against particles this size.',
  },
  mixed: {
    th: 'อนุภาคผสม — ทั้งฝุ่นละเอียดและหยาบ',
    en: 'Mixed particles — fine and coarse together',
    act_th: 'มีทั้งสองชนิด — ทำตามข้อคำแนะนำฝุ่นละเอียด (ปิดหน้าต่าง ใช้เครื่องฟอกอากาศ หรือหน้ากาก N95) และปิดหน้าต่างรถ/เก็บผ้าให้เรียบร้อยด้วย',
    act_en: 'Both sizes are present — use the fine-particle precautions (close windows, run an air cleaner or wear an N95) AND the outdoor ones (car windows, laundry, dust on surfaces).',
  },
  fine: {
    th: 'อนุภาคละเอียด — ควัน/การเผาไหม้',
    en: 'Fine particles — smoke and combustion',
    act_th: 'อนุภาคเล็กลงลึกถึงปอดได้ — ปิดหน้าต่างเมื่ออากาศนอกแย่กว่า ใช้เครื่องฟอกอากาศ HEPA และหน้ากาก N95/FFP2 ช่วยได้จริง คนที่เป็นโรคหืด/ปอดอ่อนไหวควรลดการออกนอก',
    act_en: 'Small particles reach deep into the lungs. Close windows when outside is worse, run a HEPA air cleaner, and an N95/FFP2 respirator genuinely helps. People with asthma or COPD should cut back on time outdoors.',
  },
}

/** Guidance for a profile, or null when the size could not be established. */
export function guidanceFor(profile) {
  const m = profile?.mode
  return m ? MODE_GUIDANCE[m] : null
}

/**
 * The national aerosol picture, for engines that need one mode rather than
 * five stations. AERONET has no per-province coverage, so this is explicitly a
 * NATIONAL signal and callers must treat it as such — it is not a per-province
 * measurement and must never be presented as one.
 *
 * Picks the station reporting the most aerosol, which in a dust episode is the
 * one the episode actually reached. Returns `{ mode: null, ... }` when nothing
 * usable is stored, so callers fall back to their conservative default rather
 * than reading a mode that was never measured.
 */
export function dominantAerosol(db, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const rows = db.all(
    `SELECT station, ts, aod_440, aod_500, aod_675, aod_870, aod_1020
       FROM aeronet_readings WHERE ts >= ? ORDER BY station, ts DESC`, since)
  const latest = new Map()
  for (const r of rows) if (!latest.has(r.station)) latest.set(r.station, r)
  let best = null
  for (const r of latest.values()) {
    const p = aerosolProfile(r)
    if (p.mode == null || p.load == null) continue
    if (!best || p.load > best.load) best = { station: r.station, load: p.load, mode: p.mode, alpha: p.alpha }
  }
  if (!best) return { mode: null, alpha: null, load: null, station: null, age_h: null, reason: 'no usable aerosol reading in the window' }
  const newest = rows.reduce((m, r) => (r.ts > m ? r.ts : m), '')
  return { ...best, age_h: newest ? Math.round((Date.now() - Date.parse(newest)) / 3600_000) : null }
}

export const AEROSOL_METHOD = {
  th: 'ขนาดอนุภาคเชิงคุณภาพจากรูปร่างสเปกตรัม AERONET (Ångström exponent α) — ฝุ่นหยาบต่ำกว่า 0.8, ผสม 0.8–1.5, ฝุ่นละเอียดสูงกว่า 1.5 · ไม่ใช่ค่าความเข้มข้น µg/m³',
  en: 'Qualitative particle size from the AERONET spectral shape (Ångström exponent α): coarse below 0.8, mixed 0.8–1.5, fine above 1.5. Not a µg/m³ concentration — the ground stations give the concentration.',
  refs: ['Ångström 1929', 'Eck et al. 1999', 'Westphal & Toon 1991', 'NASA Deep Blue', 'Gkikas et al. 2021a (AE(440–870) ≤ 0.75 for near-pure dust)', 'Bond et al. 2013'],
  caution: 'A daily aggregate at a handful of stations. It says what the air is made of, not how bad it is today. Values below the AOD floor are withheld rather than guessed.',
}