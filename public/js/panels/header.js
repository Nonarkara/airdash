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
import { on, store, setLang } from '../state.js?v=2.4.140'
import { tr } from '../i18n.js?v=2.4.140'
import { openInsightsPane } from '../sensorHealth.js?v=2.4.140'
import { riskCi } from '../confidence.js?v=2.4.140'
import { getJson } from '../cache.js?v=2.4.140'
import { flyToProvince } from '../map.js?v=2.4.140'
import { showProvinceDetail } from './detail.js?v=2.4.140'
import { headlineReading } from '../headline.js?v=2.4.140'

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
  // Two predictable drawers preserve every tool without making the map pay
  // for a permanently expanded toolbar. Search results remain in their field.
  const header = document.querySelector('header')
  const search = document.getElementById('place-search-container')
  const menu = document.getElementById('header-menu')
  const searchToggle = document.getElementById('header-search-toggle')
  const menuToggle = document.getElementById('header-menu-toggle')
  header.append(search)
  menu.append(document.getElementById('data-freshness'))
  search.hidden = true
  const closeDrawers = () => {
    search.hidden = menu.hidden = true
    searchToggle.setAttribute('aria-expanded', 'false')
    menuToggle.setAttribute('aria-expanded', 'false')
  }
  for (const [button, panel] of [[searchToggle, search], [menuToggle, menu]]) {
    button.addEventListener('click', () => {
      const open = panel.hidden
      closeDrawers()
      panel.hidden = !open
      button.setAttribute('aria-expanded', String(open))
      if (open) (panel.querySelector('input, button, a, select'))?.focus()
    })
  }
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const target = !search.hidden ? searchToggle : menuToggle
    closeDrawers()
    target.focus()
  })
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) closeDrawers()
  })
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
  if (thEl) {
    const compact = { normal: ['อากาศดี', 'Good air'], low: ['เฝ้าระวัง', 'Monitor'], watch: ['ติดตาม', 'Watch'], elevated: ['ลดกลางแจ้ง', 'Limit outdoors'], high: ['ป้องกัน', 'Protect now'] }[displayBand] ?? [band.th, band.en]
    thEl.textContent = tr(...compact)
    thEl.title = tr(band.th, band.en)
  }
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
  //
  // This element is OWNED BY THIS FILE. The corpus bible (sec10.4) requires
  // one specific sentence to ship with the score everywhere, and this is
  // where it ships. It used to have a second writer — the ranking panel
  // wrote its sort explanation into the same element on every language
  // switch — and the ranking's ran last, so switching language left the
  // mandated sentence off the screen until the next snapshot. Measured
  // live: scripts/ops/check-method-note.mjs. The sort explanation now has
  // its own element beside the mode switch.
  const note = document.getElementById('risk-method-note')
  if (note && snap.risk.method_th) {
    note.textContent = store.lang === 'th' ? snap.risk.method_th : snap.risk.method_en
  }

  // THE HEADLINE — the measured PM2.5 of the worst province (or of the focused
  // city's province), with its Thai AQI level name. See js/headline.js for why
  // this is no longer the Danger composite; the composite is in the tooltip
  // and one tap away in the province card.
  const dangerEl = document.getElementById('danger-hero')
  const dangerNum = document.getElementById('danger-num')
  const dangerBand = document.getElementById('danger-band')
  if (dangerEl && dangerNum && dangerBand) {
    const activeArea = store.activeArea
    const scopedCode = activeArea && activeArea.id !== 'thailand' && activeArea.province_th
      ? snap.risk.provinces.find((p) => p.province_th === activeArea.province_th)?.province_code ?? null
      : null
    const h = headlineReading(snap.risk.provinces, scopedCode)
    // The unit and "now" are one span so a phone can drop them and keep "PM2.5".
    const kindRest = document.querySelector('#danger-kind .kind-rest')
    if (kindRest) kindRest.textContent = ` µg/m³ ${tr('ตอนนี้', 'now')}`
    const scopeEl = document.getElementById('danger-scope')
    dangerEl.classList.remove('band-normal', 'band-watch', 'band-elevated', 'band-high', 'band-unknown')
    dangerProvince = h?.province ?? null
    if (h) {
      const p = h.province
      const placeName = tr(p.province_th, p.province_en)
      const level = h.name ? tr(h.name.th, h.name.en) : tr('ไม่มีข้อมูล', 'No data')
      dangerEl.classList.add(`band-${h.band}`)
      dangerNum.textContent = Math.round(h.pm25)
      dangerBand.textContent = level.charAt(0).toUpperCase() + level.slice(1)
      if (scopeEl) {
        // "Highest:" is its own span so a narrow header can drop it before it
        // drops the place or the level word (instrument-header.css).
        const pre = document.createElement('span')
        pre.className = 'scope-pre'
        pre.textContent = h.scoped ? '' : `${tr('สูงสุด', 'Highest')}: `
        scopeEl.replaceChildren(pre, placeName + (h.estimated ? ` · ${tr('ค่าประมาณ', 'estimate')}` : ''))
      }
      const line = h.overStandard
        ? tr('เกินมาตรฐาน 24 ชม. ของไทย (37.5)', 'above the Thai 24-hour standard (37.5)')
        : tr('ยังไม่เกินมาตรฐาน 24 ชม. ของไทย (37.5)', 'below the Thai 24-hour standard (37.5)')
      const d = p.danger
      const research = d && Number.isFinite(d.score)
        ? tr(`ดัชนีอันตรายเชิงวิจัย ${d.score}/100 (ไม่ใช่ดัชนีคลินิก: PM2.5 × ความร้อน × ความชื้น × เสียง − ฝน)`,
             `Research danger index ${d.score}/100 (not clinical: PM2.5 × heat × humidity × noise − rain)`)
        : ''
      dangerEl.setAttribute('aria-label', `PM2.5 ${Math.round(h.pm25)} µg/m³ · ${level} · ${placeName} · ${line}`)
      dangerEl.title = [`PM2.5 ${h.pm25.toFixed(1)} µg/m³ · ${level} (${tr('ระดับ AQI ไทย 2566', 'Thai AQI 2023 level')}) · ${placeName}`,
        line, research, tr('แตะเพื่อเปิดจังหวัดนี้', 'tap to open this province')].filter(Boolean).join('\n')
    } else {
      dangerEl.classList.add('band-unknown')
      dangerNum.textContent = '–'
      dangerBand.textContent = tr('รอข้อมูล', '…')
      dangerEl.title = tr('กำลังโหลดค่าฝุ่น…', 'Loading PM2.5…')
      if (scopeEl) scopeEl.textContent = ''
    }
  }

  // WHEN relief comes — hero sub-line under the national verb.
  renderReliefLine(snap)
}
