// Bilingual helper — Thai first, always. Signage shows both; dynamic text
// follows the selected language.
import { store } from './state.js?v=2.4.56'

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

// ── Band colour, one source of truth ────────────────────────────────────────
// WHY THIS LIVES HERE AND NOT IN THREE MAP FILES
// The same literal `{ normal, watch, elevated, high }` table was duplicated
// verbatim in paint.js, layers/osm-buildings.js and layers/province-boundaries.js.
// A colour fix applied to one file would have left two layers showing the old
// value — and "the map layers disagree about what 'watch' looks like" is not
// a bug anyone reports, they just stop trusting the map.
//
// WHY IT IS THEME-AWARE
// A single hex cannot clear WCAG SC 1.4.11 (3:1 for non-text UI) against BOTH
// papers. Measured on the real tokens (public/css/tokens.css):
//
//   #F0B400 (watch)  1.75:1 on light paper  ← FAIL, and light is the default
//   #A51931 (high)   2.32:1 on dark paper   ← FAIL, and "critical" is the
//                                              band that must be noticed most
//
// So the amber is darkened for the light theme and the red lightened for the
// dark one, by the smallest shift that clears 3:1 while preserving the hue's
// channel ratios. Every value below is asserted by
// scripts/test-band-contrast.mjs — if a future edit breaks one, the build does.
//
// A NOTE ON WHAT IS DELIBERATELY NOT FIXED HERE
// These four bands are not monotonic in lightness (yellow peaks in the middle),
// and a strictly monotonic ramp would be the more accessible choice under
// greyscale and colour-vision deficiency. It would also destroy the green→
// amber→red semantics that Thai AQI and every weather service use. That is a
// real tradeoff and it is a deliberate design decision, not an oversight, so
// the ramp is left alone and the ordering is instead carried by the text label
// beside every band.

const isDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const BAND_COLORS = {
  light: { normal: '#00933C', watch: '#B58800', elevated: '#E86A10', high: '#A51931' },
  dark:  { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#B23B4F' },
}

export const PM_COLORS = {
  light: { 1: '#1A7A4A', 2: '#799B31', 3: '#B58800', 4: '#E86A10', 5: '#A51931' },
  dark:  { 1: '#1A7A4A', 2: '#7FA334', 3: '#F0B400', 4: '#E86A10', 5: '#B23B4F' },
}

/** The colour a band's marks should use under the current colour scheme. */
export function bandColor(band) {
  const set = isDark() ? BAND_COLORS.dark : BAND_COLORS.light
  return set[band] ?? BAND_COLORS.light.normal
}

/** The colour for a Thai AQI 1–5 level under the current colour scheme. */
export function pmColorFor(lv) {
  const set = isDark() ? PM_COLORS.dark : PM_COLORS.light
  return set[lv] ?? null
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
