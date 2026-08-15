// Leaflet map: Carto basemap + JAXA/NASA satellite overlays + ground data.
// Z-order (bottom→top): basemap · satellite · radar · vectors · station data.
import { on, store } from './state.js?v=2.4.13'
import { tr, LEVEL_NAME } from './i18n.js?v=2.4.13'
import { createOsmBuildingsLayer } from './layers/osm-buildings.js?v=2.4.13'
import { createProvinceBoundariesLayer } from './layers/province-boundaries.js?v=2.4.13'
import { createSatelliteLayers, ensureMapPanes, LAYER_GROUPS, allLayerToggles } from './layers/satellite.js?v=2.4.13'
import { createBasemaps, BASEMAP_META } from './layers/basemaps.js?v=2.4.13'
import { createPm25HeatmapLayer } from './layers/pm25-heatmap.js?v=2.4.13'
import { createNewsFireLayer } from './layers/news-fire.js?v=2.4.13'
import { paintRisk, paintAir, paintRain, pm25Color } from './paint.js?v=2.4.13'

const TH_BOUNDS = L.latLngBounds([4.8, 96.5], [21.2, 106.5])
let map
const layers = {}
let satLayers = null
let osmBuildingsApi = null
let newsFireApi = null
let basemaps = null
const BASEMAP_KEY = 'ad_basemap'
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
  layers.air = L.layerGroup([], { pane: 'data' })
  layers.rain = L.layerGroup([], { pane: 'data' })
  layers.heatmap = createPm25HeatmapLayer()
  newsFireApi = createNewsFireLayer()
  layers.newsfire = newsFireApi.group
  osmBuildingsApi = createOsmBuildingsLayer({ getMap: () => map, getRisk: () => store.snapshot?.risk })
  layers.osmbuild = osmBuildingsApi.group
  const boundariesApi = createProvinceBoundariesLayer()
  layers.boundaries = boundariesApi.group
  initRadar()

  for (const t of allLayerToggles()) {
    if (t.on && layers[t.id]) {
      layers[t.id].addTo(map)
      if (t.id === 'osmbuild') osmBuildingsApi.onAdd()
    }
  }

  addLayerControl()
  addLegend()
  // Expose for testing/devtools — never used by app code.
  window.__airdash = { map, layers, osmBuildingsApi }

  on('snapshot', renderAll)
  on('lang', () => { addLegend(); addLayerControl(); renderAll(store.snapshot) })
  return map
}

// ── Overlays ────────────────────────────────────────────────────────────────
function renderAll(snap) {
  if (!snap) return
  paintRisk(layers, snap.risk)
  renderAir(snap.air)
  paintRain(layers, snap.rain)
  layers.heatmap?.setData(snap.air)
  newsFireApi?.setData(snap.news, snap.risk?.provinces)
}

let airStations = null
let zoomHookInstalled = false

// AQ stations re-render on the zoom-detail boundary: at close zoom the worst
// stations (Thai AQI level ≥4) swap from dots to numeric PM2.5 badges.
function renderAir(stations) {
  if (stations) airStations = stations
  if (!zoomHookInstalled) {
    zoomHookInstalled = true
    let wasDetailed = map.getZoom() >= 8
    map.on('zoomend', () => {
      const detailed = map.getZoom() >= 8
      if (detailed !== wasDetailed) { wasDetailed = detailed; renderAir(null) }
    })
  }
  paintAir(layers, airStations, { getZoom: () => map.getZoom() })
}

