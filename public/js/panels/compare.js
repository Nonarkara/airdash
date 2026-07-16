// Multi-screen compare — up to 4 independent map panes, each a focus area.
// Built for the connected-waterways question: put an upstream reach next to a
// downstream one and read the lag directly (Nakhon Sawan peaks in 3d, Bangkok
// in 5d). Each pane is its own Leaflet map + a readout of that area's reaches.
import { getJson } from '../cache.js?v=2.0.0-final'
import { store, on } from '../state.js?v=2.0.0-final'
import { tr, pick } from '../i18n.js?v=2.0.0-final'
import { fmtNum, el } from '../fmt.js?v=2.0.0-final'
import { focusAreas } from './focus.js?v=2.0.0-final'

const BAND_COLOR = { normal: '#1D66A8', watch: '#F0B400', warning: '#E86A10', emergency: '#A51931', unknown: '#B7AFA3' }
const LV_COLOR = { 1: '#B7AFA3', 2: '#948C7F', 3: '#00933C', 4: '#E86A10', 5: '#A51931' }

let panes = []       // { map, sel, readout, areaId }
let riversData = null
let geo = null
let paneCount = 2

export function initCompare() {
  document.getElementById('compare-btn').addEventListener('click', open)
  document.getElementById('compare-close').addEventListener('click', close)
  document.querySelectorAll('.compare-actions button[data-panes]').forEach((b) => {
    b.addEventListener('click', () => {
      paneCount = Number(b.dataset.panes)
      document.querySelectorAll('.compare-actions button[data-panes]').forEach((x) => x.classList.toggle('active', x === b))
      build()
    })
  })
  const paintClose = () => {
    const lbl = document.querySelector('#compare-close .lbl')
    if (lbl) lbl.textContent = store.lang === 'th' ? 'ปิด' : 'Close'
  }
  paintClose()
  on('lang', () => {
    paintClose()
    if (!document.getElementById('compare-overlay').hidden) build()
  })
}

async function open() {
  document.getElementById('compare-overlay').hidden = false
  ;[riversData, geo] = await Promise.all([
    getJson('/api/rivers', 60_000).catch(() => null),
    getJson('/geo/thai-rivers.geojson', 3600_000).catch(() => null),
  ])
  build()
}

function close() {
  document.getElementById('compare-overlay').hidden = true
  for (const p of panes) p.map?.remove()
  panes = []
}

// Sensible upstream→downstream default lineup so the lag is visible immediately.
const DEFAULT_LINEUP = ['nakhonsawan', 'ayutthaya', 'bangkok', 'hatyai']

function build() {
  const grid = document.getElementById('compare-grid')
  grid.className = `panes-${paneCount}`
  for (const p of panes) p.map?.remove()
  panes = []
  grid.replaceChildren()

  const areas = focusAreas().filter((a) => a.id !== 'thailand')
  for (let i = 0; i < paneCount; i++) {
    const areaId = DEFAULT_LINEUP[i] ?? areas[i % areas.length]?.id
    grid.append(buildPane(areaId, areas))
  }
  // Leaflet needs a resize tick after the grid lays out.
  requestAnimationFrame(() => panes.forEach((p) => p.map.invalidateSize()))
}

function buildPane(areaId, areas) {
  const wrap = el('div', { class: 'cmp-pane' })
  const sel = el('select', {})
  sel.replaceChildren(...areas.map((a) => {
    const o = document.createElement('option')
    o.value = a.id; o.textContent = store.lang === 'th' ? a.name_th : a.name_en
    if (a.id === areaId) o.selected = true
    return o
  }))
  const bar = el('div', { class: 'cmp-bar' }, sel)
  const mapDiv = el('div', { class: 'cmp-map' })
  const readout = el('div', { class: 'cmp-readout' })
  wrap.append(bar, mapDiv, readout)

  const area = focusAreas().find((a) => a.id === (sel.value || areaId))
  const map = L.map(mapDiv, {
    center: area.center, zoom: area.zoom, zoomControl: false,
    attributionControl: false, preferCanvas: true,
  })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd' }).addTo(map)
  if (geo) L.geoJSON(geo, { style: (f) => ({ color: '#3E7CB1', weight: f.properties.km > 45 ? 1.4 : 0.6, opacity: 0.4 }), interactive: false }).addTo(map)
  const dataLayer = L.layerGroup().addTo(map)

  const pane = { map, sel, readout, dataLayer, areaId: sel.value }
  panes.push(pane)
  sel.addEventListener('change', () => {
    const a = focusAreas().find((x) => x.id === sel.value)
    pane.areaId = sel.value
    map.flyTo(a.center, a.zoom, { duration: 0.6 })
    paintPane(pane)
  })
  paintPane(pane)
  return wrap
}

