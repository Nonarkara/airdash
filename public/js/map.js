// Leaflet map: Carto basemap + JAXA/NASA satellite overlays + ground data.
// Z-order (bottom→top): basemap · satellite · radar · vectors · station data.
import { on, emit, store } from './state.js?v=2.0.0-final'
import { tr, pick, BAND, LEVEL_NAME } from './i18n.js?v=2.0.0-final'
import { fmtNum, fmtClock, escapeHtml } from './fmt.js?v=2.0.0-final'
import { createRiversLayer } from './layers/rivers.js?v=2.0.0-final'
import { createWaterflowLayer } from './layers/waterflow.js?v=2.0.0-final'
import { createHistoryLayer } from './layers/history.js?v=2.0.0-final'
import { createOsmBuildingsLayer } from './layers/osm-buildings.js?v=2.0.0-final'
import { createProvinceBoundariesLayer } from './layers/province-boundaries.js?v=2.0.0-final'
import { createSheltersLayer } from './layers/shelters.js?v=2.0.0-final'
import { createSatelliteLayers, ensureMapPanes, LAYER_GROUPS, allLayerToggles } from './layers/satellite.js?v=2.0.0-final'
import { createBasemaps, BASEMAP_META } from './layers/basemaps.js?v=2.0.0-final'
import { paintRisk, paintWater, paintRain, paintDams, paintAqi } from './paint.js?v=2.0.0-final'

const TH_BOUNDS = L.latLngBounds([4.8, 96.5], [21.2, 106.5])
let map
const layers = {}
let satLayers = null
let riversApi = null
let waterflowApi = null
let historyApi = null
let osmBuildingsApi = null
let basemaps = null
const BASEMAP_KEY = 'fd_basemap'
let currentBasemap = (() => {
  const saved = localStorage.getItem(BASEMAP_KEY)
  return BASEMAP_META.some((b) => b.id === saved) ? saved : 'street'
})()

export function initMap() {
  map = L.map('map', {
    zoomControl: true, attributionControl: true,
    maxBounds: TH_BOUNDS.pad(0.6), minZoom: 5, maxZoom: 17,
    preferCanvas: true,
  }).fitBounds(TH_BOUNDS)
  map.attributionControl.setPrefix(false)
  ensureMapPanes(map)

  basemaps = createBasemaps()
  basemaps[currentBasemap].addTo(map)

  satLayers = createSatelliteLayers(map, 'satellite')
  layers.gsmap = satLayers.gsmap
  layers.himawari = satLayers.himawari
  layers.modis = satLayers.modis

  layers.risk = L.layerGroup([], { pane: 'data' })
  layers.water = L.layerGroup([], { pane: 'data' })
  layers.rain = L.layerGroup([], { pane: 'data' })
  layers.dams = L.layerGroup([], { pane: 'data' })
  layers.aqi = L.layerGroup([], { pane: 'data' })
  riversApi = createRiversLayer(map)
  layers.rivers = L.layerGroup([riversApi.network, riversApi.cascade], { pane: 'vectors' })
  waterflowApi = createWaterflowLayer()
  layers.waterflow = L.layerGroup([waterflowApi.group], { pane: 'vectors' })
  on('rivers', (data) => waterflowApi.draw(data))
  historyApi = createHistoryLayer()
  layers.history = historyApi.group
  osmBuildingsApi = createOsmBuildingsLayer({ getMap: () => map, getRisk: () => store.snapshot?.risk })
  layers.osmbuild = osmBuildingsApi.group
  const boundariesApi = createProvinceBoundariesLayer()
  layers.boundaries = boundariesApi.group
  const sheltersApi = createSheltersLayer(map)
  layers.shelters = sheltersApi.group
  initRadar()

  for (const t of allLayerToggles()) {
    if (t.on && layers[t.id]) {
      layers[t.id].addTo(map)
      if (t.id === 'rivers') riversApi.onAdd()
      if (t.id === 'waterflow') waterflowApi.onAdd()
      if (t.id === 'history') historyApi.onAdd()
      if (t.id === 'osmbuild') osmBuildingsApi.onAdd()
    }
  }

  addLayerControl()
  addLegend()
  // Expose for testing/devtools — never used by app code.
  window.__flooddash = { map, layers, osmBuildingsApi }

  on('snapshot', renderAll)
  on('lang', () => { addLegend(); addLayerControl(); renderAll(store.snapshot) })
  return map
}

// ── Overlays ────────────────────────────────────────────────────────────────
function renderAll(snap) {
  if (!snap) return
  paintRisk(layers, snap.risk)
  paintWater(layers, snap.water, { getZoom: () => map.getZoom() })
  paintRain(layers, snap.rain)
  paintDams(layers, snap.dams)
  paintAqi(layers, snap.aqi)
}

