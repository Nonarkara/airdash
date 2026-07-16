// Shelters layer — DDPM / data.go.th national shelter registry.
// ~11K entries with coordinates, capacity, amenities, on-site coordinator
// phone. Loaded on demand from /api/shelters?bbox=… for the visible
// viewport so we never pull 11K markers when the user is zoomed in.
//
// In citizen mode the layer auto-flies to the nearest 3 shelters around
// the user's saved province so a non-expert sees "here's where to go"
// without learning the layer toggle.
import { getJson } from '../cache.js?v=2.0.0-final'
import { store, on } from '../state.js?v=2.0.0-final'
import { tr, BAND } from '../i18n.js?v=2.0.0-final'
import { escapeHtml, el } from '../fmt.js?v=2.0.0-final'

let shelterCache = new Map()   // bbox key -> rows
let group = null
let map = null

const BBOX_CACHE_TTL = 5 * 60_000  // 5 min — shelters change yearly, not realtime
const FETCH_DEBOUNCE_MS = 350

let lastFetchController = null
let pendingTimer = null

export function createSheltersLayer(mapInstance) {
  map = mapInstance
  group = L.layerGroup()
  group.addTo(map)

  on('snapshot', () => {
    // Risk changes can shift which shelters are "high-value" to surface.
    refresh()
  })
  on('lang', refresh)

  // Re-fetch on map move (debounced) so the visible set follows the viewport.
  map.on('moveend', scheduleRefresh)
  scheduleRefresh()
  return { group, refresh: scheduleRefresh }
}

function bboxKey(b) {
  return `${b.getSouth().toFixed(3)},${b.getWest().toFixed(3)},${b.getNorth().toFixed(3)},${b.getEast().toFixed(3)}`
}

function scheduleRefresh() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(refresh, FETCH_DEBOUNCE_MS)
}

async function refresh() {
  if (!map || !group) return
  const b = map.getBounds()
  if (!b.isValid()) return
  const key = bboxKey(b)
  const cached = shelterCache.get(key)
  if (cached && Date.now() - cached.at < BBOX_CACHE_TTL) {
    paint(cached.rows)
    return
  }
  const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`
  if (lastFetchController) lastFetchController.abort()
  lastFetchController = new AbortController()
  try {
    const data = await getJson(`/api/shelters?bbox=${bbox}`, BBOX_CACHE_TTL, { signal: lastFetchController.signal })
    const rows = data?.shelters ?? []
    shelterCache.set(key, { at: Date.now(), rows })
    paint(rows)
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('shelter fetch failed', e)
  }
}

function paint(rows) {
  group.clearLayers()
  const lang = store.lang
  for (const s of rows) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
    const capacity = s.capacity ?? 0
    const dot = capacity >= 500 ? '🟢' : capacity >= 200 ? '🟡' : '🟠'
    const marker = L.circleMarker([s.lat, s.lng], {
      radius: capacity >= 500 ? 6 : 4,
      color: '#241E4E',
      weight: 1,
      fillColor: capacity >= 500 ? '#00933C' : capacity >= 200 ? '#F0B400' : '#E86A10',
      fillOpacity: 0.75,
      pane: 'vectors',
    })
    const phone = s.phone ? `<a href="tel:${escapeHtml(s.phone)}">${escapeHtml(s.phone)}</a>` : '—'
    const amenities = []
    if (s.has_power) amenities.push('⚡')
    if (s.has_water) amenities.push('💧')
    if (s.has_toilet) amenities.push('🚻')
    const html = `
      <div class="shelter-pop" style="min-width:220px">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">${dot} ${escapeHtml(s.place ?? '—')}</div>
        <div style="font-size:11px;color:#5E5A6E;margin-bottom:4px">${escapeHtml(s.district_th ?? '')} · ${escapeHtml(s.subdistrict_th ?? '')}</div>
        <div style="font-size:11.5px">👥 ${tr('รองรับ', 'capacity')} <b>${capacity || '—'}</b> ${tr('คน', 'people')}</div>
        <div style="font-size:11.5px">🛠 ${amenities.join(' ') || '—'}</div>
        <div style="font-size:11.5px">📞 ${phone}</div>
        ${s.coordinator ? `<div style="font-size:10.5px;color:#5E5A6E;margin-top:3px">${tr('ผู้ประสาน', 'contact')}: ${escapeHtml(s.coordinator)}</div>` : ''}
        <div style="margin-top:5px;font-size:10.5px"><a href="#" data-shelter-id="${s.id}" data-lat="${s.lat}" data-lng="${s.lng}" onclick="event.preventDefault();">${tr('นำทางไปที่นี่', 'navigate here')}</a></div>
      </div>`
    marker.bindPopup(html, { maxWidth: 320 })
    marker.on('popupopen', (e) => {
      const link = e.popup.getElement()?.querySelector('a[data-shelter-id]')
      if (!link) return
      link.addEventListener('click', () => {
        const lat = Number(link.dataset.lat), lng = Number(link.dataset.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          // Try Google Maps first; fall back to Apple Maps. Both work on
          // any device and require no app install.
          const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
          window.open(gmaps, '_blank', 'noopener')
        }
      }, { once: true })
    })
    group.addLayer(marker)
  }
}

/** Public — fetch the k-nearest shelters to a point and return a
 *  citizen-friendly summary (head, address, distance, capacity, phone,
 *  navigate-link). Used by the citizen-mode hero so the user sees
 *  "ศูนย์พักพิงใกล้คุณ" without opening the map. */
export async function fetchNearestShelters(lat, lng, limit = 3, province = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) })
  if (province) params.set('province', province)
  try {
    const res = await fetch(`/api/shelters/nearest?${params}`)
    if (!res.ok) return []
    const j = await res.json()
    return j.shelters ?? []
  } catch { return [] }
}
