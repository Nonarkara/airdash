// Left rail: live province watch ranking. Click → fly map + station detail.
// Sort mode: Watch (default) | Effective Harm (Watch × Social Load).
import { on, store } from '../state.js?v=2.4.0'
import { tr, BAND } from '../i18n.js?v=2.4.0'
import { fmtNum, el } from '../fmt.js?v=2.4.0'
import { flyToProvince } from '../map.js?v=2.4.0'
import { showProvinceDetail } from './detail.js?v=2.4.0'
import { causeChip, causesByProvince, causeEvidenceBlock } from './patterns-ui.js?v=2.4.0'

const TREND_THRESHOLD = 3
const VICON = { safe: '✓', watch: '!', prepare: '!!', danger: '!!!' }
const MODE_KEY = 'airdash.rankMode'
/** @type {'watch' | 'harm'} */
let rankMode = 'watch'

function readMode() {
  try {
    const v = sessionStorage.getItem(MODE_KEY)
    if (v === 'harm' || v === 'watch') return v
  } catch { /* private mode */ }
  return 'watch'
}

function setMode(mode) {
  rankMode = mode === 'harm' ? 'harm' : 'watch'
  try { sessionStorage.setItem(MODE_KEY, rankMode) } catch { /* ignore */ }
  paintChromeForMode()
  render(store.snapshot)
}

function paintChromeForMode() {
  // Own these nodes: update data-i18n so a later i18n.paintChrome() cannot
  // clobber Harm-mode copy back to the static Watch strings in ops.html.
  const eyebrow = document.getElementById('left-eyebrow')
  const method = document.getElementById('risk-method-note')
  const title = document.querySelector('#rail-left .panel-head .sign .th')
  if (eyebrow) {
    const pair = rankMode === 'harm'
      ? 'จัดอันดับภาระจริง · สด|EFFECTIVE HARM RANKING · LIVE'
      : 'จัดอันดับเฝ้าระวัง · สด|PROVINCE WATCH RANKING · LIVE'
    eyebrow.setAttribute('data-i18n', pair)
    eyebrow.textContent = tr(...pair.split('|'))
  }
  if (method) {
    const pair = rankMode === 'harm'
      ? 'ภาระจริง = ดัชนีเฝ้าระวัง × ภาระทางสังคม — ใครรับฝุ่นมากกว่าเมื่อค่าเฝ้าระวังใกล้กัน|Effective Harm = Watch × Social Load — who absorbs more when watch scores are similar'
      : 'PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ 15% — ดัชนีบ่งชี้ ไม่ใช่การพยากรณ์|PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15% — indicator, not a prediction'
    method.setAttribute('data-i18n', pair)
    method.textContent = tr(...pair.split('|'))
  }
  if (title) {
    const pair = rankMode === 'harm'
      ? 'จัดอันดับภาระจริงรายจังหวัด|Province effective-harm ranking'
      : 'จัดอันดับเฝ้าระวังรายจังหวัด|Province watch ranking'
    title.setAttribute('data-i18n', pair)
    title.textContent = tr(...pair.split('|'))
  }
}

export function initRanking() {
  rankMode = readMode()
  paintChromeForMode()
  on('snapshot', render)
  on('lang', () => {
    paintChromeForMode()
    render(store.snapshot)
  })
}

function trendArrow(delta) {
  if (typeof delta !== 'number' || Math.abs(delta) < TREND_THRESHOLD) return ''
  const up = delta > 0
  return el('span', {
    class: up ? 'hot' : '',
    style: `margin-left:4px;font-size:10px;${up ? '' : 'color:var(--ink-low)'}`,
  }, `${up ? '▲' : '▼'}${Math.abs(delta)}`)
}

function modeToggle() {
  const wrap = el('div', { class: 'rank-mode-toggle', role: 'group', 'aria-label': tr('โหมดจัดอันดับ', 'Ranking mode') })
  const mk = (id, th, en) => {
    const btn = el('button', {
      type: 'button',
      class: `rmt-btn${rankMode === id ? ' active' : ''}`,
      'aria-pressed': rankMode === id ? 'true' : 'false',
      onclick: () => { if (rankMode !== id) setMode(id) },
    }, tr(th, en))
    return btn
  }
  wrap.append(
    mk('watch', 'เฝ้าระวัง', 'Watch'),
    mk('harm', 'ภาระจริง', 'Effective Harm'),
  )
  return wrap
}

// National action card — the "so what" panel + concrete next steps.
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

function socialChip(harm) {
  if (!harm || harm.social_load == null) return null
  const liveNote = harm.watch_live === false
    ? tr(' · ไม่มีค่าเฝ้าระวังสด', ' · no live watch score')
    : ''
  return el('div', {
    class: `social-chip${harm.social_load >= 65 ? ' sc-high' : ''}`,
    title: tr(
      `ภาระทางสังคม ${harm.social_load}${harm.social_label_th ? ` (${harm.social_label_th})` : ''}: กลางแจ้ง ${harm.outdoor_labor} · รายได้ ${harm.income_strain} · อายุ ${harm.sensitivity} · ที่พักพิง ${harm.adaptive_deficit}${harm.action_th ? ` — ${harm.action_th}` : ''}${liveNote}`,
      `Social Load ${harm.social_load}${harm.social_label_en ? ` (${harm.social_label_en})` : ''}: outdoor ${harm.outdoor_labor} · income ${harm.income_strain} · age ${harm.sensitivity} · shelter ${harm.adaptive_deficit}${harm.action_en ? ` — ${harm.action_en}` : ''}${liveNote}`,
    ),
  },
    el('span', { class: 'sc-lbl' }, tr('สังคม', 'Social')),
    el('span', { class: 'sc-num' }, String(harm.social_load)),
  )
}

