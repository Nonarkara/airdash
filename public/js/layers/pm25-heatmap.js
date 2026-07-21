// PM2.5 heat-map layer — an alternative read of the same station data the
// dot/badge layer (paintAir) shows. Where the dots give you exact per-
// station numbers, the heat map gives you the spatial GRADIENT: is this
// whole valley bad, or is it one station? That question is hard to answer
// by eye from a scatter of dots but immediate from a filled surface.
//
// Deliberately NOT a generic density heatmap (leaflet.heat-style, which
// colors by how many points are NEARBY). Each station's blob is colored by
// its OWN measured PM2.5 value through the same Thai AQI palette the dots
// use (pm25Color), so the map stays honest: a lone red station over a
// yellow region still reads as a red hotspot, not diluted into an average.
// Overlaps are resolved by canvas 'lighten' compositing (per-channel max),
// which — for this red/orange/yellow/green palette — has the property that
// the worse (redder) station wins where blobs overlap, matching the
// severity-first principle used everywhere else in this dashboard.
//
// This is a rendering aid, not spatial interpolation science — the blob
// radius is tuned for "readable at province zoom", not modelled from
// atmospheric dispersion. No dependency added: hand-rolled canvas layer in
// the same style as the vendored Leaflet the rest of the map uses.
import { pm25Color } from '../paint.js?v=2.0.0-saphan1'

const MIN_RADIUS_PX = 28
const MAX_RADIUS_PX = 70

/** Blob radius shrinks at wide zoom (many stations, avoid a solid blob) and
 *  grows at close zoom (fewer stations visible, fill the gaps between them). */
function radiusForZoom(zoom) {
  const t = Math.min(1, Math.max(0, (zoom - 5) / (12 - 5)))
  return MIN_RADIUS_PX + t * (MAX_RADIUS_PX - MIN_RADIUS_PX)
}

export function createPm25HeatmapLayer() {
  const Layer = L.Layer.extend({
    initialize(options) {
      L.Util.setOptions(this, { pane: 'heatmap', opacity: 0.55, ...options })
      this._stations = []
    },

    onAdd(map) {
      this._map = map
      this._canvas = L.DomUtil.create('canvas', 'pm25-heatmap-canvas')
      this._canvas.style.position = 'absolute'
      this._canvas.style.opacity = this.options.opacity
      const pane = map.getPane(this.options.pane) ?? map.getPane('overlayPane')
      pane.appendChild(this._canvas)
      map.on('moveend zoomend resize', this._reset, this)
      this._reset()
      return this
    },

    onRemove(map) {
      this._canvas.remove()
      map.off('moveend zoomend resize', this._reset, this)
    },

    /** Replace the station set and redraw. Stations with no fresh PM2.5
     *  reading (null) are skipped — a heat map can't show what it doesn't have. */
    setData(stations) {
      this._stations = (stations ?? []).filter((s) =>
        s.lat !== null && s.lng !== null && Number.isFinite(s.pm25))
      if (this._map) this._redraw()
      return this
    },

    _reset() {
      const size = this._map.getSize()
      const topLeft = this._map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(this._canvas, topLeft)
      this._canvas.width = size.x
      this._canvas.height = size.y
      this._redraw()
    },

    _redraw() {
      if (!this._map || !this._canvas.width) return
      const ctx = this._canvas.getContext('2d')
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)
      if (!this._stations.length) return

      const radius = radiusForZoom(this._map.getZoom())
      const pad = radius * 1.2
      ctx.save()
      ctx.globalCompositeOperation = 'lighten'
      for (const s of this._stations) {
        const p = this._map.latLngToContainerPoint([s.lat, s.lng])
        if (p.x < -pad || p.y < -pad || p.x > this._canvas.width + pad || p.y > this._canvas.height + pad) continue
        const color = pm25Color(s.pm25)
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
        grad.addColorStop(0, color)
        grad.addColorStop(1, hexWithAlpha(color, 0))
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    },
  })
  return new Layer()
}

/** '#A51931' + alpha(0..1) → 'rgba(165,25,49,a)' — radial gradients need a
 *  transparent END stop of the SAME color, not transparent black, or the
 *  fade-out reads as a grey ring instead of dissolving into the basemap. */
function hexWithAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}
