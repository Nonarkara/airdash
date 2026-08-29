// Universal place search — search any place name (province, station, focus area)
// and get autocomplete results. Select one → map flies there + place card opens
// with live data: nearest AQ stations, watch score, rain-washout outlook.
import { on, store, emit } from '../state.js?v=2.4.17'
import { tr, pick, BAND } from '../i18n.js?v=2.4.17'
import { fmtNum, fmtClock, escapeHtml } from '../fmt.js?v=2.4.17'
import { getJson } from '../cache.js?v=2.4.17'

// Cached province centroids — fetched once, used to give postal results
// a fly-to target. Same numbers the server's gazetteer uses (see
// scripts/build-province-centroids.mjs).
let provinceCentroids = null
async function loadProvinceCentroids() {
  if (provinceCentroids) return provinceCentroids
  try {
    const list = await getJson('/geo/provinces.json', 3600_000)
    provinceCentroids = new Map(list.map((p) => [p.provinceCode, p]))
  } catch { provinceCentroids = new Map() }
  return provinceCentroids
}
loadProvinceCentroids()

const TYPE_ICON = {
  province: '🏛',
  station: '🌫',
  focus: '📍',
  district: '🏘',
  subdistrict: '🏡',
  municipality: '🏙',   // เทศบาล / อบต. — local-government municipality
  postal: '📮',        // postal-code lookup result
}
const SUBTYPE_ICON = {
  air: '🌫',   // สถานีวัดฝุ่น
  rain: '🌧',  // สถานีฝน
}

let searchInput = null
let searchResults = null
let placeCard = null
let debounceTimer = null
let currentSelection = null


// Recent places — frictionless reopen. Empty focus / short query shows
// the last few cities the user opened so "how is it where mom lives"
// is one tap, not a re-type. Survives refresh; private-mode safe.
const RECENT_KEY = 'ad_recent_places_v1'
const RECENT_MAX = 6

function loadRecentPlaces() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function rememberRecent(r) {
  if (!r || (r.lat == null && r.lng == null)) return
  if (!r.name_th && !r.name_en) return
  const key = `${r.type || ''}|${r.name_th || ''}|${r.province_th || ''}|${r.lat}|${r.lng}`
  const slim = {
    type: r.type, subtype: r.subtype,
    name_th: r.name_th, name_en: r.name_en,
    type_th: r.type_th, type_en: r.type_en,
    province_th: r.province_th, province_en: r.province_en,
    province_code: r.province_code,
    lat: r.lat, lng: r.lng, zoom: r.zoom, slug: r.slug,
  }
  const next = [slim, ...loadRecentPlaces().filter((x) => {
    const k = `${x.type || ''}|${x.name_th || ''}|${x.province_th || ''}|${x.lat}|${x.lng}`
    return k !== key
  })].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
}

function showRecentPlaces() {
  if (!searchResults || !searchInput) return
  const list = loadRecentPlaces()
  searchResults.replaceChildren()
  if (list.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'search-empty'
    empty.textContent = tr(
      'พิมพ์ชื่อเมือง หมู่บ้าน หรือสถานที่ — หรือเปิดการ์ดล่าสุดที่นี่หลังค้นหาครั้งแรก',
      'Type a city, village, or place — recent opens appear here after your first search',
    )
    searchResults.appendChild(empty)
  } else {
    const head = document.createElement('div')
    head.className = 'search-recent-head'
    head.innerHTML = `<span class="srh-eyebrow">${tr('ล่าสุด · RECENT', 'RECENT')}</span>
      <span class="srh-hint">${tr('แตะเพื่อเปิดแดชบอร์ดเมืองอีกครั้ง', 'Tap to reopen that city dashboard')}</span>`
    searchResults.appendChild(head)
    list.forEach((r, i) => {
      const icon = TYPE_ICON[r.type] ?? '📍'
      const name = tr(r.name_th, r.name_en)
      const ctx = r.province_th ? tr(r.province_th, r.province_en ?? r.province_th) : ''
      const typeLabel = tr(r.type_th, r.type_en) || (r.type || '')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'search-result search-result-recent'
      button.id = `search-result-recent-${i}`
      button.dataset.idx = i
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', 'false')
      button.innerHTML = `<span class="sr-icon">${icon}</span>
        <span class="sr-body">
          <span class="sr-name">${escapeHtml(name)}</span>
          <span class="sr-ctx">${escapeHtml(typeLabel)}${ctx ? ' · ' + escapeHtml(ctx) : ''}</span>
        </span>`
      button.addEventListener('click', () => selectResult(r))
      button.addEventListener('mouseenter', () => button.classList.add('hover'))
      button.addEventListener('mouseleave', () => button.classList.remove('hover'))
      searchResults.appendChild(button)
    })
  }
  searchResults.style.display = 'block'
  searchInput.setAttribute('aria-expanded', 'true')
}

