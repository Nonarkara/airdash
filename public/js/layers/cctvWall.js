// Haze eyes — the working cameras that face the worst air right now.
// The server (GET /api/cctv/haze-eyes) walks the PM2.5 stations from the
// highest reading down and, for each, picks the nearest camera that a health
// probe has shown to be alive. So this wall answers "what does that look
// like, over there?" for the places the numbers say are worst.
import { tr } from '../i18n.js?v=2.4.58'
import { escapeHtml } from '../fmt.js?v=2.4.58'
import { airChipHtml, playerHtml, startVideos, stopVideos, NOT_OFFICIAL, visionChipHtml, LOOK_LABEL } from './cctvPlayer.js?v=2.4.58'

const MAX_AUTOPLAY = 4
let overlay = null
let observer = null

function cardHtml(e, badge) {
  const c = e.camera
  const name = escapeHtml(tr(c.name_th || c.name_en, c.name_en || c.name_th) || c.id)
  const prov = escapeHtml(tr(e.air?.province_th || '', e.air?.province_th || ''))
  const down = c.stream_status === 'down' || c.stream_status === 'unknown' ? ' cctv-eye-down' : ''
  const rank = badge ?? `#${e.rank}`
  return `<div class="cctv-eye${down}" data-cam="${escapeHtml(c.id)}" data-src="${escapeHtml(c.source)}">
    <div class="cctv-eye-head"><span class="cctv-eye-rank">${escapeHtml(rank)}</span><span class="cctv-eye-prov">${prov}</span></div>
    ${airChipHtml(e.air)}
    ${visionChipHtml(c.vision)}
    ${playerHtml(c)}
    <div class="cctv-eye-name">${name}</div>
    <button type="button" class="cctv-eye-locate">${tr('ดูบนแผนที่', 'show on map')} ↗</button>
  </div>`
}

// LOOK_ORDER is the reading order of a picture, not alphabetical: a clear
// frame first, an unreadable one last, with the two "hazy" looks in the
// middle. The summary keys arrive from the server snake_cased
// (smoke_like) while the label table is kebab-cased (smoke-like), so they
// are normalised here — a lookup that silently misses renders the fallback
// label, which is indistinguishable from a real measurement.
const LOOK_ORDER = [
  { key: 'haze_like', look: 'haze-like' },
  { key: 'unchanged', look: 'unchanged' },
  { key: 'clear', look: 'clear' },
  { key: 'washed', look: 'washed' },
  { key: 'smoke_like', look: 'smoke-like' },
  { key: 'fog_like', look: 'fog-like' },
  { key: 'unclear', look: 'unclear' },
]

function lookChip(key, look, n) {
  if (!n) return ''
  const l = LOOK_LABEL[look]
  return `<span class="cv-look cv-look--${key}">${escapeHtml(tr(l.th, l.en))} <b>${n}</b></span>`
}

// The computer-vision readout, stated at the top of the wall so nobody has
// to infer that anything is being analysed.
//
// Three numbers, each answering a question the reader actually has:
//   · how many frames did it read, and over what window
//   · what those frames looked like, as a breakdown rather than a verdict
//   · how much of the camera estate it could read at all — the honest one,
//     because 1,349 cameras sounds like coverage and 588 is the truth
function cvStrip(data) {
  const s = data.vision_summary
  const flags = data.picture_flags ?? []
  const h = data.health
  if (!s?.cameras_read) {
    return `<div class="cv-strip cv-strip--off">
      <span class="cv-strip-head">${escapeHtml(tr('คอมพิวเตอร์ไวชันยังไม่มีผล — ไม่มีภาพไหนอ่านได้ในหน้าต่างเวลานี้', 'Computer vision has nothing yet — no frame could be read in this window'))}</span>
    </div>`
  }
  const chips = LOOK_ORDER.map(({ key, look }) => lookChip(key, look, s[key] || 0)).join('')
  const pct = h?.total ? Math.round(s.cameras_read / h.total * 100) : null
  const cov = h
    ? `<span class="cv-cov">${escapeHtml(tr(
        `เก็บภาพได้จาก ${s.cameras_read} กล้อง จาก ${h.total} ตัว${pct === null ? '' : ` (${pct}%)`}`,
        `Sampled images from ${s.cameras_read} of ${h.total} cameras${pct === null ? '' : ` (${pct}%)`}`,
      ))}</span>`
    : ''
  const comparable = (s.haze_like || 0) + (s.unchanged || 0)
  const head = tr(
    `เก็บภาพ ${s.cameras_read} กล้อง · เทียบภาพกลางวันได้ ${comparable} กล้อง · อาจมีหมอกควัน ${s.haze_like || 0} กล้อง ภาพกลางคืน ภาพว่าง และภาพที่ยังไม่มีอ้างอิงจะไม่ถูกประเมิน`,
    `${s.cameras_read} camera samples · ${comparable} daylight comparisons · ${s.haze_like || 0} possible haze. Night, blank, and reference-pending frames are withheld. Fog, rain and lens contamination can look like haze.`,
  )
  const grid = flags.length
    ? `<div class="cctv-wall-grid">${flags.map((c) => cardHtml({ rank: 0, air: c.air, camera: c }, tr('ภาพ', 'picture'))).join('')}</div>`
    : ''
  return `<div class="cv-strip">
    <div class="cv-strip-head">
      <b>${escapeHtml(tr('คอมพิวเตอร์ไวชัน', 'Computer vision'))}</b>
      <span class="cv-read-n">${escapeHtml(tr(`อ่านภาพจริง ${s.cameras_read} ภาพ ใน ${s.window_h} ชม.`, `read ${s.cameras_read} real frames in ${s.window_h} h`))}</span>
      ${cov}
    </div>
    <div class="cv-looks">${chips}</div>
    <p class="cctv-wall-relaxed cctv-wall-vision">${escapeHtml(head)}</p>
    ${s.calibrated ? '' : `<p class="cctv-wall-relaxed cv-uncalibrated">${escapeHtml(tr(
      'ภาพบอกการเปลี่ยนแปลงของทัศนวิสัย ไม่ใช่ค่าฝุ่น µg/m³ ค่าฝุ่นอ่านจากสถานี',
      'Camera checks show visual changes, not PM2.5 in µg/m³. Concentrations come from the stations.',
    ))}</p>`}
  </div>${grid}`
}

