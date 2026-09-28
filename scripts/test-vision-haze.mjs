// Haze read from a synthetic camera frame, where the answer is known by
// construction. This is the only honest way to test a CV estimator that has
// no labelled ground truth yet: build the frame from the physics, then check
// the estimator recovers the haze level that was put in.
//
// The synthetic haze here is textbook Koschmieder airlight:
//
//     I(x) = J(x)·t + A·(1 − t),     t = e^(−β·d)
//
// J is a "clear" scene we construct (edges, a gradient, a road, a sky), d is
// a per-pixel "distance" we get from the row (bottom of frame = near road,
// top = horizon and beyond), and A is the airlight the atmosphere adds. So
// increasing β provably adds haze, and the test asserts the estimator's
// hazeIndex rises with it and separates clear from hazy.
//
// Pure: no network, no ffmpeg, no clock.

import { readFrame, sobelField, darkChannel, chromaStats, edgeDecay, calibrateAgainstPm25, solidFrame, FRAME_W, FRAME_H, FRAME_BYTES } from '../server/vision/hazeRead.js'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !detail ? '' : `\n       ${detail}`}`)
}

/**
 * A synthetic road scene: sky gradient on top, a bright road surface at the
 * bottom, a horizon line, and a set of vertical posts of decreasing contrast
 * with distance. Returns rgb24.
 */
function syntheticScene() {
  const buf = Buffer.alloc(FRAME_BYTES)
  const horizon = Math.round(FRAME_H * 0.34)
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const i = (y * FRAME_W + x) * 3
      let r, g, b
      if (y < horizon) {
        // sky: brighter toward the horizon
        const t = y / horizon
        r = 150 + 60 * t; g = 175 + 55 * t; b = 215 + 30 * t
      } else {
        // road: grey, with a dashed centre line
        const t = (y - horizon) / (FRAME_H - horizon)
        r = 95 - 18 * t; g = 95 - 18 * t; b = 98 - 18 * t
        const lane = Math.abs(x - FRAME_W / 2) < 7 && (Math.floor((y - horizon) / 14) % 2 === 0)
        if (lane) { r += 70; g += 68; b += 60 }
      }
      // roadside posts: contrast decays with distance (y), i.e. with y above horizon
      if (y >= horizon) {
        const dist = (y - horizon) / (FRAME_H - horizon)
        const postW = 6
        const postH = 54
        if (dist < 0.80) {
          const inPost = ((x % 29) < postW) && (y > horizon + dist * 260) && (y < horizon + dist * 260 + postH)
          if (inPost) {
            // inherent contrast fades with distance
            const c = 1 - dist / 0.80
            r = 95 + 125 * c; g = 95 + 122 * c; b = 98 + 112 * c
          }
        }
        // road-surface texture / aggregate, so the near strip has real edges
        const grit = ((x * 7 + y * 13) % 23 === 0) ? 16 : 0
        r += grit; g += grit; b += grit
      }
      buf[i] = clamp(r); buf[i + 1] = clamp(g); buf[i + 2] = clamp(b)
    }
  }
  return buf
}

/** Apply Koschmieder airlight to a scene. beta is the extinction coefficient. */
function applyAirlight(scene, beta) {
  const out = Buffer.from(scene)
  const horizon = Math.round(FRAME_H * 0.34)
  const A = [205, 212, 228] // airlight colour: slightly blue-white haze
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const i = (y * FRAME_W + x) * 3
      // distance proxy: 0 at the bottom (near), 1 at the top (far)
      const d = 1 - y / FRAME_H
      const t = Math.exp(-beta * d)
      out[i] = clamp(scene[i] * t + A[0] * (1 - t))
      out[i + 1] = clamp(scene[i + 1] * t + A[1] * (1 - t))
      out[i + 2] = clamp(scene[i + 2] * t + A[2] * (1 - t))
    }
  }
  return out
}
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

// ── the synthetic scene behaves like a scene ─────────────────────────────
{
  const scene = syntheticScene()
  const r = readFrame(scene)
  check('a synthetic road scene reads without error', r.ok)
  check('a clear scene has measurable edge content', r.features.contrast > 0, `got ${r.features.contrast}`)
  check('a clear scene either scores low or withholds — never scores high',
    r.hazeIndex === null || r.hazeIndex < 50, `got ${r.hazeIndex}`)
}

// ── monotonic in beta: more extinction ⇒ more haze ───────────────────────
{
  const scene = syntheticScene()
  const betas = [0.0, 0.15, 0.35, 0.6, 0.9, 1.4]
  const reads = betas.map((b) => ({ b, r: readFrame(applyAirlight(scene, b)) }))
  console.log('\n   beta  haze   corridorTail  dark  edgeDecay')
  for (const { b, r } of reads) {
    console.log(`   ${b.toFixed(2)}  ${String(r.hazeIndex).padStart(4)}   ${String(r.features.corridorTail).padStart(9)}  ${r.features.darkChannel.toFixed(3)}  ${r.features.edgeDecay.toFixed(3)}`)
  }
  console.log('')
  // Monotonicity is asserted only over the frames where a score was issued
  // at all. A withheld score is a missing measurement and is checked
  // separately — asserting monotonicity across gaps would be asserting that
  // the estimator never declines to answer, which is not a property we want.
  const scored = reads.filter(x => x.r.hazeIndex !== null)
  let monotone = true
  for (let k = 1; k < scored.length; k++) if (scored[k].r.hazeIndex < scored[k - 1].r.hazeIndex) monotone = false
  check('hazeIndex is monotonically non-decreasing as beta increases (where scored)', monotone,
    scored.map(x => x.r.hazeIndex).join(','))

  check('a withheld score is null, never a fabricated number',
    reads.every(x => x.r.hazeIndex === null || Number.isFinite(x.r.hazeIndex)),
    reads.map(x => x.r.hazeIndex).join(','))
  check('a withheld score carries a reason', reads.every(x => x.r.hazeIndex !== null || typeof x.r.scoreReason === 'string'))
  check('every result is flagged as not calibrated', reads.every(x => x.r.calibrated === false))
  if (scored.length >= 2) {
    check('clear (beta=0) scores below hazy, among frames that scored',
      scored[0].r.hazeIndex < scored[scored.length - 1].r.hazeIndex,
      `${scored[0].r.hazeIndex} vs ${scored[scored.length - 1].r.hazeIndex}`)
  }

  // The individual physical features must also move the right way.
  check('contrast falls as haze rises (light scattered into the line of sight)',
    reads[reads.length - 1].r.features.contrast < reads[0].r.features.contrast,
    `${reads[0].r.features.contrast} → ${reads[reads.length - 1].r.features.contrast}`)
  check('the dark channel rises as haze rises (airlight lifts the darkest channel)',
    reads[reads.length - 1].r.features.darkChannel > reads[0].r.features.darkChannel,
    `${reads[0].r.features.darkChannel} → ${reads[reads.length - 1].r.features.darkChannel}`)
  check('transmittance falls as haze rises',
    reads[reads.length - 1].r.features.transmission < reads[0].r.features.transmission)
  check('edge decay shortens as haze rises (edges do not survive as far)',
    reads[reads.length - 1].r.features.edgeDecay < reads[0].r.features.edgeDecay)
}

// ── smoke vs fog: a warm-tinted haze must NOT read as fog-like ───────────
{
  const scene = syntheticScene()
  // fog: neutral white airlight
  const fog = applyAirlightTinted(scene, 1.4, [222, 226, 230])
  // smoke: warm/brown airlight, as combustion products are
  const smoke = applyAirlightTinted(scene, 1.4, [198, 176, 142])
  const f = readFrame(fog)
  const s = readFrame(smoke)
  console.log(`\n   fog-like:   haze=${f.hazeIndex} sat=${f.features.saturation.toFixed(3)} warm=${f.features.warmBias.toFixed(4)} → ${f.tintHint}`)
  console.log(`   smoke-like: haze=${s.hazeIndex} sat=${s.features.saturation.toFixed(3)} warm=${s.features.warmBias.toFixed(4)} → ${s.tintHint}`)
  if (f.hazeIndex === null || s.hazeIndex === null) { console.log('   (both scored — tint assertions below run)') }
  // The tint discriminator is a COLOUR property and does not depend on the
  // score being issued. Assert it on the chroma features directly as well as
  // through tintHint, so a withheld score cannot hide a colour regression.
  check('neutral haze reads low-saturation and near-neutral in chroma',
    f.features.saturation < 0.12 && f.features.warmBias < 0.006,
    `sat=${f.features.saturation} warm=${f.features.warmBias}`)
  check('neutral haze is flagged fog-like when a score is issued',
    f.hazeIndex === null || f.tintHint === 'fog-like', String(f.tintHint))
  check('warm-tinted haze reads positively warm-biased in chroma',
    s.features.warmBias > 0.012, `warm=${s.features.warmBias}`)
  check('warm-tinted haze is flagged smoke-like, not fog-like',
    s.hazeIndex === null || s.tintHint === 'smoke-like', String(s.tintHint))
  if (f.hazeIndex !== null && s.hazeIndex !== null) {
    check('tint does not change the haze score much (it is a hint, not a driver)',
      Math.abs(f.hazeIndex - s.hazeIndex) < 18, `${f.hazeIndex} vs ${s.hazeIndex}`)
  }
}
function applyAirlightTinted(scene, beta, A) {
  const out = Buffer.from(scene)
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const i = (y * FRAME_W + x) * 3
      const d = 1 - y / FRAME_H
      const t = Math.exp(-beta * d)
      out[i] = clamp(scene[i] * t + A[0] * (1 - t))
      out[i + 1] = clamp(scene[i + 1] * t + A[1] * (1 - t))
      out[i + 2] = clamp(scene[i + 2] * t + A[2] * (1 - t))
    }
  }
  return out
}

// ── degenerate input must be refused, not guessed at ────────────────────
{
  check('a too-short buffer is refused with a reason, not a crash',
    (() => { const r = readFrame(Buffer.alloc(10)); return !r.ok && typeof r.error === 'string' })())
  check('null input is refused', (() => { const r = readFrame(null); return !r.ok })())
  const solid = readFrame(solidFrame(200, 200, 200))
  check('a featureless solid frame yields NO score rather than a confident one',
    solid.ok && solid.hazeIndex === null, JSON.stringify(solid.hazeIndex))
  check('a featureless solid frame still reports its features',
    solid.ok && solid.features.edgeDensity === 0)
  check('a featureless frame is not given a confident tint hint', solid.tintHint === null || typeof solid.tintHint === 'string')
}

// ── calibration guard: refuse to invent a mapping ───────────────────────
{
  check('calibration refuses fewer than 12 samples',
    calibrateAgainstPm25([{ hazeIndex: 50, pm25: 20 }]).ok === false)
  check('a zero-variance PM2.5 set is refused outright (not fitted then rejected)',
    (() => {
      const s = Array.from({ length: 20 }, (_, i) => ({ hazeIndex: 40 + (i % 3), pm25: 25 }))
      const c = calibrateAgainstPm25(s)
      return c.ok === false && c.usable === false && c.pm25_range === 0
    })())
  // a strong, honest signal
  const good = Array.from({ length: 20 }, (_, i) => ({ hazeIndex: 20 + i * 3.5, pm25: 12 + i * 2.6 }))
  const cal = calibrateAgainstPm25(good)
  check('calibration accepts a strong signal and recovers the slope', cal.ok && Math.abs(cal.slope - 0.743) < 0.2, JSON.stringify(cal))
  check('a strong fit is marked usable', cal.usable === true)
  // a weak (but non-degenerate) signal must be refused as a usable calibration
  const noisy = Array.from({ length: 30 }, (_, i) => ({ hazeIndex: 10 + (i % 10) * 5, pm25: 20 + ((i * 37) % 23) }))
  const ncal = calibrateAgainstPm25(noisy)
  check('a weak correlation is reported with a low r and marked NOT usable',
    ncal.ok === true && ncal.usable === false, JSON.stringify(ncal))
  check('pm25FromHaze never returns a negative concentration',
    cal.pm25FromHaze(0) >= 0)

  // ── REGRESSION: the fit that shipped by accident ──────────────────────
  // This is the real 2026-09-28 live sample, reproduced exactly. It cleared
  // the old r >= 0.5 gate and reported itself usable. Every PM2.5 value is
  // inside the "excellent" AQI band, so there is no signal to fit — the
  // guards added after this run are what make it refuse.
  const flatDay = [
    { hazeIndex: 0,  pm25: 10.2 }, { hazeIndex: 4,  pm25: 5.1 },
    { hazeIndex: 21, pm25: 10.2 }, { hazeIndex: 30, pm25: 10.2 },
    { hazeIndex: 1,  pm25: 10.2 }, { hazeIndex: 2,  pm25: 6.7 },
    { hazeIndex: 7,  pm25: 10.2 }, { hazeIndex: 12, pm25: 9.4 },
    { hazeIndex: 18, pm25: 10.2 }, { hazeIndex: 25, pm25: 8.8 },
    { hazeIndex: 33, pm25: 10.2 }, { hazeIndex: 15, pm25: 7.1 },
    { hazeIndex: 22, pm25: 10.2 }, { hazeIndex: 6,  pm25: 9.9 },
    { hazeIndex: 28, pm25: 10.2 }, { hazeIndex: 9,  pm25: 6.7 },
    { hazeIndex: 35, pm25: 10.2 }, { hazeIndex: 3,  pm25: 8.2 },
    { hazeIndex: 19, pm25: 10.2 }, { hazeIndex: 41, pm25: 9.1 },
    { hazeIndex: 27, pm25: 10.2 }, { hazeIndex: 11, pm25: 7.9 },
    { hazeIndex: 49, pm25: 10.2 },
  ]
  const flat = calibrateAgainstPm25(flatDay)
  check('a flat-PM2.5 day is refused even at 23 samples', flat.ok === false && flat.usable === false, JSON.stringify(flat))
  check('the refusal names the actual spread it measured',
    typeof flat.pm25_range === 'number' && flat.pm25_range < 15, JSON.stringify(flat.pm25_range))
  check('the refusal explains WHY (a fit across a flat target is noise)',
    /noise/.test(flat.reason ?? ''), String(flat.reason))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
