
// AirDash frontend boot: snapshot → map + panels, SSE tap, ticker, tabs, mobile sheet.
import { on, emit, store, setLang } from './state.js?v=2.4.14'
import { paintChrome } from './i18n.js?v=2.4.14'
import { startTap } from './sse.js?v=2.4.14'
import { initMap, invalidateMap } from './map.js?v=2.4.14'
import { initHeader } from './panels/header.js?v=2.4.14'
import { initRanking } from './panels/ranking.js?v=2.4.14'
import { initForecast } from './panels/forecast.js?v=2.4.14'
import { initWhatIf } from './panels/whatif.js?v=2.4.14'
import { initDetail, hideDetail } from './panels/detail.js?v=2.4.14'
import { initTap } from './panels/tap.js?v=2.4.14'
import { initSources } from './panels/sources.js?v=2.4.14'
import { initHistory } from './panels/history.js?v=2.4.14'
import { initInsights } from './panels/insights.js?v=2.4.14'
import { initAnalytics } from './panels/analytics.js?v=2.4.14'
import { initFeeds } from './panels/feeds.js?v=2.4.14'
import { initChat } from './panels/chat.js?v=2.4.14'
import { initCitizen } from './panels/citizen.js?v=2.4.14'
import { initWaterways } from './panels/waterways.js?v=2.4.14'
import { initFocus } from './panels/focus.js?v=2.4.14'
import { initCityDashboard } from './panels/city-dashboard.js?v=2.4.14'
import { initSplit } from './panels/split.js?v=2.4.14'
import { initLibrary } from './panels/library.js?v=2.4.14'
import { initResearch } from './panels/research.js?v=2.4.14'
import { initSearch } from './panels/search.js?v=2.4.14'
import { initDataFreshness } from './dataFreshness.js?v=2.4.14'
import { refreshSensorHealth } from './sensorHealth.js?v=2.4.14'

function tr(th, en) {
  return store.lang === 'th' ? th : en
}

// Wrap a single panel's init so a synchronous throw (e.g. an optional DOM
// element got removed in a header redesign) can never block the rest of
// boot. Without this, a single bad panel strands the operator on the boot
// screen during the exact event the dashboard exists for.
function safeInit(name, fn) {
  try { fn() } catch (e) { console.error(`init ${name} failed:`, e) }
}

const SNAPSHOT_MS = 5 * 60_000
// Snapshot boot timeout. The Cloudflare Pages Function proxy has a 30s
// timeout for non-streaming JSON, and the 779KB snapshot can be slow
// on cellular. 10s is short enough that phone users see the retry
// button fast (via the stuck-on-boot escape hatch), but long enough
// to ride out a normal cold start.
const SNAPSHOT_TIMEOUT_MS = 10_000

