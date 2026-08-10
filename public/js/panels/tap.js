// The running tap: every pipeline event streams in here live. DOM capped so
// weeks of uptime can't bloat the page; auto-scroll pauses when the operator
// scrolls up to read.
import { on, store } from '../state.js?v=2.4.4'
import { tr } from '../i18n.js?v=2.4.4'
import { el } from '../fmt.js?v=2.4.4'

const MAX_ROWS = 300
const SOURCE_LABEL = {
  air4thai: 'AQ', thaiwater_rain: 'RAIN', openmeteo: 'FC',
  openmeteo_aq: 'CAMS', imerg: 'SAT', enso: 'ENSO', news: 'NEWS', null: 'SYS',
}
let missed = 0

export function initTap() {
  const box = document.getElementById('tap')
  const pausedBar = document.getElementById('tap-paused')

  const isPinned = () => box.scrollTop < 40 // newest rows are prepended at top
  const updatePaused = () => {
    pausedBar.style.display = missed > 0 ? 'block' : 'none'
    pausedBar.textContent = tr(`▲ เหตุการณ์ใหม่ ${missed} รายการ — แตะเพื่อดู`, `▲ ${missed} new events — tap to view`)
  }
  pausedBar.onclick = () => { box.scrollTop = 0; missed = 0; updatePaused() }
  box.addEventListener('scroll', () => { if (isPinned()) { missed = 0; updatePaused() } })

  on('tap', (e) => {
    addRow(box, e, true)
    if (!isPinned()) { missed += 1; updatePaused() }
    while (box.children.length > MAX_ROWS) box.lastChild.remove()
  })

  on('tap-history', (events) => {
    box.replaceChildren()
    for (const e of events.slice(-MAX_ROWS)) addRow(box, e, false)
  })

  on('lang', () => {
    // Re-render titles in the newly selected language from stored payloads.
    for (const row of box.children) {
      const th = row.dataset.th, en = row.dataset.en
      row.querySelector('.msg-text').textContent = store.lang === 'th' ? th : (en || th)
    }
  })
}

function addRow(box, e, fresh) {
  const row = el('div', { class: `tap-row${fresh ? ' fresh' : ''}` },
    el('span', { class: 't' }, (e.ts ?? '').slice(11, 19)),
    el('span', { class: `sq sev${e.severity ?? 0}` }),
    el('div', { class: 'msg' },
      el('span', { class: 'msg-text' }, store.lang === 'th' ? (e.title_th ?? '') : (e.title_en ?? e.title_th ?? '')),
      ' ',
      el('span', { class: 'src' }, SOURCE_LABEL[e.source] ?? e.source ?? '')),
  )
  row.dataset.th = e.title_th ?? ''
  row.dataset.en = e.title_en ?? ''
  box.prepend(row)
}
