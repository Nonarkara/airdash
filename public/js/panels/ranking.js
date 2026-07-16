// Left rail: live province watch ranking. Click → fly map + station detail.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr, BAND } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el } from '../fmt.js?v=2.0.0-final'
import { flyToProvince } from '../map.js?v=2.0.0-final'
import { showProvinceDetail } from './detail.js?v=2.0.0-final'

const TREND_THRESHOLD = 3
const VICON = { safe: '✓', watch: '!', prepare: '!!', danger: '!!!' }

export function initRanking() {
  on('snapshot', render)
  on('lang', () => render(store.snapshot))
}

function trendArrow(delta) {
  if (typeof delta !== 'number' || Math.abs(delta) < TREND_THRESHOLD) return ''
  const up = delta > 0
  return el('span', {
    class: up ? 'hot' : '',
    style: `margin-left:4px;font-size:10px;${up ? '' : 'color:var(--ink-low)'}`,
  }, `${up ? '▲' : '▼'}${Math.abs(delta)}`)
}

// National action card — the "so what" panel + concrete next steps.
// One place: top of the ranking, above all provinces. Designed so a person
// who sees ONLY this card (citizen mode, mobile) knows both the level AND
// what to do about it. The card is intentionally compact: head, action,
// checklist (collapsed by default to keep the ranking visible), and the
// soil-saturation context when in flood season.
function nationalActionCard(nv) {
  if (!nv) return null
  const card = el('div', { class: `rank-national-card pv-${nv.level}` })
  const head = el('div', { class: 'rnc-head' },
    el('span', { class: 'rnc-icon' }, VICON[nv.level] ?? '·'),
    el('span', { class: 'rnc-head-text' }, tr(nv.th, nv.en)),
    el('button', {
      class: 'rnc-toggle', type: 'button',
      'aria-expanded': 'false',
      title: tr('ดูขั้นตอนปฏิบัติ', 'see what to do'),
    }, tr('ทำอะไรดี?', 'What to do?')),
  )
  const win = nv.window
  const windowRow = win
    ? el('div', { class: `rnc-window${win.hours === 0 ? ' rnc-window-now' : ''}` },
        `⏱ ${win.hours === 0
          ? tr(win.th, win.en)
          : `${tr('เวลาเตรียมตัว', 'Time to prepare')}: ${tr(win.th, win.en)}`}`)
    : null
  const action = nv.action_th || nv.action_en
    ? el('div', { class: 'rnc-action' },
        `▶ ${tr(nv.action_th ?? '', nv.action_en ?? '')}`)
    : null
  const detail = el('div', { class: 'rnc-detail', hidden: true })
  if (nv.checklist?.length) {
    const list = el('ol', { class: 'rnc-checklist' })
    for (const item of nv.checklist) {
      list.append(el('li', {}, tr(item.th, item.en)))
    }
    detail.append(list)
  }
  if (nv.disclaimer_th) {
    detail.append(el('div', { class: 'rnc-disclaimer' }, tr(nv.disclaimer_th, nv.disclaimer_en)))
  }
  // Toggle behaviour
  const toggleBtn = head.querySelector('.rnc-toggle')
  toggleBtn.addEventListener('click', () => {
    const open = !detail.hidden
    detail.hidden = open
    toggleBtn.setAttribute('aria-expanded', open ? 'false' : 'true')
    toggleBtn.textContent = open ? tr('ทำอะไรดี?', 'What to do?') : tr('ซ่อน', 'Hide')
  })
  card.append(head)
  if (windowRow) card.append(windowRow)
  if (action) card.append(action)
  card.append(detail)
  return card
}

