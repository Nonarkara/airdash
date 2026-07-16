// Header: national status HERO (JMA-style 5-level), level counters,
// pipeline dots, clock, lang toggle.
//
// The header is the most visually privileged spot on the page. The
// previous design hid the most important thing — the action verb — in a
// tiny 34×34 plate. This redesign makes the verb the first thing the
// user reads, with the JMA 5-level color palette (green→teal→yellow
// →orange→deep red). The verb maps to ONE action; the body of the page
// shows the rest.
import { on, store, setLang } from '../state.js?v=2.0.0-final'
import { BAND, tr } from '../i18n.js?v=2.0.0-final'
import { openInsightsPane } from '../sensorHealth.js?v=2.0.0-final'
import { riskCi } from '../confidence.js?v=2.0.0-final'

// JMA-inspired 5-level palette. Distinct enough that the eye catches the
// level in <500ms even at the small plate size. AirDash's colours are
// the AQI palette itself — the same gradient on the top stripe, so the
// page's only saturated color band tells one consistent story.
const BAND_BG = {
  normal:   '#2E8B57',  // L1 AQI good      — good air
  low:      '#5BA8C7',  // L2 teal           — stay informed (dust season)
  watch:    '#C8B560',  // L3 AQI moderate  — stay informed
  elevated: '#C8453A',  // L4 AQI unhealthy — limit outdoor time
  high:     '#6B2D5C',  // L5 AQI hazardous — protect now
}
const BAND_ICON = {
  normal: '✓', low: 'i', watch: '!', elevated: '!!', high: '!!!',
}

// The header is a NATIONAL roll-up, not a local instruction.
// One JMA-style verb per band (design contract): the verb IS the headline.
const NATIONAL_BAND = {
  normal:   { th: 'อากาศดี',            en: 'GOOD AIR' },
  low:      { th: 'อยู่ในช่วงเฝ้าระวังฝุ่น', en: 'STAY INFORMED' },
  watch:    { th: 'ติดตามสถานการณ์',     en: 'STAY INFORMED' },
  elevated: { th: 'ลดกิจกรรมกลางแจ้ง',   en: 'LIMIT OUTDOOR TIME' },
  high:     { th: 'ป้องกันทันที',         en: 'PROTECT NOW' },
}

// Ask-bar placeholder — first-time visitors don't know what's possible to
// ask; a concrete dust question teaches by example.
const ASK_PLACEHOLDER = {
  th: 'ถามอะไรก็ได้… เช่น "จังหวัดไหนฝุ่นสูงสุดตอนนี้"',
  en: 'Ask anything… e.g. "Which province has the worst dust right now?"',
}

export function initHeader() {
  const clock = document.getElementById('clock')
  const dateEl = document.getElementById('clock-date')
  setInterval(() => {
    const now = new Date()
    clock.textContent = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Bangkok' })
    dateEl.textContent = now.toLocaleDateString(store.lang === 'th' ? 'th-TH' : 'en-GB',
      { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })
  }, 1000)

  const toggle = document.getElementById('langtoggle')
  const paint = () => toggle.querySelectorAll('button').forEach((b) => {
    const active = b.dataset.lang === store.lang
    b.classList.toggle('active', active)
    b.setAttribute('aria-pressed', active ? 'true' : 'false')
  })
  toggle.addEventListener('click', (e) => {
    const lang = e.target?.dataset?.lang
    if (lang) { setLang(lang); paint() }
  })
  paint()

  on('snapshot', renderStatus)
  on('sensor-health', renderQuality)
  on('lang', () => { renderStatus(store.snapshot); renderQuality(store.sensorHealth); paintAskBar() })
  paintAskBar()

  const qBtn = document.getElementById('data-quality')
  if (qBtn) qBtn.addEventListener('click', openInsightsPane)
  // Also paint the method note before the first snapshot lands (server is bilingual).
  const note = document.getElementById('risk-method-note')
  if (note && store.snapshot?.risk) note.textContent =
    store.lang === 'th' ? store.snapshot.risk.method_th : store.snapshot.risk.method_en
}

function paintAskBar() {
  const ask = document.getElementById('ask-hero-input')
  if (ask) ask.placeholder = tr(ASK_PLACEHOLDER.th, ASK_PLACEHOLDER.en)
}