// ── RainViewer radar with animation — rain = washout relief ────────────────
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
    if (t.id === 'osmbuild') osmBuildingsApi.onAdd()
  } else {
    layer.remove()
    if (t.id === 'osmbuild') osmBuildingsApi.onRemove()
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
    // Thai AQI 2023 PM2.5 breakpoints — sample µg/m³ per level for swatch colour.
    const PM_SAMPLE = { 1: 10, 2: 20, 3: 30, 4: 50, 5: 90 }
    const PM_RANGE = { 1: '≤15', 2: '15–25', 3: '25–37.5', 4: '37.5–75', 5: '>75' }
    const lv = (n) => `<div class="lrow"><span class="lsw" style="background:${pm25Color(PM_SAMPLE[n])}"></span>${PM_RANGE[n]} ${tr('มคก./ลบ.ม.', 'µg/m³')} · ${LEVEL_NAME[n][store.lang]}</div>`
    body.innerHTML = `
      <div class="eyebrow">${tr('PM2.5 (AQI ไทย 2566)', 'PM2.5 (THAI AQI 2023)')}</div>
      ${[5, 4, 3, 2, 1].map(lv).join('')}
      <div class="lrow" style="margin-top:4px"><span class="lsw round" style="background:#0039A6;opacity:.5"></span>${tr('ฝนสะสม 24 ชม. (ช่วยล้างฝุ่น)', 'rain 24h (washout)')}</div>
      <div class="lrow"><span class="lsw round" style="background:#1565C0;opacity:.5"></span>${tr('GPM IMERG ฝนดาวเทียม', 'GPM IMERG satellite rain')}</div>
      <div class="lrow"><span class="lsw" style="background:#5C6BC0;opacity:.6"></span>${tr('Himawari-9 IR เมฆ', 'Himawari-9 IR clouds')}</div>
      <div class="eyebrow" style="margin-top:6px">${tr('ความเสี่ยงจังหวัด', 'PROVINCE RISK')}</div>
      <div class="lrow"><span class="lsw" style="background:#A51931;opacity:.22;border:1px solid #A51931"></span>${tr('วงกว้าง = คะแนนเฝ้าระวังสูง', 'circle size = watch score')}</div>
      <div class="eyebrow" style="margin-top:6px">${tr('ฮีทแมป PM2.5', 'PM2.5 HEAT MAP')}</div>
      <div class="lrow">${tr('สีของแต่ละจุด = ค่า PM2.5 จริงที่สถานีนั้น ไม่ใช่ความหนาแน่นจุด', 'blob colour = the actual PM2.5 at that station, not point density')}</div>
      <div class="eyebrow" style="margin-top:6px">${tr('ข่าวไฟป่า/มลพิษ', 'FIRE & POLLUTION NEWS')}</div>
      <div class="lrow"><span class="lsw round" style="background:#A51931"></span>🔥 ${tr('ข่าวไฟป่า/การเผา', 'wildfire / open-burning news')}</div>
      <div class="lrow"><span class="lsw round" style="background:#A51931"></span>⚠ ${tr('ข่าวมลพิษอื่น + ค่าฝุ่นปัจจุบันของพื้นที่', 'other pollution news + current PM2.5 there')}</div>`
    // Close button at the BOTTOM of the body — the head is at the TOP of
    // the upward-growing panel, which a mobile user reported being unable
    // to reach to close the legend. Appended AFTER the innerHTML assignment
    // above (innerHTML would wipe anything created into body before it).
    const close = L.DomUtil.create('button', 'legend-close', body)
    close.type = 'button'
    close.textContent = tr('ปิดคำอธิบาย ✕', 'Close legend ✕')
    const setOpen = (open) => {
      if (open) {
        // Fit the body inside the ACTUAL map strip. The CSS max-height
        // (min(48vh,340px)) alone wasn't enough on mobile: the map area
        // there is shorter than 340px, so the bottom-anchored panel grew
        // upward past the map's top edge and put the head — the only
        // close control — under the sticky header (real user report).
        // 60 ≈ head height + control margins + breathing room.
        const mapH = map.getContainer()?.clientHeight ?? 400
        body.style.maxHeight = Math.max(120, Math.min(340, mapH - 60)) + 'px'
      }
      body.hidden = !open
      head.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    head.onclick = () => setOpen(body.hidden)
    close.onclick = () => setOpen(false)
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