export function initSearch() {
  searchInput = document.getElementById('place-search')
  searchResults = document.getElementById('search-results')
  placeCard = document.getElementById('place-card')
  if (!searchInput) return

  const placeholder = () => tr(
    'ค้นหาสถานที่ — จังหวัด, อำเภอ, สถานี…',
    'Search places — province, district, station…',
  )
  searchInput.placeholder = placeholder()

  // Autocomplete on type (debounced 350ms)
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer)
    const q = searchInput.value.trim()
    if (q.length < 2) {
      showRecentPlaces()
      return
    }
    debounceTimer = setTimeout(() => doSearch(q), 350)
  })

  // Placeholder hint for postal code search
  const origPh = placeholder()
  searchInput.placeholder = origPh + ' · 10200'

  // Keyboard-aware dropdown positioning. On a phone with the on-screen
  // keyboard up, the static top:108px leaves the dropdown hidden behind
  // the keyboard. Re-anchor it on focus using visualViewport so it sits
  // just below the search input and fits between input and keyboard top.
  const reposition = () => {
    if (!searchInput || !searchResults) return
    const vv = window.visualViewport
    if (!vv) return
    const inputRect = searchInput.getBoundingClientRect()
    // Distance from input's bottom edge to the top of the keyboard
    // (visualViewport.height is the visible area when keyboard is up).
    const bottom = Math.max(8, vv.height - inputRect.bottom - 4)
    const top = inputRect.bottom + 4
    searchResults.style.position = 'fixed'
    searchResults.style.top = `${top}px`
    searchResults.style.bottom = `${bottom}px`
    searchResults.style.left = `${Math.max(8, inputRect.left - 4)}px`
    searchResults.style.right = `${Math.max(8, vv.width - inputRect.right - 4)}px`
    searchResults.style.width = 'auto'
    searchResults.style.maxHeight = 'none'
    searchResults.style.maxWidth = 'none'
  }
  searchInput.addEventListener('focus', () => {
    requestAnimationFrame(reposition)
    if (searchInput.value.trim().length < 2) showRecentPlaces()
  })
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', reposition)
    window.visualViewport.addEventListener('scroll', reposition)
  }
  window.addEventListener('resize', reposition)
  window.addEventListener('orientationchange', reposition)

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.blur(); hideResults() }
    if (e.key === 'Enter') {
      const selected = searchResults?.querySelector('.search-result.selected')
        ?? searchResults?.querySelector('.search-result')
      if (selected) selected.click()
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      navigateResults(e.key === 'ArrowDown' ? 1 : -1)
    }
  })

  // Close results on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#place-search-container')) hideResults()
  })

  // Language switch
  on('lang', () => {
    searchInput.placeholder = placeholder() + ' · 10200'
    if (currentSelection) renderPlaceCard(currentSelection)
  })

  // Clear search button
  document.getElementById('search-clear')?.addEventListener('click', () => {
    searchInput.value = ''
    hideResults()
    hidePlaceCard()
    history.replaceState(null, '', location.pathname)
    document.title = 'AIRDASH — เฝ้าระวังฝุ่นประเทศไทย · Thailand Air Quality Watch'
    emit('search-clear')
  })

  // City deep link (?city=...) — resolve after wiring so the shared link a
  // municipality bookmarks opens directly onto their own dashboard view.
  // Falls through to /<slug> path-based links (e.g. /Sikhio) when no ?city.
  bootCityFromUrl()
  bootCityFromSlug()
  setTimeout(() => { if (!placeCard || placeCard.style.display !== 'block') bootFromSavedCity() }, 600)
}

