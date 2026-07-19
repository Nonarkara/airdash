// 3-day air forecast view — "Where will the dust be in 3 days?"
// Replays the live watch score with the CAMS PM2.5 forecast replacing the
// observed ground PM2.5, discounted by expected rain washout per day.
// Pollutants/ventilation held constant. Honest framing: heuristic
// indicator, not a model.
import { on, store } from '../state.js?v=2.0.0-hero1'
import { tr, BAND } from '../i18n.js?v=2.0.0-hero1'
import { fmtNum, el } from '../fmt.js?v=2.0.0-hero1'
import { getJson } from '../cache.js?v=2.0.0-hero1'
import { flyToProvince } from '../map.js?v=2.0.0-hero1'

const BAND_LABEL = {
  normal:   { th: 'ปกติ',     en: 'Normal'   },
  watch:    { th: 'เฝ้าระวัง', en: 'Watch'    },
  elevated: { th: 'เสี่ยงสูง', en: 'Elevated' },
  high:     { th: 'วิกฤต',    en: 'Critical' },
}

export function initForecast() {
  const box = document.getElementById('forecast-strip')
  if (!box) return
  // Pull on boot and on every snapshot tick so the strip tracks live data.
  on('snapshot', () => refresh(box))
  on('lang', () => refresh(box))
  refresh(box)
}

async function refresh(box) {
  const data = await getJson('/api/forecast', 90_000)
  if (!data) {
    box.replaceChildren(el('div', { class: 'forecast-empty' },
      tr('กำลังโหลดพยากรณ์…', 'Loading forecast…')))
    return
  }
  box.replaceChildren(...render(data))
}

// One-line PM2.5 + rain summary for a province's 3-day outlook.
function fcLine(f) {
  const pm = [f.pm25_d0, f.pm25_d1, f.pm25_d2].filter((v) => v !== null && v !== undefined)
  const probs = [f.prob_d0, f.prob_d1, f.prob_d2].filter((v) => v !== null && v !== undefined)
  const parts = []
  if (pm.length) {
    parts.push(`PM2.5 ${fmtNum(pm[0], 0)}→${fmtNum(pm[pm.length - 1], 0)} µg/m³`)
  }
  if (probs.length) {
    parts.push(`🌧 ${tr('โอกาสฝนสูงสุด', 'max rain odds')} ${fmtNum(Math.max(...probs), 0)}%`)
  }
  return parts.join(' · ')
}

function render(d) {
  const head = el('div', { class: 'forecast-head' },
    el('div', { class: 'eyebrow' }, tr('พยากรณ์ +3 วัน', '3-DAY FORECAST')),
    el('div', { class: 'forecast-method' },
      tr('คะแนนเฝ้าระวัง · PM2.5 = CAMS หักฝนล้างฝุ่น',
         'Watch score · PM2.5 = CAMS minus rain washout')))
  const escalators = d.escalators || []
  if (escalators.length === 0) {
    return [head, el('div', { class: 'forecast-empty' },
      tr('ไม่มีจังหวัดที่แนวโน้มฝุ่นแย่ลงใน 3 วันข้างหน้า',
         'No provinces trending worse over the next 3 days'))]
  }
  const sub = el('div', { class: 'forecast-sub eyebrow' },
    tr('จังหวัดที่แนวโน้มแย่ลง', 'PROVINCES TRENDING WORSE'))
  const rows = escalators.map((p) => el('a', {
    class: `forecast-row b-${p.scores.b72h}`,
    href: '#',
    onclick: (e) => { e.preventDefault(); flyToProvince({ province_code: p.code, lat: p.lat, lng: p.lng, province_th: p.name_th, province_en: p.name_en }) },
  },
    el('div', { class: 'forecast-name' },
      el('div', { class: 'th' }, tr(p.name_th, p.name_en)),
      el('div', { class: 'forecast-rain' }, fcLine(p.forecast))),
    el('div', { class: 'forecast-rail' },
      el('div', { class: 'forecast-col' },
        el('div', { class: 'forecast-h' }, tr('ตอนนี้', 'NOW')),
        el('div', { class: `forecast-score b-${p.scores.band}` }, String(p.scores.now))),
      el('div', { class: 'forecast-col' },
        el('div', { class: 'forecast-h' }, '+24h'),
        el('div', { class: `forecast-score b-${p.scores.b24h}` }, String(p.scores.p24h))),
      el('div', { class: 'forecast-col' },
        el('div', { class: 'forecast-h' }, '+48h'),
        el('div', { class: `forecast-score b-${p.scores.b48h}` }, String(p.scores.p48h))),
      el('div', { class: 'forecast-col' },
        el('div', { class: 'forecast-h' }, '+72h'),
        el('div', { class: `forecast-score b-${p.scores.b72h}` }, String(p.scores.p72h))),
    ),
    el('div', { class: 'forecast-delta' },
      el('span', { class: 'forecast-arrow' },
        p.delta > 0 ? '▲' : p.delta < 0 ? '▼' : '·'),
      el('span', { class: 'forecast-delta-num' },
        p.delta > 0 ? `+${p.delta}` : p.delta === 0 ? '0' : `${p.delta}`)),
  ))
  // Footnote disclaimer
  const foot = el('div', { class: 'forecast-foot' },
    tr('ดัชนีบ่งชี้ ไม่ใช่แบบจำลอง — มลพิษอื่น/การระบายอากาศคงที่ตามเวลาปัจจุบัน',
       'Indicator, not a model — pollutants/ventilation held at current observation'))
  return [head, sub, ...rows, foot]
}
