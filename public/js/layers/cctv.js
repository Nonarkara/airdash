// CCTV layer — cameras you can actually see, each ringed in the colour of the
// air it looks at. The catalog is FloodDash's (GISTDA + iTIC + NST) and is
// health-checked server-side every 30 min (server/sources/cctvHealth.js), so a
// pin means "this picture worked recently", not "someone listed a camera".
// Each camera carries `air`: the nearest fresh PM2.5 reading and its distance.
import { tr } from '../i18n.js?v=2.4.33'
import { escapeHtml } from '../fmt.js?v=2.4.33'
import { pm25Color } from '../paint.js?v=2.4.33'
import { airChipHtml, playerHtml, startVideos, stopVideos, linkUrl, NOT_OFFICIAL } from './cctvPlayer.js?v=2.4.33'

const REFRESH_MS = 10 * 60_000
const NO_AIR = '#7E8E9A'

// A pin is shown only if there is something to look at: a proven-live stream or
// an NST embed. Unstable streams (one timeout, not yet re-checked), dead ones
// and link-only cameras stay off the map — a map that claims 4x more working
// cameras than are verified is worse than a smaller honest one.
export const viewable = (c) => c.online !== false && (c.stream_status === 'live' || (c.source === 'nst' && c.stream_status === 'embed'))

export function createCctvLayer(map) {
  const group = L.layerGroup([], { pane: 'data' })
  let cams = []
  let health = null
  let timer = null
  let fetching = false

  function pinHtml(c) {
    const color = c.air ? pm25Color(c.air.pm25) : NO_AIR
    const hot = c.air && c.air.pm25 > 75 ? ' cctv-pin-hot' : ''
    return `<span class="cctv-pin-dot${hot}" style="--air:${color}"><i aria-hidden="true">📹</i></span>`
  }

  function popupHtml(c) {
    const name = escapeHtml(tr(c.name_th || c.name_en, c.name_en || c.name_th) || c.id)
    const where = c.location_th ? `<div class="cctv-where">${escapeHtml(c.location_th)}</div>` : ''
    const label = escapeHtml(tr(c.source_label_th ?? '', c.source_label_en ?? c.source_label_th ?? c.source ?? ''))
    const link = linkUrl(c.source_url) ? ` <a href="${escapeHtml(c.source_url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''
    return `<div class="cctv-pop">
      <div class="cctv-name">${name}</div>${where}
      ${airChipHtml(c.air)}
      ${playerHtml(c)}
      <div class="cctv-attrib">${tr('ภาพจาก', 'via')} <strong>${label}</strong>${link}</div>
      <div class="cctv-note">${NOT_OFFICIAL()}</div>
    </div>`
  }

  function paint() {
    group.clearLayers()
    for (const c of cams.filter(viewable)) {
      const m = L.marker([c.lat, c.lng], {
        pane: 'data',
        icon: L.divIcon({ className: 'cctv-pin', html: pinHtml(c), iconSize: [28, 28], iconAnchor: [14, 14] }),
        alt: `CCTV: ${c.name_th || c.name_en || c.id}`,
      })
      // Content is built when the pin is clicked, not for every camera up front.
      m.bindPopup(() => popupHtml(c), { className: 'cctv-popup-shell', maxWidth: 340, minWidth: 260 })
      m.on('popupopen', (e) => startVideos(e.popup.getElement()))
      m.on('popupclose', (e) => { const el = e.popup.getElement(); if (el) stopVideos(el) })
      m.addTo(group)
    }
  }

  async function refresh() {
    if (fetching) return
    fetching = true
    try {
      const res = await fetch('/api/cctv/all')
      if (!res.ok) return
      const data = await res.json()
      cams = data.cameras ?? []
      health = data.health ?? null
      paint()
    } catch { /* an optional layer must never cost the user the map */ }
    finally { fetching = false }
  }

  return {
    group,
    refresh,
    stats: () => ({ shown: cams.filter(viewable).length, total: cams.length, health }),
    onAdd() { refresh(); if (!timer) timer = setInterval(refresh, REFRESH_MS) },
    onRemove() { if (timer) { clearInterval(timer); timer = null } },
    /** Centre the map on a camera and open its popup (used by the haze-eyes wall). */
    locate(id, source) {
      const c = cams.find((x) => x.id === id && x.source === source)
      if (!c) return false
      map.setView([c.lat, c.lng], Math.max(map.getZoom(), 11))
      group.eachLayer((m) => { const ll = m.getLatLng(); if (ll.lat === c.lat && ll.lng === c.lng) m.openPopup() })
      return true
    },
  }
}
