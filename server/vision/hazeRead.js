// Reading haze out of a single CCTV frame — pure functions, zero dependencies.
//
// WHY THIS IS NOT A DEEP LEARNING MODEL
// -------------------------------------
// It would be easy to reach for a trained dehazing network here. That would be
// the wrong first move, for a reason worth writing down: a dehazing network is
// trained to make a PICTURE look better, and we already have a number —
// PM2.5 from the ground station the camera is paired with. Spending a 16 GB
// Mac's entire inference budget to reconstruct an image whose haze content we
// can measure directly would buy nothing and cost a lot.
//
// What the CV literature actually offers is a set of PHYSICAL estimators that
// turn a frame into an extinction coefficient, and every one of them rests on
// the same measurable fact: light that scatters off a surface loses contrast
// with distance, exponentially, at a rate set by the atmosphere.
//
//   Koschmieder (1924)   C(x) = C0 · e^(−β·x)
//   Babari et al. (2011) measured this on TRAFFIC SURVEILLANCE CAMERAS
//                        specifically — mean Sobel gradient as contrast, then
//                        fit C(V) = a/(1 + b/V) + c and invert it.
//   Minnesota DOT (1998) used EDGE DECAY instead of contrast: measure how far
//                        along the line of sight edges survive, that distance
//                        IS the visibility.
//   He et al. (2009)     the dark channel prior — the reason every dehazing
//                        network exists — is itself a classical estimator, not
//                        a learned one.
//
// So the honest v1 is the classical estimators, done carefully, producing a
// NUMBER. A learned refinement is a later question, and should only be
// justified by beating this on real paired data (see readFrame below).
//
// WHAT WE DELIBERATELY DO NOT CLAIM
// ----------------------------------
// Absolute visibility in kilometres requires knowing the path length x, and
// nobody publishes the geometry of 1,385 municipal cameras. We therefore emit
// a RELATIVE haze index calibrated per camera against its paired PM2.5
// station — which is measurable — and we do NOT emit "visibility = 4.2 km"
// unless a path length is supplied. An uncalibrated kilometre figure would be
// a fabricated number on a public-health dashboard, and the operator does not
// ship those.
//
// PURE. No I/O, no ffmpeg, no clock. Everything here is testable with a
// synthetic buffer, which is what the test suite does.

// ── frame geometry ───────────────────────────────────────────────────────────
export const FRAME_W = 320
export const FRAME_H = 180
export const FRAME_BYTES = FRAME_W * FRAME_H * 3 // rgb24

// Sky is the top strip. Road is the bottom strip. Both are used as reference
// regions, because the trick in every one of these estimators is comparing
// something against something KNOWN — and sky and road are the two things in
// a road camera that are not the subject.
const SKY_ROWS = Math.round(FRAME_H * 0.28)
const ROAD_ROWS = Math.round(FRAME_H * 0.22)

// CIE / WMO contrast threshold: the fraction of inherent contrast a black
// object retains when it is just barely visible. 5% is the meteorological
// definition; we use it as the constant in Koschmieder.
export const KOSCHMIEDER_C = 0.05

/** Build a frame buffer filled with one RGB colour. Test helper. */
export function solidFrame(r, g, b) {
  const buf = Buffer.alloc(FRAME_BYTES)
  for (let i = 0; i < FRAME_BYTES; i += 3) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b }
  return buf
}

/** Luma of one pixel, Rec. 601 weights. */
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/**
 * Sobel gradient magnitude over the whole frame, plus the edge-density
 * (fraction of pixels whose gradient clears a threshold) and the per-row mean
 * gradient, which is what the edge-decay method walks.
 *
 * The per-row array matters more than it looks: edge decay is a property of
 * the LINE OF SIGHT, and in a road camera the line of sight runs from the
 * bottom of the frame (near road) to the horizon (a row in the upper-middle).
 * Averaging the whole frame throws that away; keeping per-row means a caller
 * can ask "how far up the image do edges still exist".
 */
