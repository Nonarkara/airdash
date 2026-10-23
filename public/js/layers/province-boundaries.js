// Province-boundaries layer — pulled from chingchai/OpenGISData-Thailand
// (CC-BY 4.0, derived from DOPA shapefiles). 77 features, ~1.6 MB.
//
// This is the ZONE layer: each province is one area, filled with that
// province's watch band. It is the only layer on the map that answers
// "where is the air bad" as an area rather than as a pile of overlapping
// circles, so it is on by default.
//
// The fill is the BAND's own colour at a per-band opacity: the normal
// provinces recede and the bad ones shout. The numbers live here, and the
// map legend reads them from here, so the key and the map can never drift
// apart.
import { getJson } from '../cache.js?v=2.4.122'
import { store, on } from '../state.js?v=2.4.122'
import { tr, bandColor } from '../i18n.js?v=2.4.122'
import { escapeHtml } from '../fmt.js?v=2.4.122'
import { provinceCard } from '../paint.js?v=2.4.122'

const BAND_COLOR = bandColor // theme-aware; single source of truth in i18n.js

// The zone's fill opacity per band. A whisper for normal, a shout for high.
export const ZONE_OPACITY = { normal: 0.20, watch: 0.36, elevated: 0.52, high: 0.66 }
const DEFAULT_STYLE = { color: '#241E4E', weight: 1, opacity: 0.55, fillColor: '#241E4E', fillOpacity: 0.04 }

export function createProvinceBoundariesLayer() {
  const group = L.layerGroup()
  let boundaries = null
  let boundariesByName = new Map()

  async function load() {
    if (boundaries) return
    try {
      boundaries = await getJson('/api/province-boundaries', 24 * 3600_000)
      // index by Thai + English name (risk.snap is keyed by province_th)
      for (const f of boundaries.features ?? []) {
        if (f.properties?.pro_th) boundariesByName.set(f.properties.pro_th, f)
        if (f.properties?.pro_en) boundariesByName.set(f.properties.pro_en, f)
      }
      draw()
      on('snapshot', draw)
      on('lang', draw)
    } catch { /* boundaries unavailable — layer still adds as empty group */ }
  }

  function riskRowForName(nameTh, nameEn) {
    const snap = store.snapshot
    if (!snap?.risk?.provinces) return null
    return snap.risk.provinces.find((p) =>
      (nameTh && p.province_th === nameTh) ||
      (nameEn && p.province_en === nameEn)) ?? null
  }

  function bandForName(nameTh, nameEn) {
    return riskRowForName(nameTh, nameEn)?.band ?? null
  }

  function draw() {
    group.clearLayers()
    if (!boundaries?.features) return

    for (const feat of boundaries.features) {
      const p = feat.properties ?? {}
      const row = riskRowForName(p.pro_th, p.pro_en)
      const band = row?.band ?? null
      const style = {
        color: band ? BAND_COLOR[band] : DEFAULT_STYLE.color,
        weight: band === 'high' ? 1.6 : band === 'elevated' ? 1.4 : 0.9,
        opacity: band ? 0.85 : DEFAULT_STYLE.opacity,
        fillColor: band ? BAND_COLOR[band] : DEFAULT_STYLE.fillColor,
        fillOpacity: band ? ZONE_OPACITY[band] : DEFAULT_STYLE.fillOpacity,
        dashArray: band ? null : '3 3',
      }
      try {
        const layer = L.geoJSON(feat, {
          pane: 'vectors',
          style,
          onEachFeature: (f, lyr) => {
            const name = tr(p.pro_th, p.pro_en)
            lyr.bindTooltip(
              `<b>${escapeHtml(name)}</b>${band ? `<br><span style="color:${BAND_COLOR[band]}">${tr('คะแนน', 'score')} ${row.score}/100</span>` : ''}`,
              { sticky: true, direction: 'top', opacity: 0.95 },
            )
            // The province card lives on the ZONE, because the zone is the
            // thing a reader clicks. One card, one implementation — the same
            // one the score circles show, so they cannot disagree.
            if (row) lyr.bindPopup(() => provinceCard(row))
            lyr.on('click', () => {
              const evt = new CustomEvent('province-boundary-click', { detail: { pro_th: p.pro_th, pro_en: p.pro_en } })
              window.dispatchEvent(evt)
            })
          },
        })
        group.addLayer(layer)
      } catch { /* skip malformed feature */ }
    }
  }

  load()
  return { group }
}