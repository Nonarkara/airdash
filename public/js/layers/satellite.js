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
  // Night-lights (VIIRS DNB) is a night-overpass product processed a day
  // behind the AOD retrieval — yesterday's tile is still empty when the
  // dashboard loads in the morning, so it reads two days back.
  const twoDaysAgo = bangkokDate(2)

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
    // Aerosol Optical Depth (MODIS combined value-added, Terra+Aqua,
    // deep-blue + dark-target) — the smoke/haze plume view. This is the
    // burning-season layer: AOD is column aerosol loading, so a swath of
    // high AOD blowing in from upwind fires shows up here BEFORE the
    // ground stations downwind register the PM2.5 spike. Native tiles are
    // one calendar day behind (the retrieval is processed overnight), so
    // it defaults to yesterday; today's tile is transparent until ~mid-day.
    aod: L.tileLayer(
      `${GIBS}/MODIS_Combined_Value_Added_AOD/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© NASA GIBS · MODIS AOD (Terra+Aqua)',
        crossOrigin: true,
      },
    ),
    // Night lights — VIIRS Day/Night Band at-sensor radiance. Two things
    // make this meaningful for a dust dashboard, not just pretty:
    //   1. ACTIVE NIGHT BURNING. Agricultural fires are frequently lit in
    //      the evening precisely because it is cooler and less visible.
    //      The DNB sees that heat/light directly, so a field being burned
    //      overnight appears here while the daytime AOD retrieval has not
    //      run yet and the ground stations only smell it hours later.
    //   2. HAZE SCATTERING. On a thick-haze night the aerosol layer
    //      scatters city light back to the sensor, so an urban area looks
    //      diffuse and bloomed rather than sharply pin-pointed — a visual
    //      cross-check on the AOD panel above it.
    // Caveat worth remembering when reading it: moonlight also brightens
    // the scene, so compare like-for-like across the lunar cycle.
    nightlights: L.tileLayer(
      `${GIBS}/VIIRS_SNPP_DayNightBand_At_Sensor_Radiance/default/${twoDaysAgo}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 8,
        maxZoom: 19,
        opacity: 0.75,
        pane,
        attribution: '© NASA GIBS · VIIRS Day/Night Band',
        crossOrigin: true,
      },
    ),
  }
}

export function ensureMapPanes(map) {
  const spec = [
    ['satellite', 250],
    ['radar', 300],
    ['heatmap', 320], // above radar, below province boundaries/station data
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
      { id: 'aod', th: 'หมอกควัน/ละอองลอย (AOD ดาวเทียม)', en: 'Smoke / aerosol (satellite AOD)', on: false, kind: 'sat' },
      { id: 'nightlights', th: 'แสงไฟกลางคืน (เผากลางคืน/ฟุ้งกระจาย)', en: 'Night lights (night burning / haze glow)', on: false, kind: 'sat' },
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
      { id: 'heatmap', th: 'ฮีทแมป PM2.5', en: 'PM2.5 heat map', on: false },
      { id: 'rain', th: 'ฝนสะสม 24 ชม. (ล้างฝุ่น)', en: 'rain 24h (washout)', on: false },
      { id: 'newsfire', th: 'ข่าวไฟป่า/มลพิษ', en: 'fire & pollution news', on: true },
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