export function sobelField(buf) {
  const { FRAME_W: w, FRAME_H: h } = { FRAME_W, FRAME_H }
  const field = new Float32Array(w * h)
  const rowMean = new Float32Array(h)
  let sum = 0
  let edges = 0
  // Sobel kernel response, normalised so a full 0→255 step gives 1020.
  for (let y = 1; y < h - 1; y++) {
    let rowSum = 0
    for (let x = 1; x < w - 1; x++) {
      const at = (xx, yy) => {
        const i = (yy * w + xx) * 3
        return luma(buf[i], buf[i + 1], buf[i + 2])
      }
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1)
      const ml = at(x - 1, y), mr = at(x + 1, y)
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1)
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr)
      const mag = Math.sqrt(gx * gx + gy * gy) / 1020
      field[y * w + x] = mag
      rowSum += mag
      sum += mag
      if (mag > 0.06) edges++
    }
    rowMean[y] = rowSum / (w - 2)
  }
  const n = (w - 2) * (h - 2)
  return {
    field,
    rowMean,
    meanContrast: sum / n,   // 0..1 — this is Babari's C
    edgeDensity: edges / n,  // 0..1 — fraction of pixels that still have an edge
  }
}

/**
 * The dark channel prior (He et al., CVPR 2009) restricted to the LOWER
 * frame, which is the non-sky region the paper actually specifies. Returns
 * { dark, transmission } where transmission is the estimated fraction of
 * light reaching the sensor, 0..1, using the paper's ω = 0.95.
 */
export function darkChannel(buf, { omega = 0.95, patch = 5 } = {}) {
  const w = FRAME_W, h = FRAME_H
  const r = Math.max(1, patch >> 1)
  const yStart = SKY_ROWS
  let sum = 0
  let n = 0
  let tSum = 0
  for (let y = yStart; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // min over the patch, per channel, then min across channels
      let mn = 255
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy
        if (yy < yStart || yy >= h) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const i = (yy * w + xx) * 3
          const m = buf[i] < buf[i + 1] ? buf[i] : buf[i + 1]
          if (m < mn) mn = m
        }
      }
      sum += mn
      n++
      // t = 1 - ω·(dark/I), I = 255 nominal. Clamped to keep log() finite.
      const t = 1 - omega * (mn / 255)
      tSum += t > 0.01 ? Math.log(Math.max(t, 0.01)) : Math.log(0.01)
    }
  }
  const dark = n ? sum / n / 255 : 0
  // mean log-transmittance → geometric-mean transmittance
  const transmission = n ? Math.exp(tSum / n) : 1
  return { dark, transmission }
}

/**
 * Colour statistics that separate the two things a citizen actually needs
 * told apart, which look identical as "haze" but mean opposite things:
 *
 *   BIOMASS SMOKE  — brown/yellow-grey, saturated-ish, absorbs blue strongly
 *                    (the tint of combustion products), so blue drops relative
 *                    to red.
 *   HUMIDITY FOG   — white, desaturated, near-neutral, and crucially
 *                    LOW-CONTRAST with a hard horizon that does not move.
 *
 * Saturation and the red-minus-blue channel difference are the cheap
 * discriminators; they are not a classifier and are not sold as one. They are
 * a flag that says "this haze is tinted, so go and check the fire/smoke
 * layers before attributing it to weather".
 */
export function chromaStats(buf) {
  const w = FRAME_W, h = FRAME_H
  let satSum = 0
  let rbSum = 0
  let lumaSum = 0
  let n = 0
  let skyLuma = 0
  let skyN = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const r = buf[i], g = buf[i + 1], b = buf[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx > 8) { satSum += (mx - mn) / mx; n++ }
      rbSum += (r - b) / 255
      const L = luma(r, g, b)
      lumaSum += L
      if (y < SKY_ROWS) { skyLuma += L; skyN++ }
    }
  }
  const total = w * h
  return {
    saturation: n ? satSum / n : 0,          // 0..1
    warmBias: rbSum / total,                  // ~0 neutral; >0.02 warm/smoke; <0 cool
    meanLuma: lumaSum / total,                // 0..255
    skyLuma: skyN ? skyLuma / skyN : 0,       // 0..255
  }
}

