// Compare Places — the redesigned split view.
//
// Superpower: open the overlay and IMMEDIATELY see the hottest provinces
// side-by-side with live JMA verbs + scores. Empty panes kill the aha;
// seeding from the live snapshot is the whole point.
//
//   - Up to 4 panes (2/3/4 selector), each searchable across 70k+ places
//   - Data bar sorted by score — hottest first, with Δ vs #1
//   - Band colors use the real keys (normal/low/watch/elevated/high)

import { on, store } from '../state.js?v=2.4.20'
import { tr, BAND } from '../i18n.js?v=2.4.20'
import { fmtNum, escapeHtml } from '../fmt.js?v=2.4.20'
import { getJson } from '../cache.js?v=2.4.20'

const TYPE_ICON = {
  province: '🏛', district: '🏘', subdistrict: '🏡',
  station: '🌫', focus: '📍',
}

// Fallback lineup when the snapshot hasn't arrived yet — geographic
// spread so the eye sees "different places, different risk" at a glance.
const FALLBACK_SEEDS = [
  { name_th: 'ตราด', name_en: 'Trat', province_th: 'ตราด', province_en: 'Trat', type: 'province', zoom: 10 },
  { name_th: 'สงขลา', name_en: 'Songkhla', province_th: 'สงขลา', province_en: 'Songkhla', type: 'province', zoom: 10 },
  { name_th: 'เชียงใหม่', name_en: 'Chiang Mai', province_th: 'เชียงใหม่', province_en: 'Chiang Mai', type: 'province', zoom: 10 },
  { name_th: 'กรุงเทพมหานคร', name_en: 'Bangkok', province_th: 'กรุงเทพมหานคร', province_en: 'Bangkok', type: 'province', zoom: 11 },
]

const BAND_STROKE = {
  normal: '#00933C', low: '#5BA8C7', watch: '#F0B400',
  elevated: '#E86A10', high: '#7A1F2B',
}

/** Stable dedupe key — province_code types vary (string vs number). */
function placeKey(d) {
  if (!d) return ''
  const code = d.province_code
  if (code != null && code !== '') return `c:${String(code)}`
  const th = d.province_th ?? d.name_th
  if (th) return `t:${th}`
  const en = d.province_en ?? d.name_en
  return en ? `e:${en}` : ''
}

let panes = []
let paneCount = 2
let overlay = null
let dataBar = null
let nextPaneId = 1
let activeDebounce = new Map()
let geoCache = null
let seededOnce = false

export function initSplit() {
  const btn = document.getElementById('split-btn')
  if (!btn) return
  btn.addEventListener('click', open)
  document.getElementById('split-close')?.addEventListener('click', close)
  document.querySelectorAll('#places-actions button[data-panes]').forEach((b) => {
    b.addEventListener('click', () => {
      paneCount = Number(b.dataset.panes)
      document.querySelectorAll('#places-actions button[data-panes]').forEach((x) =>
        x.classList.toggle('active', x === b))
      const grid = document.getElementById('places-grid')
      if (grid) {
        grid.classList.remove('panes-2', 'panes-3', 'panes-4')
        grid.classList.add(`panes-${paneCount}`)
      }
      adjustPaneCount().then(() => {
        seedEmptyPanes()
        renderDataBar()
      })
    })
  })
  on('lang', () => {
    paintChrome()
    if (!overlay?.hidden) renderDataBar()
  })
  on('snapshot', () => {
    if (!overlay?.hidden) {
      for (const p of panes) resolveProvinceRisk(p)
      seedEmptyPanes().then(() => renderDataBar())
    }
  })
  paintChrome()
}

