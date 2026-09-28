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
// The important design decision: it samples ONLY streams the health probe has
// already marked 'live'. Grabbing a frame from a dead stream wastes an ffmpeg
// spawn and, worse, would store a black frame as if it were a reading. Today
// that is 63 of 1,386 cameras, all in Bangkok — see the note in
// /api/cctv/north about the 28 northern cameras currently being down. This
// source is honest about that: it reports what fraction of the catalog it
// could actually sample, so a thin sample is visible rather than silent.

import { CONFIG } from '../config.js'
import { log } from '../util.js'
import { composeAll } from '../sources/cctvRegistry.js'
import { hydrateOnce } from '../sources/cctvHealthStore.js'
import { pairAir } from '../airCctv.js'
import { airStationsNow } from '../airStationsNow.js'
import { grabMany } from './frameGrab.js'
import { readFrame, calibrateAgainstPm25 } from './hazeRead.js'

/** How many cameras to sample per cycle. Sampling is I/O bound, not CPU
 *  bound — 40 spawns takes about 2 s of wall clock and 40 rows is plenty for
 *  a per-camera trend. Raise this when the catalogue's live fraction grows. */
const MAX_CAMS = 40

/** Stride through the live set so consecutive cycles do not hammer the same
 *  dozen cameras; with 63 live and a 30-min cycle a stride of 3 means each
 *  camera is sampled roughly every 90 min, which is the right cadence for
 *  matching against a PM2.5 station that itself updates hourly. */
function stridePick(cams, n, tick) {
  if (cams.length <= n) return cams
  const out = []
  const start = tick % cams.length
  for (let k = 0; k < n; k++) out.push(cams[(start + k) % cams.length])
  return out
}

let TICK = 0

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
  version: 3,

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
    // Only streams a health probe has PROVEN alive. Grabbing a dead stream
    // stores a black frame, which is worse than storing nothing.
    const live = cat.cameras.filter((c) => c.stream_status === 'live' && c.hls_url)
    if (!live.length) {
      log('warn', 'haze_vision: no live streams to sample')
      return { sampled: 0, live_streams: 0 }
    }

    // Pair each camera with its nearest fresh PM2.5 station first, so we only
    // spend an ffmpeg spawn on cameras we can actually pair afterwards.
    const paired = pairAir(live, airStationsNow(db))
    const usable = paired.filter((c) => c.air && Number.isFinite(c.air.pm25))
      TICK = (TICK + 1) % 9973
  const pick = stridePick(usable, MAX_CAMS, TICK)

    const frames = await grabMany(pick)
    const nowIso = new Date().toISOString()
    let stored = 0
    let scored = 0
    const rows = []
    for (const cam of pick) {
      const buf = frames.get(cam)
      if (!buf) continue
      const r = readFrame(buf)
      if (!r.ok) continue
      // A null hazeIndex is a withheld score, not a clear-air reading. Store
      // the features regardless — they are the training data — but leave
      // haze_index NULL so nothing downstream can treat "no measurement" as
      // "measured, and it was fine".
      if (r.hazeIndex !== null) scored++
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
    log('info', 'haze_vision sampled', {
      live_streams: live.length,
      pairable: usable.length,
      attempted: pick.length,
      stored,
      scored,
      coverage_pct: Math.round((live.length / Math.max(1, cat.cameras.length)) * 100),
      calibration: cal.ok ? { n: cal.n, r: cal.r, usable: cal.usable } : { n: cal.n, why: cal.reason },
    })
    return {
      sampled: stored, live_streams: live.length, scored,
      coverage_pct: Math.round((live.length / Math.max(1, cat.cameras.length)) * 100),
      calibration_ok: cal.ok && cal.usable,
    }
  },
}
