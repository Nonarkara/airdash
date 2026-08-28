// Formatting: numbers, clocks, relative time — bilingual.
import { store } from './state.js?v=2.4.16'

export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString(store.lang === 'th' ? 'th-TH' : 'en-GB',
    { maximumFractionDigits: digits })
}

/** "2026-07-03T19:20" (TH local) or ISO-with-Z → HH:MM display. */
export function fmtClock(ts) {
  if (!ts) return '—'
  if (ts.endsWith('Z') || ts.includes('+')) {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
  }
  return ts.slice(11, 16)
}

export function ago(ts) {
  if (!ts) return '—'
  const then = ts.endsWith('Z') || ts.includes('+')
    ? new Date(ts).getTime()
    : new Date(`${ts}:00+07:00`.slice(0, ts.length >= 19 ? 25 : undefined)).getTime() || new Date(`${ts}+07:00`).getTime()
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (store.lang === 'th') {
    if (s < 90) return `${s} วิ.ที่แล้ว`
    if (s < 5400) return `${Math.round(s / 60)} นาทีที่แล้ว`
    if (s < 129600) return `${Math.round(s / 3600)} ชม.ที่แล้ว`
    return `${Math.round(s / 86400)} วันที่แล้ว`
  }
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  if (s < 129600) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

/** PM/pollutant concentration with unit — bilingual µg/m³ suffix. */
export function fmtUg(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${fmtNum(v, digits)} ${store.lang === 'th' ? 'มคก./ลบ.ม.' : 'µg/m³'}`
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Station names ultimately come from government API responses, not our
 * own code — escape before dropping into innerHTML (Leaflet popups/tooltips)
 * so a compromised or malformed upstream feed can't inject markup. */
export function escapeHtml(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else if (v !== null && v !== undefined) node.setAttribute(k, v)
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue
    node.append(child.nodeType ? child : document.createTextNode(child))
  }
  return node
}