async function doSearch(q) {
  try {
    // 5-digit numeric → postal-code lookup, which returns tambons served
    // by the same zip. This is the "I don't know my tambon name but I
    // know my zip" path that covers users who don't read Thai.
    let data
    if (/^\d{5}$/.test(q.trim())) {
      data = await getJson(`/api/postal?zip=${q.trim()}&lang=${store.lang}`, 60_000)
      const centroids = await loadProvinceCentroids()
      // Adapt the postal-result shape to the search-result shape so the
      // existing renderer works unchanged. Use the province centroid so
      // the map flies somewhere useful.
      const results = (data.results ?? []).map((r) => {
        const c = centroids.get(r.province_code) ?? null
        return {
          type: 'subdistrict',
          type_th: 'ตำบล · รหัสไปรษณีย์ ' + (r.postal_code ?? ''),
          type_en: 'Tambon · postal ' + (r.postal_code ?? ''),
          name_th: r.name_th, name_en: r.name_en,
          province_th: r.province_th, province_en: r.province_en,
          lat: c?.lat ?? null, lng: c?.lng ?? null, zoom: 12,
        }
      })
      showResults(results)
      return
    }
    data = await getJson(`/api/search?q=${encodeURIComponent(q)}&limit=20`, 10_000)
    showResults(data.results ?? [])
  } catch {
    hideResults()
  }
}

function showResults(results) {
  if (!searchResults) return
  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-empty">${tr('ไม่พบผลลัพธ์', 'No results')}</div>`
    searchResults.style.display = 'block'
    searchInput.setAttribute('aria-expanded', 'true')
    return
  }

  searchResults.replaceChildren(
    ...results.map((r, i) => {
      const icon = TYPE_ICON[r.type] ?? '📍'
      const subIcon = r.subtype ? (SUBTYPE_ICON[r.subtype] ?? '') : ''
      const name = tr(r.name_th, r.name_en)
      const ctx = r.province_th ? tr(r.province_th, r.province_en ?? r.province_th) : ''
      const typeLabel = tr(r.type_th, r.type_en)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'search-result'
      button.id = `search-result-${i}`
      button.dataset.idx = i
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', 'false')
      button.innerHTML = `<span class="sr-icon">${icon}</span>
        <span class="sr-body">
          <span class="sr-name">${escapeHtml(name)}</span>
          <span class="sr-ctx">${subIcon} ${escapeHtml(typeLabel)}${ctx ? ' · ' + escapeHtml(ctx) : ''}</span>
        </span>`
      button.addEventListener('click', () => selectResult(r))
      button.addEventListener('mouseenter', () => button.classList.add('hover'))
      button.addEventListener('mouseleave', () => button.classList.remove('hover'))
      return button
    }),
  )
  searchResults.style.display = 'block'
  searchInput.setAttribute('aria-expanded', 'true')
}

function hideResults() {
  if (searchResults) {
    searchResults.style.display = 'none'
    // Clear the keyboard-aware inline styles so the next open re-applies
    // them via the focus listener. Otherwise the dropdown keeps the
    // "fixed at keyboard top" coordinates from the last session even
    // when the keyboard is gone.
    searchResults.style.top = ''
    searchResults.style.bottom = ''
    searchResults.style.left = ''
    searchResults.style.right = ''
    searchResults.style.width = ''
    searchResults.style.maxHeight = ''
    searchResults.style.maxWidth = ''
    searchResults.style.position = ''
  }
  searchInput?.setAttribute('aria-expanded', 'false')
  searchInput?.removeAttribute('aria-activedescendant')
}

function navigateResults(dir) {
  const items = searchResults?.querySelectorAll('.search-result')
  if (!items || items.length === 0) return
  const current = searchResults.querySelector('.search-result.selected')
  let idx = current ? Number(current.dataset.idx) : -1
  idx = Math.max(0, Math.min(items.length - 1, idx + dir))
  items.forEach((it) => {
    const selected = Number(it.dataset.idx) === idx
    it.classList.toggle('selected', selected)
    it.setAttribute('aria-selected', selected ? 'true' : 'false')
  })
  const active = items[idx]
  if (active) {
    searchInput.setAttribute('aria-activedescendant', active.id)
    active.scrollIntoView({ block: 'nearest' })
  }
}

// Canonical shareable URL for a place — the "my city's dashboard" link a
// mayor can bookmark, print on a poster, or send to their LINE group.
function cityUrl(r) {
  return `${location.origin}/?city=${encodeURIComponent(r.name_th ?? r.name_en ?? '')}`
}