function paintChrome() {
  const close = document.getElementById('split-close')
  if (close) {
    const lbl = close.querySelector('.lbl')
    if (lbl) lbl.textContent = tr('ปิด', 'Close')
    close.setAttribute('title', tr('ปิดหน้าต่างเปรียบเทียบ / close compare view', 'close compare view'))
  }
  const head = document.querySelector('#places-overlay .places-title .th')
  if (head) head.textContent = 'เปรียบเทียบตำแหน่ง'
  const headEn = document.querySelector('#places-overlay .places-title .en')
  if (headEn) headEn.textContent = 'COMPARE PLACES'
  const countLbl = document.querySelector('#places-actions .pane-count-lbl')
  if (countLbl) countLbl.textContent = tr('จำนวนช่อง', 'panes')
  for (const pane of panes) {
    pane.search.placeholder = tr('ค้นหาตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์…',
      'Search tambon / district / province / postal code…')
    pane.search.setAttribute('aria-label', tr('ค้นหาสถานที่ในช่องเปรียบเทียบ', 'Search place in comparison pane'))
    pane.clear.setAttribute('aria-label', tr('ล้างตำแหน่งในช่องนี้', 'Clear this comparison pane'))
  }
}

async function open() {
  if (!overlay) overlay = document.getElementById('places-overlay')
  if (!dataBar) dataBar = document.getElementById('places-data-bar')
  if (!overlay) return
  overlay.hidden = false
  document.getElementById('split-btn')?.setAttribute('aria-pressed', 'true')
  seededOnce = false
  const activeBtn = document.querySelector('#places-actions button[data-panes].active')
  paneCount = activeBtn ? Number(activeBtn.dataset.panes) : 2
  await adjustPaneCount()
  await seedEmptyPanes()
  renderDataBar()
  requestAnimationFrame(() => panes.forEach((p) => p.map?.invalidateSize()))
}

function close() {
  if (!overlay) return
  overlay.hidden = true
  document.getElementById('split-btn')?.setAttribute('aria-pressed', 'false')
  for (const p of panes) p.map?.remove()
  panes = []
  nextPaneId = 1
  seededOnce = false
  paneCount = 2
  const grid = document.getElementById('places-grid')
  if (grid) {
    grid.classList.remove('panes-3', 'panes-4')
    grid.classList.add('panes-2')
  }
  document.querySelectorAll('#places-actions button[data-panes]').forEach((b) =>
    b.classList.toggle('active', b.dataset.panes === '2'))
}

async function adjustPaneCount() {
  while (panes.length < paneCount) panes.push(buildPane())
  while (panes.length > paneCount) {
    const p = panes.pop()
    p.map?.remove()
    p.root?.parentNode?.removeChild(p.root)
  }
  requestAnimationFrame(() => panes.forEach((p) => p.map?.invalidateSize()))
}

/** Instant aha: fill empty panes with live provinces — unique, contrasty. */
async function seedEmptyPanes() {
  const empty = panes.filter((p) => !p.data)
  if (!empty.length) return
  const taken = new Set(panes.filter((p) => p.data).map((p) => placeKey(p.data)))
  const freshOpen = empty.length === panes.length

  if (freshOpen && paneCount === 2 && empty.length === 2) {
    const seeds = await pickSeeds(2, taken, true)
    for (let i = 0; i < empty.length && i < seeds.length; i++) {
      await pickPlace(empty[i], seeds[i], { animate: false })
    }
  } else {
    for (const pane of empty) {
      const seeds = await pickSeeds(1, taken)
      const seed = seeds[0]
      if (!seed) break
      await pickPlace(pane, seed, { animate: false })
      if (pane.data) taken.add(placeKey(pane.data))
    }
  }
  seededOnce = true
}

function toSeed(p, geo) {
  const g = geo.find((x) =>
    (p.province_code != null && String(x.provinceCode) === String(p.province_code)) ||
    (p.province_th && x.provinceNameTh === p.province_th))
  return {
    type: 'province',
    name_th: p.province_th,
    name_en: p.province_en ?? p.province_th,
    province_th: p.province_th,
    province_en: p.province_en,
    province_code: p.province_code,
    lat: g?.lat ?? null,
    lng: g?.lng ?? null,
    zoom: 9,
    risk: p,
  }
}