function renderStatus(snap) {
  if (!snap?.risk) return
  const n = snap.risk.national
  // effective_band flips "normal" → "low" during dust season so the
  // "GOOD AIR" verb (misleading when 30%+ of provinces already exceed the
  // moderate PM2.5 line) is replaced with "STAY INFORMED".
  const displayBand = n.effective_band ?? n.band
  const band = NATIONAL_BAND[displayBand] ?? NATIONAL_BAND[n.band] ?? BAND[displayBand] ?? BAND[n.band]
  const plate = document.getElementById('national-plate')
  plate.style.background = BAND_BG[displayBand] ?? BAND_BG[n.band]
  // Watch + low use a yellow / light teal — keep dark text for contrast.
  plate.style.color = (displayBand === 'watch' || displayBand === 'low') ? '#2A2A2A' : '#fff'
  plate.textContent = BAND_ICON[displayBand] ?? '·'

  // The verb is the headline. JMA pattern: one verb per level, no
  // translation needed. Bilingual rendering keeps Thai dominant
  // (audience is Thai) and adds English uppercase as a label.
  document.getElementById('national-th').textContent = band.th
  document.getElementById('national-en').textContent = band.en

  // Confidence interval on the score — the "76 (±5)" trust signal.
  // Computed from the worst-case province score so the verb always
  // carries a visible uncertainty. Tap on the number reveals the range.
  const score = n.max_province_score
  const ciEl = document.getElementById('national-ci')
  if (score != null && ciEl) {
    const c = riskCi(score)
    ciEl.textContent = `±${c.sigma}`
    ciEl.title = tr(`ช่วงคะแนนที่เป็นไปได้: ${c.range}`,
                    `likely score range: ${c.range}`)
    ciEl.hidden = false
  } else if (ciEl) {
    ciEl.hidden = true
  }

  // TTS read-aloud — shows only if the browser supports speechSynthesis.
  // The button reads the area-scoped status + the "why" line aloud in the
  // active language. Designed for elderly / low-literacy / panic cases.
  const ttsEl = document.getElementById('national-tts')
  if (ttsEl) {
    ttsEl.hidden = !('speechSynthesis' in window) || !window.speechSynthesis
  }

  // "Why" — top 1 reason from the action card so the user gets the cause
  // without leaving the hero. If there are no reasons, blank out the line.
  const nv = snap.risk.national_verdict
  const whyEl = document.getElementById('national-why')
  if (whyEl) {
    const r = nv?.reasons?.[0]
    whyEl.textContent = r ? `· ${tr(r.th, r.en)}` : ''
  }

  // Dust-season micro-badge — same UI treatment as the old seasonal badge
  // ("LOW — STAY INFORMED" pseudo-band).
  const seasonEl = document.getElementById('national-season')
  if (seasonEl) {
    if (n.dustSeason && displayBand === 'low') {
      seasonEl.hidden = false
      seasonEl.textContent = tr(
        `ฤดูฝุ่น · ฝุ่นเกินเกณฑ์ใน ${n.dustLoadPct}% ของจังหวัด`,
        `DUST SEASON · PM2.5 past the moderate line in ${n.dustLoadPct}% of provinces`,
      )
    } else {
      seasonEl.hidden = true
    }
  }

  // Hotline button — color matches the band. For elevated/high, the
  // hotline becomes a one-tap call to the PCD pollution hotline 1650 with
  // a clear emergency tint. For safer levels, it stays visible but the
  // label downplays urgency.
  const hotlineEl = document.getElementById('national-hotline')
  if (hotlineEl) {
    hotlineEl.href = 'tel:1650'
    const isUrgent = displayBand === 'elevated' || displayBand === 'high'
    hotlineEl.style.background = isUrgent ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.18)'
    hotlineEl.style.color = isUrgent ? '#7A1F2B' : '#fff'
    hotlineEl.style.borderColor = isUrgent ? '#7A1F2B' : 'rgba(255,255,255,0.35)'
  }

  // Risk method note — comes from the server (which has both languages).
  const note = document.getElementById('risk-method-note')
  if (note && snap.risk.method_th) {
    note.textContent = store.lang === 'th' ? snap.risk.method_th : snap.risk.method_en
  }

  // Band counters — provinces per watch band (worst first).
  const lc = document.getElementById('levelcounts')
  lc.replaceChildren()
  const BAND_LV = [['high', 5], ['elevated', 4], ['watch', 3], ['normal', 1]]
  for (const [b, lv] of BAND_LV) {
    const wrap = document.createElement('div')
    wrap.className = 'lc'
    wrap.innerHTML = `<span class="badge lv${lv}">${BAND_ICON[b]}</span><span class="n">${n.bandCounts?.[b] ?? 0}</span>`
    wrap.title = b
    lc.append(wrap)
  }

  renderQuality(store.sensorHealth)

  const pipes = document.getElementById('pipes')
  pipes.replaceChildren()
  for (const [name, s] of Object.entries(snap.sources ?? {})) {
    const dot = document.createElement('span')
    const state = s.running ? 'run' : s.failures > 0 ? 'bad' : s.lastOk ? 'ok' : ''
    dot.className = `dot ${state}`
    dot.title = `${s.label_th} / ${s.label_en} — ${s.lastOk ? `OK ${s.lastOk.slice(11, 16)}Z` : 'pending'}${s.lastError ? ` · ${s.lastError}` : ''}`
    pipes.append(dot)
  }
}

function renderQuality(health) {
  const btn = document.getElementById('data-quality')
  if (!btn || !health) return
  const score = health.quality_score ?? 0
  const s = health.summary ?? {}
  const issues = (s.stale ?? 0) + (s.flatline ?? 0) + (s.outlier ?? 0) + (s.mismatch ?? 0)
  const band = score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'bad'
  btn.hidden = false
  btn.className = `data-quality ${band}`
  btn.textContent = `${score}`
  btn.title = tr(
    `คุณภาพข้อมูล ${score}/100 — สถานีน่าสงสัย ${issues} แห่ง (เงียบ ${s.stale ?? 0} · ค้าง ${s.flatline ?? 0} · ผิดปกติ ${s.outlier ?? 0} · ไม่สอดคล้อง ${s.mismatch ?? 0}) · แตะเพื่อดูสัญญาลาย`,
    `Data quality ${score}/100 — ${issues} suspicious stations (stale ${s.stale ?? 0} · flatline ${s.flatline ?? 0} · outlier ${s.outlier ?? 0} · mismatch ${s.mismatch ?? 0}) · tap for signals`,
  )
}
