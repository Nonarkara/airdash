// Province-boundaries layer — pulled from chingchai/OpenGISData-Thailand
// (CC-BY 4.0, derived from DOPA shapefiles). 77 features, ~1.6 MB.
//
// Color each province by its current risk band when both layers are on,
// so the operator gets a quick visual scan of where the situation is
// elevated. The plain boundary outline is also useful on its own for
// orientation ("which province am I looking at?").
import { getJson } from '../cache.js?v=2.0.0-tg1'
import { store, on } from '../state.js?v=2.0.0-tg1'
import { tr } from '../i18n.js?v=2.0.0-tg1'
import { escapeHtml } from '../fmt.js?v=2.0.0-tg1'

const BAND_COLOR = { normal: '#00933C', watch: '#F0B400', elevated: '#E86A10', high: '#A51931' }
const BAND_FILL = {
  normal:   { fill: '#00933C', opacity: 0.04 },
  watch:    { fill: '#F0B400', opacity: 0.10 },
  elevated: { fill: '#E86A10', opacity: 0.16 },
  high:     { fill: '#A51931', opacity: 0.22 },
}
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

  function bandForName(nameTh, nameEn) {
    const snap = store.snapshot
    if (!snap?.risk?.provinces) return null
    const p = snap.risk.provinces.find((p) =>
      (nameTh && p.province_th === nameTh) ||
      (nameEn && p.province_en === nameEn))
    return p?.band ?? null
  }

  function draw() {
    group.clearLayers()
    if (!boundaries?.features) return

    for (const feat of boundaries.features) {
      const p = feat.properties ?? {}
      const band = bandForName(p.pro_th, p.pro_en)
      const fill = band ? BAND_FILL[band] : null
      const style = {
        color: fill ? BAND_COLOR[band] : DEFAULT_STYLE.color,
        weight: band === 'high' ? 1.6 : band === 'elevated' ? 1.4 : 0.9,
        opacity: band ? 0.85 : DEFAULT_STYLE.opacity,
        fillColor: fill ? fill.fill : DEFAULT_STYLE.fillColor,
        fillOpacity: fill ? fill.opacity : DEFAULT_STYLE.fillOpacity,
        dashArray: band ? null : '3 3',
      }
      try {
        const layer = L.geoJSON(feat, {
          pane: 'vectors',
          style,
          onEachFeature: (f, lyr) => {
            const name = tr(p.pro_th, p.pro_en)
            lyr.bindTooltip(
              `<b>${escapeHtml(name)}</b>${band ? `<br><span style="color:${BAND_COLOR[band]}">${tr('คะแนน', 'score')} ${bandForScore(p.pro_th, p.pro_en)}/100</span>` : ''}`,
              { sticky: true, direction: 'top', opacity: 0.95 },
            )
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

  function bandForScore(nameTh, nameEn) {
    const snap = store.snapshot
    if (!snap?.risk?.provinces) return null
    const p = snap.risk.provinces.find((p) =>
      (nameTh && p.province_th === nameTh) ||
      (nameEn && p.province_en === nameEn))
    return p?.score ?? null
  }

  load()
  return { group }
}