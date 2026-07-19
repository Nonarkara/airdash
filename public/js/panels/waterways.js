// Washout panel — the rain-washout story: ENSO ocean state (drier = worse
// haze) and the per-province Rain-Washout outlook from /api/washout: chance
// of rain, expected mm, how much PM2.5 it would scrub out, and the projected
// value if it lands. This is the "science of it" surfaced from live data.
// (Kept the initWaterways export + #waterways container so main.js/index.html
// keep working unchanged.)
import { getJson } from '../cache.js?v=2.0.0-line1'
import { on } from '../state.js?v=2.0.0-line1'
import { tr } from '../i18n.js?v=2.0.0-line1'
import { fmtNum, el } from '../fmt.js?v=2.0.0-line1'
import { reliefEtaLine, worseBeforeBetterChip } from './patterns-ui.js?v=2.0.0-line1'

const WASHOUT_COLOR = { strong: '#1D66A8', moderate: '#3E7CB1', light: '#5BA8C7', none: '#B7AFA3', unknown: '#B7AFA3' }

export function initWaterways() {
  render()
  on('lang', render)
  setInterval(render, 3 * 60_000)
}

async function render() {
  const box = document.getElementById('waterways')
  if (!box) return
  const [enso, washout] = await Promise.all([
    getJson('/api/enso', 3600_000).catch(() => null),
    getJson('/api/washout', 60_000).catch(() => null),
  ])

  const children = []

  // ENSO ocean-state chip — seasonal context (El Niño = drier = worse haze).
  if (enso) {
    children.push(el('div', { class: `enso-chip enso-${enso.phase}` },
      el('span', { class: 'enso-dot' }),
      el('div', { class: 'txt' },
        el('div', { class: 'h' }, tr(enso.label_th, enso.label_en)),
        el('div', { class: 's' }, tr(enso.note_th, enso.note_en))),
      el('div', { class: 'oni', title: 'Oceanic Niño Index' }, `${enso.anom > 0 ? '+' : ''}${fmtNum(enso.anom, 1)}`)))
  }

  // Rain-Washout table — provinces where the rain would actually help
  // (helps_dust) sort first, then by expected relief, then by dust load.
  if (washout?.provinces?.length) {
    children.push(el('div', { class: 'panel-head' },
      el('div', { class: 'eyebrow' }, tr('ฝนช่วยล้างฝุ่น', 'RAIN WASHOUT OUTLOOK')),
      el('div', { class: 'sign' }, el('div', { class: 'en' }, tr(washout.method_th, washout.method_en)))))

    const rows = [...washout.provinces]
      .filter((p) => p.pm25 !== null)
      .sort((a, b) =>
        (b.helps_dust === true) - (a.helps_dust === true) ||
        (b.expected_relief_pct ?? 0) - (a.expected_relief_pct ?? 0) ||
        (b.pm25 ?? -1) - (a.pm25 ?? -1))
      .slice(0, 14)

    for (const p of rows) {
      const lbl = washout.labels?.[p.band] ?? { th: p.band, en: p.band }
      const color = WASHOUT_COLOR[p.band ?? 'unknown']
      children.push(el('div', { class: `washout-row wet-row wet-${p.band}` },
        el('div', { class: 'cascade-node-sq', style: `background:${color}`,
          title: tr(lbl.th, lbl.en) }),
        el('div', { class: 'cascade-body' },
          el('div', { class: 'nm' },
            tr(p.province_th, p.province_en) || p.province_code,
            p.helps_dust
              ? el('span', { class: 'hot', style: 'margin-left:6px;font-size:10px' },
                  `🌧 −${fmtNum(p.relief_if_rain_pct, 0)}%`)
              : '',
            worseBeforeBetterChip(p)),
          el('div', { class: 'q' },
            tr('ฝุ่น ', 'PM2.5 '), el('b', {}, fmtNum(p.pm25, 0)), ' µg/m³',
            ` · ${tr('โอกาสฝน 24ชม.', 'rain 24h')} ${fmtNum(p.prob24 ?? 0, 0)}%`,
            ` · ${tr('คาด', 'fc')} ${fmtNum(p.rain_fc_24 ?? 0, 0)} ${tr('มม.', 'mm')}`),
          // Relief timeline — which forecast day first brings washout-grade
          // rain ("ฝนช่วยล้างฝุ่นพรุ่งนี้ · washout rain tomorrow, 8mm @98%").
          reliefEtaLine(p),
          el('div', { class: 'q' }, tr(lbl.th, lbl.en))),
        el('div', { class: 'cascade-lag' },
          p.projected_pm25 !== null && (p.relief_if_rain_pct ?? 0) > 0
            ? el('div', { class: 'eta', title: tr('ค่าฝุ่นถ้าฝนตกจริง', 'PM2.5 if the rain lands') },
                `→${fmtNum(p.projected_pm25, 0)}`)
            : '—')))
    }
  }

  if (children.length === 0) {
    children.push(el('div', { class: 'wx-method' }, tr('กำลังโหลดข้อมูลฝนล้างฝุ่น…', 'loading washout outlook…')))
  }
  box.replaceChildren(...children)
}