export function closeHazeEyes() {
  if (!overlay) return
  observer?.disconnect(); observer = null
  stopVideos(overlay)
  document.removeEventListener('keydown', onKey)
  overlay.remove(); overlay = null
  document.body.style.overflow = ''
}
const onKey = (e) => { if (e.key === 'Escape') closeHazeEyes() }

/** onLocate(id, source) is called when a card's "show on map" is pressed. */
export async function openHazeEyes({ onLocate } = {}) {
  closeHazeEyes()
  overlay = document.createElement('div')
  overlay.className = 'cctv-wall-overlay'
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true')
  overlay.innerHTML = `<div class="cctv-wall-backdrop"></div>
    <div class="cctv-wall-sheet">
      <div class="cctv-wall-head">
        <div class="cctv-wall-title">👁 ${tr('ตาดูฝุ่น — กล้องที่มองพื้นที่ฝุ่นหนักที่สุดตอนนี้', 'Haze eyes — cameras facing the worst air right now')}</div>
        <button type="button" class="cctv-wall-close" aria-label="${tr('ปิด', 'Close')}">✕</button>
      </div>
      <div class="cctv-wall-sub">${tr('เรียงตามค่า PM2.5 ของสถานี · แถบบนภาพบอกว่าภาพดูเป็นอย่างไร (ยังไม่ได้เทียบเป็นค่าฝุ่น)', 'Ranked by the station’s PM2.5 · the line on each picture says what the frame looks like (not a concentration)')}</div>
      <div class="cctv-wall-body" aria-live="polite"><p class="cctv-wall-msg">${tr('กำลังโหลด…', 'loading…')}</p></div>
      <div class="cctv-wall-foot">${NOT_OFFICIAL()} · ${tr('วิดีโอสตรีมจากผู้ให้บริการ AirDash เก็บภาพตัวอย่างล่าสุดเพื่อเปรียบเทียบ', 'video streams from each provider; AirDash keeps the latest sampled still for comparison')}</div>
    </div>`
  document.body.appendChild(overlay)
  document.body.style.overflow = 'hidden'
  overlay.querySelector('.cctv-wall-close').onclick = closeHazeEyes
  overlay.querySelector('.cctv-wall-backdrop').onclick = closeHazeEyes
  overlay.querySelector('.cctv-wall-close').focus()
  document.addEventListener('keydown', onKey)

  const body = overlay.querySelector('.cctv-wall-body')
  const get = async (minPm25, includeDown = false) => {
    const qs = new URLSearchParams({ limit: '12', min_pm25: String(minPm25) })
    if (includeDown) qs.set('include_down', '1')
    const res = await fetch(`/api/cctv/haze-eyes?${qs}`)
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }
  let data, relaxed = false, includedDown = false
  try {
    data = await get(25)
    // Most of the wet season nothing is hazy. An empty wall would be true but
    // useless, so when fewer than 6 places pass the threshold, show the cameras
    // nearest the highest readings instead — and say plainly that the air is fine.
    if ((data.eyes?.length ?? 0) < 6) {
      const all = await get(0)
      if ((all.eyes?.length ?? 0) > (data.eyes?.length ?? 0)) { data = all; relaxed = true }
    }
    // Haze season (Dec–Apr, 2026-09-28 audit): when live streams are mostly
    // offline, the wall becomes blank. Falling back to include_down gives
    // users a list of the cameras that ARE on haze-prone roads even with the
    // "open at source" card — far better than an empty box that says the air
    // is hazy but offers no eyes.
    if ((data.eyes?.length ?? 0) < 4) {
      const withDown = await get(25, true)
      if ((withDown.eyes?.length ?? 0) > (data.eyes?.length ?? 0)) { data = withDown; relaxed = true; includedDown = true }
    }
  } catch {
    body.innerHTML = `<p class="cctv-wall-msg">${tr('โหลดไม่สำเร็จ — ลองใหม่อีกครั้งในอีกสักครู่', 'could not load — try again in a moment')}</p>`
    return
  }
  if (!overlay) return // closed while loading
  if (!data.eyes?.length && !data.picture_flags?.length) {
    body.innerHTML = `<p class="cctv-wall-msg">${tr('ยังไม่มีกล้องที่ใช้งานได้ใกล้สถานีวัดฝุ่น', 'no working camera near a PM2.5 station yet')}</p>`
    return
  }
  let note = ''
  if (includedDown) {
    note += `<p class="cctv-wall-relaxed">${tr('สตรีมสดส่วนใหญ่ออฟไลน์ — แสดงกล้องที่อยู่บนเส้นทางหลักตามค่าฝุ่น แตะการ์ดเพื่อเปิดที่ต้นทาง iTIC/DOH', 'Most live streams are offline — showing motorway cameras near the highest readings. Tap a card to open it at the iTIC/DOH source page.')}</p>`
  }
  if (relaxed && !includedDown) {
    note += `<p class="cctv-wall-relaxed">${tr('ตอนนี้ไม่มีพื้นที่ฝุ่นหนัก (PM2.5 เกิน 25) — แสดงกล้องที่ใกล้สถานีค่าสูงที่สุดแทน อากาศโดยรวมอยู่ในเกณฑ์ดี', 'No heavy haze right now (nothing above 25 µg/m³) — showing cameras near the highest readings instead. The air is broadly fine.')}</p>`
  }
  const eyesGrid = data.eyes?.length
    ? `<div class="cctv-wall-grid">${data.eyes.map((e) => cardHtml(e)).join('')}</div>`
    : ''
  const samples = (data.sampled_cameras || []).filter(c => c.vision?.frame_url)
  const sampleGrid = samples.length ? `<h3>${tr('ภาพล่าสุดที่ดึงได้จริง', 'Latest camera samples')}</h3><div class="cctv-wall-grid">${samples.map(c => {
    const name = escapeHtml(tr(c.name_th || c.name_en, c.name_en || c.name_th) || c.id)
    return `<div class="cctv-eye" data-cam="${escapeHtml(c.id)}" data-src="${escapeHtml(c.source)}">
      <a href="${escapeHtml(c.vision.frame_url)}" target="_blank" rel="noopener"><img class="cctv-sampled-frame" src="${escapeHtml(c.vision.frame_url)}" width="320" height="180" alt="${name}" loading="lazy"></a>
      <div class="cctv-eye-name">${name}</div>${visionChipHtml(c.vision)}${airChipHtml(c.air)}
      <a href="${escapeHtml(c.source_url)}" target="_blank" rel="noopener">${escapeHtml(tr(c.source_label_th, c.source_label_en) || c.source)} ↗</a>
      <button type="button" class="cctv-eye-locate">${tr('ดูบนแผนที่', 'show on map')} ↗</button></div>`
  }).join('')}</div>` : ''
  body.innerHTML = `${cvStrip(data)}${note}${sampleGrid}${eyesGrid}`
  body.querySelectorAll('.cctv-eye-locate').forEach((b) => {
    b.onclick = () => { const a = b.closest('.cctv-eye'); closeHazeEyes(); onLocate?.(a.dataset.cam, a.dataset.src) }
  })
  // These are small municipal servers: 12 streams starting together starve one
  // another (tested 2026-09-20 — one at a time they deliver, 40 at once time out).
  // So only the first MAX_AUTOPLAY visible cards start by themselves; the rest
  // show a play button.
  let active = 0
  const play = (card) => { card.querySelector('.cctv-eye-play')?.remove(); startVideos(card) }
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue
      observer?.unobserve(en.target)
      if (!en.target.querySelector('video[data-hls-src]')) continue // NST iframe / link: nothing to gate
      if (active < MAX_AUTOPLAY) { active++; startVideos(en.target); continue }
      const wrap = en.target.querySelector('.cctv-video-wrap')
      const b = document.createElement('button')
      b.type = 'button'; b.className = 'cctv-eye-play'; b.textContent = `▶ ${tr('เล่นภาพสด', 'play live')}`
      b.onclick = () => play(en.target)
      wrap?.appendChild(b)
    }
  }, { root: overlay.querySelector('.cctv-wall-sheet'), rootMargin: '0px' })
  body.querySelectorAll('.cctv-eye').forEach((card) => observer.observe(card))
}
