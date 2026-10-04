// Leaflet cannot animate a flight while the phone's map sheet has zero size.
export function moveMap(map, center, zoom, options = {}) {
  if (!map || !Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) || !Number.isFinite(zoom)) return
  const size = map.getSize()
  map.stop()
  if (size.x <= 0 || size.y <= 0 || options.duration === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    map.setView(center, zoom, { animate: false })
  } else map.flyTo(center, zoom, options)
}
