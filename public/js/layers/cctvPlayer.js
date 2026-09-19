// Shared CCTV pieces for the map layer and the haze-eyes wall: the player
// (HLS via hls.js, NST iframe, or a plain link), the PM2.5 chip that sits
// beside every picture, and URL hygiene.
//
// Upstream URLs come from third-party feeds, so nothing is dropped into
// markup unchecked: embeds are HTTPS only (an http stream is blocked as mixed
// content anyway), links may be http(s), everything else is refused.
import { tr } from '../i18n.js?v=2.4.33'
import { escapeHtml } from '../fmt.js?v=2.4.33'
import { pm25Color } from '../paint.js?v=2.4.33'

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

/** The picture itself. Live HLS → muted autoplay video; NST → its iframe; otherwise a link. */
export function playerHtml(c) {
  const hls = httpsUrl(c.hls_url)
  const viewer = linkUrl(c.viewer_url)
  if (hls) {
    return `<div class="cctv-video-wrap">
      <video class="cctv-video" controls muted autoplay playsinline loop data-hls-src="${escapeHtml(hls)}"></video>
      <span class="cctv-live">● ${tr('ภาพสด', 'LIVE')}</span>
      <p class="cctv-fail" data-cctv-fail hidden></p>
    </div>`
  }
  if (c.source === 'nst' && httpsUrl(c.viewer_url)) {
    return `<div class="cctv-video-wrap">
      <iframe class="cctv-video" src="${escapeHtml(c.viewer_url)}" loading="lazy" allow="autoplay; fullscreen" allowfullscreen frameborder="0" title="NST CCTV"></iframe>
      <span class="cctv-live">● ${tr('ภาพสด', 'LIVE')}</span>
    </div>`
  }
  if (viewer) return `<a class="cctv-linkout" href="${escapeHtml(viewer)}" target="_blank" rel="noopener noreferrer">▶ ${tr('เปิดภาพกล้องที่ต้นทาง', 'open the camera at its source')} ↗</a>`
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
