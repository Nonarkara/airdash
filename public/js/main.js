// AirDash frontend boot: snapshot → map + panels, SSE tap, ticker, tabs, mobile sheet.
import { on, emit, store, setLang } from './state.js?v=2.0.0-final'
import { paintChrome } from './i18n.js?v=2.0.0-final'
import { startTap } from './sse.js?v=2.0.0-final'
import { initMap, invalidateMap } from './map.js?v=2.0.0-final'
import { initHeader } from './panels/header.js?v=2.0.0-final'
import { initRanking } from './panels/ranking.js?v=2.0.0-final'
import { initForecast } from './panels/forecast.js?v=2.0.0-final'
import { initWhatIf } from './panels/whatif.js?v=2.0.0-final'
import { initDetail, hideDetail } from './panels/detail.js?v=2.0.0-final'
import { initTap } from './panels/tap.js?v=2.0.0-final'
import { initSources } from './panels/sources.js?v=2.0.0-final'
import { initHistory } from './panels/history.js?v=2.0.0-final'
import { initInsights } from './panels/insights.js?v=2.0.0-final'
import { initAnalytics } from './panels/analytics.js?v=2.0.0-final'
import { initFeeds } from './panels/feeds.js?v=2.0.0-final'
import { initChat } from './panels/chat.js?v=2.0.0-final'
import { initCitizen } from './panels/citizen.js?v=2.0.0-final'
import { initWaterways } from './panels/waterways.js?v=2.0.0-final'
import { initFocus } from './panels/focus.js?v=2.0.0-final'
import { initCompare } from './panels/compare.js?v=2.0.0-final'
import { initSplit } from './panels/split.js?v=2.0.0-final'
import { initLibrary } from './panels/library.js?v=2.0.0-final'
import { initResearch } from './panels/research.js?v=2.0.0-final'
import { initSearch } from './panels/search.js?v=2.0.0-final'
import { refreshSensorHealth } from './sensorHealth.js?v=2.0.0-final'

function tr(th, en) {
  return store.lang === 'th' ? th : en
}

const SNAPSHOT_MS = 5 * 60_000

async function loadSnapshot() {
  const res = await fetch('/api/snapshot')
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`)
  store.snapshot = await res.json()
  emit('snapshot', store.snapshot)
}

// A single transient blip (a cold Cloudflare Tunnel connection, a server
// restart mid-request) shouldn't strand the operator on a dead boot screen
// during exactly the event this dashboard exists for. Retry with backoff
// before giving up and showing the manual-retry error state.
async function loadSnapshotWithRetry(attempts = 4, delayMs = 1200) {
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
function selectPane(pane) {
  const tabsEl = document.getElementById('righttabs')
  if (!tabsEl) return
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

// Mobile: bottom sheet showing one rail at a time.
function initSheet() {
  const nav = document.getElementById('sheettabs')
  const left = document.getElementById('rail-left')
  const right = document.getElementById('rail-right')
  const apply = (which) => {
    const mobile = window.matchMedia(COMPACT_VIEW).matches
    left.classList.remove('sheet-active')
    right.classList.remove('sheet-active')
    if (!mobile) { invalidateMap(); return }
    if (which === 'risk') { left.classList.add('sheet-active'); hideDetail() }
    else {
      right.classList.add('sheet-active')
      selectPane(which)
    }
    nav.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('active', b.dataset.sheet === which))
    invalidateMap()
  }
  applyMobileSheet = apply
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    apply(btn.dataset.sheet)
  })
  window.matchMedia(COMPACT_VIEW).addEventListener('change', () =>
    apply(document.body.classList.contains('mode-citizen') ? 'citizen' : 'risk'))
  apply(document.body.classList.contains('mode-citizen') ? 'citizen' : 'risk')
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

// ASK AI hero bar — wires the persistent navy bar between the header
// and the rest of the page to the existing chat panel. The previous
// placement (right-rail tab #10) made the only-true-moat feature
// invisible to non-technical users. Submission here does three things:
//   1. Copy the typed question into the chat input
//   2. Switch the right rail to the chat tab (selectPane('chat'))
//   3. Submit the chat form so the existing RAG pipeline runs
// The chat form's existing submit handler is reused — no duplication of
// fetch / streaming / feedback logic.
function initAskHero() {
  const form = document.getElementById('ask-hero')
  const input = document.getElementById('ask-hero-input')
  if (!form || !input) return
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = (input.value ?? '').trim()
    if (!q) return
    // The chat tab lives in the right rail. Open the rail and switch
    // to it so the answer is visible after the user submits.
    const chatInput = document.getElementById('chat-input')
    const chatForm = document.getElementById('chat-form')
    if (chatInput && chatForm) {
      chatInput.value = q
      // selectPane is defined in this file. It also re-applies ARIA.
      try { selectPane('chat') } catch {}
      // Re-submit the chat form — its own handler streams the answer.
      chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    }
    // Clear the hero input once the question has been handed off so
    // the user can ask a follow-up without the old text lingering.
    input.value = ''
  })
}

// TTS read-aloud of the national hero — built for elderly and low-literacy
// users in a panic, where hearing the current area-scoped action is faster
// and more reliable than reading the screen. Uses the browser's
// built-in speechSynthesis so there's no extra dependency and no
// network round-trip.
function initTts() {
  const btn = document.getElementById('national-tts')
  if (!btn || !('speechSynthesis' in window)) return
  btn.addEventListener('click', () => {
    const synth = window.speechSynthesis
    if (synth.speaking) {
      synth.cancel()
      btn.classList.remove('speaking')
      return
    }
    const verb = document.getElementById('national-th')?.textContent ?? ''
    const en = document.getElementById('national-en')?.textContent ?? ''
    const why = document.getElementById('national-why')?.textContent ?? ''
    const lang = store.lang === 'th' ? 'th-TH' : 'en-US'
    const text = store.lang === 'th'
      ? `สถานการณ์ปัจจุบัน: ${verb}. ${why || ''} สายด่วนกรมควบคุมมลพิษ 1650`
      : `Current situation: ${en}. ${why || ''} PCD pollution hotline 1650.`
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = store.lang === 'th' ? 0.9 : 1.0
    u.pitch = 1.0
    u.volume = 1.0
    u.onstart = () => btn.classList.add('speaking')
    u.onend = () => btn.classList.remove('speaking')
    u.onerror = () => btn.classList.remove('speaking')
    try { synth.speak(u) } catch (e) { console.warn('tts failed', e) }
  })
}

async function boot() {
  paintChrome()
  initHeader()
  initMode()
  const map = initMap()
  initRanking()
  initForecast()
  initWhatIf()
  initDetail()
  initTap()
  initSources()
  initHistory()
  initInsights()
  initAnalytics()
  initFeeds()
  initChat()
  initCitizen()
  initWaterways()
  initFocus(map)
  initCompare()
  initSplit(map)
  initLibrary()
  initResearch()
  initSearch()
  initTabs()
  initSheet()
  initAbout()
  initAskHero()
  initTts()

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
