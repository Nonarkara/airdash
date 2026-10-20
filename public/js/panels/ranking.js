// Left rail: live province ranking — worst air first.
// Sort mode: Worst air (default, by PM2.5) | Effective Harm (Watch × Social Load).
import { on, store } from '../state.js?v=2.4.105'
import { tr, BAND, pm25Level, LEVEL_NAME } from '../i18n.js?v=2.4.105'
import { fmtNum, el } from '../fmt.js?v=2.4.105'
import { flyToProvince } from '../map.js?v=2.4.105'
import { showProvinceDetail } from './detail.js?v=2.4.105'
import { causeChip, causesByProvince, causeEvidenceBlock } from './patterns-ui.js?v=2.4.105'

const TREND_THRESHOLD = 3
const VICON = { safe: '✓', watch: '!', prepare: '!!', danger: '!!!' }
const MODE_KEY = 'airdash.rankMode'
/** @type {'worst' | 'harm'} */
let rankMode = 'worst'

/** Map live PM2.5 → the same band classes the watch score uses, so row chrome stays consistent. */
function pmBand(ug) {
  if (ug === null || ug === undefined || !Number.isFinite(ug)) return 'normal'
  if (ug >= 75) return 'high'
  if (ug >= 37.5) return 'elevated'
  if (ug >= 25) return 'watch'
  return 'normal'
}

function readMode() {
  try {
    const v = sessionStorage.getItem(MODE_KEY)
    // Legacy 'watch' key → worst-air (the new default triage order).
    if (v === 'harm') return 'harm'
    if (v === 'worst' || v === 'watch') return 'worst'
  } catch { /* private mode */ }
  return 'worst'
}

function setMode(mode) {
  rankMode = mode === 'harm' ? 'harm' : 'worst'
  try { sessionStorage.setItem(MODE_KEY, rankMode) } catch { /* ignore */ }
  paintChromeForMode()
  render(store.snapshot)
}

