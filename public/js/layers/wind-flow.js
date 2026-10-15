// Animated 10 m wind over the cached Open-Meteo grid.
// Particles are a direction cue: their speed is relative, not real-time.
// A hidden tab draws nothing. A phone gets a hard particle cap. Reduced
// motion keeps the arrow field and skips the animation.
import { onWindField } from './wind-client.js?v=2.4.95'
import { pageLang, particleBudget, sampleWind, windAsOf } from './wind-math.js?v=2.4.95'

const NARROW = '(max-width: 700px)'
const REDUCE = '(prefers-reduced-motion: reduce)'

function viewOf() {
  const narrow = typeof matchMedia === 'function' && matchMedia(NARROW).matches
  const reduce = typeof matchMedia === 'function' && matchMedia(REDUCE).matches
  const hidden = typeof document !== 'undefined' && document.hidden
  return { narrow, reduce, hidden, budget: particleBudget({ narrow, hidden, reduce }) }
}

function drawShaft(ctx, x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function createWindFlowLayer() {
  const Layer = L.Layer.extend({
    onAdd(map) {
      this.map = map
      if (!map.getPane('flow')) {
        const pane = map.createPane('flow')
        pane.style.zIndex = 340
        pane.style.pointerEvents = 'none'
      }
      this.arrows = L.DomUtil.create('canvas', 'wind-arrow-canvas', map.getPane('flow'))
      this.parts = L.DomUtil.create('canvas', 'wind-flow-canvas', map.getPane('flow'))
      for (const canvas of [this.arrows, this.parts]) {
        canvas.style.position = 'absolute'
        canvas.style.pointerEvents = 'none'
      }
      this.particles = []
      this.origin = null
      this.raf = 0
      this.last = 0
      this.redraw = () => this.drawArrows()
      map.on('moveend zoomend resize viewreset', this.redraw, this)
      this.stamp = L.control({ position: 'bottomright' })
      this.stamp.onAdd = () => {
        this.stampEl = L.DomUtil.create('div', 'wind-asof')
        this.stampEl.setAttribute('role', 'note')
        this.stampEl.hidden = true
        return this.stampEl
      }
      this.stamp.addTo(map)
      this.stopField = onWindField((field) => {
        this.field = field
        this.paintStamp()
        this.drawArrows()
      })
      this.onVis = () => {
        if (document.hidden) this.halt()
        else this.kick()
      }
      document.addEventListener('visibilitychange', this.onVis)
      this.attr = 'Wind © <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a> CC BY 4.0'
      map.attributionControl?.addAttribution(this.attr)
      this.drawArrows()
      this.kick()
    },
    onRemove(map) {
      this.halt()
      this.stopField?.()
      this.stopField = null
      document.removeEventListener('visibilitychange', this.onVis)
      map.off('moveend zoomend resize viewreset', this.redraw, this)
      this.arrows?.remove()
      this.parts?.remove()
      this.stamp?.remove()
      this.stamp = null
      this.stampEl = null
      if (this.attr) map.attributionControl?.removeAttribution(this.attr)
      this.map = null
    },
    syncLang() {
      this.paintStamp()
    },
    paintStamp() {
      const el = this.stampEl
      if (!el) return
      const field = this.field
      if (!field?.available || field.stale !== true) {
        el.hidden = true
        el.textContent = ''
        return
      }
      const text = windAsOf(field.fetched_at || field.valid_time, pageLang())
      el.hidden = !text
      el.textContent = text || ''
    },
    place(canvas) {
      const size = this.map.getSize()
      const origin = this.map.containerPointToLayerPoint([0, 0])
      canvas.width = size.x
      canvas.height = size.y
      L.DomUtil.setPosition(canvas, origin)
      this.origin = origin
      return origin
    },
    drawArrows() {
      const map = this.map
      const field = this.field
      if (!map || !this.arrows) return
      const size = map.getSize()
      if (size.x < 2 || size.y < 2) return
      const origin = this.place(this.arrows)
      this.place(this.parts)
      const ctx = this.arrows.getContext('2d')
      ctx.clearRect(0, 0, this.arrows.width, this.arrows.height)
      if (!field?.available) {
        this.halt()
        return
      }
      const stale = field.stale === true
      const stride = viewOf().narrow ? 2 : 1
      ctx.lineWidth = 3
      ctx.strokeStyle = stale ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)'
      ctx.lineCap = 'butt'
      ctx.setLineDash(stale ? [4, 4] : [])
      const shafts = []
      for (let i = 0; i < field.nlat; i += stride) {
        for (let j = 0; j < field.nlng; j += stride) {
          const lat = field.lat0 + i * field.dlat
          const lng = field.lng0 + j * field.dlng
          const wind = sampleWind(field, lat, lng)
          if (!wind || wind.speed_kmh < 1) continue
          const here = map.latLngToLayerPoint([lat, lng])
          const ahead = map.latLngToLayerPoint([
            lat + wind.v / 111.32 * 0.35,
            lng + wind.u / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180))) * 0.35,
          ])
          const dx = ahead.x - here.x
          const dy = ahead.y - here.y
          const len = Math.hypot(dx, dy) || 1
          const px = 12 + Math.min(14, wind.speed_kmh / 5)
          const x1 = here.x - origin.x
          const y1 = here.y - origin.y
          const x2 = x1 + (dx / len) * px
          const y2 = y1 + (dy / len) * px
          shafts.push([x1, y1, x2, y2, dx / len, dy / len])
          drawShaft(ctx, x1, y1, x2, y2)
        }
      }
      ctx.lineWidth = stale ? 1 : 1.25
      ctx.strokeStyle = stale ? 'rgba(14,74,94,0.4)' : 'rgba(14,74,94,0.8)'
      ctx.fillStyle = stale ? 'rgba(14,74,94,0.4)' : 'rgba(14,74,94,0.8)'
      for (const [x1, y1, x2, y2, ux, uy] of shafts) {
        drawShaft(ctx, x1, y1, x2, y2)
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - ux * 4 - uy * 2.5, y2 - uy * 4 + ux * 2.5)
        ctx.lineTo(x2 - ux * 4 + uy * 2.5, y2 - uy * 4 - ux * 2.5)
        ctx.closePath()
        ctx.fill()
      }
      this.kick()
    },
    kick() {
      if (this.raf || !this.map || !this.field?.available) return
      const size = this.map.getSize()
      if (size.x < 2 || size.y < 2) return
      if (viewOf().budget === 0) return
      this.last = 0
      const frame = (t) => {
        this.raf = requestAnimationFrame(frame)
        this.step(t)
      }
      this.raf = requestAnimationFrame(frame)
    },
    halt() {
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      if (this.parts) this.parts.getContext('2d').clearRect(0, 0, this.parts.width, this.parts.height)
    },
    step(t) {
      const map = this.map
      const field = this.field
      const canvas = this.parts
      if (!map || !canvas || !this.origin) return
      const size = map.getSize()
      if (size.x < 2 || size.y < 2) { this.halt(); return }
      const view = viewOf()
      const ctx = canvas.getContext('2d')
      if (!field?.available || view.budget === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        this.halt()
        return
      }
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0.016
      this.last = t
      while (this.particles.length > view.budget) this.particles.pop()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const stale = field.stale === true
      ctx.lineWidth = 1.4
      ctx.strokeStyle = stale ? 'rgba(14,74,94,0.28)' : 'rgba(14,74,94,0.55)'
      ctx.setLineDash(stale ? [3, 4] : [])
      ctx.beginPath()
      const bounds = map.getBounds().pad(0.15)
      for (let n = this.particles.length; n < view.budget; n++) {
        const born = this.spawn(bounds, field)
        if (born) this.particles.push(born)
      }
      const next = []
      for (const p of this.particles) {
        const wind = sampleWind(field, p.lat, p.lng)
        if (!wind || p.age > 9) {
          const born = this.spawn(bounds, field)
          if (born) next.push(born)
          continue
        }
        const here = map.latLngToLayerPoint([p.lat, p.lng])
        const hour = map.latLngToLayerPoint([
          p.lat + wind.v / 111.32,
          p.lng + wind.u / (111.32 * Math.max(0.2, Math.cos(p.lat * Math.PI / 180))),
        ])
        const pxPerHour = Math.hypot(hour.x - here.x, hour.y - here.y)
        const pxPerSec = (wind.speed_kmh / 30) * (view.narrow ? 10 : 16)
        const hours = pxPerHour > 1 ? (pxPerSec * dt) / pxPerHour : 0
        const backLat = p.lat - wind.v / 111.32 * hours * 0.45
        const backLng = p.lng - wind.u / (111.32 * Math.max(0.2, Math.cos(p.lat * Math.PI / 180))) * hours * 0.45
        p.lat += wind.v / 111.32 * hours
        p.lng += wind.u / (111.32 * Math.max(0.2, Math.cos(p.lat * Math.PI / 180))) * hours
        p.age += dt
        if (!bounds.contains([p.lat, p.lng])) {
          const born = this.spawn(bounds, field)
          if (born) next.push(born)
          continue
        }
        const a = map.latLngToLayerPoint([backLat, backLng])
        const b = map.latLngToLayerPoint([p.lat, p.lng])
        ctx.moveTo(a.x - this.origin.x, a.y - this.origin.y)
        ctx.lineTo(b.x - this.origin.x, b.y - this.origin.y)
        next.push(p)
      }
      ctx.stroke()
      this.particles = next
    },
    spawn(bounds, field) {
      for (let n = 0; n < 4; n++) {
        const lat = field.lat0 + Math.random() * (field.nlat - 1) * field.dlat
        const lng = field.lng0 + Math.random() * (field.nlng - 1) * field.dlng
        if (bounds.contains([lat, lng]) && sampleWind(field, lat, lng)) return { lat, lng, age: Math.random() * 4 }
      }
      return null
    },
  })
  return new Layer()
}