function render(snap) {
  if (!snap?.risk) return
  const box = document.getElementById('ranking')

  // National action card — replaced the one-liner with a full action panel
  // (head + verb + checklist + disclaimer). In citizen mode this is the only
  // context a non-technical reader sees; in operator mode it's still the
  // first thing at the top of the ranking.
  const nv = snap.risk.national_verdict
  const card = nationalActionCard(nv)

  const rows = snap.risk.provinces.slice(0, 60)
  const rowEls = rows.map((p, i) => {
    const stats = []
    if (p.max_rain_24h !== null && p.max_rain_24h >= 10) {
      stats.push(el('div', { class: 'line' },
        tr('ฝน ', 'rain '),
        el('b', { class: p.max_rain_24h > 90 ? 'hot' : '' }, fmtNum(p.max_rain_24h, 0)), ' มม.'))
    }
    if (p.stations_l5 > 0 || p.stations_l4 > 0) {
      stats.push(el('div', { class: 'line' },
        p.stations_l5 > 0 ? el('span', { class: 'hot' }, `${tr('ล้นตลิ่ง', 'overflow')} ${p.stations_l5} `) : '',
        p.stations_l4 > 0 ? `${tr('น้ำมาก', 'high')} ${p.stations_l4}` : ''))
    }
    if (p.fc_48h !== null && p.fc_48h >= 35) {
      stats.push(el('div', { class: 'line' }, tr('คาดฝน ', 'fc '), el('b', {}, fmtNum(p.fc_48h, 0)), ` ${tr('มม./48ชม.', 'mm/48h')}`))
    }
    const card = p.card
    const expand = card ? el('div', { class: 'rank-expand', hidden: true }) : null
    if (card) {
      // Reasons (up to 2)
      if (card.reasons?.length) {
        const reasons = el('div', { class: 'rx-reasons' })
        for (const r of card.reasons) {
          reasons.append(el('div', { class: 'rx-reason' }, `· ${tr(r.th, r.en)}`))
        }
        expand.append(reasons)
      }
      // Action verb (the "what to do" line)
      if (card.action_th || card.action_en) {
        expand.append(el('div', { class: 'rx-action' }, `▶ ${tr(card.action_th ?? '', card.action_en ?? '')}`))
      }
      // Checklist
      if (card.checklist?.length) {
        const list = el('ol', { class: 'rx-checklist' })
        for (const item of card.checklist) {
          list.append(el('li', {}, tr(item.th, item.en)))
        }
        expand.append(list)
      }
      // Disclaimer
      if (card.disclaimer_th) {
        expand.append(el('div', { class: 'rx-disclaimer' }, tr(card.disclaimer_th, card.disclaimer_en)))
      }
      // "Open detail" link — keeps the existing fly-to-province + station list behaviour
      expand.append(el('button', {
        class: 'rx-detail-btn', type: 'button',
        onclick: (e) => { e.stopPropagation(); flyToProvince(p); showProvinceDetail(p) },
      }, tr('ดูสถานี/กราฟ →', 'See stations/chart →')))
    }
    const row = el('div', {
      class: `rank-row b-${p.band}`,
      onclick: () => {
        flyToProvince(p)
        // Toggle expand on click of the row itself (anywhere except the
        // detail button which has its own handler). Two interactions in one
        // tap is the citizen-mode ergonomic — no separate "+" button to find.
        if (expand) {
          const wasHidden = expand.hidden
          expand.hidden = !wasHidden
          row.classList.toggle('rank-row-open', wasHidden)
        }
      },
    },
      el('span', { class: 'mono', style: 'width:18px;color:var(--ink-low);font-size:10px' }, String(i + 1)),
      el('div', { class: `score b-${p.band} badge` }, String(p.score)),
      el('div', { class: 'who' },
        el('div', { class: 'th' }, tr(p.province_th, p.province_en) || '—'),
        el('div', { class: 'en' }, `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${BAND[p.band][store.lang]}`, trendArrow(p.delta))),
      el('div', { class: 'stats' }, ...stats),
    )
    if (expand) row.append(expand)
    return row
  })
  // Filter out a null card: replaceChildren coerces null to the text node
  // "null" (Web IDL DOMString), which would print literally atop the ranking.
  box.replaceChildren(...[card, ...rowEls].filter(Boolean))
}