/**
 * Edge decay along the vertical axis: how far up the frame (i.e. how far away
 * along the line of sight) do detectable edges survive?
 *
 * IMPORTANT — a bug this file was written to avoid, worth recording because
 * the naive version fails here and fails silently:
 *
 * The obvious implementation sets the detection threshold as a FRACTION of the
 * near-road baseline edge energy. That is self-referencing, and airlight
 * breaks it: haze raises the floor everywhere, so the near baseline shrinks
 * AND the threshold shrinks with it, and distant rows that were genuinely
 * below the noise floor sail past the now-lower bar. The result is edge
 * "decay" that INCREASES as haze gets worse — exactly backwards, and only
 * visible when you plot it against a known beta. Hence the ABSOLUTE gradient
 * floor below, calibrated in luma-gradient units, not a ratio.
 *
 * Returns the horizon row — the highest row whose edge content clears the
 * floor — and the fraction of rows that carry an edge at all.
 */
// Calibrated by measurement, not by picking a round number. 0.02 was the
// first guess and it was wrong by roughly 4x: it silenced the corridor
// detector on every frame tested, because a road surface viewed from above is
// genuinely almost textureless in the mid-corridor. Measured edge energy in
// the corridor band runs ~0.006 (smooth asphalt) to ~0.08 (lane markings
// under low sun) on this project's live streams.
export const EDGE_ABS_FLOOR = 0.005

// The composite's value on a perfectly CLEAR frame (beta = 0, no airlight).
// Measured, not assumed — see the use in readFrame. Without subtracting it,
// every clear frame scores ~50 and the number is measuring the scene, not
// the air.
export const HAZE_FLOOR = 0.51

export function edgeDecay(rowMean) {
  const h = FRAME_H
  const nearStart = h - ROAD_ROWS
  let base = 0
  for (let y = nearStart; y < h; y++) base += rowMean[y]
  base /= ROAD_ROWS
  // Use max(floor, small fraction of baseline) — the floor is the real
  // detector; the fraction only adapts to very high-contrast scenes, and is
  // clamped so it can never drop below the absolute floor.
  const thresh = Math.max(EDGE_ABS_FLOOR, base * 0.10)
  let horizon = 0
  let rows = 0
  for (let y = h - 1; y >= 1; y--) {
    if (rowMean[y] > thresh) { horizon = y; rows++ }
  }
  return {
    horizonRow: horizon,
    decayFraction: rows / h,   // 0..1 — larger means edges survive further
    baseline: base,
    threshold: thresh,
  }
}

/**
 * THE PRIMARY ESTIMATOR — contrast decay along a line of sight.
 *
 * ── the version that does not work, and why ──────────────────────────────
 * The obvious design is "compare edge energy in the near strip against the far
 * strip, the ratio goes to 1 as haze increases". That is sound physics and it
 * is WRONG for a road camera, for a reason worth recording because it looks
 * right until you check it against real frames:
 *
 * It assumes the same CONTENT at both distances. A road camera does not have
 * that. The bottom of the frame is ASPHALT — smooth, few edges, regardless of
 * the weather. The band near the horizon is treeline, shophouses, a skyline,
 * or cloud — full of edges, regardless of the weather. So far/near sits above
 * 1.0 on a perfectly clear day, the "ratio" is measuring SCENE CONTENT rather
 * than ATMOSPHERE, and it happily returns 1.0 (= maximally hazy) for a camera
 * pointing at a clear treeline. Measured on this project's live streams, 5 of
 * 6 frames returned a saturated ratio of exactly 1.0 — the estimator was
 * reporting "the sky has clouds", not "there is smoke".
 *
 * ── the version that does work ──────────────────────────────────────────
 * Keep the physics, fix the content assumption. A road camera looks DOWN A
 * ROAD, and the road surface is a continuous, self-similar feature running
 * from the bottom of the frame to the horizon: lane markings, the road
 * centre, the road EDGE against the shoulder. The same kind of object appears
 * at every distance from the camera, so edge energy measured in a narrow
 * centre corridor genuinely does decay with path length — and the rate it
 * decays at is set by the atmosphere plus perspective.
 *
 * Perspective alone produces a steep falloff. Haze flattens it, because
 * atmospheric scattering adds a floor of light that stops contrast from ever
 * reaching zero. So the shape of the decay profile, not its absolute slope,
 * is the haze signal: clear air drives the profile toward zero by the
 * horizon; haze holds it up.
 *
 * `corridorDecay` returns the per-row profile plus the fraction of the first
 * row's energy still present at the far end of the corridor. That tail ratio
 * is the feature; the perspective geometry cancels out of it because both
 * ends of the corridor are the same kind of object.
 */
