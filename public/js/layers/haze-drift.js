// Short strokes from hotspots and high-PM stations, pushed along the current
// 10 m wind for about 6 h (solid) and 12 h (dashed). The length is capped.
// This is where the wind is carrying haze, not a time of arrival.
import { onWindField } from './wind-client.js?v=2.4.95'
import { AIR_COPY, chevron, hazeSources, pageLang } from './wind-math.js?v=2.4.95'

function freshStation(row) {
  if (!Number.isFinite(row?.pm25)) return false
  if (row.status === 'stale') return false
  if (!row.pm25_time) return true
  const raw = String(row.pm25_time)
  const stamp = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}+07:00`
  const age = Date.now() - Date.parse(stamp)
  return Number.isFinite(age) && age >= -300000 && age <= 90 * 60000
}

function ensurePane(map) {
  if (map.getPane('drift')) return
  const pane = map.createPane('drift')
  pane.style.zIndex = 360
  pane.style.pointerEvents = 'none'
}

export function createHazeDriftLayer() {
  const Layer = L.Layer.extend({
    initialize() {
      this.stations = []
      this.fires = []
      this.field = null
      this.lines = L.layerGroup()
    },
    onAdd(map) {
      this.map = map
      ensurePane(map)
      this.lines.addTo(map)
      this.stop = onWindField((field) => {
        this.field = field
        this.redraw()
      })
      this.label = L.control({ position: 'bottomleft' })
      this.label.onAdd = () => {
        this.note = L.DomUtil.create('div', 'haze-drift-label')
        this.note.setAttribute('role', 'note')
        this.syncLang()
        return this.note
      }
      this.label.addTo(map)
      this.redraw()
    },
    syncLang() {
      if (!this.note) return
      const lang = pageLang()
      this.note.textContent = AIR_COPY[`drift_${lang}`] || AIR_COPY.drift_en
    },
    onRemove() {
      this.stop?.()
      this.stop = null
      this.lines.remove()
      this.label?.remove()
      this.label = null
      this.note = null
      this.map = null
    },
    setStations(rows) {
      this.stations = (rows ?? []).filter(freshStation)
      this.redraw()
      return this
    },
    setFires(rows) {
      this.fires = rows ?? []
      this.redraw()
      return this
    },
    redraw() {
      this.lines.clearLayers()
      if (!this.map || !this.field?.available) return
      const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches
      const rows = hazeSources({
        stations: this.stations,
        fires: this.fires,
        field: this.field,
        maxPlumes: narrow ? 10 : 18,
      })
      for (const row of rows) {
        const [a, b, c] = row.track.points
        const color = row.kind === 'fire' ? '#C8453A' : '#0E4A5E'
        const common = { pane: 'drift', color, interactive: false, lineCap: 'butt' }
        L.polyline([a, b], { ...common, weight: 2.25, opacity: 0.9 }).addTo(this.lines)
        L.polyline([b, c], { ...common, weight: 1.25, opacity: 0.55, dashArray: '2 5' }).addTo(this.lines)
        L.polyline(chevron(b, c), { ...common, weight: 1.5, opacity: 0.9 }).addTo(this.lines)
      }
    },
  })
  return new Layer()
}