let waterStations = null
let zoomHookInstalled = false

function renderWater(stations) {
  if (stations) waterStations = stations
  if (!zoomHookInstalled) {
    zoomHookInstalled = true
    let wasDetailed = map.getZoom() >= 8
    map.on('zoomend', () => {
      const detailed = map.getZoom() >= 8
      if (detailed !== wasDetailed) { wasDetailed = detailed; renderWater(null) }
    })
  }
  paintWater(layers, waterStations, { getZoom: () => map.getZoom() })
}

// ── RainViewer radar with animation ────────────────────────────────────────
const radar = { frames: [], idx: 0, playing: true, timer: null, layer: null }

function initRadar() {
  radar.layer = L.tileLayer('', { opacity: 0.55, pane: 'radar', maxNativeZoom: 7 })
  layers.radar = radar.layer
  refreshRadarFrames()
  setInterval(refreshRadarFrames, 5 * 60_000)
}

async function refreshRadarFrames() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
    const j = await res.json()
    radar.frames = [...(j.radar?.past ?? []).slice(-7), ...(j.radar?.nowcast ?? [])]
      .map((f) => ({ time: f.time, url: `${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png` }))
    if (radar.frames.length && !radar.timer) startRadarLoop()
  } catch { /* radar is optional */ }
}

function startRadarLoop() {
  clearInterval(radar.timer)
  radar.timer = setInterval(() => {
    if (!radar.playing || document.hidden || !map.hasLayer(radar.layer) || radar.frames.length === 0) return
    radar.idx = (radar.idx + 1) % radar.frames.length
    radar.layer.setUrl(radar.frames[radar.idx].url)
    updateRadarClock()
  }, 900)
}

