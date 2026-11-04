// ── Preprint — the paper behind the system, readable in the About drawer ──
//
// "Nobody owns the haze" (Thiengburanathum & Arkaraprasertkul, 2026) is a
// two-column scientific PDF. The site's CSP (frame-src) and X-Frame-Options
// forbid a native PDF frame, so the pages are drawn on canvases by a vendored
// pdf.js (public/lib/pdfjs-4.10.38, Apache-2.0). Nothing loads until the tab is
// opened: the 1.8 MB of pdf.js is not part of the boot path.
//
// /paper/manifest.json names the files and their sha256, written by
// paper/publish.py; scripts/test-preprint.mjs proves it matches the bytes.
import { store, on } from '../state.js?v=2.4.135'

const tr = (th, en) => (store.lang === 'th' ? th : en)
const PDFJS = '/lib/pdfjs-4.10.38/pdf.min.mjs'
const WORKER = '/lib/pdfjs-4.10.38/pdf.worker.min.mjs'
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3]
const MAX_COLUMN = 980          // css px: fit-width never makes a page wider than this
const MAX_CANVAS_PX = 3000      // device px: caps memory at high zoom on phones
const NARROW = 700              // below this the two-column page is unreadable at fit-width

const SUMMARY = {
  th: 'เอกสารอังกฤษ: ตรวจสอบข้อมูล 110 วันก่อนฤดูฝุ่น พร้อมข้อจำกัดของระบบและการพยากรณ์',
  en: '',
}

let state = null   // { manifest, pdf, pages, zoom, observer, started }

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat()) n.append(c)
  return n
}
const kb = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} kB`)

function shell(root, m) {
  const pdfUrl = `/paper/${m.pdf.file}`
  const dl = tr('ดาวน์โหลด PDF', 'Download PDF')
  const data = tr('ข้อมูลและโค้ด', 'Data & code')
  const open = tr('เปิดในแท็บใหม่', 'Open in new tab')
  const btn = (cls, href, glyph, label, extra = {}) =>
    el('a', { class: `pp-btn ${cls}`, href, 'aria-label': label, title: label, ...extra }, el('span', { class: 'pp-glyph', 'aria-hidden': 'true' }, glyph), el('span', { class: 'pp-lbl' }, label))
  const bar = el('div', { class: 'pp-bar', role: 'toolbar', 'aria-label': tr('ตัวควบคุมเอกสาร', 'Document controls') },
    el('p', { class: 'pp-id' }, el('b', {}, 'Nobody owns the haze'), ` · ${tr('พรีพรินต์', 'preprint')} ${m.version} · ${m.date} · ${tr('ฉบับแก้ไข · รอผู้เขียนทุกคนอนุมัติ · ยังไม่ผ่านผู้ทรงคุณวุฒิ', 'corrected draft · author approval pending · not peer reviewed')}`),
    el('button', { class: 'pp-tool', id: 'pp-out', 'aria-label': tr('ย่อ', 'Zoom out') }, '−'),
    el('output', { class: 'pp-zoom', id: 'pp-zoom', 'aria-live': 'polite' }),
    el('button', { class: 'pp-tool', id: 'pp-in', 'aria-label': tr('ขยาย', 'Zoom in') }, '+'),
    el('output', { class: 'pp-page', id: 'pp-page', 'aria-live': 'polite' }, `1 / ${m.pages}`),
    btn('pp-primary', pdfUrl, '↓', `${dl} · ${kb(m.pdf.bytes)}`, { download: m.pdf.file }),
    btn('', `/paper/${m.supplement.file}`, '{ }', `${data} · ${kb(m.supplement.bytes)}`, { download: m.supplement.file }),
    btn('', pdfUrl, '↗', open, { target: '_blank', rel: 'noopener' }),
  )
  // The PDF is English. Thai readers get the question and the finding up front.
  const note = el('p', { class: 'pp-note' }, tr('ฉบับแก้ไข · รอผู้เขียนทุกคนอนุมัติ · ยังไม่ผ่านผู้ทรงคุณวุฒิ. ', 'Corrected draft · all-author approval pending · not peer reviewed. '), ...(store.lang === 'th' ? [SUMMARY.th] : []))
  const view = el('div', { class: 'pp-view', id: 'pp-view', tabindex: '0', role: 'document', 'aria-label': tr('เอกสาร PDF', 'PDF document') })
  const status = el('p', { class: 'pp-load', id: 'pp-load', role: 'status' }, tr('กำลังโหลดเอกสาร…', 'Loading the paper…'))
  root.replaceChildren(bar, ...(note ? [note] : []), status, view)
  root.querySelector('#pp-out').addEventListener('click', () => zoomBy(-1))
  root.querySelector('#pp-in').addEventListener('click', () => zoomBy(1))
}

const columnWidth = () => Math.min(MAX_COLUMN, document.getElementById('pp-view')?.clientWidth || window.innerWidth || MAX_COLUMN)
const baseZoomIndex = () => (columnWidth() < NARROW ? ZOOMS.indexOf(2.5) : 0)

function paintZoom() {
  const out = document.getElementById('pp-zoom')
  if (out) out.textContent = `${Math.round(ZOOMS[state.zoom] * 100)}%`
  document.getElementById('pp-out').disabled = state.zoom === 0
  document.getElementById('pp-in').disabled = state.zoom === ZOOMS.length - 1
}

function sizeSlots() {
  const w = Math.round(columnWidth() * ZOOMS[state.zoom])
  for (const slot of state.pages) {
    slot.node.style.width = `${w}px`
    slot.node.style.height = `${Math.round(w * slot.ratio)}px`
  }
}

async function drawPage(slot) {
  if (slot.drawing) return
  slot.drawing = true
  const page = await state.pdf.getPage(slot.n)
  const cssW = parseFloat(slot.node.style.width)
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PX / cssW, 3)
  const viewport = page.getViewport({ scale: (cssW * dpr) / page.getViewport({ scale: 1 }).width })
  const canvas = el('canvas', { 'aria-label': `${tr('หน้า', 'Page')} ${slot.n} / ${state.manifest.pages}`, role: 'img' })
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${cssW}px`; canvas.style.height = `${(cssW * canvas.height) / canvas.width}px`
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  slot.node.replaceChildren(canvas)
  slot.drawn = cssW
  slot.drawing = false
}

