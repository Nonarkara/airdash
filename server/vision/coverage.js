// Distinguish supported protocols from individual cameras that have actually
// yielded a recent decoded image. Decoding is not a haze result: blank/night
// frames are counted here and withheld separately by hazeSignal.js.

/** Reasons a class is unreachable, in both languages. Keyed by stream_kind. */
export const UNREACHABLE = {
  snapshot: {
    why_th: 'ยังไม่มีภาพที่ใช้งานได้ — ที่อยู่ภาพนิ่งอาจส่งภาพว่าง',
    why_en: 'no usable sampled image yet — a snapshot endpoint may return a placeholder',
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
export const REACHABLE_KINDS = new Set(['hls', 'other-stream', 'mjpeg', 'snapshot'])

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
    const available = reachable && b.proven > 0
    let why = null
    if (!reachable) why = UNREACHABLE[b.stream_kind] ?? UNREACHABLE.none
    else if (b.stream_status === 'down' && !available) why = UNREACHABLE.down
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
  const available = rows.filter((r) => r.available).reduce((a, r) => a + r.proven, 0)
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
    headline_th: `ดึงภาพจริงได้ ${available} จาก ${total} กล้อง (${reachable} กล้องใช้รูปแบบที่รองรับ) ต้องตรวจคุณภาพภาพและมีภาพอ้างอิงก่อนประเมินหมอกควัน`,
    headline_en: `decoded images from ${available} of ${total} cameras (${reachable} use supported protocols); image quality and a daylight reference determine whether haze can be checked`,
  }
}
