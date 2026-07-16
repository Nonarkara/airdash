// What-if widget — "ถ้าฝนตก X มม. ใน 24 ชม. จะเกิดอะไรขึ้น?"
// Drag the slider → re-projects the watch score for every province and
// shows the top 5 escalators. Same score formula as the live indicator —
// only the rain component is replaced with the slider value.
//
// Audit #8 — "Check your province": a search box lets a user look up their
// OWN province instead of only seeing the top 5 escalators. The full
// /api/whatif payload already contains every province's re-projected
// score; the search just filters the existing list client-side, so no
// extra round trip and no server change.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr, BAND } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el } from '../fmt.js?v=2.0.0-final'
import { getJson } from '../cache.js?v=2.0.0-final'

let currentRain = 100
let currentData = null
let currentQuery = ''
let lastDataRain = null

export function initWhatIf() {
  const box = document.getElementById('whatif')
  if (!box) return
  let debounce = null

  function repaint() {
    box.replaceChildren(...render(currentRain, currentData, currentQuery))
  }
  function refetch() {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(async () => {
      const data = await getJson(`/api/whatif?rain=${currentRain}`, 15_000)
      if (data) {
        currentData = data
        lastDataRain = currentRain
        repaint()
      }
    }, 150)
  }
  // Slider input drives both repaint (instant) and refetch (debounced).
  // Search input only drives a repaint — same data, different filter.
  box.addEventListener('input', (e) => {
    if (e.target?.id === 'whatif-rain') {
      currentRain = parseInt(e.target.value, 10)
      repaint()
      refetch()
    } else if (e.target?.id === 'whatif-search') {
      currentQuery = e.target.value ?? ''
      repaint()
    }
  })
  on('lang', repaint)
  // Initial fetch.
  refetch()
  repaint()
}

function render(rain, data, query) {
  const head = el('div', { class: 'whatif-head' },
    el('div', { class: 'eyebrow' }, tr('ถ้าเกิดเหตุการณ์ · WHAT-IF', 'WHAT-IF')),
    el('p', { class: 'whatif-sub' },
      tr('ฝนตก X มม. ใน 24 ชม. → จังหวัดไหนจะเสี่ยงเพิ่ม',
         'X mm of rain in 24h → which provinces escalate')))
  // Slider + value chip
  const slider = el('div', { class: 'whatif-slider' },
    el('input', {
      type: 'range', id: 'whatif-rain',
      min: '0', max: '500', step: '10', value: String(rain),
    }),
    el('div', { class: 'whatif-ticks' },
      el('span', {}, '0'),
      el('span', {}, '100'),
      el('span', {}, '200'),
      el('span', {}, '300'),
      el('span', {}, '400'),
      el('span', {}, '500')),
    el('div', { class: 'whatif-readout' },
      el('span', { class: 'whatif-rain-num' }, `${rain}`),
      el('span', { class: 'whatif-rain-unit' }, ` ${tr('มม./24ชม.', 'mm/24h')}`)),
  )
  // Search box — looks up a specific province in the same what-if payload.
  // Filters the existing data.provinces list by partial Thai/English match.
  // Audit #8: a citizen doesn't care about the top-5 escalators; they care
  // about THEIR province. This makes the feature actually usable.
  const search = el('div', { class: 'whatif-search' },
    el('input', {
      type: 'search', id: 'whatif-search',
      placeholder: tr('ค้นหาจังหวัดของคุณ… เช่น ตราด เชียงใหม่',
                       'Look up your province… e.g. Trat, Chiang Mai'),
      value: query ?? '',
      autocomplete: 'off',
    }),
  )
  // Live summary
  let summary, escalators, foot
  if (data) {
    const s = data.summary
    summary = el('div', { class: 'whatif-summary' },
      el('div', { class: 'whatif-summary-cell' },
        el('span', { class: 'num' }, String(s.high)),
        el('span', { class: 'lbl' }, tr('วิกฤต', 'CRITICAL'))),
      el('div', { class: 'whatif-summary-cell' },
        el('span', { class: 'num' }, String(s.elevated)),
        el('span', { class: 'lbl' }, tr('เสี่ยงสูง', 'ELEVATED'))),
      el('div', { class: 'whatif-summary-cell' },
        el('span', { class: 'num' }, String(s.watch)),
        el('span', { class: 'lbl' }, tr('เฝ้าระวัง', 'WATCH'))),
      el('div', { class: 'whatif-summary-cell' },
        el('span', { class: 'num' }, String(s.normal)),
        el('span', { class: 'lbl' }, tr('ปกติ', 'NORMAL'))),
    )
    // Search filter — case-insensitive substring match on TH + EN names.
    const q = (query ?? '').trim().toLowerCase()
    if (q.length >= 2) {
      const match = (data.provinces || []).find((p) =>
        (p.name_th ?? '').toLowerCase().includes(q) ||
        (p.name_en ?? '').toLowerCase().includes(q))
      if (match) {
        // When searching, hide the top-5 escalators and show ONLY the
        // match — this is the audit's "Check your province" intent.
        escalators = [
          el('div', { class: 'whatif-search-hit' },
            tr('จังหวัดของคุณ', 'Your province')),
          whatifRow(match),
        ]
        foot = el('div', { class: 'whatif-foot' },
          tr('น้ำ/ความชื้น/อัตราน้ำขึ้น/พยากรณ์คงที่ตามเวลาปัจจุบัน · เปลี่ยนเฉพาะฝน',
             'Water/wetness/riseRate/forecast held; only rain changes'))
        return [head, slider, search, summary, ...escalators, foot].filter(Boolean)
      }
      // No match — show empty state with the typed query echoed back.
      escalators = [el('div', { class: 'whatif-empty' },
        tr(`ไม่พบจังหวัด "${query}"`,
           `No province matches "${query}"`))]
      return [head, slider, search, summary, ...escalators].filter(Boolean)
    }
    // Default: top 5 escalators (no search active).
    escalators = (data.escalators || []).slice(0, 5).map(whatifRow)
    if (escalators.length === 0) {
      escalators = [el('div', { class: 'whatif-empty' },
        tr('ไม่มีจังหวัดที่เสี่ยงเพิ่มที่ระดับฝนนี้',
           'No provinces escalate at this rain level'))]
    }
    foot = el('div', { class: 'whatif-foot' },
      tr('น้ำ/ความชื้น/อัตราน้ำขึ้น/พยากรณ์คงที่ตามเวลาปัจจุบัน · เปลี่ยนเฉพาะฝน',
         'Water/wetness/riseRate/forecast held; only rain changes'))
  } else {
    summary = el('div', { class: 'whatif-summary' })
    escalators = [el('div', { class: 'whatif-empty' }, tr('กำลังคำนวณ…', 'computing…'))]
    foot = null
  }
  return [head, slider, search, summary, ...escalators, foot].filter(Boolean)
}

function whatifRow(p) {
  return el('div', { class: `whatif-row b-${p.band_whatif}` },
    el('div', { class: 'whatif-name' }, tr(p.name_th, p.name_en)),
    el('div', { class: 'whatif-numbers' },
      el('span', { class: 'whatif-num-now' }, String(p.now)),
      el('span', { class: 'whatif-arrow' }, '→'),
      el('span', { class: 'whatif-num-new' }, String(p.whatif)),
      el('span', { class: 'whatif-delta' }, `(+${p.delta})`)),
  )
}
