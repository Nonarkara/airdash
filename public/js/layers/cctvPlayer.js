// Shared CCTV pieces for the map layer and the haze-eyes wall: the player
// (HLS via hls.js, NST iframe, or a plain link), the PM2.5 chip that sits
// beside every picture, and URL hygiene.
//
// Upstream URLs come from third-party feeds, so nothing is dropped into
// markup unchecked: embeds are HTTPS only (an http stream is blocked as mixed
// content anyway), links may be http(s), everything else is refused.
import { tr } from '../i18n.js?v=2.4.45'
import { escapeHtml } from '../fmt.js?v=2.4.45'
import { pm25Color } from '../paint.js?v=2.4.45'

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js'

export const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null)
export const linkUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null)

// Thai AQI 2023 PM2.5 band names (the server sends the band id, see server/airCctv.js).
export const BAND_LABEL = {
  excellent: { th: 'ดีมาก', en: 'Excellent' },
  good: { th: 'ดี', en: 'Good' },
  moderate: { th: 'ปานกลาง', en: 'Moderate' },
  sensitive: { th: 'เริ่มมีผลต่อสุขภาพ', en: 'Unhealthy for sensitive groups' },
  unhealthy: { th: 'มีผลต่อสุขภาพ', en: 'Unhealthy' },
}

/** PM2.5 next to a camera: the number, its band, and which station said it. */
export function airChipHtml(air, { compact = false } = {}) {
  if (!air) return `<div class="cctv-air cctv-air-none">${tr('ไม่มีสถานีวัดฝุ่นใกล้กล้องนี้ (ภายใน 25 กม.)', 'no PM2.5 station within 25 km of this camera')}</div>`
  const band = BAND_LABEL[air.band]
  const name = escapeHtml(tr(air.name_th || air.name_en || '', air.name_en || air.name_th || ''))
  return `<div class="cctv-air" style="--air:${pm25Color(air.pm25)}">
    <span class="cctv-air-num">${Math.round(air.pm25)}</span>
    <span class="cctv-air-body">
      <span class="cctv-air-unit">PM2.5 ${tr('มคก./ลบ.ม.', 'µg/m³')} · <b>${band ? escapeHtml(tr(band.th, band.en)) : ''}</b></span>
      ${compact ? '' : `<span class="cctv-air-src">${tr('สถานี', 'station')} ${name} · ${air.km} ${tr('กม.', 'km')}</span>`}
    </span>
  </div>`
}

// ── hls.js, loaded on first use ─────────────────────────────────────────────
let hlsPromise = null
function loadHls() {
  if (typeof Hls !== 'undefined') return Promise.resolve()
  hlsPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = HLS_CDN; s.async = true
    s.onload = () => resolve()
    s.onerror = () => { hlsPromise = null; reject(new Error('hls.js failed to load')) }
    document.head.appendChild(s)
  })
  return hlsPromise
}
const instances = new WeakMap() // <video> → Hls

/** Play an HLS stream in a <video>. onFail(reasonTh, reasonEn) is called if it cannot. */
export async function attachHls(video, src, onFail = () => {}) {
  if (!video || !httpsUrl(src) || instances.has(video)) return
  // hls.js first wherever it runs (MSE). Chrome now claims native HLS support
  // but its demuxer is stricter: on 2026-09-20 it read these municipal streams
  // as 1920x1080, then died with DEMUXER_ERROR_COULD_NOT_PARSE. Native HLS is the
  // fallback for browsers without MSE (iPhone Safari), where hls.js cannot run.
  try {
    await loadHls()
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      // Not low-latency: these municipal streams are plain HLS and LL mode stalls them.
      const hls = new Hls({ enableWorker: false, lowLatencyMode: false })
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d?.fatal) onFail(d.type === 'networkError' ? 'สตรีมไม่ตอบสนอง (อาจหยุดให้บริการ)' : 'สตรีมเสียหาย', d.type === 'networkError' ? 'stream not responding (may be offline)' : 'stream broken')
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      instances.set(video, hls)
      return
    }
  } catch { /* fall through to native */ }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src
    video.addEventListener('error', () => onFail('เล่นวิดีโอไม่ได้', 'cannot play this video'), { once: true })
    return
  }
  onFail('เล่นวิดีโอไม่ได้ในเบราว์เซอร์นี้', 'cannot play video in this browser')
}

export function detachHls(video) {
  const hls = instances.get(video)
  if (!hls) return
  try { hls.destroy() } catch { /* already gone */ }
  instances.delete(video)
}

/** The picture itself. Live HLS → muted autoplay video; NST → its iframe; down
 *  stream + a viewer_url → still show the source-page link so the user has
 *  somewhere to go (haze season: many DOH motorway streams rotate offline for
 *  hours at a time but the camera's page on iTIC/DOH still shows it). */