async function pickSeeds(n, taken = new Set(), contrastPair = false) {
  const list = store.snapshot?.risk?.provinces
  if (list?.length) {
    const seen = new Set()
    const ranked = [...list]
      .filter((p) => p.province_th || p.province_en)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .filter((p) => {
        const k = placeKey(p)
        if (!k || seen.has(k) || taken.has(k)) return false
        seen.add(k)
        return true
      })
    const geo = await loadGeo()

    // 2-pane fresh open: hottest vs a calm contrast — the instant aha.
    if (contrastPair && n === 2 && ranked.length >= 2) {
      const hottest = ranked[0]
      const topScore = hottest.score ?? 0
      let contrast = ranked.find((p, i) => i > 0 && topScore - (p.score ?? 0) >= 15)
      if (!contrast) contrast = ranked[ranked.length - 1]
      if (placeKey(contrast) === placeKey(hottest)) contrast = ranked[1]
      return [hottest, contrast].map((p) => toSeed(p, geo))
    }

    return ranked.slice(0, n).map((p) => toSeed(p, geo))
  }
  return FALLBACK_SEEDS
    .filter((s) => !taken.has(placeKey(s)))
    .slice(0, n)
}

async function loadGeo() {
  if (geoCache) return geoCache
  try {
    geoCache = await getJson('/geo/provinces.json', 3600_000)
  } catch {
    geoCache = []
  }
  return geoCache
}

// ── Per-pane construction ──────────────────────────────────────────
function buildPane() {
  const id = `pane-${nextPaneId++}`
  const root = document.createElement('div')
  root.className = 'place-pane'
  root.dataset.paneId = id

  const searchWrap = document.createElement('div')
  searchWrap.className = 'place-search'
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = tr('ค้นหาตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์…',
    'Search tambon / district / province / postal code…')
  input.setAttribute('aria-label', tr('ค้นหาสถานที่ในช่องเปรียบเทียบ', 'Search place in comparison pane'))
  input.autocomplete = 'off'
  const clear = document.createElement('button')
  clear.className = 'place-search-clear'
  clear.type = 'button'
  clear.textContent = '✕'
  clear.title = tr('ล้าง', 'clear')
  clear.setAttribute('aria-label', tr('ล้างตำแหน่งในช่องนี้', 'Clear this comparison pane'))
  clear.hidden = true
  searchWrap.append(input, clear)
  const results = document.createElement('div')
  results.className = 'place-results'
  results.setAttribute('role', 'listbox')
  results.hidden = true
  root.append(searchWrap, results)

  const mapEl = document.createElement('div')
  mapEl.className = 'place-map'
  root.append(mapEl)

  const mini = document.createElement('div')
  mini.className = 'place-mini'
  root.append(mini)

  document.getElementById('places-grid')?.append(root)

  const map = L.map(mapEl, {
    zoomControl: false, attributionControl: false,
    minZoom: 5, maxZoom: 17, preferCanvas: true,
  }).setView([13.7, 100.5], 6)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 19 }).addTo(map)

  const layer = L.layerGroup().addTo(map)
  const pane = { id, root, search: input, clear, results, map, layer, mini, data: null }

  input.addEventListener('input', () => {
    clear.hidden = !input.value
    const q = input.value.trim()
    if (q.length < 2) { results.hidden = true; results.replaceChildren(); return }
    scheduleSearch(pane, q)
  })
  clear.addEventListener('click', () => {
    input.value = ''; clear.hidden = true
    results.hidden = true; results.replaceChildren()
    pane.data = null
    if (pane.marker) { pane.marker.remove(); pane.marker = null }
    layer.clearLayers()
    root.style.removeProperty('--pane-band')
    renderDataBar()
    paintPaneMini(pane, null)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.blur(); results.hidden = true }
  })
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) results.hidden = true
  })

  paintPaneMini(pane, null)
  return pane
}

function scheduleSearch(pane, q) {
  const prev = activeDebounce.get(pane.id)
  if (prev) clearTimeout(prev)
  const t = setTimeout(() => doSearch(pane, q), 220)
  activeDebounce.set(pane.id, t)
}

async function doSearch(pane, q) {
  try {
    let results
    if (/^\d{5}$/.test(q)) {
      const r = await getJson(`/api/postal?zip=${q}&lang=${store.lang}`, 30_000)
      results = (r.results ?? []).map((row) => ({
        type: 'subdistrict', type_th: 'ตำบล · ' + (row.postal_code ?? ''),
        type_en: 'Tambon · ' + (row.postal_code ?? ''),
        name_th: row.name_th, name_en: row.name_en,
        province_th: row.province_th, province_en: row.province_en,
        lat: null, lng: null, _postal: row.postal_code,
      }))
    } else {
      const r = await getJson(`/api/search?q=${encodeURIComponent(q)}&limit=12`, 8_000)
      results = r.results ?? []
    }
    showResults(pane, results)
  } catch {
    pane.results.hidden = true
  }
}

