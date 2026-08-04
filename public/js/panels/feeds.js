// Dust alerts + haze news lists (ข่าวฝุ่น/หมอกควัน — right rail tabs),
// refreshed from snapshot and tap events.
import { on, store } from '../state.js?v=2.4.3'
import { tr } from '../i18n.js?v=2.4.3'
import { el, ago } from '../fmt.js?v=2.4.3'

export function initFeeds() {
  on('snapshot', render)
  on('lang', () => render(store.snapshot))
  on('tap', (e) => {
    // Live insert without waiting for the next snapshot refresh.
    if ((e.kind === 'alert' || e.kind === 'news') && store.snapshot) {
      if (e.kind === 'alert') {
        store.snapshot.alerts.unshift({
          ts: e.ts, severity: e.severity,
          message_th: e.title_th, message_en: e.title_en,
        })
      } else {
        store.snapshot.news.unshift({
          title: e.title_th, title_en: e.title_en,
          link: null, published_at: e.ts,
        })
      }
      render(store.snapshot)
    }
  })
}

function render(snap) {
  if (!snap) return
  const alerts = document.getElementById('alerts')
  alerts.replaceChildren(...(snap.alerts ?? []).slice(0, 100).map((a) =>
    el('div', { class: 'alert-row' },
      el('span', { class: `badge ${a.severity >= 3 ? 'lv5' : a.severity >= 2 ? 'lv4' : 'lv3'}` }, a.severity >= 3 ? '!' : '›'),
      el('div', {},
        el('div', {}, tr(a.message_th, a.message_en)),
        el('div', { class: 'when' }, ago(a.ts))))))
  if ((snap.alerts ?? []).length === 0) {
    alerts.replaceChildren(el('div', { class: 'alert-row' },
      tr('ยังไม่มีการแจ้งเตือน', 'no alerts yet')))
  }
  document.getElementById('alert-cnt').textContent =
    (snap.alerts ?? []).filter((a) => Date.now() - new Date(a.ts) < 24 * 3600_000).length || ''

  const news = document.getElementById('news')
  news.replaceChildren(...(snap.news ?? []).slice(0, 60).map((n) => {
    // Google-News-TH items have no English title — fall back to the Thai
    // headline instead of rendering an empty link (the ticker already
    // does exactly this).
    const title = tr(n.title, n.title_en ?? n.title)
    // Defence-in-depth: only http(s) links become anchors (the server now
    // also scheme-validates at ingest, but old rows may predate that).
    const safeLink = n.link && /^https?:\/\//i.test(n.link) ? n.link : null
    // Geotagged items (province named in the headline) get the same 🔥/⚠
    // treatment as their map pin, so the panel and the map tell one story.
    const provChip = n.province_code
      ? el('span', { class: `news-prov${n.is_fire ? ' is-fire' : ''}` },
          n.is_fire ? '🔥' : '⚠', ' ', tr(n.province_th, n.province_en ?? n.province_th))
      : null
    return el('div', { class: 'news-row' },
      safeLink
        ? el('a', { href: safeLink, target: '_blank', rel: 'noopener' }, title)
        : el('span', {}, title),
      el('div', { class: 'when' }, provChip, ago(n.published_at ?? n.fetched_at)))
  }))
}
