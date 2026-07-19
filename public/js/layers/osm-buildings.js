// OSM building footprints — building-level air-quality context via
// OpenStreetMap polygons. Fetches from the Overpass API for the current map
// bounds, colors each building by the watch score of its nearest province,
// and shows a popup with the building's risk context.
//
// 2D footprint coloring driven by our real-time multi-source watch score —
// a quick "how bad is the air around this block" read at street zoom.
import { store } from '../state.js?v=2.0.0-tg1'
import { tr } from '../i18n.js?v=2.0.0-tg1'
import { escapeHtml } from '../fmt.js?v=2.0.0-tg1'

const BAND_COLOR = {
  high:     '#A51931',
  elevated: '#E86A10',
  watch:    '#F0B400',
  normal:   '#00933C',
}
const BAND_FILL = {
  high:     0.30,
  elevated: 0.22,
  watch:    0.14,
  normal:   0.08,
}
const OVERPASS = 'https://overpass-api.de/api/interpreter'

export function createOsmBuildingsLayer({ getMap, getRisk }) {
  const group = L.layerGroup()
  let busy = false
  let currentKey = null
  const cache = new Map()
  const CACHE_TTL_MS = 600_000

  async function load() {
    refresh()
    // Refresh on map move/zoom (debounced).
    if (getMap) {
      const map = getMap()
      map.on('moveend zoomend', debouncedRefresh)
    }
  }

  function debouncedRefresh() {
    clearTimeout(debouncedRefresh._t)
    debouncedRefresh._t = setTimeout(refresh, 600)
  }

  async function refresh() {
    if (busy || !getMap) return
    const map = getMap()
    if (!map) return
    const risk = getRisk ? getRisk() : null
    if (!risk?.provinces) return
    const b = map.getBounds()
    const key = `${b.getSouth().toFixed(3)},${b.getWest().toFixed(3)},${b.getNorth().toFixed(3)},${b.getEast().toFixed(3)},${map.getZoom().toFixed(0)}`
    if (key === currentKey) return
    currentKey = key

    // Only query when the user is zoomed in enough that buildings are useful.
    if (map.getZoom() < 11) {
      group.clearLayers()
      return
    }
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      draw(cached.features, risk)
      return
    }
    busy = true
    try {
      const [s, w, n, e] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
      const q = `[out:json][timeout:25];(way["building"](${s},${w},${n},${e}););out geom;`
      const json = await postOverpass(q)
      const features = Array.isArray(json?.elements) ? json.elements : []
      // Cap to keep render cost bounded.
      const limited = features.slice(0, 1500)
      cache.set(key, { at: Date.now(), features: limited })
      draw(limited, risk)
    } catch (_e) {
      // Overpass busy or rate-limited — silently keep what we have.
    } finally {
      busy = false
    }
  }

  /** Convert an Overpass `way` element with geometry to a GeoJSON Polygon Feature.
   *  Overpass returns {type:"way", geometry:[{lat,lon},...]} — Leaflet's
   *  L.geoJSON needs {type:"Feature", geometry:{type:"Polygon", coordinates:[[lng,lat],...]}}. */
  function overpassWayToGeoJSON(way) {
    if (!Array.isArray(way.geometry) || way.geometry.length < 3) return null
    const ring = []
    for (const pt of way.geometry) {
      if (typeof pt.lat !== 'number' || typeof pt.lon !== 'number') continue
      ring.push([pt.lon, pt.lat])
    }
    if (ring.length < 3) return null
    // Close the ring (first point == last point) per GeoJSON spec.
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
  }

  function draw(features, risk) {
    group.clearLayers()
    // Build province centroid index for nearest-province lookup.
    const centroids = []
    for (const p of risk.provinces) {
      if (p.lat != null && p.lng != null) {
        centroids.push({ code: p.province_code, th: p.province_th, en: p.province_en, lat: p.lat, lng: p.lng, band: p.band, score: p.score })
      }
    }
    if (centroids.length === 0) return

    for (const f of features) {
      if (f.type !== 'way') continue
      const geojson = overpassWayToGeoJSON(f)
      if (!geojson) continue
      // Compute centroid of the building for province lookup.
      let sumLat = 0, sumLng = 0, n = 0
      for (const pt of f.geometry) {
        if (typeof pt.lat === 'number' && typeof pt.lon === 'number') {
          sumLat += pt.lat; sumLng += pt.lon; n += 1
        }
      }
      if (n === 0) continue
      const cLat = sumLat / n, cLng = sumLng / n
      const prov = nearestProvince(cLat, cLng, centroids)
      const color = BAND_COLOR[prov.band] ?? '#888'
      const fillOpacity = BAND_FILL[prov.band] ?? 0.10
      try {
        const poly = L.geoJSON(geojson, {
          pane: 'vectors',
          style: {
            color, weight: 1, opacity: 0.7,
            fillColor: color, fillOpacity,
          },
          onEachFeature: (_f, layer) => {
            layer.bindPopup(() => buildPopup(prov, cLat, cLng))
          },
        })
        group.addLayer(poly)
      } catch { /* skip malformed */ }
    }
  }

  function unload() {
    group.clearLayers()
    if (getMap) {
      const map = getMap()
      if (map) map.off('moveend zoomend', debouncedRefresh)
    }
  }

  return { group, onAdd: load, onRemove: unload }
}

function nearestProvince(lat, lng, centroids) {
  let best = centroids[0]
  let bestD = Infinity
  for (const c of centroids) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

function buildPopup(prov, lat, lng) {
  const isEn = store.lang === 'en'
  const name = isEn ? (prov.en || prov.th) : (prov.th || prov.en)
  const riskWord = { high: tr('วิกฤต', 'Critical'), elevated: tr('เสี่ยงสูง', 'Elevated'), watch: tr('เฝ้าระวัง', 'Watch'), normal: tr('ปกติ', 'Normal') }[prov.band] || prov.band
  return `<div class="pop-name">${escapeHtml(name)}</div>
          <div class="pop-en">${tr('อาคารใกล้เคียง', 'Nearby building')} · ${prov.score}/100</div>
          <div style="margin-top:4px;font-size:12.5px">
            ${tr('ความเสี่ยงจังหวัด', 'Province risk')}: <b>${escapeHtml(riskWord)}</b>
          </div>
          <div style="font-size:10.5px;color:var(--ink-low);font-family:var(--font-num);margin-top:2px">
            ${lat.toFixed(4)}, ${lng.toFixed(4)}
          </div>`
}

async function postOverpass(query) {
  const form = new URLSearchParams({ data: query })
  const res = await fetch(OVERPASS, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`overpass ${res.status}`)
  return res.json()
}