function selectResult(r) {
  hideResults()
  searchInput.value = tr(r.name_th, r.name_en)
  // Fly the map
  emit('place-select', { lat: r.lat, lng: r.lng, zoom: r.zoom ?? 11 })
  // Fetch and show place detail
  loadPlaceDetail(r)
  // Reflect the selection in the address bar + tab title so copying the URL
  // or bookmarking captures this exact city view.
  if (r.name_th || r.name_en) {
    history.replaceState(null, '', `?city=${encodeURIComponent(r.name_th ?? r.name_en)}`)
    document.title = `${tr(r.name_th, r.name_en)} — AIRDASH`
  }
}

// ?city=<name or postal code> boots straight into that municipality's view —
// the individualized dashboard link handed to every city. &tv=1 opens it
// directly in full-screen war-room mode (for the wall TV that reboots).

async function bootFromSavedCity() {
  if (location.pathname !== '/' && location.pathname !== '') return
  if (new URLSearchParams(location.search).get('city')) return
  let saved = null
  try { saved = JSON.parse(localStorage.getItem('ad_my_city_v1') ?? 'null') } catch {}
  if (!saved || typeof saved.lat !== 'number' || typeof saved.lng !== 'number') return
  selectResult(saved)
}

async function bootCityFromUrl() {
  const params = new URLSearchParams(location.search)
  const q = params.get('city')?.trim()
  if (!q) return
  if (params.get('tv') === '1') pendingTv = true
  try {
    const data = await getJson(`/api/search?q=${encodeURIComponent(q)}&limit=1`, 60_000)
    const r = data.results?.[0]
    if (r) selectResult(r)
  } catch { /* bad or stale link — fall through to the normal national view */ }
}

// Clean /<slug> links — public/_redirects sends any path with no matching
// static file to index.html, so by the time this runs, a non-root
// single-segment path is a candidate place slug. Resolved server-side by
// gazetteer.js's slug index (unambiguous by construction).
const RESERVED_TOP_SEGMENTS = new Set(['api', 'css', 'js', 'geo', 'vendor', 'img', 'fonts', 'photos', 'ops.html'])
async function bootCityFromSlug() {
  const seg = location.pathname.slice(1).split('/')[0]
  if (!seg || seg.includes('.') || RESERVED_TOP_SEGMENTS.has(seg)) return
  try {
    const data = await getJson(`/api/place/slug/${encodeURIComponent(seg)}`, 60_000)
    if (data?.result) selectResult(data.result)
  } catch { /* unknown slug — fall through to the normal national view */ }
}

// City mode: while a place card is open it owns the whole left rail — a
// mayor following their ?city= link cares about THEIR city, not the national
// ranking. Everything comes back when the card closes.
const RAIL_SIBLINGS = ['ranking', 'detail', 'city-dashboard', 'forecast-strip', 'whatif']
function setCityMode(onMode) {
  for (const id of RAIL_SIBLINGS) {
    const n = document.getElementById(id)
    if (!n) continue
    // #detail manages its own visibility (station click) and defaults to
    // hidden — restoring it to '' would wrongly reveal an empty panel.
    n.style.display = onMode ? 'none' : (id === 'detail' ? 'none' : '')
  }
}

async function loadPlaceDetail(r) {
  if (!placeCard) return
  setCityMode(true)
  placeCard.style.display = 'block'
  placeCard.innerHTML = `<div class="place-loading">${tr('กำลังโหลดข้อมูล…', 'Loading data…')}</div>`

  try {
    const detail = await getJson(
      `/api/place?lat=${r.lat}&lng=${r.lng}&province=${encodeURIComponent(r.province_th ?? '')}&radius=30`,
      60_000,
    )
    currentSelection = { ...r, detail }
    renderPlaceCard(currentSelection)
    // War-room boards sit on walls for hours — refresh the live data every
    // 2 minutes so the verdict/gauges never go stale. Checklist ticks live
    // in localStorage, so a re-render never loses them.
    clearInterval(refreshTimer)
    refreshTimer = setInterval(async () => {
      if (!currentSelection) return
      try {
        const fresh = await getJson(
          `/api/place?lat=${r.lat}&lng=${r.lng}&province=${encodeURIComponent(r.province_th ?? '')}&radius=30`,
          60_000,
        )
        currentSelection = { ...currentSelection, detail: fresh }
        renderPlaceCard(currentSelection)
      } catch { /* transient — keep showing the last good board */ }
    }, 120_000)
  } catch {
    // The honest failure path — the snapshot or detail fetch blew up.
    // Plain language + a retry button so the user isn't stranded on a
    // blank card wondering "did the network drop, or is the dashboard
    // broken?". Without the button, a non-technical reader has no
    // clear next step.
    placeCard.innerHTML = `
      <div class="place-error">
        <div class="place-error-msg">${tr('โหลดข้อมูลสถานที่ไม่สำเร็จ', "Couldn't load this place")}</div>
        <button class="place-retry" type="button">${tr('ลองอีกครั้ง', 'Try again')}</button>
      </div>`
    const retryBtn = placeCard.querySelector('.place-retry')
    if (retryBtn) retryBtn.addEventListener('click', () => loadPlaceCard())
  }
}