async function loadSnapshot() {
  const res = await fetch('/api/snapshot', { cache: 'no-store', signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`)
  store.snapshot = await res.json()
  emit('snapshot', store.snapshot)
}

// A single transient blip (a cold Cloudflare Tunnel connection, a server
// restart mid-request) shouldn't strand the operator on a dead boot screen
// during exactly the event this dashboard exists for. Retry with backoff
// before giving up and showing the manual-retry error state. Two retries
// × 1.5s backoff ≈ 5s max; the stuck-on-boot escape hatch covers anything
// longer so phone users are never stranded silently.
async function loadSnapshotWithRetry(attempts = 2, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    try {
      await loadSnapshot()
      return
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
}

function showBootError(err) {
  const boot = document.getElementById('boot')
  if (!boot) return
  const th = tr('เชื่อมต่อไม่สำเร็จ — ตรวจสอบว่าเซิร์ฟเวอร์และ tunnel ทำงานอยู่',
    'Connection failed — check that the server and tunnel are running')
  const hint = tr('ลองใหม่', 'Retry')
  boot.replaceChildren()
  const sign = document.createElement('div')
  sign.className = 'sign'
  sign.style.textAlign = 'center'
  sign.innerHTML = `<div class="th" style="font-size:16px;color:var(--th-red,#A51931)">${th}</div>
    <div class="en" style="font-size:12px;color:var(--ink-mid);margin-top:6px">${err?.message ?? ''}</div>`
  const btn = document.createElement('button')
  btn.className = 'boot-retry'
  btn.textContent = hint
  btn.addEventListener('click', () => location.reload())
  boot.append(sign, btn)
}

// Stuck-on-boot escape hatch. If the boot is still on screen after 6s,
// reveal the "tap to retry" prompt. Without this, a stuck boot on slow
// cellular or a half-broken SW looks identical to "still loading" and
// the user has no escape. The plain Retry button does a normal reload
// (SW may serve from cache). The "clear cache" button unregisters the
// SW and wipes caches first — useful when the SW is serving broken
// cached HTML from a previous broken deploy. Both are wired below.
function setupBootStuckEscape() {
  const stuck = document.getElementById('boot-stuck')
  if (!stuck) return
  const reveal = () => { if (document.getElementById('boot')) stuck.hidden = false }
  setTimeout(reveal, 6000)
  document.getElementById('boot-retry-btn')?.addEventListener('click', () => {
    // Bypass the SW + HTTP cache for the retry so a broken cached
    // page is not served back to the user.
    const url = new URL(location.href)
    url.searchParams.set('forceReload', String(Date.now()))
    location.replace(url.toString())
  })
  document.getElementById('boot-clear-btn')?.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map((n) => caches.delete(n)))
      }
    } catch (e) { /* best-effort — still reload even if cleanup throws */ }
    const url = new URL(location.href)
    url.searchParams.set('forceReload', String(Date.now()))
    location.replace(url.toString())
  })
}

async function loadTapHistory() {
  const res = await fetch('/api/tap/recent?limit=200')
  const j = await res.json()
  emit('tap-history', j.events ?? [])
}

// Citizen ("ง่าย") vs operator ("เต็ม") view. Citizen mode strips the screen
// to what a non-technical reader needs: map + search + city verdict card.
// First-time visitors arriving through a ?city= link get citizen mode by
// default — that's the audience those links are made for; everyone's choice
// persists in localStorage afterwards.
const MODE_KEY = 'ad_mode'
const COMPACT_VIEW = '(max-width: 1100px)'
let applyMobileSheet = null

function applyMode(mode) {
  document.body.classList.toggle('mode-citizen', mode === 'citizen')
  document.querySelectorAll('#modetoggle button').forEach((b) => {
    const active = b.dataset.mode === mode
    b.classList.toggle('active', active)
    b.setAttribute('aria-pressed', active ? 'true' : 'false')
  })
  localStorage.setItem(MODE_KEY, mode)
  // When switching to citizen mode, the right rail only shows My Area and
  // Alerts. Auto-activate My Area so the panel
  // is visible immediately — that's the whole point of toggling.
  if (mode === 'citizen') {
    try { selectPane('citizen') } catch {}
  } else {
    // FULL means the operator overview, not whichever citizen tab happened
    // to be open before the mode switch.
    try { selectPane('analytics') } catch {}
  }
  if (applyMobileSheet && window.matchMedia(COMPACT_VIEW).matches) {
    applyMobileSheet(mode === 'citizen' ? 'citizen' : 'risk')
  }
  // Leaflet must re-measure after the right rail appears/disappears.
  setTimeout(() => invalidateMap(), 60)
}
function initMode() {
  const stored = localStorage.getItem(MODE_KEY)
  const cityLink = new URLSearchParams(location.search).has('city')
  const mode = stored ?? (cityLink ? 'citizen' : 'operator')
  applyMode(mode)
  document.getElementById('modetoggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (btn) applyMode(btn.dataset.mode)
  })
}

// Switch the right-rail to the named pane. Updates visual state (.active),
// ARIA attributes (aria-selected, hidden, tabindex), so the tab pattern is
// fully accessible to screen-reader and keyboard-only users — officers and
// community leaders who navigate without a mouse during a live event.
export function selectPane(pane) {
  const tabsEl = document.getElementById('righttabs')
  if (!tabsEl) return
  // Citizen (EASY) mode hides every pane except MY AREA and ALERTS via
  // CSS (!important). Selecting a hidden pane would mark it .active while
  // it stays display:none — on mobile that leaves the whole sheet blank
  // (the ASK AI chip used to do exactly this). Refuse the no-op instead.
  if (document.body.classList.contains('mode-citizen') && pane !== 'citizen' && pane !== 'alerts') return
  const tabBtns = Array.from(tabsEl.querySelectorAll('button'))
  const panes = document.querySelectorAll('#rail-right .tabpane')
  tabBtns.forEach((b) => {
    const isActive = b.dataset.pane === pane
    b.classList.toggle('active', isActive)
    b.setAttribute('aria-selected', isActive ? 'true' : 'false')
    b.tabIndex = isActive ? 0 : -1   // roving tabindex: only the active tab is in the tab order
  })
  panes.forEach((p) => {
    const isActive = p.dataset.pane === pane
    p.classList.toggle('active', isActive)
    p.hidden = !isActive              // hidden attribute is the accessibility signal
  })
}

function initTabs() {
  const tabs = document.getElementById('righttabs')
  const tabBtns = Array.from(tabs.querySelectorAll('button'))

  // Sync initial ARIA state from the HTML (.active class on the default tab).
  const initialActive = tabBtns.find((b) => b.classList.contains('active'))
  if (initialActive) selectPane(initialActive.dataset.pane)

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    selectPane(btn.dataset.pane)
  })

  // Keyboard navigation (WAI-ARIA Tabs pattern):
  // Arrow keys move focus + activation; Home/End jump to first/last.
  tabs.addEventListener('keydown', (e) => {
    const idx = tabBtns.indexOf(e.target)
    if (idx < 0) return
    let next = null
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown':
        next = tabBtns[(idx + 1) % tabBtns.length]; break
      case 'ArrowLeft': case 'ArrowUp':
        next = tabBtns[(idx - 1 + tabBtns.length) % tabBtns.length]; break
      case 'Home':
        next = tabBtns[0]; break
      case 'End':
        next = tabBtns[tabBtns.length - 1]; break
    }
    if (next) {
      e.preventDefault()
      next.focus()
      selectPane(next.dataset.pane)
    }
  })
}

// Mobile: single-destination navigation. Exactly ONE of {left rail, right
// rail, map} owns the area between the header and the bottom nav.
//
// This replaces the docked-map layout, where the map held 44% of the space
// below the header whether or not the user wanted it — leaving the map too
// small to read a boundary and the panel too small to read without
// scrolling, both at once. Giving one thing the whole area roughly doubles
// whichever the user actually asked for. (Ported from FloodDash, where the
// before/after was measured at 277px -> 604px on a 375x812 device.)
//
// The old "re-tap the active tab to collapse" gesture is deliberately gone:
// it existed only to reclaim the screen from the docked map, and tapping
// MAP now does that visibly.
function initSheet() {
  const nav = document.getElementById('sheettabs')
  const left = document.getElementById('rail-left')
  const right = document.getElementById('rail-right')
  const moreBtn = document.getElementById('sheet-more')
  const MAP_SHEET = 'map'

  const closeMore = () => {
    nav.classList.remove('more-open')
    moreBtn?.setAttribute('aria-expanded', 'false')
  }

  // Remembered across breakpoint changes so widening to desktop and
  // narrowing back returns you to the destination you were on.
  let currentSheet = document.body.classList.contains('mode-citizen') ? 'citizen' : 'risk'

  const apply = (which) => {
    if (which) currentSheet = which
    const target = currentSheet
    const mobile = window.matchMedia(COMPACT_VIEW).matches
    left.classList.remove('sheet-active')
    right.classList.remove('sheet-active')
    // The map only needs the body flag on mobile; on desktop it is the page
    // and the flag would fight the three-column grid.
    document.body.classList.toggle('map-sheet', mobile && target === MAP_SHEET)
    // Sync the nav BEFORE the desktop bail-out — otherwise a window dragged
    // narrow reveals a bar highlighting a destination whose rail was never
    // mounted: a tab that looks selected next to a blank screen.
    nav.querySelectorAll('button[data-sheet]').forEach((b) => {
      const active = b.dataset.sheet === target
      b.classList.toggle('active', active)
      b.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    if (!mobile) { closeMore(); invalidateMap(); return }
    if (target === MAP_SHEET) {
      // Nothing to mount — the map element is always in the DOM, CSS just
      // stops hiding it. It does need to re-measure (see below).
    } else if (target === 'risk') {
      left.classList.add('sheet-active')
      hideDetail()
    } else {
      right.classList.add('sheet-active')
      selectPane(target)
    }
    // Leaflet measures 0x0 while display:none, so every switch INTO the map
    // must re-measure after the style lands — one frame is not always enough
    // on a slow phone, hence the second pass.
    invalidateMap()
    if (target === MAP_SHEET) {
      requestAnimationFrame(() => invalidateMap())
      setTimeout(() => invalidateMap(), 120)
    }
  }

  applyMobileSheet = apply
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    if (btn === moreBtn) {
      const open = !nav.classList.contains('more-open')
      nav.classList.toggle('more-open', open)
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
      return
    }
    if (!btn.dataset.sheet) return
    closeMore()          // picking anything dismisses the overflow grid
    apply(btn.dataset.sheet)
  })
  // Panels elsewhere ask for a destination through the store bus rather
  // than importing this module — main.js already imports them, so a direct
  // call would be circular.
  on('sheet', (which) => {
    if (which && window.matchMedia(COMPACT_VIEW).matches) { closeMore(); apply(which) }
  })
  // Re-apply on BOTH signals. matchMedia 'change' is the precise one but
  // does not fire in every resize path; a phone rotating or a desktop window
  // dragged narrow must not be left with a highlighted tab and an empty
  // screen. apply() is idempotent, so running it twice costs nothing.
  window.matchMedia(COMPACT_VIEW).addEventListener('change', () => apply())
  let resizeTimer = null
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => apply(), 150)
  })
  apply()
}

// Bottom ticker: alerts first, then the dustiest reading, hot provinces, news.
function renderTicker(snap) {
  if (!snap) return
  const lang = store.lang
  const bits = []
  for (const a of (snap.alerts ?? []).slice(0, 6)) {
    bits.push(`⚠ ${lang === 'th' ? a.message_th : (a.message_en ?? a.message_th)}`)
  }
  const worst = snap.risk?.national?.worstPm25
  if (worst && Number.isFinite(worst.ug)) {
    const wName = lang === 'th' ? (worst.province_th ?? worst.province_en ?? '—')
      : (worst.province_en ?? worst.province_th ?? '—')
    bits.push(lang === 'th'
      ? `PM2.5 สูงสุด ${wName} ${Math.round(worst.ug)} มคก./ลบ.ม.`
      : `worst PM2.5 ${wName} ${Math.round(worst.ug)} µg/m³`)
  }
  for (const p of (snap.risk?.provinces ?? []).filter((p) => p.band !== 'normal').slice(0, 8)) {
    const name = lang === 'th' ? (p.province_th ?? p.province_en ?? '—')
      : (p.province_en ?? p.province_th ?? '—')
    const pm = Number.isFinite(p.pm25) ? ` PM2.5 ${Math.round(p.pm25)}` : ''
    bits.push(`${name}${pm} · ${p.score}/100`)
  }
  for (const n of (snap.news ?? []).slice(0, 5)) {
    const title = lang === 'th' ? (n.title ?? '') : (n.title_en ?? n.title ?? '')
    bits.push(`📰 ${title}`)
  }
  document.getElementById('crawl').replaceChildren(
    ...bits.map((b) => { const s = document.createElement('span'); s.textContent = b; return s }))
}

// About overlay — fine print, methodology, project credit.
// Announce to screen readers that the dashboard is ready. The boot
// screen's aria-live went away with the boot, so we need a separate
// live region to actually fire the message. The message itself is
// the national JMA verb — a screen-reader user gets both "loaded"
// AND the current situation in one announcement.
function announceReady() {
  let r = document.getElementById('aria-live-ready')
  if (!r) {
    r = document.createElement('div')
    r.id = 'aria-live-ready'
    r.className = 'aria-live-sr'
    r.setAttribute('aria-live', 'polite')
    r.setAttribute('aria-atomic', 'true')
    document.body.appendChild(r)
  }
  const verb = document.getElementById('national-th')?.textContent ?? ''
  const en = document.getElementById('national-en')?.textContent ?? ''
  const msg = store?.lang === 'th'
    ? `โหลดข้อมูลเสร็จ · สถานการณ์ปัจจุบัน: ${verb}`
    : `Dashboard ready · current situation: ${en}`
  r.textContent = msg
}

function initAbout() {
  const btn = document.getElementById('about-btn')
  const overlay = document.getElementById('about-overlay')
  const close = document.getElementById('about-close')
  const paint = () => {
    btn.querySelector('.lbl').textContent = tr('เกี่ยวกับ', 'About')
    close.querySelector('.lbl').textContent = tr('ปิด', 'Close')
    // Re-paint every node that carries data-th / data-en attributes.
    for (const node of overlay.querySelectorAll('[data-th][data-en]')) {
      node.textContent = tr(node.dataset.th, node.dataset.en)
    }
  }
  btn.addEventListener('click', () => { overlay.hidden = false; paint() })
  close.addEventListener('click', () => { overlay.hidden = true })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true
  })
  on('lang', paint)
  paint()
}

// ASK AI button — v2 of the header collapses the full hero form into a
// single chip. Tap → opens the chat tab. The user can then type into
// the existing chat input. We removed the form entirely (it took up a
// second row of the header) — the chat tab is the same input surface
// just relocated, and one click is faster than form + submit.
function initAskBtn() {
  const btn = document.getElementById('ask-btn')
  if (!btn) return
  btn.addEventListener('click', () => {
    try { selectPane('chat') } catch {}
  })
}

async function boot() {
  // Each init is wrapped in its own try/catch so a single broken panel
  // (e.g. an optional overlay whose trigger button was removed) can
  // never strand the rest of the boot on a dead screen. The dashboard has
  // nine right-rail panels; the user needs every working one of them,
  // even if a single optional overlay fails to bind.
  paintChrome()
  initHeader()
  initAskBtn()
  initMode()
  const map = initMap()
  safeInit('ranking', initRanking)
  safeInit('forecast', initForecast)
  safeInit('whatif', initWhatIf)
  safeInit('detail', initDetail)
  safeInit('tap', initTap)
  safeInit('sources', initSources)
  safeInit('history', initHistory)
  safeInit('insights', initInsights)
  safeInit('analytics', initAnalytics)
  safeInit('feeds', initFeeds)
  safeInit('chat', initChat)
  safeInit('citizen', initCitizen)
  safeInit('waterways', initWaterways)
  safeInit('cityDashboard', initCityDashboard)
  // initFocus is async; if it fails the rest of the boot must still
  // proceed. It is the canonical ?city= resolver for FOCUS IDS
  // (?city=chiangmai): it populates the header dropdown, wires the
  // city-picker grid's 'focus' events, sets store.activeArea (which
  // city-scopes the header Danger chip) and keeps the URL in sync.
  // Province names / place names in ?city= are resolved by citizen.js
  // (EASY mode pin, space-insensitive) and search.js (place card).
  safeInit('focus', () => initFocus(map))
  safeInit('split', () => initSplit(map))
  safeInit('library', initLibrary)
  safeInit('research', initResearch)
  safeInit('search', initSearch)
  safeInit('tabs', initTabs)
  safeInit('dataFreshness', initDataFreshness)
  safeInit('sheet', initSheet)
  safeInit('about', initAbout)
  // Wire the stuck-on-boot escape hatch. Runs even if every safeInit
  // succeeded — a slow /api/snapshot on cellular can keep the boot
  // screen up well past the point a phone user is comfortable.
  setupBootStuckEscape()

  // Place search → fly the map
  on('place-select', ({ lat, lng, zoom }) => {
    if (map && Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], zoom ?? 11, { duration: 0.8 })
    }
  })
  on('search-clear', () => {
    // Restore ranking panel visibility when search is cleared
    document.getElementById('ranking').style.display = ''
  })

  on('snapshot', renderTicker)
  on('lang', () => { paintChrome(); renderTicker(store.snapshot) })
  on('resync', () => { loadSnapshot(); loadTapHistory() })
  // The ask-ai button in the header fires this event; we listen here
  // (not in header.js) to keep the boot flow acyclic.
  window.addEventListener('ask-ai', () => { try { selectPane('chat') } catch (e) { console.error('ask-ai:', e) } })
  // Refresh aggregates periodically; the tap keeps the feel live in between.
  setInterval(loadSnapshot, SNAPSHOT_MS)
  // A critical alert refreshes aggregates immediately.
  on('tap', (e) => { if (e.kind === 'alert' && e.severity >= 2) loadSnapshot() })

  try {
    await loadSnapshotWithRetry()
    await loadTapHistory()
    refreshSensorHealth().catch(() => {})
    document.getElementById('boot')?.remove()
    // Announce readiness to screen readers via a hidden live region.
    // The boot's own aria-live went away with the boot — we need a
    // separate region to actually fire the "ready" message. Reading
    // the national JMA verb out is enough: a screen reader user knows
    // the dashboard is live AND the current situation in one line.
    announceReady()
    startTap()
    invalidateMap()
  } catch (err) {
    showBootError(err)
  }
}

boot()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
