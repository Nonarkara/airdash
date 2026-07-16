// 3-day flood forecast view — "Where will the crisis be in 3 days?"
// Replays the live watch score with Open-Meteo's 3-day forecast rain
// replacing the observed rain. Water/wetness/riseRate held constant at
// current observation. Honest framing: heuristic indicator, not a model.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr, BAND } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el } from '../fmt.js?v=2.0.0-final'
import { getJson } from '../cache.js?v=2.0.0-final'
import { flyToProvince } from '../map.js?v=2.0.0-final'

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

function render(d) {
  const head = el('div', { class: 'forecast-head' },
    el('div', { class: 'eyebrow' }, tr('พยากรณ์ +3 วัน', '3-DAY FORECAST')),
    el('div', { class: 'forecast-method' },
      tr('คะแนนเฝ้าระวัง · น้ำคงที่ · ฝน = ฝนสะสมพยากรณ์',
         'Watch score · water held · rain = cum. forecast')))
  const escalators = d.escalators || []
  if (escalators.length === 0) {
    return [head, el('div', { class: 'forecast-empty' },
      tr('ไม่มีจังหวัดที่คาดว่าเสี่ยงเพิ่มใน 3 วันข้างหน้า',
         'No provinces expected to escalate in the next 3 days'))]
  }
  const rows = escalators.map((p) => el('a', {
    class: `forecast-row b-${p.scores.b72h}`,
    href: '#',
    onclick: (e) => { e.preventDefault(); flyToProvince({ province_code: p.code, lat: p.lat, lng: p.lng, province_th: p.name_th, province_en: p.name_en }) },
  },
    el('div', { class: 'forecast-name' },
      el('div', { class: 'th' }, tr(p.name_th, p.name_en)),
      el('div', { class: 'forecast-rain' },
        `🌧 ${tr('คาด', 'fc')} ${fmtNum(p.forecast.mm48, 0)} ${tr('มม./48ชม.', 'mm/48h')}`)),
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
    tr('ดัชนีบ่งชี้ ไม่ใช่แบบจำลอง — น้ำ/ดินชื้น/อัตราน้ำขึ้นคงที่ตามเวลาปัจจุบัน · เปลี่ยนเฉพาะฝน',
       'Indicator, not a model — water/wetness/rise held; only rain changes'))
  return [head, ...rows, foot]
}