function paintChromeForMode() {
  // Own these nodes: update data-i18n so a later i18n.paintChrome() cannot
  // clobber Harm-mode copy back to the static strings in ops.html.
  const eyebrow = document.getElementById('left-eyebrow')
  const method = document.getElementById('risk-method-note')
  const title = document.querySelector('#rail-left .panel-head .sign .th')
  if (eyebrow) {
    const pair = rankMode === 'harm'
      ? 'จัดอันดับภาระจริง · สด|EFFECTIVE HARM RANKING · LIVE'
      : 'จัดอันดับอากาศแย่สุด · สด|WORST AIR RANKING · LIVE'
    eyebrow.setAttribute('data-i18n', pair)
    eyebrow.textContent = tr(...pair.split('|'))
  }
  if (method) {
    const pair = rankMode === 'harm'
      ? 'ภาระจริง = ดัชนีเฝ้าระวัง × ภาระทางสังคม — ใครรับฝุ่นมากกว่าเมื่อค่าเฝ้าระวังใกล้กัน|Effective Harm = Watch × Social Load — who absorbs more when watch scores are similar'
      : 'เรียงจาก PM2.5 สูงสุดก่อน — จังหวัดอากาศดีถูกจางไว้ด้านล่าง · คะแนนเฝ้าระวังยังแสดงในแถว|Sorted by highest PM2.5 first — clean provinces dimmed below · watch score still shown per row'
    method.setAttribute('data-i18n', pair)
    method.textContent = tr(...pair.split('|'))
  }
  if (title) {
    const pair = rankMode === 'harm'
      ? 'จัดอันดับภาระจริงรายจังหวัด|Province effective-harm ranking'
      : 'จัดอันดับจังหวัดอากาศแย่สุด|Worst air quality by province'
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
    mk('worst', 'อากาศแย่สุด', 'Worst air'),
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

/** Worst-PM2.5 first; provinces with no reading sink to the bottom. */
function sortWorstAir(list) {
  return [...list].sort((a, b) => {
    const pa = a.pm25, pb = b.pm25
    const aNull = pa === null || pa === undefined
    const bNull = pb === null || pb === undefined
    if (aNull !== bNull) return aNull ? 1 : -1
    if (!aNull && pb !== pa) return pb - pa
    return (b.score ?? 0) - (a.score ?? 0)
      || (b.stations_very_unhealthy ?? 0) - (a.stations_very_unhealthy ?? 0)
  })
}

function render(snap) {
  if (!snap?.risk) return
  const box = document.getElementById('ranking')

  const nv = snap.risk.national_verdict
  const card = nationalActionCard(nv)

  let provinces = [...(snap.risk.provinces ?? [])]
  if (rankMode === 'harm') {
    provinces.sort((a, b) => {
      const ha = a.harm?.score ?? -1
      const hb = b.harm?.score ?? -1
      if (hb !== ha) return hb - ha
      return (b.harm?.social_load ?? 0) - (a.harm?.social_load ?? 0)
    })
  } else {
    provinces = sortWorstAir(provinces)
  }

  const rows = provinces.slice(0, 60)
  const rowEls = rows.map((p, i) => {
    const harm = p.harm
    const useHarm = rankMode === 'harm' && harm
    const useWorst = !useHarm

    const primary = rankMode === 'harm' ? harm?.score : p.pm25
    const badgeBand = !Number.isFinite(primary) ? 'unknown' : (useHarm ? harm.band : pmBand(p.pm25))

    const stats = []
    if (Number.isFinite(p.delta) && Math.abs(p.delta) >= TREND_THRESHOLD) {
      stats.push(el('div', { class: 'line' }, tr('แนวโน้มคะแนนเฝ้าระวัง ', 'Watch-score trend '), trendArrow(p.delta)))
    }
    if (useWorst && typeof p.score === 'number') {
      stats.push(el('div', { class: 'line' },
        tr('เฝ้าระวัง ', 'Watch '),
        el('b', {}, String(p.score))))
    }
    if (useHarm && p.pm25 !== null && p.pm25 !== undefined) {
      stats.push(el('div', { class: 'line' },
        tr('ฝุ่น ', 'PM2.5 '),
        el('b', { class: p.pm25 >= 75 ? 'hot' : '' }, fmtNum(p.pm25, 0)), ' µg/m³',
        // No ground sensor reporting: the value is GISTDA's satellite estimate.
        p.pm25_source === 'gistda_satellite'
          ? el('span', { class: 'src', title: tr('ค่าประมาณจากดาวเทียม GISTDA — ไม่มีสถานีภาคพื้นรายงาน', 'GISTDA satellite estimate — no ground station reporting') }, ' 🛰')
          : ''))
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
      stats.push(el('div', { class: 'line' }, tr('คาดฝุ่น ', 'fc '), el('b', {}, fmtNum(p.pm25_fc_48h, 0)), ` ${tr('µg พรุ่งนี้', 'µg tomorrow')}`))
    }
    if (p.washout_helps && p.washout_relief_pct) {
      stats.push(el('div', { class: 'line' },
        el('span', { title: tr('ฝนช่วยล้างฝุ่นได้', 'rain washout expected') },
          `🌧 −${fmtNum(p.washout_relief_pct, 0)}%`)))
    }
    const causeEl = causeChip(p.cause)
    if (causeEl) stats.push(el('div', { class: 'line' }, causeEl))
    const cardExpand = p.card ?? {}
    const expand = el('div', { class: 'rank-expand', hidden: true, id: `rank-details-${p.province_code}` })
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

    const lvl = pm25Level(p.pm25)
    const bandLabel = !Number.isFinite(primary) ? tr('ไม่มีข้อมูล', 'No data') : (useWorst && lvl
      ? (LEVEL_NAME[lvl]?.[store.lang] ?? badgeBand)
      : (BAND[badgeBand]?.[store.lang] ?? badgeBand))


    const number = value => Number.isFinite(value) ? fmtNum(value, 0) : '–'
    const name = tr(p.province_th, p.province_en) || '—'
    const row = el('div', { class: `rank-row b-${badgeBand}` })
    const summary = el('button', {
      class: 'rank-summary', type: 'button',
      'aria-expanded': 'false', 'aria-controls': expand.id,
      'aria-label': `${i + 1}. ${name} · ${bandLabel} · ${rankMode === 'harm' ? tr('ภาระจริง', 'Effective harm') : 'PM2.5'} ${number(primary)} · ${tr('เฝ้าระวัง', 'Watch')} ${number(p.score)} · ${tr('สังคม', 'Social')} ${number(harm?.social_load)} · ${tr('ดัชนีวิจัย ไม่ใช่ดัชนีคลินิก', 'Research index, not clinical')} ${number(p.danger?.score)}`,
      onclick: () => {
        flyToProvince(p)
        const open = expand.hidden
        expand.hidden = !open
        summary.setAttribute('aria-expanded', String(open))
        row.classList.toggle('rank-row-open', open)
        if (open && !expand.dataset.causeLoaded) {
          expand.dataset.causeLoaded = '1'
          causesByProvince().then(map => {
            const block = causeEvidenceBlock(map.get(p.province_code))
            if (block) expand.prepend(block)
          }).catch(() => {})
        }
      },
    },
      el('span', { class: 'rank-place', title: `${name} · ${bandLabel}` },
        el('span', { class: 'rank-name' }, name)),
      el('span', { class: 'rank-value rank-primary' }, number(primary)),
      el('span', { class: 'rank-value' }, number(p.score)),
      el('span', { class: 'rank-value' }, number(harm?.social_load)),
      el('span', { class: 'rank-value', title: tr('ดัชนีวิจัย ไม่ใช่ดัชนีคลินิก', 'Research screening index, not clinical') }, number(p.danger?.score)),
    )
    expand.prepend(el('div', { class: 'rank-metrics-note' }, ...stats))
    row.append(summary, expand)
    return row
  })
  const headings = el('div', { class: 'rank-columns', 'aria-hidden': 'true' },
    ...[tr('จังหวัด', 'Province'), rankMode === 'harm' ? tr('ภาระ', 'Harm') : 'PM2.5', tr('เฝ้าระวัง', 'Watch'), tr('สังคม', 'Social'), tr('ดัชนี', 'Index')].map(text => el('span', {}, text)))
  const note = el('p', { class: 'rank-method' }, tr(
    'PM2.5: µg/m³ · คะแนนวิจัย ไม่ใช่ดัชนีคลินิก',
    'PM2.5: µg/m³ · Research scores, not clinical indices.'))
  box.replaceChildren(...[modeToggle(), card, note, headings, ...rowEls].filter(Boolean))
}
