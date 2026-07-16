// JAXA / NASA GIBS satellite tile layers — Web Mercator (EPSG:3857) to match
// the Carto basemap. GPM IMERG rain (washout verification) and Himawari-9 IR
// cloud are the air-relevant layers; MODIS true colour doubles as a smoke /
// haze-plume view on burning-season days.
//
// References:
//   https://earth.jaxa.jp/en/data/index.html  — JAXA data catalog
//   https://data.earth.jaxa.jp/               — JAXA Earth API (COG/WMTS)
//   https://www.eorc.jaxa.jp/ptree/           — Himawari P-Tree monitor
//   https://gibs.earthdata.nasa.gov/          — tile delivery (Web Mercator)

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

function bangkokDate(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600_000 - offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Leaflet tile layer factory with native zoom cap (tiles upscale cleanly). */
function gibsLayer(layer, { date, maxNativeZoom, opacity = 0.82, pane }) {
  const tms = `GoogleMapsCompatible_Level${maxNativeZoom}`
  return L.tileLayer(
    `${GIBS}/${layer}/default/${date}/${tms}/{z}/{y}/{x}.png`,
    {
      maxNativeZoom,
      maxZoom: 19,
      opacity,
      pane,
      attribution: '© JAXA/JMA/NASA GIBS',
      crossOrigin: true,
    },
  )
}

export function createSatelliteLayers(map, pane) {
  const today = bangkokDate(0)
  const yesterday = bangkokDate(1)

  return {
    // Himawari-9 band 13 clean IR — storm/cloud-top monitoring (JAXA/JMA via GIBS).
    himawari: gibsLayer('Himawari_AHI_Band13_Clean_Infrared', {
      date: today,
      maxNativeZoom: 6,
      opacity: 0.72,
      pane,
    }),
    // GPM IMERG near-real-time precipitation — JAXA/GPM mission product on GIBS.
    gsmap: gibsLayer('IMERG_Precipitation_Rate_30min', {
      date: today,
      maxNativeZoom: 6,
      opacity: 0.65,
      pane,
    }),
    // MODIS Terra true colour — yesterday (today often incomplete).
    modis: L.tileLayer(
      `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      {
        maxNativeZoom: 9,
        maxZoom: 19,
        opacity: 0.88,
        pane,
        attribution: '© NASA GIBS · MODIS Terra',
        crossOrigin: true,
      },
    ),
  }
}

export function ensureMapPanes(map) {
  const spec = [
    ['satellite', 250],
    ['radar', 300],
    ['vectors', 350],
    ['data', 450],
  ]
  for (const [name, z] of spec) {
    if (!map.getPane(name)) {
      map.createPane(name)
      map.getPane(name).style.zIndex = z
    }
  }
}

export const LAYER_GROUPS = [
  {
    id: 'remote',
    th: 'ดาวเทียม · เรดาร์',
    en: 'SATELLITE · RADAR',
    layers: [
      { id: 'gsmap', th: 'GSMaP/GPM ฝนดาวเทียม', en: 'GSMaP/GPM rain', on: false, kind: 'sat' },
      { id: 'himawari', th: 'Himawari-9 เมฆ IR', en: 'Himawari-9 IR', on: false, kind: 'sat' },
      { id: 'modis', th: 'MODIS ภาพจริง', en: 'MODIS true colour', on: false, kind: 'sat' },
      { id: 'radar', th: 'เรดาร์ฝน', en: 'rain radar', on: true, kind: 'radar' },
    ],
  },
  {
    id: 'ground',
    th: 'ข้อมูลภาคสนาม',
    en: 'GROUND OBSERVATIONS',
    layers: [
      { id: 'air', th: 'สถานีคุณภาพอากาศ (Air4Thai)', en: 'AQ stations (Air4Thai)', on: true },
      { id: 'rain', th: 'ฝนสะสม 24 ชม. (ล้างฝุ่น)', en: 'rain 24h (washout)', on: false },
    ],
  },
  {
    id: 'analysis',
    th: 'วิเคราะห์ · อ้างอิง',
    en: 'ANALYSIS · REFERENCE',
    layers: [
      { id: 'risk', th: 'ชั้นความเสี่ยงจังหวัด', en: 'province risk', on: true },
      { id: 'boundaries', th: 'ขอบเขตจังหวัด (data.go.th)', en: 'province boundaries (DOPA)', on: false },
      { id: 'osmbuild', th: 'อาคารพื้นที่เสี่ยง OSM', en: 'OSM buildings in risk areas', on: false },
    ],
  },
]

/** Flat list for toggle lookup. */
export function allLayerToggles() {
  return LAYER_GROUPS.flatMap((g) => g.layers)
}
