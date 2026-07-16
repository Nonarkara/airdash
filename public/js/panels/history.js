// Historical flood events — Thailand's major floods as a card list.
// Same data that powers the map markers; this gives users a scannable
// timeline they can read without zooming around the map.
import { on, store } from '../state.js?v=2.0.0-final'
import { tr } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el, escapeHtml } from '../fmt.js?v=2.0.0-final'
import { getJson } from '../cache.js?v=2.0.0-final'
import { flyToProvince } from '../map.js?v=2.0.0-final'

const SEV_LABEL = {
  emergency: { th: 'วิกฤต',     en: 'EMERGENCY' },
  warning:   { th: 'เตือนภัย',  en: 'WARNING'   },
  watch:     { th: 'เฝ้าระวัง', en: 'WATCH'     },
}

let events = null

export function initHistory() {
  load()
  on('lang', paint)
}

async function load() {
  try {
    events = await getJson('/geo/historical-floods.json', 3_600_000)
    paint()
  } catch {
    const box = document.getElementById('history')
    if (box) box.textContent = tr('โหลดข้อมูลประวัติไม่สำเร็จ', 'failed to load history')
  }
}

function paint() {
  const box = document.getElementById('history')
  if (!box || !events) return
  box.replaceChildren(
    el('div', { class: 'hist-intro' },
      el('div', { class: 'eyebrow' }, tr('น้ำท่วมใหญ่ในไทย', 'MAJOR THAI FLOODS')),
      el('p', {}, tr(
        'เหตุการณ์สำคัญที่บันทึกไว้ — คลิกเพื่อบินไปยังสถานที่บนแผนที่',
        'Curated historical events — click to fly to location'))),
    ...events
      .slice()
      .sort((a, b) => b.year - a.year)
      .map(renderEvent),
    el('div', { class: 'hist-foot' },
      tr('ข้อมูลจากเอกสารภาครัฐและองค์กรวิจัย — ดู knowledge/historical-floods.md สำหรับที่มา',
         'Sourced from government and research publications — see knowledge/historical-floods.md')),
  )
}

function renderEvent(e) {
  const sev = SEV_LABEL[e.severity] ?? { th: e.severity, en: e.severity }
  return el('a', {
    class: `hist-card sev-${e.severity}`,
    href: '#',
    onclick: (ev) => {
      ev.preventDefault()
      flyToProvince({ lat: e.lat, lng: e.lng, name_th: e.name_th, name_en: e.name_en, province_code: 'history' })
    },
  },
    el('div', { class: 'hist-head' },
      el('span', { class: 'hist-year' }, String(e.year)),
      el('span', { class: 'hist-sev' }, tr(sev.th, sev.en))),
    el('div', { class: 'hist-name' },
      el('div', { class: 'th' }, tr(e.name_th, e.name_en)),
      el('div', { class: 'en' }, tr(e.months_th, e.months_en))),
    el('p', { class: 'hist-fact' }, tr(e.fact_th, e.fact_en)),
  )
}
