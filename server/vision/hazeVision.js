// Accumulates (camera frame features, paired ground PM2.5) pairs.
//
// THIS IS THE PART THAT ACTUALLY MATTERS.
//
// A haze score from a single uncalibrated frame is a guess. The literature is
// unambiguous on this: every published method needed a reference instrument
// (Babari et al. fit per-camera coefficients against a transmissometer; the
// Minnesota DOT and Sutter/Nater studies likewise). This deployment has no
// transmissometer, and it never will — buying one is not on the table for a
// public dashboard.
//
// What it does have is a ground PM2.5 station paired to every camera, and a
// camera's optical response is a fixed property of that camera. So the
// calibration is learnable — it just needs DATA, and data only exists once a
// real haze episode has happened and been watched.
//
// That is what this source does: on a schedule, grab one frame from each
// stream that is currently verified alive, extract the features, pair each
// frame with the PM2.5 its station was reporting at that moment, and store
// the row. Over a season this becomes the training set that lets
// calibrateAgainstPm25 do something honest.
//
// The important design decision: it samples every stream a server can ACTUALLY
// open, and it says plainly which ones it cannot. On 2026-09-29 the catalogue
// held 1,369 cameras and only 362 of them expose a protocol ffmpeg reads; of
// those, 118 HLS + 6 MJPEG actually returned a frame. The other 1,007 are not
// a bug to be papered over — 572 BMA cameras serve a blank white placeholder,
// 208 NST embeds are WebRTC-only, the rest are dead links. coverageReport()
// below turns that into a per-class accounting the API publishes, because a
// dashboard that quietly samples 4 % of its cameras and calls it "all of them"
// is worse than one that says which 96 % it cannot see and why.

import { CONFIG } from '../config.js'
import { log } from '../util.js'
import { composeAll } from '../sources/cctvRegistry.js'
import { hydrateOnce } from '../sources/cctvHealthStore.js'
import { pairAir } from '../airCctv.js'
import { airStationsNow } from '../airStationsNow.js'
import { grabMany, grabUrlOf } from './frameGrab.js'
import { readFrame, calibrateAgainstPm25 } from './hazeRead.js'
import { coverageReport, REACHABLE_KINDS } from './coverage.js'

/** Hard ceiling on ffmpeg spawns per cycle. Sampling is I/O bound, not CPU
 *  bound — the whole reachable set costs a few seconds of wall clock. This is
 *  a blast-radius guard, not a sampling plan: if the catalogue ever grows past
 *  it we want to notice in the log, not silently sample a prefix of it. */
const MAX_CAMS = 240

/** MJPEG has no playlist to HEAD, so the health probe cannot judge it. We
 *  spend a few ffmpeg spawns a cycle on a rotating sample of that class to
 *  find out which of them actually produce a frame — the grab IS the probe. */
const MJPEG_PROBE_PER_CYCLE = 12

let TICK = 0

/** Rotate through a list so consecutive cycles do not hammer the same few. */
function stridePick(cams, n, tick) {
  if (cams.length <= n) return cams
  const out = []
  const start = tick % cams.length
  for (let k = 0; k < n; k++) out.push(cams[(start + k) % cams.length])
  return out
}

