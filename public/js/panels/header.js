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
import { on, store, setLang } from '../state.js?v=2.0.0-audit4'
import { tr } from '../i18n.js?v=2.0.0-audit4'
import { openInsightsPane } from '../sensorHealth.js?v=2.0.0-audit4'
import { riskCi } from '../confidence.js?v=2.0.0-audit4'
import { getJson } from '../cache.js?v=2.0.0-audit4'
import { flyToProvince } from '../map.js?v=2.0.0-audit4'
import { showProvinceDetail } from './detail.js?v=2.0.0-audit4'

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
  // into the existing chat input; the old hero form is gone.
  // Uses a DOM CustomEvent so the ask button doesn't need a direct
  // import of main.js (which would be a circular dependency).
  const askBtn = document.getElementById('ask-btn')
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ask-ai', { bubbles: true }))
    })
  }

  // Danger chip is now a real <button>: tapping it opens the same
  // formula breakdown the province detail panel renders, scoped to the
  // province driving the number — no more hover-only tooltip that touch
  // and keyboard users could never reach.
  const dangerBtn = document.getElementById('danger-hero')
  if (dangerBtn) {
    dangerBtn.addEventListener('click', () => {
      if (!dangerProvince) return
      try { flyToProvince(dangerProvince); showProvinceDetail(dangerProvince) } catch {}
    })
  }

  on('snapshot', renderStatus)
  on('sensor-health', () => { /* quiet: pain in v1 was the data-quality pill. Now hidden. */ })
  on('lang', () => { renderStatus(store.snapshot) })
}

// The province row whose Danger composite the hero chip currently shows —
// used by the chip's click handler to open the matching breakdown.
let dangerProvince = null