// WHY A NO-PICTURE CARD NAMES THE REASON INSTEAD OF SAYING "MAY BE OFFLINE"
// FloodDash's wall has one fallback string for every camera it cannot play,
// which is honest but useless: "camera may be offline" sends a reader to the
// source site to find out, and on this catalogue the answer is usually NOT
// that the hardware is broken. Probing every class with the production ffmpeg
// grab on 2026-09-29 measured why, and the four answers are completely
// different situations with different fixes:
//
//   snapshot — BMA's show.aspx answers HTTP 200 with a 400x266 image that
//              measures mean 255 / stddev 0.000: a pure white rectangle. The
//              camera is fine; there is simply no picture in the response.
//   page     — NST embeds are MediaMTX WHEP over WebRTC. RTSP is closed and
//              there is no HLS, so a BROWSER can play it and a server cannot.
//              Telling such a user the camera is offline is simply false.
//   none     — the source publishes no stream URL at all.
//   other    — a stream of an unrecognised kind; say nothing was readable.
//
// The general rule this encodes: "no picture" and "broken camera" are
// different claims, and a public dashboard should not conflate them. Someone
// deciding whether a street is clear needs to know the first, not be sent to
// re-verify the second.
const NO_PICTURE = {
  snapshot: {
    th: 'กล้องนี้ส่งภาพสีขาวเปล่า (ยังไม่มีภาพจริงให้ระบบอ่าน)',
    en: 'this camera returns a blank white image — no picture to read',
  },
  page: {
    th: 'ภาพถ่ายทอดผ่าน WebRTC — เปิดดูได้ในเบราว์เซอร์ แต่ระบบอ่านภาพไม่ได้',
    en: 'streamed over WebRTC — playable in a browser, not readable by this system',
  },
  none: {
    th: 'แหล่งข้อมูลนี้ไม่ได้ประกาศลิงก์ภาพของกล้อง',
    en: 'this source publishes no picture link for the camera',
  },
}

// Deliberately OUTSIDE the taxonomy above: a catch-all for a stream_kind this
// build has never seen. It is a default, not a reason — the server does not
// emit it, and keeping it in the table would imply it does. Split out so the
// taxonomy stays exactly "the reasons we can actually measure".
const NO_PICTURE_FALLBACK = {
  th: 'ยังไม่พบรูปแบบสตรีมที่ระบบอ่านได้',
  en: 'stream type not readable by this system',
}

export function noPictureLabel(streamKind) {
  return NO_PICTURE[streamKind] ?? NO_PICTURE_FALLBACK
}

