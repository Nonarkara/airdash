import { containDialog } from './dialogFocus.js?v=2.4.71'
let releaseDialogFocus
// The Window. One place at a time: the camera that faces it, what people
// reported, and the headline that names it. The filmstrip swaps the place.
// Only the place on the glass plays video — a wall of streams starves the
// small servers these cameras live on.
import { tr } from './i18n.js?v=2.4.71'
import { escapeHtml, ago } from './fmt.js?v=2.4.71'
import { pm25Color } from './paint.js?v=2.4.71'
import { BAND_LABEL, playerHtml, startVideos, stopVideos, visionChipHtml, NOT_OFFICIAL } from './layers/cctvPlayer.js?v=2.4.71'

const CLAIM = {
  smoke: { th: 'ควันไฟ', en: 'fire smoke' },
  washout: { th: 'ฝนจะล้าง', en: 'rain incoming' },
  dust: { th: 'ฝุ่น', en: 'dust' },
  fog: { th: 'หมอก', en: 'fog' },
}
const CLAIM_ORDER = ['smoke', 'washout', 'dust', 'fog']
const KIND = {
  haze: { th: 'ฝุ่น', en: 'haze' },
  smoke: { th: 'ควัน', en: 'smoke' },
  burning: { th: 'การเผา', en: 'burning' },
  other: { th: 'รายงาน', en: 'report' },
}

let overlay = null
let data = null
let index = 0

function primaryClaim(claims) {
  if (!claims) return null
  return CLAIM_ORDER.find((k) => claims[k]) ?? null
}

function placeName(air) {
  return tr(air?.province_th || '', air?.province_en || air?.province_th || '')
}

function stageHtml(place) {
  const air = place.air
  const cam = place.camera
  const color = air ? pm25Color(air.pm25) : '#7E8E9A'
  const band = air ? BAND_LABEL[air.band] : null
  const num = air ? Math.round(air.pm25) : '—'
  const station = air
    ? `${tr(air.name_th || air.name_en || '', air.name_en || air.name_th || '')} · ${air.km} ${tr('กม.', 'km')}`
    : tr('ไม่มีสถานีใกล้กล้องนี้', 'no station near this camera')
  const camName = cam
    ? escapeHtml(tr(cam.name_th || cam.name_en || cam.id, cam.name_en || cam.name_th || cam.id))
    : ''
  const picture = cam ? playerHtml(cam) : `<div class="cctv-air cctv-air-none">${tr('ไม่มีกล้องใกล้สถานีนี้', 'no camera near this station')}</div>`
  const look = cam ? visionChipHtml(cam.vision) : ''
  return `<div class="win-finder" style="--air:${color}">
    <i class="win-corner tl"></i><i class="win-corner tr"></i><i class="win-corner bl"></i><i class="win-corner br"></i>
    <div class="win-picture">${picture}</div>
    <div class="win-lower">
      <div class="win-num">${num}<small>PM2.5</small></div>
      <div>
        <div class="win-place">${escapeHtml(placeName(air) || tr('ไม่ทราบจังหวัด', 'unknown province'))}</div>
        <div class="win-meta">${band ? escapeHtml(tr(band.th, band.en)) + ' · ' : ''}${escapeHtml(station)}</div>
        ${look ? `<div class="win-look">${look}</div>` : ''}
      </div>
      <div class="win-cam">${camName}</div>
    </div>
  </div>
  <div class="win-actions">
    <button type="button" class="win-locate" ${cam ? '' : 'disabled'}>${tr('ดูบนแผนที่', 'show on map')}</button>
  </div>`
}

function claimChip(claims) {
  const k = primaryClaim(claims)
  if (!k) return ''
  const m = CLAIM[k]
  return `<span class="win-chip ${k}">${escapeHtml(tr(m.th, m.en))}</span>`
}

function heardHtml(rows) {
  if (!rows?.length) return `<p class="win-empty">${tr('ยังไม่มีรายงานจากสื่อที่ระบุจังหวัดนี้', 'no credited report names this province')}</p>`
  return rows.map((r) => {
    const title = escapeHtml(r.title || r.place_name || tr('รายงาน', 'report'))
    const body = r.source_url
      ? `<a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title
    const where = r.place_name ? ` · ${escapeHtml(r.place_name)}` : ''
    const prec = r.pin_precision === 1
      ? ` · ${tr('จุดกึ่งกลางจังหวัด', 'province centroid')}`
      : ''
    return `<article class="win-card">${claimChip(r.claims)}${body}<span class="win-credit">${escapeHtml(r.credit_line || '')}${where}${prec}${r.created_at ? ' · ' + escapeHtml(ago(r.created_at)) : ''}</span></article>`
  }).join('')
}

function streetHtml(rows) {
  if (!rows?.length) return `<p class="win-empty">${tr('ไม่มีรายงานไลน์ที่ตรวจแล้วในจังหวัดนี้', 'no approved LINE note for this province')}</p>`
  return rows.map((r) => {
    const kind = KIND[r.kind] || KIND.other
    const msg = escapeHtml((r.message || '').trim() || tr('ส่งตำแหน่งมา โดยไม่มีข้อความ', 'sent a location, no message'))
    const photo = r.has_image ? ` · ${tr('มีภาพที่ตรวจแล้ว (ไม่แสดงต่อสาธารณะ)', 'a reviewed photo exists (not shown publicly)')}` : ''
    return `<article class="win-card"><span class="win-chip dust">${escapeHtml(tr(kind.th, kind.en))}</span>${msg}<span class="win-credit">${tr('ตรวจแล้ว · ไลน์', 'reviewed · LINE')}${photo}${r.created_at ? ' · ' + escapeHtml(ago(r.created_at)) : ''}</span></article>`
  }).join('')
}

function saidHtml(rows) {
  if (!rows?.length) return `<p class="win-empty">${tr('ยังไม่มีข่าวที่ระบุชื่อจังหวัดนี้', 'no headline names this province')}</p>`
  return rows.map((n) => {
    const title = escapeHtml(n.title || '')
    const body = n.link
      ? `<a href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title
    const fire = n.is_fire ? `<span class="win-chip smoke">${tr('ไฟ', 'fire')}</span>` : ''
    return `<article class="win-card">${fire}${body}<span class="win-credit">${n.published_at ? escapeHtml(ago(n.published_at)) : ''}</span></article>`
  }).join('')
}

