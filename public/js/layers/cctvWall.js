// Haze eyes — the working cameras that face the worst air right now.
// The server (GET /api/cctv/haze-eyes) walks the PM2.5 stations from the
// highest reading down and, for each, picks the nearest camera that a health
// probe has shown to be alive. So this wall answers "what does that look
// like, over there?" for the places the numbers say are worst.
import { tr } from '../i18n.js?v=2.4.33'
import { escapeHtml } from '../fmt.js?v=2.4.33'
import { airChipHtml, playerHtml, startVideos, stopVideos, NOT_OFFICIAL } from './cctvPlayer.js?v=2.4.33'

const MAX_AUTOPLAY = 4
let overlay = null
let observer = null

function cardHtml(e) {
  const c = e.camera
  const name = escapeHtml(tr(c.name_th || c.name_en, c.name_en || c.name_th) || c.id)
  const prov = escapeHtml(tr(e.air.province_th || '', e.air.province_th || ''))
  return `<div class="cctv-eye" data-cam="${escapeHtml(c.id)}" data-src="${escapeHtml(c.source)}">
    <div class="cctv-eye-head"><span class="cctv-eye-rank">#${e.rank}</span><span class="cctv-eye-prov">${prov}</span></div>
    ${airChipHtml(e.air)}
    ${playerHtml(c)}
    <div class="cctv-eye-name">${name}</div>
    <button type="button" class="cctv-eye-locate">${tr('ดูบนแผนที่', 'show on map')} ↗</button>
  </div>`
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
      <div class="cctv-wall-sub">${tr('เรียงตามค่า PM2.5 สูงสุด · เลือกเฉพาะกล้องที่ระบบตรวจแล้วว่ามีภาพสด', 'Ranked by PM2.5 · only cameras a health probe found alive')}</div>
      <div class="cctv-wall-body" aria-live="polite"><p class="cctv-wall-msg">${tr('กำลังโหลด…', 'loading…')}</p></div>
      <div class="cctv-wall-foot">${NOT_OFFICIAL()} · ${tr('วิดีโอสตรีมตรงจากผู้ให้บริการต้นทาง AirDash ไม่ได้เก็บภาพ', 'video streams straight from each provider — AirDash stores no footage')}</div>
    </div>`
  document.body.appendChild(overlay)
  document.body.style.overflow = 'hidden'
  overlay.querySelector('.cctv-wall-close').onclick = closeHazeEyes
  overlay.querySelector('.cctv-wall-backdrop').onclick = closeHazeEyes
  overlay.querySelector('.cctv-wall-close').focus()
  document.addEventListener('keydown', onKey)

  const body = overlay.querySelector('.cctv-wall-body')
  const get = async (minPm25) => {
    const res = await fetch(`/api/cctv/haze-eyes?limit=12&min_pm25=${minPm25}`)
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }
  let data, relaxed = false
  try {
    data = await get(25)
    // Most of the wet season nothing is hazy. An empty wall would be true but
    // useless, so when fewer than 6 places pass the threshold, show the cameras
    // nearest the highest readings instead — and say plainly that the air is fine.
    if ((data.eyes?.length ?? 0) < 6) {
      const all = await get(0)
      if ((all.eyes?.length ?? 0) > (data.eyes?.length ?? 0)) { data = all; relaxed = true }
    }
  } catch {
    body.innerHTML = `<p class="cctv-wall-msg">${tr('โหลดไม่สำเร็จ — ลองใหม่อีกครั้งในอีกสักครู่', 'could not load — try again in a moment')}</p>`
    return
  }
  if (!overlay) return // closed while loading
  if (!data.eyes?.length) {
    body.innerHTML = `<p class="cctv-wall-msg">${tr('ยังไม่มีกล้องที่ใช้งานได้ใกล้สถานีวัดฝุ่น', 'no working camera near a PM2.5 station yet')}</p>`
    return
  }
  const note = relaxed ? `<p class="cctv-wall-relaxed">${tr('ตอนนี้ไม่มีพื้นที่ฝุ่นหนัก (PM2.5 เกิน 25) — แสดงกล้องที่ใกล้สถานีค่าสูงที่สุดแทน อากาศโดยรวมอยู่ในเกณฑ์ดี', 'No heavy haze right now (nothing above 25 µg/m³) — showing cameras near the highest readings instead. The air is broadly fine.')}</p>` : ''
  body.innerHTML = `${note}<div class="cctv-wall-grid">${data.eyes.map(cardHtml).join('')}</div>`
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