function showResults(pane, results) {
  const list = pane.results
  list.replaceChildren()
  if (!results.length) {
    list.append(emptyHint(tr('ไม่พบ', 'no results')))
    list.hidden = false
    return
  }
  for (const r of results.slice(0, 10)) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'place-result'
    const icon = TYPE_ICON[r.type] ?? '📍'
    const name = tr(r.name_th, r.name_en)
    const ctx = r.province_th ? tr(r.province_th, r.province_en ?? r.province_th) : ''
    const typeLbl = tr(r.type_th ?? r.type, r.type_en ?? r.type)
    row.innerHTML = `
      <span class="pr-icon">${icon}</span>
      <span class="pr-body">
        <span class="pr-name">${escapeHtml(name)}</span>
        <span class="pr-ctx">${escapeHtml(ctx)} · ${escapeHtml(typeLbl)}</span>
      </span>`
    row.addEventListener('click', () => {
      pickPlace(pane, r)
      list.hidden = true
    })
    list.append(row)
  }
  list.hidden = false
}

function emptyHint(text) {
  const d = document.createElement('div')
  d.className = 'place-empty'
  d.textContent = text
  return d
}

async function pickPlace(pane, place, opts = {}) {
  let lat = place.lat, lng = place.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    try {
      const list = await loadGeo()
      const prov = list.find((p) =>
        (place.province_code && p.provinceCode === place.province_code) ||
        (place.province_th && p.provinceNameTh === place.province_th) ||
        (place.name_th && p.provinceNameTh === place.name_th))
      if (prov) { lat = prov.lat; lng = prov.lng }
    } catch { /* keep null */ }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

  const zoom = place.zoom ?? 10
  if (opts.animate === false) pane.map.setView([lat, lng], zoom, { animate: false })
  else pane.map.flyTo([lat, lng], zoom, { duration: 0.55 })

  pane.layer.clearLayers()
  if (pane.marker) { pane.marker.remove(); pane.marker = null }
  const band = place.risk?.band ?? 'elevated'
  const stroke = BAND_STROKE[band] ?? BAND_STROKE.elevated
  pane.marker = L.circleMarker([lat, lng], {
    radius: 9, color: stroke, weight: 3,
    fillColor: '#fff', fillOpacity: 1,
  }).addTo(pane.layer)
  // Soft halo so the pin reads at a glance across four maps.
  L.circleMarker([lat, lng], {
    radius: 22, color: stroke, weight: 0,
    fillColor: stroke, fillOpacity: 0.18,
    interactive: false,
  }).addTo(pane.layer)

  pane.data = {
    ...place,
    lat, lng, zoom,
    picked_at: new Date().toISOString(),
  }
  pane.search.value = tr(place.name_th, place.name_en)
  pane.clear.hidden = false
  pane.results.hidden = true
  pane.root.style.setProperty('--pane-band', stroke)
  resolveProvinceRisk(pane)
  renderDataBar()
  requestAnimationFrame(() => pane.map?.invalidateSize())
}

function resolveProvinceRisk(pane) {
  if (!pane.data || !store.snapshot?.risk?.provinces) {
    if (pane.data?.risk) paintPaneMini(pane, pane.data.risk)
    return
  }
  const prov = store.snapshot.risk.provinces.find((p) =>
    (pane.data.province_code && p.province_code === pane.data.province_code) ||
    (pane.data.province_th && p.province_th === pane.data.province_th) ||
    (pane.data.province_en && p.province_en === pane.data.province_en) ||
    (pane.data.name_th && p.province_th === pane.data.name_th))
  if (prov) {
    pane.data.risk = prov
    const stroke = BAND_STROKE[prov.band] ?? BAND_STROKE.normal
    pane.root.style.setProperty('--pane-band', stroke)
    if (pane.marker) {
      pane.marker.setStyle({ color: stroke })
    }
  }
  paintPaneMini(pane, pane.data.risk ?? null)
}

