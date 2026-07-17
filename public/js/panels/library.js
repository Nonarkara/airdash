// The Air Library — bilingual reference reader: the air-bible sections and
// the knowledge/ research notes, all searchable from one tab. TOC by default,
// full-text search on 3+ chars, and a full-screen reader overlay for the docs.
import { getJson } from '../cache.js?v=2.0.0-fix1'
import { store, on, emit } from '../state.js?v=2.0.0-fix1'
import { tr, pick } from '../i18n.js?v=2.0.0-fix1'
import { el } from '../fmt.js?v=2.0.0-fix1'

let toc = null
let query = ''
let searchToken = 0
let debounceTimer = null

export function initLibrary() {
  const box = document.getElementById('library')
  if (!box) return

  const input = el('input', {
    type: 'search', id: 'library-search',
    'data-i18n-ph': 'ค้นห้องสมุด…|Search the library…',
    placeholder: tr('ค้นห้องสมุด…', 'Search the library…'),
  })
  const results = el('div', { class: 'lib-results' })
  box.replaceChildren(el('div', { class: 'lib-search-bar' }, input), results)

  input.addEventListener('input', () => {
    query = input.value.trim()
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSearch(results), 250)
  })

  renderToc(results)

  on('lang', () => {
    if (query.length >= 3) runSearch(results)
    else { toc = null; renderToc(results) }
  })

  initReader()
}

async function renderToc(container) {
  container.replaceChildren(el('div', { class: 'wx-method' }, tr('กำลังโหลด…', 'loading…')))
  try {
    if (!toc) toc = await getJson(`/api/library/toc?lang=${store.lang}`, 5 * 60_000)
  } catch {
    container.replaceChildren(el('div', { class: 'wx-method' }, tr('โหลดไม่สำเร็จ', 'Failed to load')))
    return
  }
  const sections = toc?.sections ?? []
  if (sections.length === 0) {
    container.replaceChildren(el('div', { class: 'wx-method' }, tr('ไม่มีเอกสาร', 'No documents')))
    return
  }
  const rows = []
  let lastGroup = null
  for (const s of sections) {
    const group = s.section.startsWith('bible/') ? 'bible' : (s.section.startsWith('knowledge/') ? 'knowledge' : null)
    if (group && group !== lastGroup) {
      rows.push(el('div', { class: 'lib-group-head' },
        group === 'bible' ? tr('คู่มือฝุ่น (BIBLE)', 'AIR BIBLE') : tr('บันทึกความรู้ (NOTES)', 'KNOWLEDGE NOTES')))
      lastGroup = group
    }
    rows.push(el('div', { class: 'lib-toc-row', onclick: () => openLibraryDoc(s.section) },
      el('div', { class: 'lib-toc-title' },
        el('div', { class: 'th' }, s.title_th || s.title_en || s.section),
        el('div', { class: 'en' }, s.title_en || s.title_th || '')),
      el('div', { class: 'lib-toc-n' }, s.n != null ? String(s.n) : '')))
  }
  container.replaceChildren(...rows)
}

async function runSearch(container) {
  const myToken = ++searchToken
  if (query.length < 3) {
    renderToc(container)
    return
  }
  container.replaceChildren(el('div', { class: 'wx-method' }, tr('กำลังค้นหา…', 'searching…')))
  let data
  try {
    data = await getJson(`/api/library/search?q=${encodeURIComponent(query)}&lang=${store.lang}&limit=30`, 15_000)
  } catch {
    if (myToken !== searchToken) return
    container.replaceChildren(el('div', { class: 'wx-method' }, tr('โหลดไม่สำเร็จ', 'Failed to load')))
    return
  }
  if (myToken !== searchToken) return

  if (data?.error) {
    container.replaceChildren(el('div', { class: 'wx-method' }, tr('พิมพ์อย่างน้อย 3 ตัวอักษร', 'Type at least 3 characters')))
    return
  }
  const results = data?.results ?? []
  if (results.length === 0) {
    container.replaceChildren(el('div', { class: 'wx-method' }, tr('ไม่พบผลลัพธ์', 'No results')))
    return
  }
  const rows = results.map((r) => {
    const snippet = el('div', { class: 'lib-snippet' })
    snippet.innerHTML = r.snippet ?? ''
    return el('div', { class: 'lib-result-row', onclick: () => openLibraryDoc(r.section) },
      el('div', { class: 'lib-result-ctx' }, r.section_title ?? ''),
      el('div', { class: 'lib-result-title' }, r.title ?? ''),
      snippet)
  })
  container.replaceChildren(...rows)
}

// ── Reader overlay ──────────────────────────────────────────────────────────
let currentDoc = null // { key, lang, title, html, prev, next }

