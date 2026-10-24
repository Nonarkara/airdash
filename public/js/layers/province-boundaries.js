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
import { getJson } from '../cache.js?v=2.4.125'
import { store, on } from '../state.js?v=2.4.125'
import { tr, bandColor } from '../i18n.js?v=2.4.125'
import { escapeHtml } from '../fmt.js?v=2.4.125'
import { provinceCard } from '../paint.js?v=2.4.125'
import { zoneStyle } from '../zone-style.js?v=2.4.125'
import { changeStyle, outlookByProvince, stateLabel } from '../horizon.js?v=2.4.125'

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
      on('horizon', draw)
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

  /**
   * The change the model expects for each province at the selected horizon,
   * keyed by province code. Empty at horizon 0 (the present): the zone then
   * paints the band's LEVEL, and the two are never on screen together.
   */
  function changeRows() {
    const h = store.horizon ?? 0
    if (!h || !store.outlook) return null
    return outlookByProvince(store.outlook, h)
  }

  function draw() {
    group.clearLayers()
    if (!boundaries?.features) return
    const changes = changeRows()
    const horizon = store.horizon ?? 0

    for (const feat of boundaries.features) {
      const p = feat.properties ?? {}
      const row = riskRowForName(p.pro_th, p.pro_en)
      const band = row?.band ?? null
      const change = changes ? (changes.get(String(row?.province_code)) ?? null) : null
      // In a forecast horizon the area carries the model's expected CHANGE;
      // at the present it carries the band's level. One area, one meaning,
      // and the legend says which meaning is on screen.
      const style = changes
        ? changeStyle(change?.state ?? 'unknown')
        : zoneStyle(band)
      try {
        const layer = L.geoJSON(feat, {
          pane: 'vectors',
          style,
          onEachFeature: (f, lyr) => {
            const name = tr(p.pro_th, p.pro_en)
            let tip
            if (changes) {
              const delta = change?.delta
              tip = change
                ? `<b>${escapeHtml(name)}</b><br>${tr('แบบจำลอง', 'model')} ${change.now} → ${change.then} µg/m³` +
                  ` · <span style="color:${changeStyle(change.state).fillColor}">${delta > 0 ? '+' : ''}${delta} · ${escapeHtml(stateLabel(change.state))}</span>`
                : `<b>${escapeHtml(name)}</b><br>${tr('ไม่มีค่าจากแบบจำลอง', 'no model value for this province')}`
            } else {
              tip = `<b>${escapeHtml(name)}</b>${band ? `<br><span style="color:${bandColor(band)}">${tr('คะแนน', 'score')} ${row.score}/100</span>` : ''}`
            }
            lyr.bindTooltip(tip, { sticky: true, direction: 'top', opacity: 0.95 })
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