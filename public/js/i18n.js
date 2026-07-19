// Bilingual helper — Thai first, always. Signage shows both; dynamic text
// follows the selected language.
import { store } from './state.js?v=2.0.0-tg1'

export function tr(th, en) {
  return store.lang === 'th' ? th : en
}

/** Pick from a bilingual record {x_th, x_en} with graceful fallback. */
export function pick(obj, base) {
  const th = obj?.[`${base}_th`]
  const en = obj?.[`${base}_en`]
  return store.lang === 'th' ? (th ?? en ?? '—') : (en ?? th ?? '—')
}

/** Repaint static chrome (tabs, labels, placeholders) on language switch. */
export function paintChrome() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const [th, en] = (node.dataset.i18n ?? '').split('|')
    if (th) node.textContent = tr(th, en ?? th)
  }
  for (const node of document.querySelectorAll('[data-i18n-html]')) {
    const [th, en] = (node.dataset.i18nHtml ?? '').split('|')
    if (th) node.innerHTML = tr(th, en ?? th)
  }
  for (const node of document.querySelectorAll('[data-i18n-ph]')) {
    const [th, en] = (node.dataset.i18nPh ?? '').split('|')
    if (th) node.placeholder = tr(th, en ?? th)
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    const [th, en] = (node.dataset.i18nTitle ?? '').split('|')
    if (th) node.title = tr(th, en ?? th)
  }
  // Tab/sheet buttons are permanent bilingual signage (Thai label + small
  // English caption, matching the header brand and .sign convention elsewhere)
  // — they intentionally do NOT toggle with the language switch, so their
  // static HTML is left untouched here. (A previous version repainted them
  // via innerHTML, which both duplicated the label in English mode and
  // destroyed the nested #alert-cnt counter span on every repaint.)
  const live = document.querySelector('#ticker .live')
  if (live) live.innerHTML = `<span class="pip"></span> ${tr('สด', 'LIVE')}`
  document.documentElement.lang = store.lang === 'th' ? 'th' : 'en'
}

// BAND — plain-language action framework for the heuristic watch score.
// This dashboard can tell people to pay attention, prepare, or protect
// themselves, but it cannot issue a health order. Only PCD / DDC / local
// authorities can do that. Keep the strongest heuristic band at ACT NOW and
// point the detailed action copy to official instructions.
export const BAND = {
  normal:   { th: 'ปลอดภัย',        en: 'ALL CLEAR',          noun_th: 'ปกติ',     noun_en: 'NORMAL'    },
  low:      { th: 'ติดตาม',         en: 'STAY INFORMED',      noun_th: 'ต่ำ',     noun_en: 'LOW'       },
  watch:    { th: 'ติดตาม',         en: 'STAY INFORMED',      noun_th: 'เฝ้าระวัง', noun_en: 'WATCH'    },
  elevated: { th: 'เตรียมพร้อม',    en: 'PREPARE',            noun_th: 'เสี่ยงสูง', noun_en: 'ELEVATED' },
  high:     { th: 'ปฏิบัติการทันที', en: 'ACT NOW',           noun_th: 'วิกฤต',    noun_en: 'CRITICAL'  },
}

// LEVEL_NAME — Thai AQI 2023 PM2.5 levels 1–5
// (breakpoints ≤15 · ≤25 · ≤37.5 · ≤75 · >75 µg/m³).
export const LEVEL_NAME = {
  1: { th: 'ดีมาก', en: 'very good' },
  2: { th: 'ดี', en: 'good' },
  3: { th: 'ปานกลาง', en: 'moderate' },
  4: { th: 'เริ่มมีผลต่อสุขภาพ', en: 'unhealthy (start)' },
  5: { th: 'มีผลต่อสุขภาพ', en: 'UNHEALTHY' },
}

/** Thai AQI 2023 PM2.5 level (1–5) for a µg/m³ reading, or null. */
export function pm25Level(ug) {
  if (ug === null || ug === undefined || !Number.isFinite(ug)) return null
  if (ug <= 15) return 1
  if (ug <= 25) return 2
  if (ug <= 37.5) return 3
  if (ug <= 75) return 4
  return 5
}