function paintPane(pane) {
  const area = focusAreas().find((a) => a.id === pane.areaId)
  pane.dataLayer.clearLayers()

  // Water-level stations within the area bbox (from the shared snapshot).
  const [s, w, n, e] = area.bbox
  const water = (store.snapshot?.water ?? []).filter((st) =>
    st.lat !== null && st.lat >= s && st.lat <= n && st.lng >= w && st.lng <= e)
  for (const st of water) {
    const lv = Math.round(st.situation_level ?? 0)
    L.circleMarker([st.lat, st.lng], {
      radius: lv >= 4 ? 5 : 3, color: '#fff', weight: 0.8,
      fillColor: LV_COLOR[lv] ?? '#B7AFA3', fillOpacity: 0.9,
    }).addTo(pane.dataLayer)
  }

  // The area's river reaches (GloFAS) as cascade nodes.
  const reaches = (riversData?.reaches ?? []).filter((r) => (area.reaches ?? []).includes(r.id))
  for (const r of reaches) {
    if (r.lat === null) continue
    const band = r.peakBand === 'normal' ? r.band : r.peakBand
    L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: '', iconSize: [16, 16],
        html: `<div class="reach-node" style="width:16px;height:16px;background:${BAND_COLOR[band ?? 'unknown']}"></div>` }),
    }).addTo(pane.dataLayer)
  }

  // Readout — the numbers that make the lag legible side by side.
  const rows = [el('div', { class: 'wx-method' }, area && (store.lang === 'th' ? area.blurb_th : area.blurb_en))]
  if (reaches.length === 0) {
    rows.push(el('div', { class: 'wet-row' }, tr('ไม่มีจุดวัดแม่น้ำหลักในพื้นที่นี้', 'no major river gauge here')))
  }
  for (const r of reaches) {
    const band = r.peakBand === 'normal' ? r.band : r.peakBand
    rows.push(el('div', { class: 'cascade-step', style: 'padding:6px 10px' },
      el('div', { class: 'cascade-node-sq', style: `width:18px;height:18px;background:${BAND_COLOR[band ?? 'unknown']}` }),
      el('div', { class: 'cascade-body' },
        el('div', { class: 'nm', style: 'font-size:12.5px' }, pick(r, 'name')),
        el('div', { class: 'q' }, tr('ไหล ', 'now '), el('b', {}, fmtNum(r.discharge, 0)),
          ` → ${tr('สูงสุด', 'peak')} ${fmtNum(r.forecastPeak, 0)} ${tr('ลบ.ม./วิ', 'm³/s')}`)),
      el('div', { class: 'cascade-lag' },
        r.forecastPeakDay !== null ? el('div', { class: 'eta' }, `+${r.forecastPeakDay}${tr('ว', 'd')}`) : '—')))
  }
  // Local rain summary for the area.
  const rain = (store.snapshot?.rain ?? []).filter((st) =>
    st.lat !== null && st.lat >= s && st.lat <= n && st.lng >= w && st.lng <= e)
  const maxRain = rain.reduce((m, st) => Math.max(m, st.rain_24h ?? 0), 0)
  rows.push(el('div', { class: 'wet-row' },
    el('span', { class: 'nm' }, tr('ฝนสูงสุด 24ชม.', 'max rain 24h')),
    el('span', { class: 'val', style: 'width:auto;flex:1;text-align:left;color:var(--ink)' },
      `${fmtNum(maxRain, 0)} ${tr('มม. · สถานีน้ำ', 'mm · gauges')} ${water.length}`)))
  pane.readout.replaceChildren(...rows)
}