// ── City Command Board ──────────────────────────────────────────────────
// The card a mayor projects on the war-room TV. Order is deliberate:
//   1. verdict — do we worry?          2. time window — how long do we have?
//   3. upstream wave — what's coming?  4. rain outlook — today/tomorrow/next
//   5. gauges w/ trend — is it rising? 6. checklist — what do we DO?
// Everything is computed from the same live pipelines as the national view;
// nothing is pre-authored per city.

const VICON = { safe: '✅', watch: '👀', prepare: '🎒', danger: '🚨' }
const LEVEL_COLOR = { safe: '#00933C', watch: '#F0B400', prepare: '#E86A10', danger: '#A51931' }
const DAY_LABEL = [
  { th: 'วันนี้', en: 'Today' },
  { th: 'พรุ่งนี้', en: 'Tomorrow' },
  { th: 'มะรืนนี้', en: 'Day after' },
]

function rainColor(mm) {
  return mm >= 90 ? '#A51931' : mm >= 35 ? '#E86A10' : mm >= 10 ? '#F0B400' : '#0039A6'
}

// Checklist ticks survive re-renders and page reloads for the rest of the
// day — a war-room board that forgets what you've done is worse than paper.
function checklistKey(sel, level) {
  const day = new Date().toISOString().slice(0, 10)
  return `fd-check-${sel.name_th ?? sel.name_en}-${level}-${day}`
}
function loadTicks(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set() }
}
function saveTicks(key, ticks) {
  try { localStorage.setItem(key, JSON.stringify([...ticks])) } catch { /* private mode */ }
}

function verdictHero(v) {
  if (!v) return ''
  const win = v.window
  return `
    <div class="place-verdict pv-${v.level}">
      <div class="pv-head">${VICON[v.level] ?? ''} ${escapeHtml(tr(v.head_th, v.head_en))}</div>
      ${win ? `<div class="pv-window ${win.hours === 0 ? 'pv-window-now' : ''}">⏱ ${
        win.hours === 0
          ? escapeHtml(tr(win.th, win.en))
          : `${tr('เวลาเตรียมตัว', 'Time to prepare')}: <b>${escapeHtml(tr(win.th, win.en))}</b>`
      }</div>` : ''}
      ${(v.reasons ?? []).map((r) => `<div class="pv-reason">· ${escapeHtml(tr(r.th, r.en))}</div>`).join('')}
      <div class="pv-action">${escapeHtml(tr(v.action_th, v.action_en))}</div>
      <div class="pv-disclaimer">${escapeHtml(tr(v.disclaimer_th, v.disclaimer_en))}</div>
    </div>`
}

