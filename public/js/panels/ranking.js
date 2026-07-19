// Left rail: live province watch ranking. Click → fly map + station detail.
import { on, store } from '../state.js?v=2.0.0-muni1'
import { tr, BAND } from '../i18n.js?v=2.0.0-muni1'
import { fmtNum, el } from '../fmt.js?v=2.0.0-muni1'
import { flyToProvince } from '../map.js?v=2.0.0-muni1'
import { showProvinceDetail } from './detail.js?v=2.0.0-muni1'
import { causeChip, causesByProvince, causeEvidenceBlock } from './patterns-ui.js?v=2.0.0-muni1'

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
// dust-load context when in dust season.
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
    if (p.pm25 !== null && p.pm25 !== undefined) {
      stats.push(el('div', { class: 'line' },
        tr('ฝุ่น ', 'PM2.5 '),
        el('b', { class: p.pm25 >= 75 ? 'hot' : '' }, fmtNum(p.pm25, 0)), ' µg/m³'))
    }
    if (p.stations_very_unhealthy > 0 || p.stations_unhealthy > 0) {
      stats.push(el('div', { class: 'line' },
        p.stations_very_unhealthy > 0 ? el('span', { class: 'hot' }, `${tr('อันตราย', 'v.unhealthy')} ${p.stations_very_unhealthy} `) : '',
        p.stations_unhealthy > 0 ? `${tr('เกินเกณฑ์', 'unhealthy')} ${p.stations_unhealthy}` : ''))
    }
    if (p.pm25_fc_48h !== null && p.pm25_fc_48h >= 37.5) {
      stats.push(el('div', { class: 'line' }, tr('คาดฝุ่น ', 'fc '), el('b', {}, fmtNum(p.pm25_fc_48h, 0)), ` ${tr('µg/48ชม.', 'µg/48h')}`))
    }
    // Washout chip — rain is expected to help this province's dust.
    if (p.washout_helps && p.washout_relief_pct) {
      stats.push(el('div', { class: 'line' },
        el('span', { title: tr('ฝนช่วยล้างฝุ่นได้', 'rain washout expected') },
          `🌧 −${fmtNum(p.washout_relief_pct, 0)}%`)))
    }
    // Cause chip — the "WHY is the air bad here" hypothesis from
    // /api/risk's cause fold (e.g. "🔥 การเผาในที่โล่ง 70%" / "🚗 traffic").
    const causeEl = causeChip(p.cause)
    if (causeEl) stats.push(el('div', { class: 'line' }, causeEl))
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
    // Danger chip — the headline composite for "is it safe to be outside
    // RIGHT NOW". Shows the worst-case band's number + label so a glance
    // at the ranking tells you both the watch indicator and the
    // acute-risk number. Tooltip breaks out every modifier for audit.
    const danger = p.danger
    const dangerChip = danger ? el('div', {
      class: `danger-chip b-${danger.band}`,
      title: tr(
        `ดัชนีอันตราย: PM2.5 ${danger.pm25_live != null ? danger.pm25_live.toFixed(0) : '–'} · ความร้อน ${danger.temp_c != null ? danger.temp_c.toFixed(0) : '–'}°C · ความชื้น ${danger.rh_pct != null ? danger.rh_pct.toFixed(0) : '–'}%${danger.noise_leq_db != null ? ` · เสียง ${danger.noise_leq_db.toFixed(0)} dB` : ''} · ลดฝน ${(danger.rain_relief * 100).toFixed(0)}%`,
        `Danger: PM2.5 ${danger.pm25_live != null ? danger.pm25_live.toFixed(0) : '–'} · T ${danger.temp_c != null ? danger.temp_c.toFixed(0) : '–'}°C · RH ${danger.rh_pct != null ? danger.rh_pct.toFixed(0) : '–'}%${danger.noise_leq_db != null ? ` · noise ${danger.noise_leq_db.toFixed(0)} dB` : ''} · rain −${(danger.rain_relief * 100).toFixed(0)}%`,
      ),
    },
      el('span', { class: 'dc-num' }, String(danger.score)),
      el('span', { class: 'dc-band' }, tr(danger.label_th, danger.label_en)),
    ) : null

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
          // Lazy-load the cause evidence on first open — the ranked
          // hypotheses + the actual numbers behind them (/api/causes).
          if (wasHidden && !expand.dataset.causeLoaded) {
            expand.dataset.causeLoaded = '1'
            causesByProvince().then((map) => {
              const block = causeEvidenceBlock(map.get(p.province_code))
              if (block) expand.prepend(block)
            }).catch(() => {})
          }
        }
      },
    },
      el('span', { class: 'mono', style: 'width:18px;color:var(--ink-low);font-size:10px' }, String(i + 1)),
      el('div', { class: `score b-${p.band} badge` }, String(p.score)),
      el('div', { class: 'who' },
        el('div', { class: 'th' }, tr(p.province_th, p.province_en) || '—'),
        el('div', { class: 'en' }, `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${BAND[p.band][store.lang]}`, trendArrow(p.delta))),
      dangerChip,
      el('div', { class: 'stats' }, ...stats),
    )
    if (expand) row.append(expand)
    return row
  })
  // Filter out a null card: replaceChildren coerces null to the text node
  // "null" (Web IDL DOMString), which would print literally atop the ranking.
  box.replaceChildren(...[card, ...rowEls].filter(Boolean))
}
