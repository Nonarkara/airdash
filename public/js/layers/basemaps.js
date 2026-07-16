// Basemap switcher — clean street (Carto Positron, matches the existing
// design), fresh satellite (Esri World Imagery + a faint reference-label
// overlay so place names stay readable over imagery), and a scientific
// topo map (OpenTopoMap, contour-shaded). All free, no API key.
export const BASEMAP_META = [
  { id: 'street', th: 'ถนน (มาตรฐาน)', en: 'Street' },
  { id: 'satellite', th: 'ดาวเทียม', en: 'Satellite' },
  { id: 'topo', th: 'ภูมิประเทศ', en: 'Topo' },
]

export function createBasemaps() {
  const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '© OpenStreetMap © CARTO',
  })

  const satellite = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19, maxZoom: 19,
      attribution: '© Esri — World Imagery',
    }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19, maxZoom: 19, opacity: 0.85,
    }),
  ])

  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19,
    attribution: '© OpenTopoMap (CC-BY-SA) · SRTM',
  })

  return { street, satellite, topo }
}