function paintPaneMini(pane, risk) {
  if (!risk) {
    pane.mini.replaceChildren(emptyHint(tr('เลือกตำแหน่งเพื่อดูข้อมูล', 'pick a place to see live data')))
    return
  }
  const band = risk.band ?? 'normal'
  const verb = BAND[band] ?? BAND.normal
  pane.mini.replaceChildren(
    miniRow('verb', tr(verb.th, verb.en), `b-${band}`),
    miniRow('score', `${risk.score}`, `b-${band} place-mini-score-lg`),
  )
}

function miniRow(kind, text, klass) {
  const d = document.createElement('div')
  d.className = `place-mini-row place-mini-${kind} ${klass ?? ''}`
  d.textContent = text
  return d
}

// ── Data bar (left rail) ──────────────────────────────────────────
function renderDataBar() {
  if (!dataBar) return
  dataBar.replaceChildren()
  const filled = panes.filter((p) => p.data)
  if (!filled.length) {
    const hint = document.createElement('div')
    hint.className = 'places-bar-hint'
    hint.innerHTML = `
      <div class="hint-h">${tr('กำลังโหลดตำแหน่งร้อน…', 'Loading hottest places…')}</div>
      <div class="hint-b">${tr('หรือพิมพ์ชื่อหมู่บ้าน ตำบล อำเภอ จังหวัด หรือรหัสไปรษณีย์ 5 หลัก',
        'Or type a village, tambon, district, province, or 5-digit postal code')}</div>`
    dataBar.append(hint)
    return
  }

  // Sort hottest → calmest. The ordered stack IS the comparison.
  const ranked = [...filled].sort((a, b) =>
    (b.data.risk?.score ?? -1) - (a.data.risk?.score ?? -1))
  const topScore = ranked[0]?.data?.risk?.score

  if (ranked.length >= 2 && topScore != null) {
    const second = ranked[1]?.data?.risk?.score
    const delta = second != null ? Math.round(topScore - second) : null
    const strip = document.createElement('div')
    strip.className = 'places-compare-strip'
    const topName = tr(ranked[0].data.name_th, ranked[0].data.name_en)
    const topBand = ranked[0].data.risk?.band ?? 'normal'
    const topVerb = BAND[topBand] ?? BAND.normal
    strip.innerHTML = `
      <div class="pcs-label">${tr('ใครร้อนกว่า', 'WHO’S HOTTER')}</div>
      <div class="pcs-winner b-${topBand}">
        <span class="pcs-name">${escapeHtml(topName)}</span>
        <span class="pcs-verb">${escapeHtml(tr(topVerb.th, topVerb.en))}</span>
        <span class="pcs-score">${topScore}</span>
      </div>
      ${delta != null && delta > 0
        ? `<div class="pcs-delta">▲ ${delta} ${tr('คะแนนเหนืออันดับ 2', 'pts over #2')}</div>`
        : `<div class="pcs-delta">${tr('ใกล้เคียงกัน', 'nearly tied')}</div>`}`
    dataBar.append(strip)
  }

  ranked.forEach((p, i) => dataBar.append(dataCard(p, i + 1, topScore)))
}