function initReader() {
  const overlay = document.getElementById('library-overlay')
  if (!overlay) return
  document.getElementById('library-close')?.addEventListener('click', closeLibraryDoc)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLibraryDoc() })
  document.getElementById('library-prev')?.addEventListener('click', () => {
    if (currentDoc?.prev) openLibraryDoc(currentDoc.prev)
  })
  document.getElementById('library-next')?.addEventListener('click', () => {
    if (currentDoc?.next) openLibraryDoc(currentDoc.next)
  })

  // Docked ⇄ fullscreen. Docked is the default: the map stays live beside
  // the text, which is the whole point of the reader as a teaching tool.
  document.getElementById('library-expand')?.addEventListener('click', () => {
    overlay.classList.toggle('lib-full')
  })

  // Click a linkified place name → fly the map there. If the reader is in
  // fullscreen, drop back to docked so the map is actually visible.
  document.querySelector('.lib-article')?.addEventListener('click', (e) => {
    const g = e.target.closest('.lib-geo')
    if (!g) return
    overlay.classList.remove('lib-full')
    emit('place-select', {
      lat: Number(g.dataset.lat), lng: Number(g.dataset.lng),
      zoom: Number(g.dataset.zoom) || 9,
    })
  })
  const paintClose = () => {
    const lbl = document.querySelector('#library-close .lbl')
    if (lbl) lbl.textContent = tr('ปิด', 'Close')
  }
  paintClose()
  on('lang', () => {
    paintClose()
    if (!overlay.hidden && currentDoc?.key) openLibraryDoc(currentDoc.key)
  })
}

// ── Geo-linkify: place names in Bible text become click-to-fly map links ────
// The didactic loop: read about the northern burning-season haze, click
// "เชียงใหม่", watch the map fly there with today's live stations. Names
// come from the province gazetteer (77 centroids).
let geoTargets = null
async function getGeoTargets() {
  if (geoTargets) return geoTargets
  let provs = []
  try { provs = await getJson('/geo/provinces.json', 3600_000) } catch { /* optional */ }
  geoTargets = provs
    .map((p) => ({ name: p.provinceNameTh, lat: p.lat, lng: p.lng, zoom: 9 }))
    .filter((t) => t.name && t.name.length >= 3)
    // Longest first, so a long name wins over a bare substring.
    .sort((a, b) => b.name.length - a.name.length)
  return geoTargets
}

async function linkifyGeo(article) {
  const targets = await getGeoTargets()
  if (!targets.length) return 0
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement?.closest('a, code, pre, .lib-geo')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  const queue = []
  while (walker.nextNode()) queue.push(walker.currentNode)
  let count = 0
  while (queue.length && count < 200) {
    const node = queue.shift()
    const text = node.nodeValue ?? ''
    let hit = null
    for (const t of targets) {
      const idx = text.indexOf(t.name)
      if (idx >= 0 && (!hit || idx < hit.idx)) hit = { t, idx }
    }
    if (!hit) continue
    const { t, idx } = hit
    const rest = node.splitText(idx)
    rest.nodeValue = rest.nodeValue.slice(t.name.length)
    const a = document.createElement('a')
    a.className = 'lib-geo'
    a.textContent = t.name
    a.title = tr('ดูบนแผนที่', 'Show on map')
    a.dataset.lat = t.lat; a.dataset.lng = t.lng; a.dataset.zoom = t.zoom
    rest.parentNode.insertBefore(a, rest)
    queue.push(rest) // remainder may hold more names
    count += 1
  }
  return count
}

export async function openLibraryDoc(key) {
  if (!key) return
  const overlay = document.getElementById('library-overlay')
  const article = document.querySelector('.lib-article')
  if (!overlay || !article) return
  overlay.hidden = false
  article.innerHTML = `<div class="wx-method">${tr('กำลังโหลด…', 'loading…')}</div>`
  try {
    const doc = await getJson(`/api/library/doc?key=${encodeURIComponent(key)}&lang=${store.lang}`, 5 * 60_000)
    currentDoc = doc
    const titleEl = document.querySelector('#library-overlay .sign .doc-title')
    if (titleEl) titleEl.textContent = doc.title ?? ''
    article.innerHTML = doc.html ?? ''
    const geoCount = await linkifyGeo(article)
    if (geoCount > 0) {
      const hint = document.createElement('div')
      hint.className = 'lib-geo-hint'
      hint.textContent = tr(
        '💡 คลิกชื่อจังหวัดที่ขีดเส้นใต้ เพื่อบินไปดูจุดนั้นบนแผนที่สด',
        '💡 Click an underlined province name to fly the live map there')
      article.prepend(hint)
    }
    article.scrollTop = 0
    const prevBtn = document.getElementById('library-prev')
    const nextBtn = document.getElementById('library-next')
    if (prevBtn) prevBtn.hidden = !doc.prev
    if (nextBtn) nextBtn.hidden = !doc.next
  } catch {
    article.innerHTML = `<div class="wx-method">${tr('โหลดไม่สำเร็จ', 'Failed to load')}</div>`
  }
}

export function closeLibraryDoc() {
  const overlay = document.getElementById('library-overlay')
  if (overlay) overlay.hidden = true
}

window.openLibraryDoc = openLibraryDoc