function render(snap) {
  if (!snap?.risk) return
  const box = document.getElementById('ranking')

  const nv = snap.risk.national_verdict
  const card = nationalActionCard(nv)

  const provinces = [...(snap.risk.provinces ?? [])]
  if (rankMode === 'harm') {
    provinces.sort((a, b) => {
      const ha = a.harm?.score ?? -1
      const hb = b.harm?.score ?? -1
      if (hb !== ha) return hb - ha
      return (b.harm?.social_load ?? 0) - (a.harm?.social_load ?? 0)
    })
  }

  const rows = provinces.slice(0, 60)
  const rowEls = rows.map((p, i) => {
    const harm = p.harm
    const useHarm = rankMode === 'harm' && harm
    const badgeScore = useHarm ? harm.score : p.score
    const badgeBand = useHarm ? harm.band : p.band

    const stats = []
    if (p.pm25 !== null && p.pm25 !== undefined) {
      stats.push(el('div', { class: 'line' },
        tr('ฝุ่น ', 'PM2.5 '),
        el('b', { class: p.pm25 >= 75 ? 'hot' : '' }, fmtNum(p.pm25, 0)), ' µg/m³'))
    }
    if (useHarm && typeof p.score === 'number') {
      stats.push(el('div', { class: 'line' },
        tr('เฝ้าระวัง ', 'Watch '),
        el('b', {}, String(p.score))))
    }
    if (p.stations_very_unhealthy > 0 || p.stations_unhealthy > 0) {
      stats.push(el('div', { class: 'line' },
        p.stations_very_unhealthy > 0 ? el('span', { class: 'hot' }, `${tr('อันตราย', 'v.unhealthy')} ${p.stations_very_unhealthy} `) : '',
        p.stations_unhealthy > 0 ? `${tr('เกินเกณฑ์', 'unhealthy')} ${p.stations_unhealthy}` : ''))
    }
    if (p.pm25_fc_48h !== null && p.pm25_fc_48h >= 37.5) {
      stats.push(el('div', { class: 'line' }, tr('คาดฝุ่น ', 'fc '), el('b', {}, fmtNum(p.pm25_fc_48h, 0)), ` ${tr('µg/48ชม.', 'µg/48h')}`))
    }
    if (p.washout_helps && p.washout_relief_pct) {
      stats.push(el('div', { class: 'line' },
        el('span', { title: tr('ฝนช่วยล้างฝุ่นได้', 'rain washout expected') },
          `🌧 −${fmtNum(p.washout_relief_pct, 0)}%`)))
    }
    const causeEl = causeChip(p.cause)
    if (causeEl) stats.push(el('div', { class: 'line' }, causeEl))
    const cardExpand = p.card
    const expand = cardExpand ? el('div', { class: 'rank-expand', hidden: true }) : null
    if (cardExpand) {
      if (useHarm && (harm.action_th || harm.action_en)) {
        expand.append(el('div', { class: 'rx-action' },
          `▶ ${tr(harm.action_th ?? '', harm.action_en ?? '')}`))
      }
      if (cardExpand.reasons?.length) {
        const reasons = el('div', { class: 'rx-reasons' })
        for (const r of cardExpand.reasons) {
          reasons.append(el('div', { class: 'rx-reason' }, `· ${tr(r.th, r.en)}`))
        }
        expand.append(reasons)
      }
      if (cardExpand.action_th || cardExpand.action_en) {
        expand.append(el('div', { class: 'rx-action' }, `▶ ${tr(cardExpand.action_th ?? '', cardExpand.action_en ?? '')}`))
      }
      if (cardExpand.checklist?.length) {
        const list = el('ol', { class: 'rx-checklist' })
        for (const item of cardExpand.checklist) {
          list.append(el('li', {}, tr(item.th, item.en)))
        }
        expand.append(list)
      }
      if (cardExpand.disclaimer_th) {
        expand.append(el('div', { class: 'rx-disclaimer' }, tr(cardExpand.disclaimer_th, cardExpand.disclaimer_en)))
      }
      expand.append(el('button', {
        class: 'rx-detail-btn', type: 'button',
        onclick: (e) => { e.stopPropagation(); flyToProvince(p); showProvinceDetail(p) },
      }, tr('ดูสถานี/กราฟ →', 'See stations/chart →')))
    }

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

    const bandLabel = BAND[badgeBand]?.[store.lang] ?? badgeBand
    const row = el('div', {
      class: `rank-row b-${badgeBand}`,
      onclick: () => {
        flyToProvince(p)
        if (expand) {
          const wasHidden = expand.hidden
          expand.hidden = !wasHidden
          row.classList.toggle('rank-row-open', wasHidden)
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
      el('div', { class: `score b-${badgeBand} badge` }, String(badgeScore ?? '–')),
      el('div', { class: 'who' },
        el('div', { class: 'th' }, tr(p.province_th, p.province_en) || '—'),
        el('div', { class: 'en' }, `${store.lang === 'th' ? (p.province_en ?? '') : (p.province_th ?? '')} · ${bandLabel}`,
          useHarm ? '' : trendArrow(p.delta))),
      socialChip(harm),
      dangerChip,
      el('div', { class: 'stats' }, ...stats),
    )
    if (expand) row.append(expand)
    return row
  })
  box.replaceChildren(...[modeToggle(), card, ...rowEls].filter(Boolean))
}