function updateRadarClock() {
  const elClock = document.getElementById('radar-time')
  const f = radar.frames[radar.idx]
  if (elClock && f) {
    elClock.textContent = new Date(f.time * 1000).toLocaleTimeString('en-GB',
      { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
  }
}

// ── Layer control (grouped toggles) ─────────────────────────────────────────
let layerCtl, legendCtl, radarCtl

function toggleLayer(t) {
  t.on = !t.on
  const layer = layers[t.id]
  if (!layer) return
  if (t.on) {
    layer.addTo(map)
    if (t.id === 'rivers') riversApi.onAdd()
    if (t.id === 'waterflow') waterflowApi.onAdd()
    if (t.id === 'history') historyApi.onAdd()
    if (t.id === 'osmbuild') osmBuildingsApi.onAdd()
  } else {
    layer.remove()
    if (t.id === 'rivers') riversApi.onRemove()
    if (t.id === 'waterflow') waterflowApi.onRemove()
  }
}

function addLayerControl() {
  layerCtl?.remove()
  layerCtl = L.control({ position: 'topright' })
  layerCtl.onAdd = () => {
    const div = L.DomUtil.create('div', 'mapctl')
    L.DomEvent.disableClickPropagation(div)
    const head = L.DomUtil.create('button', 'row head', div)
    head.type = 'button'
    head.setAttribute('aria-expanded', 'false')
    head.innerHTML = `<span class="sw" style="background:var(--th-navy)"></span><span>${tr('ชั้นข้อมูล', 'layers')}</span>`
    const body = L.DomUtil.create('div', 'mapctl-body', div)
    body.hidden = true
    head.onclick = () => {
      body.hidden = !body.hidden
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true')
    }

    const bh = L.DomUtil.create('div', 'mapctl-group', body)
    bh.textContent = tr('พื้นแผนที่', 'BASEMAP')
    const basemapRows = []
    for (const b of BASEMAP_META) {
      const row = L.DomUtil.create('button', `row${b.id === currentBasemap ? ' on' : ''}`, body)
      row.type = 'button'
      row.innerHTML = `<span class="sw"></span><span class="lbl">${tr(b.th, b.en)}</span>`
      row.onclick = () => {
        if (b.id === currentBasemap) return
        basemaps[currentBasemap].remove()
        currentBasemap = b.id
        localStorage.setItem(BASEMAP_KEY, currentBasemap)
        basemaps[currentBasemap].addTo(map)
        for (const r of basemapRows) r.el.classList.toggle('on', r.id === currentBasemap)
      }
      basemapRows.push({ id: b.id, el: row })
    }

    for (const group of LAYER_GROUPS) {
      const gh = L.DomUtil.create('div', 'mapctl-group', body)
      gh.textContent = tr(group.th, group.en)
      for (const t of group.layers) {
        const row = L.DomUtil.create('button', `row${t.on ? ' on' : ''}`, body)
        row.type = 'button'
        row.innerHTML = `<span class="sw"></span><span class="lbl">${tr(t.th, t.en)}</span>`
        row.onclick = () => {
          toggleLayer(t)
          row.classList.toggle('on', t.on)
        }
      }
    }

    return div
  }
  layerCtl.addTo(map)

  radarCtl?.remove()
  radarCtl = L.control({ position: 'bottomright' })
  radarCtl.onAdd = () => {
    const div = L.DomUtil.create('div', 'radarctl')
    L.DomEvent.disableClickPropagation(div)
    div.innerHTML = `<span>${tr('เรดาร์', 'RADAR')}</span><button id="radar-toggle" type="button" aria-label="${tr('หยุดหรือเล่นเรดาร์', 'pause or play radar')}">⏸</button><span id="radar-time" class="num">--:--</span>`
    div.querySelector('#radar-toggle').onclick = (e) => {
      radar.playing = !radar.playing
      e.target.textContent = radar.playing ? '⏸' : '▶'
    }
    return div
  }
  radarCtl.addTo(map)
}

function addLegend() {
  legendCtl?.remove()
  legendCtl = L.control({ position: 'bottomleft' })
  legendCtl.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend')
    L.DomEvent.disableClickPropagation(div)
    const head = L.DomUtil.create('button', 'legend-head', div)
    head.type = 'button'
    head.setAttribute('aria-expanded', 'false')
    head.textContent = tr('คำอธิบายแผนที่', 'Map legend')
    const body = L.DomUtil.create('div', 'legend-body', div)
    body.hidden = true
    const LV_COLOR = { 1: '#B7AFA3', 2: '#948C7F', 3: '#00933C', 4: '#E86A10', 5: '#A51931' }
    const lv = (n) => `<div class="lrow"><span class="lsw" style="background:${LV_COLOR[n]}"></span>${n} ${LEVEL_NAME[n].th} · ${LEVEL_NAME[n].en}</div>`
    body.innerHTML = `
      <div class="eyebrow">${tr('ระดับน้ำ (สสน.)', 'WATER LEVEL (HII)')}</div>
      ${[5, 4, 3, 2, 1].map(lv).join('')}
      <div class="lrow" style="margin-top:4px"><span class="lsw round" style="background:#0039A6;opacity:.5"></span>${tr('ฝนสะสม 24 ชม.', 'rain 24h')}</div>
      <div class="lrow"><span class="lsw round" style="background:#1565C0;opacity:.5"></span>${tr('GPM IMERG ฝนดาวเทียม', 'GPM IMERG satellite rain')}</div>
      <div class="lrow"><span class="lsw" style="background:#5C6BC0;opacity:.6"></span>${tr('Himawari-9 IR เมฆ', 'Himawari-9 IR clouds')}</div>
      <div class="eyebrow" style="margin-top:6px">${tr('เส้นทางน้ำ', 'WATERWAYS')}</div>
      <div class="lrow"><span class="lsw" style="background:#0039A6;height:3px"></span>${tr('แม่น้ำสายหลัก (มีสถานีวัด)', 'major river (gauged)')}</div>
      <div class="lrow"><span class="lsw" style="background:#6FA8D8;height:1px;opacity:.6"></span>${tr('ลำน้ำ/คลองย่อย', 'streams / canals')}</div>
      <div class="lrow"><span class="lsw round" style="background:#1D66A8"></span>${tr('จุดไหล — ตามทิศจริง', 'flow dots — real direction')}</div>
      <div class="eyebrow" style="margin-top:6px">${tr('น้ำท่วมในอดีต', 'HISTORICAL FLOODS')}</div>
      <div class="lrow"><span class="lsw" style="background:#A51931;opacity:.18;border:1px dashed #A51931"></span>${tr('พื้นที่ท่วม (ประมาณ)', 'flood extent (approx.)')}</div>
      <div class="lrow"><span class="lsw" style="background:#A51931"></span>${tr('ปีที่เกิด', 'year pin')}</div>`
    head.onclick = () => {
      body.hidden = !body.hidden
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true')
    }
    return div
  }
  legendCtl.addTo(map)
}

export function flyToProvince(p) {
  if (p.lat !== null && p.lng !== null) map.flyTo([p.lat, p.lng], 9, { duration: 0.8 })
}
export function flyToStation(s) {
  if (s.lat !== null && s.lng !== null) map.flyTo([s.lat, s.lng], 12, { duration: 0.8 })
}
export function invalidateMap() { map?.invalidateSize() }