function dataCard(pane, rank, topScore) {
  const d = pane.data
  const risk = d.risk ?? {}
  const band = risk.band ?? 'normal'
  const verb = BAND[band] ?? BAND.normal
  const card = document.createElement('div')
  card.className = `places-card b-${band}${rank === 1 ? ' is-hot' : ''}`

  const head = document.createElement('div')
  head.className = 'places-card-head'
  const rankEl = document.createElement('div')
  rankEl.className = `places-card-rank${rank === 1 ? ' hot' : ''}`
  rankEl.textContent = `#${rank}`
  const headBody = document.createElement('div')
  headBody.className = 'places-card-titles'
  const name = document.createElement('div')
  name.className = 'places-card-name'
  name.textContent = tr(d.name_th, d.name_en)
  const ctx = document.createElement('div')
  ctx.className = 'places-card-ctx'
  ctx.textContent = [
    d.province_th && d.province_th !== d.name_th ? tr(d.province_th, d.province_en) : '',
    d.district_th ? tr(d.district_th, d.district_en) : '',
  ].filter(Boolean).join(' · ')
  headBody.append(name, ctx)
  const close = document.createElement('button')
  close.className = 'places-card-x'
  close.type = 'button'
  close.textContent = '✕'
  close.title = tr('ลบ', 'remove')
  close.addEventListener('click', () => pane.clear.click())
  head.append(rankEl, headBody, close)
  card.append(head)

  const verbEl = document.createElement('div')
  verbEl.className = `places-card-verb b-${band}`
  verbEl.textContent = tr(verb.th, verb.en)
  card.append(verbEl)

  const rows = document.createElement('div')
  rows.className = 'places-card-rows'
  const score = risk.score
  if (score != null) {
    const delta = topScore != null && rank > 1 ? Math.round(score - topScore) : null
    const scoreTxt = delta != null
      ? `${score}/100 · ${delta}`
      : `${score}/100`
    rows.append(numRow(tr('คะแนน', 'SCORE'), scoreTxt, rank === 1 ? 'hot' : ''))
  } else {
    rows.append(numRow(tr('คะแนน', 'SCORE'), '—'))
  }
  if (score != null) {
    const ci = scoreCi()
    rows.append(numRow(tr('± ความเชื่อมั่น', '± CONFIDENCE'), `±${ci}`, ci > 5 ? 'warn' : ''))
  }
  if (risk.pm25 != null) {
    const klass = risk.pm25 >= 75 ? 'warn' : ''
    rows.append(numRow('PM2.5',
      `${fmtNum(risk.pm25, 0)} µg/m³` +
      (risk.aq_stations ? ` · ${risk.aq_stations} ${tr('สถานี', 'stn')}` : ''), klass))
  }
  if (risk.pm25_fc_48h != null) {
    rows.append(numRow(tr('คาดฝุ่น 48 ชม.', 'PM2.5 FC 48H'),
      `${fmtNum(risk.pm25_fc_48h, 0)} µg/m³`))
  }
  // Washout chip — rain expected to scrub this province's dust.
  if (risk.washout_helps && risk.washout_relief_pct != null) {
    rows.append(numRow(tr('ฝนล้างฝุ่น', 'WASHOUT'),
      `🌧 −${fmtNum(risk.washout_relief_pct, 0)}%` +
      (risk.projected_pm25 != null ? ` → ${fmtNum(risk.projected_pm25, 0)} µg` : '')))
  }
  if (risk.rain_obs_24h != null) {
    rows.append(numRow(tr('ฝน 24 ชม.', 'RAIN 24H'),
      `${fmtNum(risk.rain_obs_24h, 0)} ${tr('มม.', 'mm')}` +
      (risk.rain_stations ? ` · ${risk.rain_stations} ${tr('จุด', 'gauges')}` : '')))
  }
  if (risk.rise_6h_ug != null && Math.abs(risk.rise_6h_ug) > 0.5) {
    const arrow = risk.rise_6h_ug > 0 ? '▲' : '▼'
    const klass = risk.rise_6h_ug > 0 ? 'warn' : ''
    rows.append(numRow(tr('ฝุ่นขึ้น 6 ชม.', 'RISE 6H'),
      `${arrow} ${Math.abs(risk.rise_6h_ug).toFixed(1)} µg`, klass))
  }
  card.append(rows)

  const prov = document.createElement('div')
  prov.className = 'places-card-prov'
  const lat = d.lat?.toFixed?.(4), lng = d.lng?.toFixed?.(4)
  prov.textContent = lat && lng
    ? `${lat}, ${lng} · ${tr('สดจากสัญญาณ', 'live signal')}`
    : tr('สดจากสัญญาณ', 'live signal')
  card.append(prov)

  return card
}

function numRow(label, value, klass) {
  const row = document.createElement('div')
  row.className = `places-card-num ${klass ?? ''}`
  const l = document.createElement('span')
  l.className = 'pcr-lbl'
  l.textContent = label
  const v = document.createElement('span')
  v.className = 'pcr-val'
  v.textContent = value
  row.append(l, v)
  return row
}

function scoreCi() {
  const fresh = store.snapshot?.fetched_at
  const ageMin = fresh ? Math.max(0, (Date.now() - new Date(fresh).getTime()) / 60_000) : 30
  if (ageMin < 5) return 3
  if (ageMin < 15) return 5
  if (ageMin < 60) return 8
  return 12
}