function rainOutlook(fcObj, sat) {
  const days = fcObj ? [fcObj.d0, fcObj.d1, fcObj.d2] : []
  const hasDays = days.some((v) => v !== null && v !== undefined)
  if (!hasDays && !sat) return ''
  const maxMm = Math.max(90, ...days.filter((v) => v != null))
  let bars = ''
  if (hasDays) {
    bars = days.map((mm, i) => {
      if (mm === null || mm === undefined) return ''
      const pct = Math.max(3, Math.round((mm / maxMm) * 100))
      return `
        <div class="pc-rain-row">
          <span class="pc-rain-day">${tr(DAY_LABEL[i].th, DAY_LABEL[i].en)}</span>
          <span class="pc-rain-track"><span class="pc-rain-bar" style="width:${pct}%;background:${rainColor(mm)}"></span></span>
          <span class="pc-rain-mm" style="color:${rainColor(mm)}">${fmtNum(mm, 0)}</span>
        </div>`
    }).join('')
  }
  let satChip = ''
  if (sat && sat.value !== null && sat.value !== undefined) {
    const satAge = sat.obs_time ? Math.round((Date.now() - new Date(sat.obs_time).getTime()) / 3_600_000) : null
    satChip = `<div class="pc-sat-chip" style="border-color:${sat.value >= 8 ? '#A51931' : sat.value >= 2 ? '#E86A10' : 'var(--rule-strong)'}">
      🛰 ${tr('ดาวเทียมเห็นฝนตอนนี้', 'Satellite sees rain now')}: <b>${fmtNum(sat.value, 1)} ${tr('มม./ชม.', 'mm/h')}</b>
      ${satAge !== null ? `<span class="pc-sat-age">${tr(`(${satAge} ชม. ที่แล้ว)`, `(${satAge}h ago)`)}</span>` : ''}
    </div>`
  }
  return `
    <div class="place-section">
      <div class="eyebrow">${tr('ฝนที่กำลังมา — ช่วยล้างฝุ่น (มม./วัน)', 'RAIN COMING — WASHOUT (MM/DAY)')}</div>
      ${bars}${satChip}
    </div>`
}

function trendArrow(t) {
  // 6h PM2.5 delta in µg/m³ — ±1 µg is the "moving" threshold.
  if (t === null || t === undefined) return ''
  if (t >= 1) return `<span class="pc-trend pc-trend-up">▲ +${fmtNum(t, 1)}</span>`
  if (t <= -1) return `<span class="pc-trend pc-trend-down">▼ ${fmtNum(t, 1)}</span>`
  return `<span class="pc-trend pc-trend-flat">—</span>`
}

function stationList(aq) {
  if (!aq.length) {
    return `<div class="place-section"><div class="eyebrow">${tr('สถานีวัดฝุ่นใกล้สุด', 'NEAREST AQ STATIONS')}</div>
      <div class="place-empty">${tr('ไม่มีสถานีในรัศมี 30 กม.', 'No stations within 30 km')}</div></div>`
  }
  return `
    <div class="place-section">
      <div class="eyebrow">${tr('สถานีวัดฝุ่นใกล้สุด · แนวโน้ม 6 ชม.', 'NEAREST AQ · 6H TREND')}</div>
      ${aq.map((s) => {
        const pm = s.pm25 ?? null
        const pmColor = pm === null ? '#B7AFA3' : pm >= 75 ? '#A51931' : pm >= 37.5 ? '#E86A10' : pm >= 25 ? '#F0B400' : '#00933C'
        return `<div class="place-station" data-lat="${s.lat}" data-lng="${s.lng}">
          <span class="badge" style="background:${pmColor}">●</span>
          <span class="ps-name">${escapeHtml(tr(s.name_th, s.name_en))}<span class="ps-km">${Math.round(s.distance_km)} ${tr('กม.', 'km')}</span></span>
          ${trendArrow(s.trend_6h)}
          <span class="ps-val">${pm !== null ? fmtNum(pm, 0) + ' µg' : '—'}</span>
        </div>`
      }).join('')}
    </div>`
}

function checklistBlock(sel, v) {
  if (!v?.checklist?.length) return ''
  const key = checklistKey(sel, v.level)
  const ticks = loadTicks(key)
  return `
    <div class="place-section pc-checklist" data-key="${escapeHtml(key)}">
      <div class="eyebrow">${tr('สิ่งที่ต้องทำตอนนี้', 'DO THIS NOW')} · <span class="pc-check-count">${ticks.size}/${v.checklist.length}</span></div>
      ${v.checklist.map((c, i) => `
        <label class="pc-check ${ticks.has(i) ? 'done' : ''}">
          <input type="checkbox" data-i="${i}" ${ticks.has(i) ? 'checked' : ''}>
          <span>${escapeHtml(tr(c.th, c.en))}</span>
        </label>`).join('')}
    </div>`
}