export function corridorDecay(rowMean) {
  const h = FRAME_H
  // The corridor: the band between the near road and the horizon. Starts just
  // above the near strip and ends just below the sky band.
  const start = Math.round(FRAME_H * 0.30)
  const end = SKY_ROWS + Math.round(FRAME_H * 0.12)
  const profile = []
  for (let y = start; y < end; y++) profile.push(rowMean[y])
  if (profile.length < 4) return { ok: false, profile: [], tailRatio: null, head: 0 }
  const head = profile[0]
  // Tail: mean of the last third of the corridor.
  const tailSlice = profile.slice(-Math.max(2, Math.floor(profile.length / 3)))
  const tail = tailSlice.reduce((a, b) => a + b, 0) / tailSlice.length
  if (head < EDGE_ABS_FLOOR) return { ok: false, profile, tailRatio: null, head }
  const tailRatio = Math.max(0, Math.min(1, tail / head))
  return { ok: true, profile, tailRatio, head, tail }
}

/**
 * The composite read. Everything above is a feature; this is the score.
 *
 * hazeIndex 0..100 is a RELATIVE measure, calibrated per camera against its
 * paired PM2.5 station (see calibrateAgainstPm25). It is explicitly not a
 * visibility in kilometres.
 *
 * `tintHint` is the smoke/fog nudge described in chromaStats: 'smoke-like',
 * 'fog-like' or null when the frame is too clean to say.
 */
