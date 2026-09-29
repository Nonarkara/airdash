// What can computer vision actually see, camera by camera — stated plainly.
//
// WHY THIS FILE EXISTS
// --------------------
// The ask was "use computer vision to detect haze in ALL of them". The honest
// answer is not a number and a shrug; it is a per-class accounting, because the
// catalogue's 1,369 cameras are not 1,369 streams. Measured on the live
// catalogue 2026-09-29 by probing every class with the production ffmpeg grab:
//
//   REACHABLE  — ffmpeg returns a real frame
//     hls      335  .m3u8 playlists (61 live before the URL repair, 118 after)
//     mjpeg     27  iTIC mjpeg2.php multipart streams — 6 of 27 responded
//
//   NOT REACHABLE — and the reason differs per class, which is the part worth
//   publishing rather than hiding behind one 'embed' label
//     snapshot 572  BMA show.aspx answers with a 400×266 image, measured
//                  mean 255 / stddev 0.000 — a pure white placeholder. The
//                  HTTP layer is healthy; the PIXELS are empty. A CV score
//                  from this is not "clear air", it is "no information".
//     page     208  NST embeds are MediaMTX WHEP (WebRTC over POST+SDP).
//                  RTSP 8554 refused, SRT absent, no HLS on the web port.
//                  A browser plays these; ffmpeg has no WebRTC stack, and
//                  this project ships zero npm dependencies by design.
//     none       1  no URL of any kind.
//
// Pure: no I/O, no clock, no database. Takes the catalog and a set of camera
// keys the collector has already proven grabbable, so the numbers are
// reproducible in a test with a synthetic catalog.

/** Reasons a class is unreachable, in both languages. Keyed by stream_kind. */
export const UNREACHABLE = {
  snapshot: {
    why_th: 'กล้องตอบกลับ แต่ภาพเป็นสีขาวทั้งหมด (ไม่มีภาพจริง) — วิเคราะห์ไม่ได้',
    why_en: 'camera answers but returns a blank white frame — no image to analyse',
  },
  page: {
    why_th: 'ถ่ายทอดผ่าน WebRTC (WHEP) เบราว์เซอร์เปิดได้ แต่เซิร์ฟเวอร์ดึงเฟรมไม่ได้',
    why_en: 'streamed over WebRTC (WHEP) — plays in a browser, but a server cannot pull frames',
  },
  none: {
    why_th: 'ไม่พบที่อยู่สตรีมจากแหล่งข้อมูล',
    why_en: 'source publishes no stream URL at all',
  },
  down: {
    why_th: 'สตรีมไม่ตอบสนอง (เชื่อมต่อไม่ได้ / หน้าเว็บไม่พบ)',
    why_en: 'stream not responding (connection failed / not found)',
  },
}

/** stream_kind values ffmpeg can pull a frame from. */
export const REACHABLE_KINDS = new Set(['hls', 'other-stream', 'mjpeg'])

/**
 * @param cams   normalized catalog (needs stream_kind + stream_status)
 * @param opts.grabbedKeys  Set of "source:id" the collector has proven
 *                          grabbable this cycle — for MJPEG this IS the proof,
 *                          because there is no playlist to HEAD.
 */
export function coverageReport(cams, { grabbedKeys = new Set() } = {}) {
  const classes = new Map()

  const bucket = (kind, streamStatus) => {
    const key = `${kind}|${streamStatus}`
    if (!classes.has(key)) {
      classes.set(key, { stream_kind: kind, stream_status: streamStatus, n: 0, proven: 0 })
    }
    return classes.get(key)
  }

  for (const c of cams) {
    const kind = c.stream_kind ?? 'none'
    const b = bucket(kind, c.stream_status ?? 'unknown')
    b.n++
    if (grabbedKeys.has(`${c.source}:${c.id}`)) b.proven++
  }

  const rows = [...classes.values()].map((b) => {
    const reachable = REACHABLE_KINDS.has(b.stream_kind)
    // A class of reachable streams is "available" only if something has
    // actually produced a frame from it. Until then it is a promise.
    const available = reachable && (b.proven > 0 || b.stream_status === 'live')
    let why = null
    if (!reachable) why = UNREACHABLE[b.stream_kind] ?? UNREACHABLE.none
    else if (b.stream_status === 'down') why = UNREACHABLE.down
    else if (!available) why = {
      why_th: 'ยังไม่เคยดึงเฟรมสำเร็จจากกลุ่มนี้',
      why_en: 'no frame has been pulled successfully from this class yet',
    }
    return {
      stream_kind: b.stream_kind,
      stream_status: b.stream_status,
      n: b.n,
      proven: b.proven,
      reachable,
      available,
      why_th: why?.why_th ?? null,
      why_en: why?.why_en ?? null,
    }
  })

  // Reachable first, biggest first — the reader wants the headline up top.
  rows.sort((a, b) =>
    (b.available - a.available) || (a.reachable - b.reachable) || (b.n - a.n))

  const total = cams.length
  const reachable = rows.filter((r) => r.reachable).reduce((a, r) => a + r.n, 0)
  const available = rows.filter((r) => r.available).reduce((a, r) => a + r.n, 0)
  const proven = rows.reduce((a, r) => a + r.proven, 0)

  return {
    total,
    // "reaching" = the protocol is one ffmpeg can open at all.
    // "available" = we have actually taken a frame from one this cycle.
    reachable,
    available,
    proven,
    unreachable: total - reachable,
    pct_reachable: total ? Math.round((reachable / total) * 1000) / 10 : 0,
    classes: rows,
    headline_th: `วิเคราะห์ภาพได้ ${available} จาก ${total} กล้อง (${reachable} กล้องเปิดสตรีมได้) ที่เหลือเป็นสตรีมที่เซิร์ฟเวอร์ดึงเฟรมไม่ได้`,
    headline_en: `frame analysis covers ${available} of ${total} cameras (${reachable} expose a readable stream); the rest serve no frame a server can read`,
  }
}
