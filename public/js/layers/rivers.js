// Connected-waterways layer: the real Thai river network (GISTDA geometry) as a
// quiet backdrop, with the GloFAS cascade drawn on top — discharge-scaled nodes
// linked upstream→downstream by arrows labelled with flood-wave transit lag.
import { getJson } from '../cache.js?v=2.0.0-final'
import { store, on, emit } from '../state.js?v=2.0.0-final'
import { tr, pick } from '../i18n.js?v=2.0.0-final'
import { fmtNum, escapeHtml } from '../fmt.js?v=2.0.0-final'

const BAND_COLOR = { normal: '#1D66A8', watch: '#F0B400', warning: '#E86A10', emergency: '#A51931', unknown: '#B7AFA3' }

export function createRiversLayer(map) {
  const network = L.layerGroup()   // static geometry backdrop
  const cascade = L.layerGroup()   // GloFAS nodes + links
  let networkLoaded = false
  let reaches = []

  // Segments within 22km of a real GloFAS gauge point (server/rivers.js
  // REACHES) are tagged `tier:'named'` by scripts/tag-waterways.mjs — real
  // proximity to a station we have live discharge data for, not a fabricated
  // stream-order. Everything else renders as the generic waterway backdrop:
  // "canals" in the primary-school sense, even though some are unnamed rivers
  // we simply have no gauge for.
  function waterwayStyle(f) {
    if (f.properties.tier === 'named') {
      return { color: '#0039A6', weight: 2.6, opacity: 0.68 }
    }
    return { color: '#6FA8D8', weight: 0.7, opacity: 0.24 }
  }

  async function loadNetwork() {
    if (networkLoaded) return
    networkLoaded = true
    try {
      const geo = await getJson('/geo/thai-rivers.geojson', 3600_000)
      L.geoJSON(geo, {
        style: waterwayStyle,
        interactive: (f) => f.properties.tier === 'named',
        onEachFeature: (f, layer) => {
          if (f.properties.tier !== 'named') return
          layer.bindTooltip(() => `<b>${escapeHtml(tr(f.properties.name_th, f.properties.name_en))}</b><br>` +
            `${escapeHtml(tr(f.properties.basin_th, f.properties.basin_en))} · ${f.properties.km}${tr(' กม. ของเส้นทาง', ' km segment')}`,
            { sticky: true, direction: 'top' })
        },
      }).addTo(network)
    } catch { networkLoaded = false }
  }

  async function loadCascade() {
    try {
      const data = await getJson('/api/rivers', 60_000)
      reaches = data.reaches
      emit('rivers', data)
      draw(data)
    } catch { /* keep last drawing */ }
  }

  function draw(data) {
    cascade.clearLayers()
    const byId = new Map(data.reaches.map((r) => [r.id, r]))

    // Cascade links — arrowed lines from upstream to downstream with lag labels.
    for (const link of data.links) {
      const from = byId.get(link.from)
      const color = BAND_COLOR[from?.peakBand ?? from?.band ?? 'unknown']
      L.polyline([[link.fromLat, link.fromLng], [link.toLat, link.toLng]], {
        color, weight: 2, opacity: 0.55, dashArray: '4 4', interactive: false,
      }).addTo(cascade)
      const midLat = (link.fromLat + link.toLat) / 2
      const midLng = (link.fromLng + link.toLng) / 2
      L.marker([midLat, midLng], {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [44, 14],
          html: `<div class="lag-chip">▼ ${link.lagDays}${tr('ว', 'd')}</div>` }),
      }).addTo(cascade)
    }

    // Reach nodes — square, discharge-scaled, colored by forecast-peak band.
    for (const r of data.reaches) {
      if (r.lat === null) continue
      const band = r.peakBand === 'normal' ? r.band : r.peakBand
      const color = BAND_COLOR[band ?? 'unknown']
      const size = 12 + Math.min(16, Math.sqrt(r.discharge ?? 0) * 0.5)
      L.marker([r.lat, r.lng], {
        zIndexOffset: 500,
        icon: L.divIcon({ className: '', iconSize: [size, size],
          html: `<div class="reach-node" style="width:${size}px;height:${size}px;background:${color}"></div>` }),
      }).bindTooltip(() => `<b>${escapeHtml(pick(r, 'name'))}</b><br>${fmtNum(r.discharge, 0)} ${tr('ลบ.ม./วิ', 'm³/s')}`,
        { direction: 'top', offset: [0, -8] })
        .bindPopup(() => reachPopup(r)).on('click', () => emit('reach-select', r)).addTo(cascade)
    }
  }

  function reachPopup(r) {
    const trend = r.trend === 'rising' ? tr('↑ กำลังเพิ่ม', '↑ rising')
      : r.trend === 'falling' ? tr('↓ กำลังลด', '↓ falling') : tr('→ คงที่', '→ stable')
    const dn = r.downstream ? `<div class="pop-kv"><span>${tr('ไหลลงสู่', 'flows to')}</span><span class="v">${escapeHtml(r.downstream)} · ${r.lagDays}${tr('ว', 'd')}</span></div>` : ''
    return `<div class="pop-name">${escapeHtml(pick(r, 'name'))}</div>
      <div class="pop-en">${escapeHtml(pick(r, 'basin'))} · GloFAS</div>
      <div class="pop-kv"><span>${tr('อัตราการไหลวันนี้', 'discharge now')}</span><span class="v">${fmtNum(r.discharge, 0)} ${tr('ลบ.ม./วิ', 'm³/s')}</span></div>
      <div class="pop-kv"><span>${tr('คาดการณ์สูงสุด', 'forecast peak')}</span><span class="v">${fmtNum(r.forecastPeak, 0)} (${tr('อีก', 'in')} ${r.forecastPeakDay ?? '?'}${tr('ว', 'd')})</span></div>
      <div class="pop-kv"><span>${tr('แนวโน้ม', 'trend')}</span><span class="v">${trend}</span></div>
      ${dn}
      <div class="pop-en" style="margin-top:4px">${escapeHtml(pick(r, 'note'))}</div>`
  }

  let lastCascade = null
  on('rivers', (d) => { lastCascade = d; reaches = d.reaches })
  on('lang', () => { if (lastCascade) draw(lastCascade) })

  let cascadeTimer = null

  function startCascadePoll() {
    if (cascadeTimer) return
    loadCascade()
    cascadeTimer = setInterval(loadCascade, 3 * 60_000)
  }

  function stopCascadePoll() {
    if (!cascadeTimer) return
    clearInterval(cascadeTimer)
    cascadeTimer = null
  }

  return {
    network, cascade,
    onAdd() { loadNetwork(); startCascadePoll() },
    onRemove() { stopCascadePoll() },
  }
}
