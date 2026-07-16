// Historical floods — a curated archive of Thailand's major flood events as a
// map layer. Stacked over the live data, it puts today's readings in the
// context of what has happened before ("Hat Yai has flooded in 2000, 2010, 2025").
//
// Two render modes:
//  1. POINT MARKERS — the original curated pin per event (from historical-floods.json)
//  2. POLYGON EXTENTS — approximate flood footprint polygons (from historical-flood-extents.geojson)
// Both layers render together: the polygon shows the affected area, the pin
// marks the epicentre and carries the detail popup.
import { getJson } from '../cache.js?v=2.0.0-final'
import { store, on } from '../state.js?v=2.0.0-final'
import { tr } from '../i18n.js?v=2.0.0-final'
import { escapeHtml } from '../fmt.js?v=2.0.0-final'

const SEV_COLOR = { emergency: '#A51931', warning: '#E86A10', watch: '#F0B400' }
const SEV_FILL_OPACITY = { emergency: 0.18, warning: 0.14, watch: 0.10 }

export function createHistoryLayer() {
  const group = L.layerGroup()
  let loaded = false
  let pointsData = null
  let extentsData = null

  async function load() {
    if (loaded) return
    loaded = true
    try {
      // Fetch both datasets in parallel — points + polygon extents.
      const [points, extents] = await Promise.all([
        getJson('/geo/historical-floods.json', 3600_000),
        getJson('/geo/historical-flood-extents.geojson', 3600_000),
      ])
      pointsData = points
      extentsData = extents
      draw()
      on('lang', draw)
    } catch { loaded = false }
  }

  function draw() {
    group.clearLayers()
    if (!extentsData && !pointsData) return

    // 1. Render polygon extents first (underneath the point pins).
    if (extentsData?.features) {
      for (const feat of extentsData.features) {
        const p = feat.properties
        if (!feat.geometry) continue
        const color = SEV_COLOR[p.severity] ?? '#8A8A8A'
        try {
          L.geoJSON(feat, {
            pane: 'vectors',
            style: {
              color,
              weight: 2,
              opacity: 0.7,
              fillColor: color,
              fillOpacity: SEV_FILL_OPACITY[p.severity] ?? 0.12,
              dashArray: '4 3',
            },
            onEachFeature: (_f, layer) => {
              layer.bindPopup(() => buildExtentPopup(p))
            },
          }).addTo(group)
        } catch { /* malformed geometry — skip gracefully */ }
      }
    }

    // 2. Render the point markers on top (epicentre pins with year labels).
    if (pointsData) {
      for (const e of pointsData) {
        const color = SEV_COLOR[e.severity] ?? '#8A8A8A'
        L.marker([e.lat, e.lng], {
          icon: L.divIcon({ className: '', iconSize: [34, 20],
            html: `<div class="hist-pin" style="background:${color}">${e.year}</div>` }),
          zIndexOffset: 500,
        }).bindPopup(() =>
          `<div class="pop-name">${escapeHtml(tr(e.name_th, e.name_en))}</div>
           <div class="pop-en">${escapeHtml(tr(e.months_th, e.months_en))}</div>
           <div style="margin-top:4px;font-size:12.5px">${escapeHtml(tr(e.fact_th, e.fact_en))}</div>`
        ).addTo(group)
      }
    }
  }

  /** Rich popup for a flood-extent polygon — shows impact stats. */
  function buildExtentPopup(p) {
    const isEn = store.lang === 'en'
    const name = isEn ? p.name_en : p.name_th
    const months = isEn ? p.months_en : p.months_th
    const provs = isEn ? p.provinces_en : p.provinces_th
    const fact = isEn ? p.fact_en : p.fact_th
    const stats = []
    if (p.deaths) stats.push(`${tr('เสียชีวิต', 'deaths')}: ${p.deaths}`)
    if (p.damage_usd_bn) stats.push(`${tr('ความเสียหาย', 'damage')}: $${p.damage_usd_bn}B`)
    const statsHtml = stats.length
      ? `<div class="pop-kv-row">${stats.map((s) => `<span class="hist-stat">${escapeHtml(s)}</span>`).join('')}</div>`
      : ''
    return `<div class="pop-name">${escapeHtml(name)}</div>
            <div class="pop-en">${escapeHtml(months)} · ${escapeHtml(provs)}</div>
            ${statsHtml}
            <div style="margin-top:4px;font-size:12px">${escapeHtml(fact)}</div>`
  }

  return { group, onAdd: load }
}