export function readFrame(buf) {
  if (!buf || buf.length < FRAME_BYTES) {
    return { ok: false, error: `need ${FRAME_BYTES} bytes of rgb24, got ${buf?.length ?? 0}` }
  }
  const { rowMean, meanContrast, edgeDensity } = sobelField(buf)
  const { dark, transmission } = darkChannel(buf)
  const chroma = chromaStats(buf)
  const decay = edgeDecay(rowMean)
  const corridor = corridorDecay(rowMean)

  // ── the composite ──────────────────────────────────────────────────────
  // Provenance of these constants matters, so read it before trusting a
  // number from this function:
  //
  // Every published estimator in this family (Babari et al. 2011 on traffic
  // cameras, the Minnesota DOT edge-decay work, the Sutter/Nater panorama
  // study) required CALIBRATION AGAINST A REFERENCE VISIBILITY SENSOR. None of
  // them works from a single uncalibrated frame — the papers' own response
  // function is a fitted C(V) = a/(1 + b/V) + c, and a, b, c are measured
  // per camera against a transmissometer.
  //
  // This deployment has no transmissometer. It has something better in the
  // sense that matters to a citizen: a ground PM2.5 station paired to every
  // camera (server/airCctv.js already does that pairing, and it is what the
  // haze-eyes wall shows). So the honest design is:
  //
  //   - the FEATURES below are absolute, correct, and reusable;
  //   - hazeIndex is a MONOTONIC TRIAGE SCORE, meaningful for ranking one
  //     camera against another and for "go look at this one" — it is NOT a
  //     PM2.5 estimate and NOT a visibility in km;
  //   - turning it into a concentration is what calibrateAgainstPm25 does, and
  //     it refuses to run until there are 12+ paired samples AND the fit is
  //     strong enough. Until a real haze episode supplies that variance, this
  //     number is a triage aid and nothing more.
  //
  // WHY THE SCORE CAN COME BACK NULL — this was learned the hard way, by
  // watching a synthetic beta sweep go 51, 52, 14, 54, 19, 22, 27. The cause
  // is not a bug in the arithmetic: the corridor detector returns null on
  // frames whose mid-corridor edge energy sits below the floor, and the naive
  // response — drop the missing term from a weighted mean — makes the score
  // JUMP DOWNWARD exactly when the primary evidence disappeared. A missing
  // measurement is missing. It is not zero, and it is certainly not "clear".
  // So when the primary term is unavailable the score is withheld entirely
  // and the features are returned for the caller to log.
  const skyRef = chroma.skyLuma > 20 ? chroma.skyLuma : 180
  const darkNorm = dark / (skyRef / 255)

  const features = {
    corridorTail: corridor.ok && corridor.tailRatio !== null ? round4(corridor.tailRatio) : null,
    corridorOk: corridor.ok,
    contrast: round4(meanContrast),
    edgeDensity: round4(edgeDensity),
    darkChannel: round4(dark),
    darkChannelNorm: round4(darkNorm),
    transmission: round4(transmission),
    edgeDecay: round4(decay.decayFraction),
    horizonRow: decay.horizonRow,
    saturation: round4(chroma.saturation),
    warmBias: round4(chroma.warmBias),
    meanLuma: round1(chroma.meanLuma),
    skyLuma: round1(chroma.skyLuma),
  }

  const havePrimary = corridor.ok && corridor.tailRatio !== null
  let hazeIndex = null
  if (havePrimary) {
    const terms = [
      [0.45, corridor.tailRatio],
      [0.30, Math.min(1, Math.max(0, (darkNorm - 0.35) / 0.70))],
      [0.25, 1 - Math.min(1, decay.decayFraction / 0.62)],
    ]
    const wSum = terms.reduce((a, [w]) => a + w, 0)
    const raw = terms.reduce((a, [w, v]) => a + w * v, 0) / wSum
    // Subtract the CLEAR-AIR FLOOR before scaling, so that a genuinely clear
    // frame lands near 0 rather than near 50. The floor is not a guess: it was
    // measured on a synthetic scene with beta = 0 (no airlight applied at
    // all), where the composite still read 0.51, because every term has a
    // non-zero value in clear air — a road surface simply has edges and a
    // daytime sky simply has a dark-channel floor. Without this anchor the
    // score is a measure of "how road-like is this picture", which is not the
    // same question at all.
    hazeIndex = Math.round(100 * Math.max(0, Math.min(1, (raw - HAZE_FLOOR) / (1 - HAZE_FLOOR))))
  }

  // Tint: only offered once the frame is hazy enough for the tint to mean
  // anything. Below the threshold the answer is "no idea", not "fog".
  let tintHint = null
  // Gate scaled to the ANCHORED score (clear ≈ 0), not the pre-anchoring one.
  // 12 was chosen from the real-frame distribution: the six live Bangkok
  // frames sampled on 2026-09-28 read 0–23 in genuinely clean air
  // (PM2.5 6.6–10.6 µg/m³), so a 25 gate would have meant "never tint a
  // clean frame" — correct — but also "tint almost nothing else", because the
  // scale no longer spends half its range on clear air.
  if (hazeIndex !== null && hazeIndex >= 12) {
    if (chroma.warmBias > 0.012) tintHint = 'smoke-like'
    else if (chroma.saturation < 0.12 && chroma.warmBias < 0.006) tintHint = 'fog-like'
  }

  return {
    ok: true,
    hazeIndex,
    // Stated on every single result so it can never be read as a calibrated
    // number downstream by something that did not notice this comment.
    calibrated: false,
    basis: 'uncalibrated triage score — features are absolute, the score is relative',
    scoreReason: havePrimary
      ? 'all three terms available'
      : 'withheld: corridor edge energy below floor (frame has no usable line-of-sight structure)',
    features,
    tintHint,
    _rowMean: rowMean,
    _corridorProfile: corridor.profile,
  }
}

