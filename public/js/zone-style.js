// The province zone's style — the map's primary layer.
//
// WHY THIS IS ITS OWN MODULE
// The zone is the only layer on the map that answers "where is the air
// bad" as an AREA, and it is painted with the BAND's own colour so the
// map, the legend and the province card cannot disagree about what a
// colour means.
//
// That means one call, not an index: `bandColor(band)` is a function, and
// `bandColor[band]` is `undefined`. Written that way, Leaflet falls back
// to the SVG default and paints every province BLACK — which is exactly
// what shipped in 2.4.122, and exactly what a pattern-matching guard
// cannot see. So the style lives here, pure, and the guard EXECUTES it.
import { bandColor } from './i18n.js?v=2.4.128'

// The fill opacity per band: the normal provinces recede, the bad ones
// shout. A tint has to be light enough for the basemap to show through
// and dark enough that the hue is readable — a whisper is not a zone.
export const ZONE_OPACITY = { normal: 0.20, watch: 0.36, elevated: 0.52, high: 0.66 }

// A province with no band is reference geometry, not a zone. It must never
// borrow a band's colour.
export const ZONE_FALLBACK = { color: '#241E4E', weight: 1, opacity: 0.55, fillColor: '#241E4E', fillOpacity: 0.04, dashArray: '3 3' }

export function zoneStyle(band) {
  if (!band || !(band in ZONE_OPACITY)) return { ...ZONE_FALLBACK }
  const color = bandColor(band)
  return {
    color,
    weight: band === 'high' ? 1.6 : band === 'elevated' ? 1.4 : 0.9,
    opacity: 0.85,
    fillColor: color,
    fillOpacity: ZONE_OPACITY[band],
    dashArray: null,
  }
}
