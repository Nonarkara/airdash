// Multi-screen compare — up to 4 independent map panes, each a focus area.
// Built for the regional-haze question: put Chiang Mai's smoky valley next
// to Bangkok's traffic smog and read the difference directly. Each pane is
// its own Leaflet map of live AQ stations + a readout of that area's worst
// PM2.5 and washout context.
import { getJson } from '../cache.js?v=2.0.0-i18n1'
import { store, on } from '../state.js?v=2.0.0-i18n1'
import { tr, pick } from '../i18n.js?v=2.0.0-i18n1'
import { fmtNum, el } from '../fmt.js?v=2.0.0-i18n1'
import { focusAreas } from './focus.js?v=2.0.0-i18n1'

// Thai AQI 2023 PM2.5 marker colours (15 / 25 / 37.5 / 75 µg/m³).
function pm25Color(v) {
  if (v === null || v === undefined) return '#B7AFA3'
  if (v >= 75) return '#A51931'
  if (v >= 37.5) return '#E86A10'
  if (v >= 25) return '#F0B400'
  if (v >= 15) return '#8BB174'
  return '#00933C'
}

let panes = []       // { map, sel, readout, dataLayer, areaId }
let geo = null
let paneCount = 2

export function initCompare() {
  // The compare feature is opt-in: it only attaches handlers if the trigger
  // button is present in the DOM. The top bar v2 redesign removed the
  // compare-btn chip (it was a tertiary feature, not in the headline), so
  // most builds will skip the wiring entirely. The overlay, close button
  // and grid stay available for any future header that re-adds the trigger.
  const trigger = document.getElementById('compare-btn')
  const closeBtn = document.getElementById('compare-close')
  if (!trigger) return  // no compare button → feature is disabled in this build
  trigger.addEventListener('click', open)
  if (closeBtn) closeBtn.addEventListener('click', close)
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
  geo = await getJson('/geo/province-boundaries.geojson', 3600_000).catch(() => null)
  build()
}

function close() {
  document.getElementById('compare-overlay').hidden = true
  for (const p of panes) p.map?.remove()
  panes = []
}

// Sensible default lineup: the burning-season north next to the traffic
// metropolis, then the stubble-burning northeast and the transboundary south.
const DEFAULT_LINEUP = ['chiangmai', 'bangkok', 'khonkaen', 'hatyai']

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
  if (geo) L.geoJSON(geo, { style: () => ({ color: '#948C7F', weight: 0.6, opacity: 0.35, fill: false }), interactive: false }).addTo(map)
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

  // AQ stations within the area bbox (from the shared snapshot),
  // PM2.5-colored — the primary markers.
  const [s, w, n, e] = area.bbox
  const air = (store.snapshot?.air ?? []).filter((st) =>
    st.lat !== null && st.lat >= s && st.lat <= n && st.lng >= w && st.lng <= e)
  for (const st of air) {
    const pm = st.pm25 ?? null
    L.circleMarker([st.lat, st.lng], {
      radius: pm !== null && pm >= 37.5 ? 6 : 4, color: '#fff', weight: 0.8,
      fillColor: pm25Color(pm), fillOpacity: 0.9,
    }).addTo(pane.dataLayer)
  }

  // Readout — the numbers that make the comparison legible side by side.
  const rows = [el('div', { class: 'wx-method' }, area && (store.lang === 'th' ? area.blurb_th : area.blurb_en))]
  const worst = [...air].filter((st) => st.pm25 !== null && st.pm25 !== undefined)
    .sort((a, b) => b.pm25 - a.pm25)
    .slice(0, 3)
  if (worst.length === 0) {
    rows.push(el('div', { class: 'wet-row' }, tr('ไม่มีสถานีวัดฝุ่นในพื้นที่นี้', 'no AQ station here')))
  }
  for (const st of worst) {
    rows.push(el('div', { class: 'cascade-step', style: 'padding:6px 10px' },
      el('div', { class: 'cascade-node-sq', style: `width:18px;height:18px;background:${pm25Color(st.pm25)}` }),
      el('div', { class: 'cascade-body' },
        el('div', { class: 'nm', style: 'font-size:12.5px' }, pick(st, 'name')),
        el('div', { class: 'q' }, 'PM2.5 ', el('b', {}, fmtNum(st.pm25, 0)), ' µg/m³',
          st.aqi !== null && st.aqi !== undefined ? ` · AQI ${fmtNum(st.aqi, 0)}` : '')),
    ))
  }
  // Local washout context — max observed rain across the area's gauges.
  const rain = (store.snapshot?.rain ?? []).filter((st) =>
    st.lat !== null && st.lat >= s && st.lat <= n && st.lng >= w && st.lng <= e)
  const maxRain = rain.reduce((m, st) => Math.max(m, st.rain_24h ?? 0), 0)
  rows.push(el('div', { class: 'wet-row' },
    el('span', { class: 'nm' }, tr('ฝนล้างฝุ่น 24ชม.', 'washout rain 24h')),
    el('span', { class: 'val', style: 'width:auto;flex:1;text-align:left;color:var(--ink)' },
      `${fmtNum(maxRain, 0)} ${tr('มม. · สถานีฝุ่น', 'mm · AQ stations')} ${air.length}`)))
  pane.readout.replaceChildren(...rows)
}