function ledgerHtml(place) {
  return `<section class="win-sec"><h3>Heard<b>${tr('ได้ยิน', 'What people reported')}</b></h3>${heardHtml(place.heard)}</section>
    <section class="win-sec"><h3>Said<b>${tr('ข่าวว่า', 'What the news said')}</b></h3>${saidHtml(place.said)}</section>
    <section class="win-sec"><h3>Sent<b>${tr('ส่งมา', 'Sent on LINE')}</b></h3>${streetHtml(place.street)}</section>`
}

function stripHtml() {
  return (data?.places ?? []).map((p, i) => {
    const color = p.air ? pm25Color(p.air.pm25) : '#7E8E9A'
    const num = p.air ? Math.round(p.air.pm25) : '—'
    return `<button type="button" class="win-cell${i === index ? ' on' : ''}" data-i="${i}" style="--air:${color}">
      <span class="n">${num}</span><span class="p">${escapeHtml(placeName(p.air) || '—')}</span>
    </button>`
  }).join('')
}

function paint() {
  if (!overlay || !data?.places?.length) return
  index = Math.max(0, Math.min(index, data.places.length - 1))
  const place = data.places[index]
  const stage = overlay.querySelector('.win-stage')
  stopVideos(stage)
  stage.innerHTML = stageHtml(place)
  overlay.querySelector('.win-ledger').innerHTML = ledgerHtml(place)
  overlay.querySelector('.win-strip').innerHTML = stripHtml()
  const note = overlay.querySelector('.win-note')
  if (note) note.textContent = tr(data.note_th || '', data.note_en || data.note_th || '')
  stage.querySelector('.win-locate')?.addEventListener('click', () => {
    const cam = place.camera
    if (!cam) return
    const id = cam.id
    const source = cam.source
    closeWindow()
    window.dispatchEvent(new CustomEvent('airdash:locate-camera', { detail: { id, source } }))
  })
  overlay.querySelectorAll('.win-cell').forEach((b) => {
    b.addEventListener('click', () => { index = Number(b.dataset.i); paint() })
  })
  startVideos(stage)
}

function onKey(e) {
  if (e.key === 'Escape') closeWindow()
  else if (e.key === 'ArrowRight') { index += 1; paint() }
  else if (e.key === 'ArrowLeft') { index -= 1; paint() }
}

export function closeWindow() {
  if (!overlay) return
  stopVideos(overlay)
  document.removeEventListener('keydown', onKey)
  overlay.remove()
  overlay = null
  data = null
  releaseDialogFocus?.(); releaseDialogFocus = null
}

export async function openWindow() {
  closeWindow()
  overlay = document.createElement('div')
  overlay.className = 'win-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', tr('หน้าต่างฟ้า', 'The Window'))
  overlay.innerHTML = `<div class="win-bar">
      <div class="win-brand"><h2>${tr('หน้าต่าง', 'The')}<span>${tr('ฟ้า', ' Window')}</span></h2>
        <p class="win-kicker">one place · picture, report, headline</p></div>
      <p class="win-note">${tr('กำลังเปิดกระจก…', 'opening the glass…')}</p>
      <button type="button" class="win-close">${tr('ปิด', 'Close')}</button>
    </div>
    <div class="win-body"><div class="win-stage"><p class="win-msg">${tr('กำลังหากล้องที่มองอากาศนี้…', 'finding the camera that faces this air…')}</p></div><div class="win-ledger"></div></div>
    <div class="win-strip"></div>`
  document.body.appendChild(overlay)
  releaseDialogFocus = containDialog(overlay)
  const opened = overlay
  overlay.querySelector('.win-close').onclick = closeWindow
  overlay.querySelector('.win-close').focus()
  document.addEventListener('keydown', onKey)
  try {
    const res = await fetch('/api/witness', { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(String(res.status))
    const next = await res.json()
    if (overlay !== opened) return
    data = next
  } catch {
    if (overlay !== opened) return
    overlay.querySelector('.win-stage').innerHTML = `<p class="win-msg">${tr('เปิดหน้าต่างไม่ได้ในตอนนี้ — ลองอีกครั้งในอีกสักครู่', 'the window could not open — try again in a moment')}</p>`
    return
  }
  if (overlay !== opened) return
  if (!data.places?.length) {
    overlay.querySelector('.win-stage').innerHTML = `<p class="win-msg">${tr('ยังไม่มีกล้องที่ใช้งานได้ใกล้สถานีวัดฝุ่น', 'no working camera near a PM2.5 station yet')}</p>`
    const note = overlay.querySelector('.win-note')
    if (note) note.textContent = tr(data.note_th || '', data.note_en || '')
    return
  }
  index = 0
  paint()
}

export function initWitness() {
  document.getElementById('window-btn')?.addEventListener('click', () => { openWindow() })
  if (new URLSearchParams(location.search).has('window')) openWindow()
}
