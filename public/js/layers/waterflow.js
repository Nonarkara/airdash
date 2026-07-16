// Animated water-flow direction — the "primary school" layer: which way is
// the water actually going, from rain to canal to river to the sea?
//
// Three honestly-scoped pieces, each labelled for what it really is:
//  1. Real cascade links (server/rivers.js REACHES) get moving dots between
//     the two real gauge points, direction = real upstream→downstream, speed
//     ranked by the real lagDays (flood-wave transit time) — slower dots on
//     longer-lag links, faster dots on shorter-lag links. The path drawn is
//     a straight line between gauges (schematic), not the true meander — the
//     real channel shape is already the waterway backdrop underneath.
//  2. Headwater reaches (nothing feeds them, per the graph) get a small
//     illustrative "rain / smaller streams feed in here" stub — explicitly
//     schematic, no real per-canal telemetry backs it.
//  3. Outlet reaches (downstream: null) get one arrow + label to the real,
//     named body of water they empty into (Gulf of Thailand / Songkhla Lake
//     / the Mekong) — real geography, not fabricated.
import { tr } from '../i18n.js?v=2.0.0-final'

const BAND_COLOR = { normal: '#1D66A8', watch: '#F0B400', warning: '#E86A10', emergency: '#A51931', unknown: '#8A93A6' }
const DOTS_PER_LINK = 3

// Real river-mouth / receiving-water-body coordinates for each outlet reach —
// geography, not invented. Songkhla Lake empties to the Gulf via Songkhla's
// inlet; the Mun/Chi system reaches the Mekong at Khong Chiam.
const OUTLETS = {
  cp_bangkok:     { lat: 13.55, lng: 100.60, th: 'อ่าวไทย', en: 'Gulf of Thailand' },
  bangpakong:     { lat: 13.50, lng: 101.15, th: 'อ่าวไทย', en: 'Gulf of Thailand' },
  tapi_surat:     { lat: 9.10,  lng: 99.50,  th: 'อ่าวบ้านดอน สู่อ่าวไทย', en: 'Bandon Bay → Gulf of Thailand' },
  utaphao_hatyai: { lat: 7.20,  lng: 100.60, th: 'ทะเลสาบสงขลา สู่อ่าวไทย', en: 'Songkhla Lake → Gulf of Thailand' },
  pattani_river:  { lat: 6.86,  lng: 101.30, th: 'อ่าวไทย (อ่าวปัตตานี)', en: 'Gulf of Thailand (Pattani Bay)' },
  mun_ubon:       { lat: 15.32, lng: 105.50, th: 'แม่น้ำโขง ที่โขงเจียม', en: 'the Mekong River, at Khong Chiam' },
}

function bearingDeg(fromLat, fromLng, toLat, toLng) {
  return (Math.atan2(toLng - fromLng, toLat - fromLat) * 180) / Math.PI
}

function lerp(a, b, t) { return a + (b - a) * t }