function observe() {
  state.observer?.disconnect()
  state.observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const slot = state.pages[Number(e.target.dataset.n) - 1]
      if (e.isIntersecting && slot.drawn !== parseFloat(slot.node.style.width)) drawPage(slot).catch(() => { slot.drawing = false })
    }
  }, { root: document.querySelector('.about-pane[data-about-pane="preprint"]'), rootMargin: '600px 0px' })
  for (const slot of state.pages) state.observer.observe(slot.node)
  // the page indicator follows whichever page covers the middle of the pane
  state.pageObserver?.disconnect()
  state.pageObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) document.getElementById('pp-page').textContent = `${e.target.dataset.n} / ${state.manifest.pages}`
  }, { root: document.querySelector('.about-pane[data-about-pane="preprint"]'), rootMargin: '-45% 0px -45% 0px' })
  for (const slot of state.pages) state.pageObserver.observe(slot.node)
}

function zoomBy(step) {
  const next = Math.max(0, Math.min(ZOOMS.length - 1, state.zoom + step))
  if (next === state.zoom) return
  state.zoom = next; state.userZoomed = true
  paintZoom(); sizeSlots(); observe()
}

async function start() {
  const root = document.getElementById('preprint-content')
  if (!root || state?.started) return
  state = { started: true, pages: [], zoom: 0 }
  try {
    const manifest = await (await fetch('/paper/manifest.json', { cache: 'no-cache' })).json()
    state.manifest = manifest
    shell(root, manifest)
    const pdfjs = await import(PDFJS)
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER
    state.pdf = await pdfjs.getDocument({ url: `/paper/${manifest.pdf.file}`, disableFontFace: true }).promise
    const view = document.getElementById('pp-view')
    for (let n = 1; n <= state.pdf.numPages; n++) {
      const first = await state.pdf.getPage(n)
      const { width, height } = first.getViewport({ scale: 1 })
      const node = el('div', { class: 'pp-page-slot', 'data-n': String(n), 'data-label': `${tr('หน้า', 'Page')} ${n}` })
      state.pages.push({ n, ratio: height / width, node })
      view.append(node)
    }
    state.zoom = baseZoomIndex()
    document.getElementById('pp-load').remove()
    paintZoom(); sizeSlots(); observe()
    // The pane can be laid out after this runs (the drawer opens from a link, or the window is resized):
    // when the viewer's real width arrives or changes, size the pages again.
    state.lastWidth = view.clientWidth
    new ResizeObserver(() => {
      if (!view.clientWidth || view.clientWidth === state.lastWidth) return
      state.lastWidth = view.clientWidth
      if (!state.userZoomed) state.zoom = baseZoomIndex()
      paintZoom(); sizeSlots(); observe()
    }).observe(view)
  } catch (err) {
    state.started = false
    const m = state.manifest
    const note = el('p', { class: 'pp-load', role: 'alert' }, tr('แสดงเอกสารในหน้านี้ไม่ได้ ', 'This page could not draw the paper. '),
      m ? el('a', { href: `/paper/${m.pdf.file}`, target: '_blank', rel: 'noopener' }, tr('เปิด PDF โดยตรง', 'Open the PDF directly')) : tr('ลองใหม่ภายหลัง', 'Try again later'))
    ;(document.getElementById('pp-load') ?? root).replaceWith(note)
  }
}

export function initPreprint() {
  const overlay = document.getElementById('about-overlay')
  const tab = overlay?.querySelector('.about-tab[data-about-pane="preprint"]')
  if (!tab) return
  tab.addEventListener('click', start)
  // air.nonarkara.org/#paper opens the About drawer on this tab (shareable link).
  // main.js wires the About button in its own init, which may run after this one,
  // so retry briefly until the drawer actually opens.
  const openFromHash = (tries = 0) => {
    if (location.hash !== '#paper') return
    if (overlay.hidden) document.getElementById('about-btn')?.click()
    if (overlay.hidden && tries < 40) return void setTimeout(() => openFromHash(tries + 1), 250)
    tab.click()
  }
  openFromHash()
  window.addEventListener('hashchange', () => openFromHash())
  // a language change repaints the labels without refetching the PDF
  on('lang', () => {
    if (!state?.manifest || !document.getElementById('pp-view')) return
    const root = document.getElementById('preprint-content')
    const keep = [...root.querySelectorAll('.pp-view')][0]
    const pdfZoom = state.zoom
    shell(root, state.manifest)
    root.querySelector('#pp-view').replaceWith(keep)
    root.querySelector('#pp-load')?.remove()
    state.zoom = pdfZoom; paintZoom()
    state.pageObserver?.disconnect(); state.observer?.disconnect(); observe()
  })
}