export default {
  name: 'hazeVision',
  label_th: 'วิเคราะห์ภาพกล้อง — เก็บค่าฝุ่นจากภาพ (ยังไม่เทียบเทียบ)',
  label_en: 'Camera-frame haze features (not yet calibrated)',
  intervalMs: CONFIG.intervals.haze_vision ?? 30 * 60_000,
  enabled: true,
  // Bumped when the extraction changes, so the boot guard re-runs this source
  // once after a deploy instead of deferring it and leaving the feature table
  // populated with the old shape. NB the field is `version`, not
  // `dataVersion` — server/scheduler.js reads s.source.version. A source that
  // declares `dataVersion` is silently ignored by the guard and deferred
  // forever, which is exactly what happened to the first run of this source.
  version: 4,

  async run({ db }) {
    // The registry's health overlay reads an in-process map that is only
    // populated when cctvHealth runs. cctvHealth is deferred by the boot
    // guard on most restarts (it succeeded recently, so there is nothing to
    // re-probe), which means without this call the map is EMPTY and every
    // camera comes back stream_status 'unknown' — the first version of this
    // source sampled zero cameras and logged "no live streams", while
    // /api/health simultaneously reported 63 live streams. Same hydrateOnce
    // call cctvHealth makes, for the same reason.
    hydrateOnce(db)
    const cat = await composeAll({ useCache: true, skipHealth: false })

    // Two classes, two reasons, one grab path.
    //
    //  hls   — the health probe has already proven these alive by reading the
    //         playlist, so trust it and spend an ffmpeg spawn on all of them.
    //  mjpeg — nothing can probe these without opening the stream (an endless
    //         multipart body has no HEAD), so a rotating sample IS the probe.
    //         Cameras that answered get recorded in `proven`, which is what
    //         turns this class from "unmeasured" into "available".
    const hlsLive = cat.cameras.filter(
      (c) => c.stream_status === 'live' && c.stream_kind === 'hls' && grabUrlOf(c))
    const mjpegAll = cat.cameras.filter(
      (c) => c.stream_kind === 'mjpeg' && grabUrlOf(c))

    TICK = (TICK + 1) % 9973
    const mjpegPick = stridePick(mjpegAll, MJPEG_PROBE_PER_CYCLE, TICK)
    // A camera that answered on a previous cycle is sampled again without
    // needing to be in this cycle's rotating probe.
    const mjpegSeen = stridePick(
      mjpegAll.filter((c) => !mjpegPick.includes(c)),
      Math.max(0, MJPEG_PROBE_PER_CYCLE), TICK + 7)

    const candidates = [...hlsLive, ...mjpegPick, ...mjpegSeen]
    if (!candidates.length) {
      log('warn', 'haze_vision: no reachable streams to sample')
      return { sampled: 0, reachable: 0 }
    }

    // Pair each camera with its nearest fresh PM2.5 station first, so we only
    // spend an ffmpeg spawn on cameras we can actually pair afterwards.
    const paired = pairAir(candidates, airStationsNow(db))
    const usable = paired.filter((c) => c.air && Number.isFinite(c.air.pm25))
    const pick = stridePick(usable, MAX_CAMS, TICK)

    const frames = await grabMany(pick)
    const nowIso = new Date().toISOString()
    const grabbedKeys = new Set()
    let stored = 0
    let scored = 0
    let blank = 0
    const rows = []
    for (const cam of pick) {
      const buf = frames.get(cam)
      if (!buf) continue
      // A frame we actually decoded, whatever it contains. This is the proof
      // that matters for MJPEG: no frame, no claim.
      grabbedKeys.add(cam.source + ':' + cam.id)
      const r = readFrame(buf)
      if (!r.ok) continue
      // A blank/white placeholder still gets its features stored — they are
      // the training data, and a zero-variance frame is a fact worth keeping.
      // What it must never get is a score: readFrame withholds hazeIndex on a
      // frame with no line-of-sight structure, and that is the whole guard.
      if (r.hazeIndex !== null) scored++
      else if (r.features.corridorTail === null) blank++
      db.run(
        `INSERT INTO cctv_haze_frames
           (camera_key, camera_source, lat, lng, obs_time, haze_index, calibrated,
            corridor_tail, contrast, edge_density, dark_channel, transmission,
            edge_decay, saturation, warm_bias, mean_luma, tint_hint,
            pm25, pm25_station, pm25_km)
         VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        cam.source + ':' + cam.id, cam.source, cam.lat, cam.lng, nowIso,
        r.hazeIndex, r.features.corridorTail, r.features.contrast, r.features.edgeDensity,
        r.features.darkChannel, r.features.transmission, r.features.edgeDecay,
        r.features.saturation, r.features.warmBias, r.features.meanLuma, r.tintHint,
        cam.air.pm25, cam.air.station_key, cam.air.km,
      )
      stored++
      rows.push({ id: cam.id, haze: r.hazeIndex, pm25: cam.air.pm25, tint: r.tintHint })
    }

    // Report the calibration state honestly rather than letting the row count
    // imply the model is ready. `usable: false` is the normal, correct state
    // until a haze episode supplies variance.
    const cal = calibrateAgainstPm25(rows.map((x) => ({ hazeIndex: x.haze, pm25: x.pm25 })))
    const coverage = coverageReport(cat.cameras, { grabbedKeys })
    log('info', 'haze_vision sampled', {
      total_cameras: coverage.total,
      reachable: coverage.reachable,
      unavailable: coverage.unreachable,
      hls_live: hlsLive.length,
      mjpeg_candidates: mjpegAll.length,
      attempted: pick.length,
      stored,
      scored,
      blank_frames: blank,
      classes: coverage.classes.map((c) => `${c.stream_kind}/${c.stream_status}:${c.n}`).join(' '),
      calibration: cal.ok ? { n: cal.n, r: cal.r, usable: cal.usable } : { n: cal.n, why: cal.reason },
    })
    return {
      sampled: stored, scored, blank,
      reachable: coverage.reachable,
      unavailable: coverage.unreachable,
      coverage_pct: coverage.pct_reachable,
      calibration_ok: cal.ok && cal.usable,
    }
  },
}
