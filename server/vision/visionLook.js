// What a stored camera frame is allowed to say in public.
//
// readFrame() emits a triage score. That score is not a concentration: on a
// clear day a motorway camera pointed at a pale sky scores 49 while the
// station beside it reads 6 µg/m³. Publishing that 49 as "pollution" would
// be the bug this file exists to prevent.
//
// The useful statement is a LOOK plus whether it agrees with the station
// that was paired at sample time:
//
//   clear + low PM2.5     the picture and the station agree the air is fine
//   smoke/fog + high PM   both say look — still not a µg/m³ from the pixels
//   smoke/fog + low PM    the frame looks off; the station does not. Look at
//                         the picture. Do not quote the score as pollution.
//   clear + high PM       the station is elevated and this frame does not
//                         show it (wrong aim, haze aloft, night IR)
//
// Pure. No DB, no clock. The caller decides which row is "latest".

export const VISION_WINDOW_H = 6

const FLAG_LOOKS = new Set(['smoke-like', 'fog-like'])

/**
 * @param {object|null} frame row from cctv_haze_frames, or null
 * @returns {object|null}
 */
export function describeVision(frame) {
  if (!frame) return null
  const index = Number.isFinite(frame.haze_index) ? frame.haze_index : null
  const tint = frame.tint_hint === 'smoke-like' || frame.tint_hint === 'fog-like'
    ? frame.tint_hint : null
  let look = 'unclear'
  if (index == null) look = 'unclear'
  else if (tint) look = tint
  else if (index >= 25) look = 'washed'
  else look = 'clear'

  const pm = Number.isFinite(frame.pm25) ? frame.pm25 : null
  let agreement = 'unknown'
  const pictureHazy = look === 'smoke-like' || look === 'fog-like' || look === 'washed'
  if (look === 'unclear' || pm == null) agreement = 'unknown'
  else if (look === 'clear' && pm <= 25) agreement = 'agree-clear'
  else if (pictureHazy && pm > 25) agreement = 'agree-hazy'
  else if (pictureHazy && pm <= 25) agreement = 'picture-only'
  else if (look === 'clear' && pm > 37.5) agreement = 'station-only'
  else agreement = 'mixed'

  return {
    look,
    haze_index: index,
    // Pinned. Nothing in this project has earned a calibrated concentration
    // from pixels, and a caller must not be able to flip it by passing a row
    // whose `calibrated` column was written as 0.
    calibrated: false,
    observed_at: frame.obs_time ?? null,
    pm25_at_sample: pm,
    agreement,
  }
}

/** Latest row per camera_key. Later obs_time wins; ties keep the first seen. */
export function indexLatestFrames(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    if (!r?.camera_key) continue
    const prev = map.get(r.camera_key)
    if (!prev || String(r.obs_time) > String(prev.obs_time)) map.set(r.camera_key, r)
  }
  return map
}

export function cameraVisionKey(c) {
  return `${c?.source}:${c?.id}`
}

/** Copy each camera, adding `vision` (object or null). Does not mutate. */
export function withVision(cameras, byKey) {
  const idx = byKey instanceof Map ? byKey : new Map()
  return (cameras ?? []).map((c) => ({
    ...c,
    vision: describeVision(idx.get(cameraVisionKey(c)) ?? null),
  }))
}

/**
 * Cameras whose latest frame looks smoke-tinted or fog-white, and that we
 * can actually show. A washed-out score with no tint is scene content — a
 * pale sky, a bright road — and does not belong in this list.
 */
export function pictureFlags(cameras, byKey, { limit = 8 } = {}) {
  const flagged = withVision(cameras, byKey).filter((c) =>
    FLAG_LOOKS.has(c.vision?.look) &&
    (c.stream_status === 'live' || c.stream_status === 'embed'))
  const rank = { 'smoke-like': 0, 'fog-like': 1 }
  flagged.sort((a, b) =>
    (rank[a.vision.look] - rank[b.vision.look]) ||
    ((b.vision.haze_index ?? 0) - (a.vision.haze_index ?? 0)))
  const n = Math.max(0, Math.min(24, Math.trunc(Number(limit) || 8)))
  return flagged.slice(0, n)
}

/** Counts over the latest frame of each camera. `calibrated` is always false. */
export function summarizeLooks(byKey) {
  const counts = { clear: 0, smoke_like: 0, fog_like: 0, washed: 0, unclear: 0 }
  const idx = byKey instanceof Map ? byKey : new Map()
  for (const frame of idx.values()) {
    const v = describeVision(frame)
    if (!v) continue
    const key = v.look === 'smoke-like' ? 'smoke_like'
      : v.look === 'fog-like' ? 'fog_like'
        : v.look
    if (key in counts) counts[key]++
  }
  return {
    calibrated: false,
    window_h: VISION_WINDOW_H,
    cameras_read: idx.size,
    ...counts,
  }
}