// Hero relief sub-line — "WHEN does relief come" for the worst-PM province
// ("จ.เชียงใหม่ ฝนช่วยล้างฝุ่นพรุ่งนี้ · washout rain tomorrow, 8mm @98%").
// Only speaks when the worst province is actually dusty (>=25 µg/m³) and
// hides itself otherwise — an honest empty state, not a filler line.
function renderReliefLine(snap) {
  const box = document.getElementById('national-relief')
  if (!box) return
  const worst = snap?.risk?.national?.worstPm25
  if (!worst || !(worst.ug >= 25)) { box.hidden = true; return }
  getJson('/api/washout', 60_000).then((w) => {
    const entry = (w?.provinces ?? []).find((x) => x.province_th === worst.province_th) ?? null
    const eta = entry?.relief_eta
    if (!eta || eta.day === null) { box.hidden = true; return }
    const name = tr(entry.province_th, entry.province_en)
    const mm = eta.mm !== null ? `, ${Math.round(eta.mm)}${tr('มม.', 'mm')}` : ''
    const prob = eta.prob !== null ? ` @${Math.round(eta.prob)}%` : ''
    const worse = entry.worse_before_better
      ? ` · ⚠ ${tr('แย่ลงก่อนดีขึ้น', 'worse before better')}`
      : ''
    box.textContent = `🌧 ${name}: ${tr(eta.label_th, eta.label_en)}${mm}${prob}${worse}`
    box.hidden = false
  }).catch(() => { box.hidden = true })
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

  // DANGER SCORE — paint the hero chip. When a focus city is selected
  // (store.activeArea is set by focus.js), scope the chip to that city's
  // province. When no city is selected (All Thailand), show the worst
  // province nationally — the same headline answer readers expect from
  // the top bar.
  const dangerEl = document.getElementById('danger-hero')
  const dangerNum = document.getElementById('danger-num')
  const dangerBand = document.getElementById('danger-band')
  if (dangerEl && dangerNum && dangerBand) {
    const activeArea = store.activeArea
    let scoped = null
    if (activeArea && activeArea.id !== 'thailand' && activeArea.province_th) {
      scoped = snap.risk.provinces.find((p) => p.province_th === activeArea.province_th) ?? null
    }
    // Worst case across all provinces — used when no city is focused, or
    // when the user's selected city has no data (e.g. first load). Keep
    // the whole province row (not just .danger) so the chip's click can
    // open the matching breakdown panel.
    let worstP = null
    for (const p of snap.risk.provinces) {
      const d = p.danger
      if (!d) continue
      if (!worstP || d.score > worstP.danger.score) worstP = p
    }
    const showP = (scoped?.danger ? scoped : null) ?? worstP
    const show = showP?.danger ?? null
    dangerProvince = showP ?? null
    if (show) {
      const isCityScoped = !!scoped?.danger
      // Smooth transition between bands via a class, not an inline color
      dangerEl.classList.remove('band-normal', 'band-watch', 'band-elevated', 'band-high')
      dangerEl.classList.add(`band-${show.band}`)
      dangerNum.textContent = show.score
      const label = tr(show.label_th, show.label_en)
      dangerBand.textContent = label
      // Add a small "scoped" badge so readers can tell whether the number
      // is national-worst or just-the-city. A tiny chip, not a redraw.
      const cityBadge = isCityScoped
        ? ` · ${tr(activeArea.name_th, activeArea.name_en)}`
        : ''
      // The scope is IN the chip, not tooltip-only: a phone user must be
      // able to see that "62 Dangerous" means one worst province, not
      // the whole country contradicting the calm hero verb next to it.
      const scopeEl = document.getElementById('danger-scope')
      if (scopeEl) {
        scopeEl.textContent = isCityScoped
          ? tr(activeArea.name_th, activeArea.name_en)
          : `${tr(showP.province_th, showP.province_en)} · ${tr('จังหวัดแย่สุด', 'worst province')}`
      }
      // Build the audit-trail tooltip — every modifier, in one place.
      // Lets a curious reader see what drove the number without leaving
      // the top bar.
      const parts = []
      parts.push(`PM2.5 ${show.pm25_live != null ? show.pm25_live.toFixed(0) : '–'} µg/m³ (base ${show.pm_base})`)
      if (show.temp_c != null) parts.push(`T ${show.temp_c.toFixed(0)}°C (heat amp ${(show.heat_amp * 100).toFixed(0)}%)`)
      if (show.rh_pct != null) parts.push(`RH ${show.rh_pct.toFixed(0)}% (hygroscopic amp ${(show.hum_amp * 100).toFixed(0)}%)`)
      if (show.noise_leq_db != null) {
        const nStations = show.noise_stations > 1 ? ` · ${show.noise_stations} stn` : ''
        parts.push(`noise ${show.noise_leq_db.toFixed(0)} dB${nStations} (amp ${(show.noise_amp * 100).toFixed(0)}%)`)
      }
      if (show.rain_relief > 0) parts.push(`rain relief ${(show.rain_relief * 100).toFixed(0)}% (${show.rain_source ?? 'forecast'})`)
      const provinceName = tr(showP.province_th, showP.province_en)
      dangerEl.title = `${label} · ${provinceName} (${show.score}/100)${cityBadge}\n${parts.join(' · ')}\n${tr('แตะเพื่อดูสูตรคำนวณ', 'tap for the formula breakdown')}`
    } else {
      dangerEl.classList.remove('band-normal', 'band-watch', 'band-elevated', 'band-high')
      dangerEl.classList.add('band-normal')
      dangerNum.textContent = '–'
      // Subtle "waiting on data" state — just a short loading hint, not a
      // full sentence that takes two rows in the chip. The national plate
      // already says "กำลังโหลด/LOADING" so duplicating it here is noise.
      dangerBand.textContent = tr('รอข้อมูล', '…')
      dangerEl.title = tr('กำลังโหลดข้อมูล Danger Score…', 'Loading Danger Score…')
      const scopeEl = document.getElementById('danger-scope')
      if (scopeEl) scopeEl.textContent = ''
    }
  }

  // WHEN relief comes — hero sub-line under the national verb.
  renderReliefLine(snap)
}
