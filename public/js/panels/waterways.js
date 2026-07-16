// Waterways panel — the connected-rivers story: ENSO ocean state, the flagship
// Chao Phraya cascade (upstream discharge → Bangkok in N days), and per-province
// catchment wetness (Antecedent Precipitation Index). This is the "science of
// it" surfaced from live data.
import { getJson } from '../cache.js?v=2.0.0-final'
import { on, store, emit } from '../state.js?v=2.0.0-final'
import { tr, pick } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el } from '../fmt.js?v=2.0.0-final'
import { flyToStation } from '../map.js?v=2.0.0-final'

const BAND_COLOR = { normal: '#1D66A8', watch: '#F0B400', warning: '#E86A10', emergency: '#A51931', unknown: '#B7AFA3' }

export function initWaterways() {
  render()
  on('lang', render)
  setInterval(render, 3 * 60_000)
  on('reach-select', (r) => { if (r?.lat) flyToStation({ lat: r.lat, lng: r.lng }) })
}

async function render() {
  const box = document.getElementById('waterways')
  if (!box) return
  const [rivers, enso, wetness] = await Promise.all([
    getJson('/api/rivers', 60_000).catch(() => null),
    getJson('/api/enso', 3600_000).catch(() => null),
    getJson('/api/wetness', 60_000).catch(() => null),
  ])

  const children = []

  // ENSO ocean-state chip.
  if (enso) {
    children.push(el('div', { class: `enso-chip enso-${enso.phase}` },
      el('span', { class: 'enso-dot' }),
      el('div', { class: 'txt' },
        el('div', { class: 'h' }, tr(enso.label_th, enso.label_en)),
        el('div', { class: 's' }, tr(enso.note_th, enso.note_en))),
      el('div', { class: 'oni', title: 'Oceanic Niño Index' }, `${enso.anom > 0 ? '+' : ''}${fmtNum(enso.anom, 1)}`)))
  }

  // Flagship Chao Phraya cascade.
  if (rivers?.flagship?.length) {
    children.push(el('div', { class: 'panel-head' },
      el('div', { class: 'eyebrow' }, tr('น้ำเดินทางลงเจ้าพระยา', 'CHAO PHRAYA CASCADE')),
      el('div', { class: 'sign' }, el('div', { class: 'en' }, tr(rivers.method_th, rivers.method_en)))))

    const flow = el('div', { class: 'cascade-flow' })
    rivers.flagship.forEach((s) => {
      const color = BAND_COLOR[s.band ?? 'unknown']
      flow.append(el('div', { class: 'cascade-step' },
        el('div', { class: 'cascade-node-sq', style: `background:${color}` }),
        el('div', { class: 'cascade-body' },
          el('div', { class: 'nm' }, tr(s.name_th, s.name_en)),
          el('div', { class: 'q' }, tr('ไหลวันนี้ ', 'now '), el('b', {}, fmtNum(s.discharge, 0)),
            ` ${tr('ลบ.ม./วิ · คาด', 'm³/s · peak')} ${fmtNum(s.forecastPeak, 0)}`)),
        el('div', { class: 'cascade-lag' },
          s.cumLagDays > 0 ? el('div', { class: 'eta' }, `+${s.cumLagDays}${tr('ว', 'd')}`) : tr('ต้นน้ำ', 'source'))))
    })
    children.push(flow)
  }

  // Catchment wetness (Antecedent Precipitation Index).
  if (wetness?.provinces?.length) {
    const top = wetness.provinces.filter((p) => p.api >= 5).slice(0, 12)
    children.push(el('div', { class: 'panel-head' },
      el('div', { class: 'eyebrow' }, tr('ความชุ่มน้ำของดิน (API)', 'CATCHMENT WETNESS (API)'), ' ',
        el('a', { href: '#', class: 'lib-more', onclick: (e) => { e.preventDefault(); window.openLibraryDoc?.('knowledge/soil-wetness') } },
          tr('อ่านเพิ่มเติม →', 'read more →'))),
      el('div', { class: 'sign' }, el('div', { class: 'en' }, tr(wetness.method_th, wetness.method_en)))))
    const maxApi = Math.max(60, ...top.map((p) => p.api))
    for (const p of top) {
      const lbl = wetness.labels[p.band]
      children.push(el('div', { class: `wet-row wet-${p.band}` },
        el('span', { class: 'nm' }, tr(p.province_th, p.province_en) || p.province_code),
        el('div', { class: 'wet-bar' }, el('div', { style: `width:${Math.min(100, (p.api / maxApi) * 100)}%` })),
        el('span', { class: 'val' }, `${fmtNum(p.api, 0)} · ${tr(lbl.th, lbl.en)}`)))
    }
  }

  if (children.length === 0) {
    children.push(el('div', { class: 'wx-method' }, tr('กำลังโหลดข้อมูลเส้นทางน้ำ…', 'loading waterways…')))
  }
  box.replaceChildren(...children)
}
