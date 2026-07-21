// What-if widget — "ถ้าฝนตก X มม. ใน 24 ชม. ฝุ่นจะลดลงเท่าไร?"
// Drag the slider → re-projects PM2.5 through the wet-deposition washout
// curve for every province and shows the top 5 relievers. Same score
// formula as the live indicator — only the rain input changes.
//
// Audit #8 — "Check your province": a search box lets a user look up their
// OWN province instead of only seeing the top 5 relievers. The full
// /api/whatif payload already contains every province's re-projected
// score; the search just filters the existing list client-side, so no
// extra round trip and no server change.
import { on, store } from '../state.js?v=2.0.0-saphan1'
import { tr, BAND } from '../i18n.js?v=2.0.0-saphan1'
import { fmtNum, el } from '../fmt.js?v=2.0.0-saphan1'
import { getJson } from '../cache.js?v=2.0.0-saphan1'

let currentRain = 20
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
    el('div', { class: 'eyebrow' }, tr('ถ้าฝนตก · WHAT-IF', 'WHAT-IF')),
    el('p', { class: 'whatif-sub' },
      data
        ? tr(`ถ้าฝนตก ${rain} มม. ใน 24 ชม. ฝุ่นจะลดลง ~${fmtNum(data.relief_pct ?? 0, 0)}%`,
             `If ${rain} mm falls in 24h, PM2.5 washes out ~${fmtNum(data.relief_pct ?? 0, 0)}%`)
        : tr('ฝนตก X มม. ใน 24 ชม. → ฝุ่นจังหวัดไหนลดลงมากสุด',
             'X mm of rain in 24h → where does dust drop most')))
  // Slider + value chip
  const slider = el('div', { class: 'whatif-slider' },
    el('input', {
      type: 'range', id: 'whatif-rain',
      min: '0', max: '200', step: '5', value: String(rain),
    }),
    el('div', { class: 'whatif-ticks' },
      el('span', {}, '0'),
      el('span', {}, '50'),
      el('span', {}, '100'),
      el('span', {}, '150'),
      el('span', {}, '200')),
    el('div', { class: 'whatif-readout' },
      el('span', { class: 'whatif-rain-num' }, `${rain}`),
      el('span', { class: 'whatif-rain-unit' }, ` ${tr('มม./24ชม.', 'mm/24h')}`)),
  )
  // Search box — looks up a specific province in the same what-if payload.
  // Filters the existing data.provinces list by partial Thai/English match.
  // Audit #8: a citizen doesn't care about the top-5 relievers; they care
  // about THEIR province. This makes the feature actually usable.
  const search = el('div', { class: 'whatif-search' },
    el('input', {
      type: 'search', id: 'whatif-search',
      placeholder: tr('ค้นหาจังหวัดของคุณ… เช่น เชียงใหม่ ขอนแก่น',
                       'Look up your province… e.g. Chiang Mai, Khon Kaen'),
      value: query ?? '',
      autocomplete: 'off',
    }),
  )
  // Live summary — band migration counts after the washout.
  let summary, relievers, foot
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
        // When searching, hide the top-5 relievers and show ONLY the
        // match — this is the audit's "Check your province" intent.
        relievers = [
          el('div', { class: 'whatif-search-hit' },
            tr('จังหวัดของคุณ', 'Your province')),
          whatifRow(match),
        ]
        foot = whatifFoot()
        return [head, slider, search, summary, ...relievers, foot].filter(Boolean)
      }
      // No match — show empty state with the typed query echoed back.
      relievers = [el('div', { class: 'whatif-empty' },
        tr(`ไม่พบจังหวัด "${query}"`,
           `No province matches "${query}"`))]
      return [head, slider, search, summary, ...relievers].filter(Boolean)
    }
    // Default: top 5 relievers — the provinces this rain would help most.
    // (delta is NEGATIVE when rain helps; the server pre-sorts by delta.)
    relievers = (data.relievers || data.escalators || []).slice(0, 5).map(whatifRow)
    if (relievers.length === 0) {
      relievers = [el('div', { class: 'whatif-empty' },
        tr('ฝนระดับนี้ยังไม่ช่วยลดฝุ่นจังหวัดไหนอย่างมีนัย',
           'No province improves meaningfully at this rain level'))]
    }
    foot = whatifFoot()
  } else {
    summary = el('div', { class: 'whatif-summary' })
    relievers = [el('div', { class: 'whatif-empty' }, tr('กำลังคำนวณ…', 'computing…'))]
    foot = null
  }
  return [head, slider, search, summary, ...relievers, foot].filter(Boolean)
}

function whatifFoot() {
  return el('div', { class: 'whatif-foot' },
    tr('มลพิษอื่น/แนวโน้ม/พยากรณ์คงที่ตามเวลาปัจจุบัน · เปลี่ยนเฉพาะฝนชะล้างฝุ่น',
       'Pollutants/trend/forecast held; only rain washout changes'))
}

function whatifRow(p) {
  const delta = p.delta ?? 0
  return el('div', { class: `whatif-row b-${p.band_whatif}` },
    el('div', { class: 'whatif-name' },
      tr(p.name_th, p.name_en),
      p.pm25_now !== null && p.pm25_whatif !== null
        ? el('div', { class: 'whatif-pm', style: 'font-size:10px;color:var(--ink-low)' },
            `PM2.5 ${fmtNum(p.pm25_now, 0)} → ${fmtNum(p.pm25_whatif, 0)} µg/m³`)
        : ''),
    el('div', { class: 'whatif-numbers' },
      el('span', { class: 'whatif-num-now' }, String(p.now)),
      el('span', { class: 'whatif-arrow' }, '→'),
      el('span', { class: 'whatif-num-new' }, String(p.whatif)),
      el('span', { class: 'whatif-delta' }, delta > 0 ? `(+${delta})` : `(${delta})`)),
  )
}