export function createWaterflowLayer() {
  const group = L.layerGroup()
  let raf = null
  let dots = []       // { marker, fromLat, fromLng, toLat, toLng, durationMs, phase }
  let visible = false
  let started = 0

  function clear() {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    group.clearLayers()
    dots = []
  }

  function arrowIcon(deg, color) {
    return L.divIcon({
      className: '', iconSize: [10, 10],
      html: `<div class="flow-arrow" style="border-bottom-color:${color};transform:rotate(${deg}deg)"></div>`,
    })
  }

  function draw(data) {
    clear()
    if (!data?.reaches?.length) return
    const byId = new Map(data.reaches.map((r) => [r.id, r]))
    const hasIncoming = new Set(data.links.map((l) => l.to))

    for (const link of data.links) {
      const from = byId.get(link.from)
      const color = BAND_COLOR[from?.peakBand ?? from?.band ?? 'unknown']
      const deg = bearingDeg(link.fromLat, link.fromLng, link.toLat, link.toLng)

      // Static direction arrows at 30%/70% — visible even if animation is off-screen/paused.
      for (const t of [0.3, 0.7]) {
        L.marker([lerp(link.fromLat, link.toLat, t), lerp(link.fromLng, link.toLng, t)], {
          interactive: false, icon: arrowIcon(deg, color),
        }).addTo(group)
      }

      // Moving dots — real direction, speed ranked by real lagDays.
      const durationMs = Math.max(2200, (link.lagDays || 1) * 3000)
      for (let i = 0; i < DOTS_PER_LINK; i++) {
        const marker = L.circleMarker([link.fromLat, link.fromLng], {
          radius: 3, weight: 0, fillColor: color, fillOpacity: 0.9, interactive: false,
        }).addTo(group)
        dots.push({
          marker, fromLat: link.fromLat, fromLng: link.fromLng,
          toLat: link.toLat, toLng: link.toLng, durationMs, phase: i / DOTS_PER_LINK,
        })
      }
    }

    // Headwaters — nothing upstream of them in the graph — get a schematic
    // "rain and smaller streams feed in here" stub, clearly dashed/lighter.
    for (const r of data.reaches) {
      if (hasIncoming.has(r.id) || r.lat === null) continue
      const stubDeg = 45
      const rad = 0.35 // ~35km, purely illustrative offset
      const stubLat = r.lat - rad * Math.cos((stubDeg * Math.PI) / 180)
      const stubLng = r.lng - rad * Math.sin((stubDeg * Math.PI) / 180)
      L.polyline([[stubLat, stubLng], [r.lat, r.lng]], {
        color: '#8A93A6', weight: 1.4, opacity: 0.5, dashArray: '2 5', interactive: false,
      }).addTo(group)
      L.marker([stubLat, stubLng], {
        interactive: false,
        icon: L.divIcon({
          className: '', iconSize: [90, 14],
          html: `<div class="flow-schematic-label">${tr('ฝน/ลำธารเล็ก →', 'rain/small streams →')}</div>`,
        }),
      }).addTo(group)
    }

    // Outlets — reaches with no downstream — get a real-geography arrow to
    // the actual named sea/lake/river they empty into.
    for (const r of data.reaches) {
      if (r.downstream || r.lat === null) continue
      const outlet = OUTLETS[r.id]
      if (!outlet) continue
      L.polyline([[r.lat, r.lng], [outlet.lat, outlet.lng]], {
        color: '#1D66A8', weight: 1.8, opacity: 0.55, dashArray: '1 6', interactive: false,
      }).addTo(group)
      const deg = bearingDeg(r.lat, r.lng, outlet.lat, outlet.lng)
      L.marker([lerp(r.lat, outlet.lat, 0.55), lerp(r.lng, outlet.lng, 0.55)], {
        interactive: false, icon: arrowIcon(deg, '#1D66A8'),
      }).addTo(group)
      L.marker([outlet.lat, outlet.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '', iconSize: [140, 14],
          html: `<div class="flow-outlet-label">→ ${tr(outlet.th, outlet.en)}</div>`,
        }),
      }).addTo(group)
    }

    // draw() runs asynchronously after the reach data fetch resolves, which is
    // usually after onAdd() has already fired — so onAdd() alone can't rely on
    // dots existing yet. Start the loop here too if we're already visible.
    if (visible && !raf) {
      started = 0
      raf = requestAnimationFrame(tick)
    }
  }

  function tick(ts) {
    if (!visible || document.hidden) {
      raf = requestAnimationFrame(tick)
      return
    }
    if (!started) started = ts
    for (const d of dots) {
      const t = ((ts - started) / d.durationMs + d.phase) % 1
      d.marker.setLatLng([lerp(d.fromLat, d.toLat, t), lerp(d.fromLng, d.toLng, t)])
    }
    raf = requestAnimationFrame(tick)
  }

  return {
    group,
    draw,
    onAdd() {
      visible = true
      started = 0
      if (!raf && dots.length) raf = requestAnimationFrame(tick)
    },
    onRemove() {
      visible = false
      if (raf) cancelAnimationFrame(raf)
      raf = null
    },
  }
}