/**
 * Per-camera calibration of hazeIndex against the ground PM2.5 station the
 * camera is paired with. Ordinary least squares, plus four guards that exist
 * because the first version of this function produced a confident, wrong,
 * published-looking fit.
 *
 * THE BUG THAT FORCED THE GUARDS. On its first live run (2026-09-28) this
 * returned `{ n: 23, r: 0.52, usable: true }` — which looks like a working
 * model and is in fact meaningless. That day Thailand had no haze: the 23
 * samples spanned PM2.5 5.1 to 10.9 µg/m³, i.e. a 5.8 µg/m³ range on a scale
 * that runs to 500, all of it inside the "excellent" AQI band. A correlation
 * coefficient computed across a variable that barely moves is measuring
 * noise, and r > 0 on noise is a coin flip, not a result. Only a threshold on
 * r cannot catch this, because noise clears r = 0.5 about as often as signal
 * does. So the guards are:
 *
 *   1. SPREAD in PM2.5. A fit needs the target to actually vary. Below
 *      MIN_PM25_RANGE µg/m³ there is nothing to fit, whatever r says.
 *   2. SPREAD in hazeIndex, for the same reason on the other axis.
 *   3. Both axes must clear their floor AT THE SAME TIME. This is the guard
 *      that would have caught today's run.
 *   4. A stricter r than intuition suggests (0.7, not 0.5), because the
 *      samples are not independent — consecutive frames from one camera over
 *      one afternoon are heavily autocorrelated, which inflates r.
 *
 * `usable` is the single flag a caller should branch on. When it is false the
 * stored features are still the right thing to have collected; only the
 * mapping to a concentration is unavailable.
 */
export const MIN_SAMPLES = 12
export const MIN_PM25_RANGE = 15   // µg/m³ — below this the target is flat
export const MIN_HAZE_RANGE = 15   // index points
export const MIN_R = 0.7

export function calibrateAgainstPm25(samples) {
  const pts = (samples ?? []).filter((s) =>
    Number.isFinite(s?.hazeIndex) && Number.isFinite(s?.pm25) && s.pm25 >= 0 && s.hazeIndex >= 0)
  if (pts.length < MIN_SAMPLES) {
    return { ok: false, usable: false, reason: `need ${MIN_SAMPLES}+ paired samples, have ${pts.length}`, n: pts.length }
  }
  const pms = pts.map((p) => p.pm25)
  const hz = pts.map((p) => p.hazeIndex)
  const pmRange = Math.max(...pms) - Math.min(...pms)
  const hzRange = Math.max(...hz) - Math.min(...hz)
  if (pmRange < MIN_PM25_RANGE || hzRange < MIN_HAZE_RANGE) {
    return {
      ok: false, usable: false, n: pts.length,
      pm25_range: round1(pmRange), haze_range: round1(hzRange),
      reason: `both axes must vary: need PM2.5 span ≥ ${MIN_PM25_RANGE} µg/m³ and haze span ≥ ${MIN_HAZE_RANGE} ` +
              `(got ${round1(pmRange)} and ${round1(hzRange)}) — a fit across a flat target is noise, not a model`,
    }
  }
  // Fit pm25 = a * hazeIndex + b by ordinary least squares.
  const n = pts.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of pts) { sx += p.hazeIndex; sy += p.pm25; sxx += p.hazeIndex ** 2; sxy += p.hazeIndex * p.pm25 }
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-9) return { ok: false, usable: false, reason: 'degenerate: hazeIndex did not vary', n }
  const a = (n * sxy - sx * sy) / denom
  const b = (sy - a * sx) / n
  // Pearson r, so we can refuse a weak fit.
  const mx = sx / n, my = sy / n
  let num = 0, dx = 0, dy = 0
  for (const p of pts) {
    const ex = p.hazeIndex - mx, ey = p.pm25 - my
    num += ex * ey; dx += ex * ex; dy += ey * ey
  }
  const r = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
  return {
    ok: true,
    n,
    slope: round4(a),
    intercept: round4(b),
    r: round4(r),
    pm25_range: round1(pmRange),
    haze_range: round1(hzRange),
    // A weak correlation means the camera is not actually seeing the air
    // (blocked lens, pointing at a wall, night IR). Say so rather than ship it.
    usable: r >= MIN_R,
    reason: r >= MIN_R ? null : `r = ${round4(r)} is below the ${MIN_R} floor; samples are autocorrelated, so a weak r is not evidence of signal`,
    pm25FromHaze: (hazeIndex) => Math.max(0, a * hazeIndex + b),
  }
}

const round1 = (v) => Math.round(v * 10) / 10
const round4 = (v) => Math.round(v * 10000) / 10000
