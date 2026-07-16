// Header: national status HERO (JMA-style 5-level verb) + Danger Score
// chip + minimal toolbar (search / lang / mode / about / ask).
//
// The header is the most visually privileged spot on the page. v2 of the
// header keeps ONE thing loud (the national verb), adds the Danger Score
// (the composite "is it safe to be outside RIGHT NOW") next to it, and
// drops the dozen secondary elements (levelcounts, pipeline dots,
// clockbox, focusbox, hotline chips, TTS button, full-width ask form)
// to a quieter right side. The ask form became a single button that
// opens the existing chat tab — one click, not a typing + clicking flow.
//
// All coloring follows the AQI palette so the only saturated color band
// on the page tells one consistent story.
import { on, store, setLang } from '../state.js?v=2.0.0-final'
import { tr } from '../i18n.js?v=2.0.0-final'
import { openInsightsPane } from '../sensorHealth.js?v=2.0.0-final'
import { riskCi } from '../confidence.js?v=2.0.0-final'
import { selectPane } from '../main.js?v=2.0.0-final'

// AQI-derived 5-level palette — the same gradient the top stripe uses.
// Watch (yellow) keeps dark text for contrast.
const BAND_BG = {
  normal:   '#2E8B57',
  low:      '#5BA8C7',
  watch:    '#C8B560',
  elevated: '#C8453A',
  high:     '#6B2D5C',
}
const BAND_ICON = { normal: '✓', low: 'i', watch: '!', elevated: '!!', high: '!!!' }

// One JMA-style verb per band (design contract): the verb IS the headline.
const NATIONAL_BAND = {
  normal:   { th: 'อากาศดี',            en: 'GOOD AIR' },
  low:      { th: 'อยู่ในช่วงเฝ้าระวังฝุ่น', en: 'STAY INFORMED' },
  watch:    { th: 'ติดตามสถานการณ์',     en: 'STAY INFORMED' },
  elevated: { th: 'ลดกิจกรรมกลางแจ้ง',   en: 'LIMIT OUTDOOR TIME' },
  high:     { th: 'ป้องกันทันที',         en: 'PROTECT NOW' },
}

export function initHeader() {
  const toggle = document.getElementById('langtoggle')
  if (toggle) {
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
  }

  // Single ASK AI button — opens the chat tab. The user can type
  // inside the chat input; the old hero form is gone.
  const askBtn = document.getElementById('ask-btn')
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      try { selectPane('chat') } catch {}
    })
  }

  on('snapshot', renderStatus)
  on('sensor-health', () => { /* quiet: pain in v1 was the data-quality pill. Now hidden. */ })
  on('lang', () => { renderStatus(store.snapshot) })
}

function renderStatus(snap) {
  if (!snap?.risk) return
  const n = snap.risk.national
  const displayBand = n.effective_band ?? n.band
  const band = NATIONAL_BAND[displayBand] ?? NATIONAL_BAND[n.band] ?? { th: '—', en: '—' }

  // National plate — the headline verb.
  const plate = document.getElementById('national-plate')
  if (plate) {
    plate.style.background = BAND_BG[displayBand] ?? BAND_BG[n.band]
    plate.style.color = (displayBand === 'watch' || displayBand === 'low') ? '#2A2A2A' : '#fff'
    plate.textContent = BAND_ICON[displayBand] ?? '·'
  }
  const thEl = document.getElementById('national-th')
  const enEl = document.getElementById('national-en')
  if (thEl) thEl.textContent = band.th
  if (enEl) enEl.textContent = band.en

  // "Why" — top 1 reason from the action card so the user gets the cause
  // without leaving the hero.
  const nv = snap.risk.national_verdict
  const whyEl = document.getElementById('national-why')
  if (whyEl) {
    const r = nv?.reasons?.[0]
    whyEl.textContent = r ? `· ${tr(r.th, r.en)}` : ''
  }

  // Dust-season micro-badge — when the data is calm but a third of the
  // country is already past the moderate PM2.5 line, swap the verb to
  // "STAY INFORMED" so a clean morning doesn't read as "season over".
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

  // Risk method note — the technical citation that travels with the
  // ranking's eyebrow. Bilingual server-side.
  const note = document.getElementById('risk-method-note')
  if (note && snap.risk.method_th) {
    note.textContent = store.lang === 'th' ? snap.risk.method_th : snap.risk.method_en
  }

  // DANGER SCORE — paint the hero chip from the worst province in the
  // ranking. Same `danger` block was added to /api/risk alongside the
  // Air Watch Score, so we don't need a separate fetch.
  const dangerEl = document.getElementById('danger-hero')
  const dangerNum = document.getElementById('danger-num')
  const dangerBand = document.getElementById('danger-band')
  if (dangerEl && dangerNum && dangerBand) {
    // Find the worst Danger score in the ranking. We use the highest
    // (most dangerous) province, not the average, because the headline
    // answer to "is it dangerous outside right now?" is worst-case.
    let worst = null
    for (const p of snap.risk.provinces) {
      const d = p.danger
      if (!d) continue
      if (!worst || d.score > worst.score) worst = d
    }
    if (worst) {
      // Smooth transition between bands via a class, not an inline color
      dangerEl.classList.remove('band-normal', 'band-watch', 'band-elevated', 'band-high')
      dangerEl.classList.add(`band-${worst.band}`)
      dangerNum.textContent = worst.score
      const label = tr(worst.label_th, worst.label_en)
      dangerBand.textContent = label
      // Build the audit-trail tooltip — every modifier, in one place.
      // Lets a curious reader see what drove the number without leaving
      // the top bar.
      const parts = []
      parts.push(`PM2.5 ${worst.pm25_live != null ? worst.pm25_live.toFixed(0) : '–'} µg/m³ (base ${worst.pm_base})`)
      if (worst.temp_c != null) parts.push(`T ${worst.temp_c.toFixed(0)}°C (heat amp ${(worst.heat_amp * 100).toFixed(0)}%)`)
      if (worst.rh_pct != null) parts.push(`RH ${worst.rh_pct.toFixed(0)}% (hygroscopic amp ${(worst.hum_amp * 100).toFixed(0)}%)`)
      if (worst.noise_leq_db != null) {
        const nStations = worst.noise_stations > 1 ? ` · ${worst.noise_stations} stn` : ''
        parts.push(`noise ${worst.noise_leq_db.toFixed(0)} dB${nStations} (amp ${(worst.noise_amp * 100).toFixed(0)}%)`)
      }
      if (worst.rain_relief > 0) parts.push(`rain relief ${(worst.rain_relief * 100).toFixed(0)}% (${worst.rain_source ?? 'forecast'})`)
      const provinceName = tr(worst.province_th, worst.province_en)
      dangerEl.title = `${label} · ${provinceName} (${worst.score}/100)\n${parts.join(' · ')}`
    } else {
      dangerEl.classList.remove('band-normal', 'band-watch', 'band-elevated', 'band-high')
      dangerEl.classList.add('band-normal')
      dangerNum.textContent = '–'
      dangerBand.textContent = tr('กำลังโหลด', 'loading')
    }
  }
}