export function playerHtml(c) {
  const hls = httpsUrl(c.hls_url)
  const viewer = linkUrl(c.viewer_url)
  if (hls && c.stream_status !== 'down') {
    return `<div class="cctv-video-wrap">
      <video class="cctv-video" controls muted autoplay playsinline loop data-hls-src="${escapeHtml(hls)}"></video>
      <span class="cctv-live">● ${tr('ภาพสด', 'LIVE')}</span>
      <p class="cctv-fail" data-cctv-fail hidden></p>
    </div>`
  }
  if (c.source === 'nst' && httpsUrl(c.viewer_url) && c.stream_status !== 'down') {
    return `<div class="cctv-video-wrap">
      <iframe class="cctv-video" src="${escapeHtml(c.viewer_url)}" loading="lazy" allow="autoplay; fullscreen" allowfullscreen frameborder="0" title="NST CCTV"></iframe>
      <span class="cctv-live">● ${tr('ภาพสด', 'LIVE')}</span>
    </div>`
  }
  // A stream we could not play. Say which kind it is, because "may be
  // offline" is the wrong claim for 564 of the 807 cameras that have no
  // readable stream — most of them are answering perfectly well.
  //
  // The guard is `kind`, NOT `NO_PICTURE[kind]`: a camera with a stream of a
  // kind this build does not recognise still HAS a stream, so falling through
  // to the "no picture link" text below would assert something false. The
  // fallback wording covers exactly that case.
  const kind = c.stream_kind
  if (kind) {
    const reason = noPictureLabel(kind)
    // Where a viewer URL exists it is still the best the reader can do, and
    // for `page` (WebRTC) opening it in a browser is the ONLY way to see
    // anything — so the link stays, now framed as the route rather than a
    // consolation prize.
    const action = viewer
      ? `<a class="cctv-linkout${kind === 'page' ? '' : ' cctv-linkout-down'}" href="${escapeHtml(viewer)}" target="_blank" rel="noopener noreferrer">▶ ${escapeHtml(tr('เปิดภาพกล้องที่ต้นทาง', 'open the camera at its source'))} ↗</a>`
      : ''
    return `<div class="cctv-nosignal">
      <div class="cctv-nosignal-icon" aria-hidden="true">▨</div>
      <div class="cctv-nosignal-text">${escapeHtml(tr(reason.th, reason.en))}</div>
      ${action}
    </div>`
  }
  if (viewer) {
    // Down/unknown streams with a viewer_url: still provide the camera, but as
    // an explicit "may be offline — open at source" call-to-action rather than
    // an empty black box.
    const down = c.stream_status === 'down' || c.stream_status === 'unknown'
    const cls = down ? 'cctv-linkout cctv-linkout-down' : 'cctv-linkout'
    const label = down
      ? `▶ ${tr('กล้องอาจหยุดให้บริการ · เปิดภาพที่ต้นทาง', 'camera may be offline · open at its source')} ↗`
      : `▶ ${tr('เปิดภาพกล้องที่ต้นทาง', 'open the camera at its source')} ↗`
    return `<a class="${cls}" href="${escapeHtml(viewer)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  }
  return `<div class="cctv-air cctv-air-none">${tr('ไม่มีลิงก์ภาพ', 'no picture link')}</div>`
}

/** After a popup/card is in the DOM: start every <video data-hls-src> inside root. */
export function startVideos(root) {
  for (const v of root.querySelectorAll('video[data-hls-src]')) {
    const fail = v.parentElement?.querySelector('[data-cctv-fail]')
    attachHls(v, v.dataset.hlsSrc, (th, en) => { if (fail) { fail.textContent = tr(th, en); fail.hidden = false } })
  }
}
export function stopVideos(root) {
  for (const v of root.querySelectorAll('video[data-hls-src]')) detachHls(v)
}

export const NOT_OFFICIAL = () => tr('ภาพและค่าฝุ่นเป็นข้อมูลอ้างอิง ไม่ใช่ประกาศทางราชการ', 'Pictures and readings are for reference — not an official announcement')

// What the frame looks like. The station chip above this is the measurement.
// These sentences exist so a washed-out motorway shot on a clean day is not
// read as "pollution = 49".
const LOOK_LABEL = {
  clear: { th: 'ภาพดูใส', en: 'picture looks clear' },
  'smoke-like': { th: 'ภาพออกโทนควัน', en: 'picture looks smoke-tinted' },
  'fog-like': { th: 'ภาพดูขาวหมอก', en: 'picture looks fog-white' },
  washed: { th: 'ภาพดูหมอง', en: 'picture looks washed out' },
  unclear: { th: 'อ่านภาพนี้ไม่ได้', en: 'this frame could not be read' },
}
const AGREE_LABEL = {
  'agree-clear': { th: 'สถานีใกล้เคียงก็อ่านค่าต่ำ', en: 'the nearby station is low too' },
  'agree-hazy': { th: 'สถานีใกล้เคียงก็สูง — นี่ไม่ใช่ค่าฝุ่นจากภาพ', en: 'the nearby station is high too — this is not a concentration from the picture' },
  'picture-only': { th: 'แต่สถานีใกล้เคียงอ่านค่าต่ำ — ดูภาพเอง อย่าอ่านเป็นค่าฝุ่น', en: 'but the nearby station is low — look at the frame; this is not a pollution reading' },
  'station-only': { th: 'สถานีอ่านค่าสูง แต่ภาพนี้ไม่เห็นฝุ่น', en: 'the station is high and this frame does not show it' },
  mixed: { th: 'ตัวเลขคือสถานี — คะแนนภาพยังไม่ได้เทียบเครื่องวัด', en: 'the station is the number — the picture score is not calibrated' },
  unknown: { th: 'ยังสรุปจากภาพนี้ไม่ได้', en: 'this frame does not support a conclusion' },
}

/** The picture's look, beside the station number. Empty when this camera has no recent frame. */
export function visionChipHtml(vision) {
  if (!vision?.look) return ''
  const look = LOOK_LABEL[vision.look] ?? LOOK_LABEL.unclear
  const agree = AGREE_LABEL[vision.agreement] ?? AGREE_LABEL.unknown
  const cls = vision.look === 'smoke-like' ? 'is-smoke'
    : vision.look === 'fog-like' ? 'is-fog'
      : vision.look === 'washed' ? 'is-washed'
        : vision.look === 'clear' ? 'is-clear' : 'is-unclear'
  return `<div class="cctv-vision ${cls}"><b>${escapeHtml(tr(look.th, look.en))}</b> <span>${escapeHtml(tr(agree.th, agree.en))}</span></div>`
}

/** A corner dot on the pin, only when the frame itself looks smoke-tinted or fog-white. */
export function visionMarkHtml(vision) {
  if (vision?.look !== 'smoke-like' && vision?.look !== 'fog-like') return ''
  const cls = vision.look === 'fog-like' ? 'is-fog' : 'is-smoke'
  const label = vision.look === 'fog-like' ? tr('ภาพดูขาวหมอก', 'picture looks fog-white') : tr('ภาพออกโทนควัน', 'picture looks smoke-tinted')
  return `<i class="cctv-pin-mark ${cls}" title="${escapeHtml(label)}"></i>`
}