function renderPlaceCard(sel) {
  if (!placeCard) return
  const d = sel.detail
  const name = tr(sel.name_th, sel.name_en)
  const typeLabel = tr(sel.type_th, sel.type_en)
  const prov = sel.province_th ? tr(sel.province_th, sel.province_en ?? sel.province_th) : ''
  const v = d.verdict

  // Header — name, share link, and the TV-mode toggle for the wall screen.
  let html = `
    <button class="place-close" id="place-close">✕</button>
    <div class="place-header" style="border-top: 4px solid ${LEVEL_COLOR[v?.level] ?? 'var(--rule-strong)'}">
      <div class="place-name">${escapeHtml(name)}</div>
      <div class="place-type">${TYPE_ICON[sel.type] ?? '📍'} ${escapeHtml(typeLabel)}${prov ? ' · ' + escapeHtml(prov) : ''}</div>
      <span class="pc-clock" id="pc-clock"></span>
      <div class="pc-header-actions">
        <button class="place-share" id="place-share" title="${tr('คัดลอกลิงก์แดชบอร์ดเมืองนี้', 'Copy this city’s dashboard link')}">🔗 ${tr('ลิงก์เมืองนี้', 'City link')}</button>
        <button class="place-share" id="place-tv" title="${tr('โหมดจอใหญ่สำหรับศูนย์บัญชาการ', 'Full-screen mode for the war-room TV')}">📺 ${tr('โหมด TV', 'TV mode')}</button>
      </div>
    </div>`

  html += `<div class="pc-cols"><div class="pc-main">`
  html += verdictHero(v)
  html += rainOutlook(d.province_forecast, d.sat_rain)

  // Province context — where this city's province sits nationally, for every
  // place type (a tambon inherits its province's regional picture).
  const provRisk = store.snapshot?.risk?.provinces?.find((p) => p.province_th === sel.province_th)
  if (provRisk) {
    const bandColor = { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#A51931' }[provRisk.band]
    const rank = (store.snapshot?.risk?.provinces ?? [])
      // Real DOPA codes are 2 digits; cross-border spillover rows (e.g.
      // Myanmar '10499') must not count in the #rank/77 denominator.
      .filter((p) => p.province_code && p.province_code.length === 2)
      .sort((a, b) => {
        const pa = a.pm25, pb = b.pm25
        const aNull = pa === null || pa === undefined
        const bNull = pb === null || pb === undefined
        if (aNull !== bNull) return aNull ? 1 : -1
        if (!aNull && pb !== pa) return pb - pa
        return (b.score ?? 0) - (a.score ?? 0)
      })
      .findIndex((p) => p.province_th === sel.province_th) + 1
    html += `
      <div class="place-section place-score-band" style="border-left-color:${bandColor}">
        <div class="place-score-val" style="color:${bandColor}">${provRisk.score}</div>
        <div class="place-score-detail">
          <b>${tr('ภาพรวมจังหวัด', 'Province picture')}: ${BAND[provRisk.band][store.lang]}</b><br>
          ${rank > 0 ? `${tr('อันดับอากาศแย่สุด', 'worst-air rank')} #${rank}/77 · ` : ''}
          ${provRisk.stations_unhealthy + provRisk.stations_very_unhealthy > 0 ? `${tr('สถานีเกินเกณฑ์/อันตราย', 'unhealthy/v.unhealthy stn')}: ${provRisk.stations_unhealthy}/${provRisk.stations_very_unhealthy} · ` : ''}
          ${provRisk.pm25 !== null ? `${tr('ฝุ่นสูงสุด', 'worst PM2.5')} ${fmtNum(provRisk.pm25, 0)} µg/m³` : ''}
        </div>
      </div>`
  }
  html += `</div><div class="pc-side">`

  html += stationList(d.nearest_air ?? [])

  // Nearest rain gauges (condensed) — observed washout nearby.
  const rain = d.nearest_rain ?? []
  if (rain.length > 0) {
    html += `
      <div class="place-section">
        <div class="eyebrow">${tr('ฝนสะสม 24 ชม. ใกล้สุด (ล้างฝุ่น)', 'NEAREST RAIN 24H (WASHOUT)')}</div>
        ${rain.slice(0, 3).map((s) => {
          const mm = s.rain_24h ?? 0
          return `<div class="place-station" data-lat="${s.lat}" data-lng="${s.lng}">
            <span class="ps-rain" style="background:${rainColor(mm)}"></span>
            <span class="ps-name">${escapeHtml(tr(s.name_th, s.name_en))}</span>
            <span class="ps-val">${fmtNum(mm)} ${tr('มม.', 'mm')}</span>
          </div>`
        }).join('')}
      </div>`
  }

  html += checklistBlock(sel, v)

  if (sel.blurb_th || sel.blurb_en) {
    html += `<div class="place-section place-blurb">${escapeHtml(tr(sel.blurb_th, sel.blurb_en))}</div>`
  }
  html += `</div></div>` // .pc-side .pc-cols

  html += `<div class="place-warning">⚠ ${tr(
    'ฟังประกาศทางการของ คพ. / กรมอุตุฯ เสมอ — ข้อมูลนี้เพื่อจัดลำดับความสนใจ ไม่ใช่การเตือนภัย',
    'Always follow official PCD / TMD advisories — this data is for prioritisation, not alerts',
  )} · ${tr('สายด่วนมลพิษ คพ. 1650', 'PCD pollution hotline 1650')}</div>`

  placeCard.innerHTML = html

  document.getElementById('place-close')?.addEventListener('click', hidePlaceCard)

  // Share button — clipboard, with a brief "copied" state.
  const shareBtn = document.getElementById('place-share')
  shareBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cityUrl(sel))
      shareBtn.textContent = `✓ ${tr('คัดลอกแล้ว', 'Copied')}`
      setTimeout(() => { shareBtn.textContent = `🔗 ${tr('ลิงก์เมืองนี้', 'City link')}` }, 1600)
    } catch {
      prompt(tr('คัดลอกลิงก์นี้', 'Copy this link'), cityUrl(sel))
    }
  })

  // TV-mode toggle
  document.getElementById('place-tv')?.addEventListener('click', () => setTvMode(!document.body.classList.contains('tv-mode')))
  if (pendingTv) { pendingTv = false; setTvMode(true) }
  updateClock()

  // Checklist ticks → localStorage (re-render safe, reload safe)
  const checkBox = placeCard.querySelector('.pc-checklist')
  checkBox?.addEventListener('change', (e) => {
    const i = Number(e.target?.dataset?.i)
    if (!Number.isFinite(i)) return
    const key = checkBox.dataset.key
    const ticks = loadTicks(key)
    if (e.target.checked) ticks.add(i); else ticks.delete(i)
    saveTicks(key, ticks)
    e.target.closest('.pc-check')?.classList.toggle('done', e.target.checked)
    const counter = checkBox.querySelector('.pc-check-count')
    if (counter) counter.textContent = `${ticks.size}/${checkBox.querySelectorAll('.pc-check').length}`
  })

  // Station click → fly to station
  placeCard.querySelectorAll('.place-station').forEach((el) => {
    el.addEventListener('click', () => {
      const lat = Number(el.dataset.lat)
      const lng = Number(el.dataset.lng)
      emit('place-select', { lat, lng, zoom: 13 })
    })
  })
}

// ── TV mode — the wall-screen version of the board ──────────────────────
// Big type, live clock, auto-refresh. Deep link: ?city=X&tv=1
let pendingTv = false
let clockTimer = null
let refreshTimer = null

function setTvMode(onMode) {
  document.body.classList.toggle('tv-mode', onMode)
  const btn = document.getElementById('place-tv')
  if (btn) btn.textContent = onMode ? `✕ ${tr('ออกจากโหมด TV', 'Exit TV mode')}` : `📺 ${tr('โหมด TV', 'TV mode')}`
  clearInterval(clockTimer)
  if (onMode) {
    clockTimer = setInterval(updateClock, 1000)
    updateClock()
  }
  // Keep the URL shareable in the exact mode being viewed.
  if (currentSelection?.name_th || currentSelection?.name_en) {
    const cityQ = encodeURIComponent(currentSelection.name_th ?? currentSelection.name_en)
    history.replaceState(null, '', `?city=${cityQ}${onMode ? '&tv=1' : ''}`)
  }
}

function updateClock() {
  const el = document.getElementById('pc-clock')
  if (!el) return
  el.textContent = new Date().toLocaleTimeString(store.lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok',
  })
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('tv-mode')) setTvMode(false)
})

function hidePlaceCard() {
  if (placeCard) {
    placeCard.style.display = 'none'
    placeCard.innerHTML = ''
  }
  currentSelection = null
  setCityMode(false)
  document.body.classList.remove('tv-mode')
  clearInterval(clockTimer)
  clearInterval(refreshTimer)
  history.replaceState(null, '', location.pathname)
  document.title = 'AIRDASH — เฝ้าระวังฝุ่นประเทศไทย · Thailand Air Quality Watch'
}
