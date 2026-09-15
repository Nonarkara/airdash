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

// JAXA's own tile server (P-Tree / Himawari Monitor), not GIBS. Found by
// opening https://www.eorc.jaxa.jp/ptree/ (their real-time Himawari-9
// viewer), turning on "Aerosol Optical Thickness", and reading the tile
// requests off the network panel — this endpoint is not published as an
// API anywhere. Verified 2026-09-15: real, non-blank AOT tiles over
// Thailand at z<=5 during Thai daytime hours; z>=6 degrades to a near-
// empty placeholder, so 5 is the true native ceiling, not a guess.
const JAXA_PTREE = 'https://www.eorc.jaxa.jp/cgi-bin/ptree/tilemap/tilemap_aersol_v4r1.py'

function bangkokDate(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600_000 - offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// Himawari-9 AOT is produced every 10 minutes from a VISIBLE-BAND
// retrieval, so it only exists during Thai daylight (roughly 00:00-10:00
// UTC) — a blank tile at night is the instrument working correctly, not
// a broken feed, the same way the AOD/night-lights layers are honestly
// empty outside their own valid windows.
//
// The 20-minute pull-back is not a guess: probed empirically against
// live tiles on 2026-09-15 — the two most recent 10-minute slots at
// request time were still placeholder-sized, and the one before that
// carried real data. Rounds down to the product's own 10-minute grid.
function himawariTimestamp() {
  const t = Date.now() - 20 * 60_000
  const d = new Date(Math.floor(t / (10 * 60_000)) * 10 * 60_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
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

/**
 * JAXA Himawari-9 Aerosol Optical Thickness, straight from JAXA's own
 * P-Tree infrastructure — not routed through GIBS like every other layer
 * in this file. Two things follow from that, and both matter:
 *
 *   1. NO crossOrigin. The other layers set `crossOrigin: true` because
 *      GIBS sends permissive CORS headers; this server sends none at
 *      all (checked with `curl -I`). Setting crossOrigin here would make
 *      the browser silently discard every tile as a CORS failure — the
 *      layer would toggle on and show nothing, with no error a user
 *      could see. Leaflet doesn't need it for plain display, only this
 *      file's habit of always setting it — so this is the one deliberate
 *      exception.
 *   2. LIVE, not lagged. Himawari is geostationary and reprocesses every
 *      10 minutes, so — unlike the MODIS AOD layer one calendar day
 *      behind — this can show aerosol loading from within the last half
 *      hour during Thai daylight. That is the actual reason to run it
 *      alongside AOD rather than instead of it: AOD is the reliable
 *      once-daily read, this is the same measurement (column aerosol)
 *      refreshed fast enough to catch a plume moving during the day.
 *
 * Licensing note: P-Tree's public terms permit commercial use only for
 * data from 2026-02-01 onward; earlier archive data stays research/
 * education-only. Immaterial to how this is used — nothing here is
 * stored or redistributed, the browser fetches today's tile live each
 * session — but worth knowing before anyone builds a burn-scar-style
 * archive on top of this feed the way burn-area.js does for HII.
 */
function createJaxaAerosolLayer(pane) {
  return L.tileLayer(
    `${JAXA_PTREE}?z={z}&x={x}&y={y}&date=${himawariTimestamp()}&prd=AOT&term=T10m&ver=031&min=0&max=4`,
    {
      maxNativeZoom: 5,
      maxZoom: 19,
      opacity: 0.75,
      pane,
      attribution: '© JAXA Himawari Monitor (P-Tree) · Himawari-9 AOT',
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
    // MODIS Aqua AOD at 3 km native resolution — the satellite-retrieved
    // plume view at a useful zoom for a single province. NASA GIBS hosts
    // the daily 3-km Aqua product separately from the combined value-added
    // AOD above; this is the same MODIS instrument, just a sharper
    // retrieval pipeline and at the higher native 3-km pixel size. Each
    // daily tile is published one day behind.
    //
    // This used to be labelled "JAXA-class" as a stand-in, reasoning that
    // JAXA's own GCOM-C SGLI aerosol product sits behind G-Portal auth
    // with no public tile service. That reasoning missed a real one:
    // JAXA's Himawari Monitor (P-Tree) serves live Himawari-9 AOT tiles
    // with no key at all — see createJaxaAerosolLayer below. Calling a
    // NASA/MODIS product "JAXA-class" on a public-health dashboard is a
    // provenance claim someone could reasonably rely on, so once the
    // real thing existed the label was corrected rather than left as a
    // harmless-sounding approximation.
    aodAqua3km: L.tileLayer(
      `${GIBS}/MODIS_Aqua_Aerosol_Optical_Depth_3km/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.72,
        pane,
        attribution: '© NASA GIBS · MODIS Aqua AOD 3km',
        crossOrigin: true,
      },
    ),
    // Carbon monoxide, 500 hPa (AIRS/Aqua). CO is THE tracer for biomass
    // burning: incomplete combustion of vegetation produces it in bulk, it
    // survives in the atmosphere for weeks, and — unlike CO2 — it is not
    // well-mixed, so a plume still points back at its source. That is the
    // whole reason this layer is here and a CO2 layer is not: CO2 from a
    // rice field is indistinguishable from CO2 from anywhere else on Earth,
    // which makes it useless for finding a fire.
    //
    // Read it as TRANSPORT, not ignition: 500 hPa is roughly 5.5 km up, so
    // this shows smoke that has already lofted and is travelling — often
    // the haze arriving from Myanmar/Laos before any Thai station reacts.
    // It will NOT show a field burning this morning.
    // Verified 2026-09-10: L2 returns real tiles at 1-day lag over Thailand
    // where the L3 daily grid was still 404 — hence L2 and yesterday.
    co: L.tileLayer(
      `${GIBS}/AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.68,
        pane,
        attribution: '© NASA GIBS · AIRS CO 500 hPa',
        crossOrigin: true,
      },
    ),
    // UV Aerosol Index (OMPS/Suomi-NPP). Complements AOD rather than
    // repeating it: AOD measures how MUCH aerosol is in the column, while
    // the UV index responds to ABSORBING aerosol — smoke and dust — and
    // stays usable over bright surfaces and thin cloud where the AOD
    // retrieval drops out and leaves a hole exactly where the haze is.
    // Positive values mean absorbing particles aloft; near-zero or
    // negative is clear air or non-absorbing cloud.
    aerosolIndex: L.tileLayer(
      `${GIBS}/OMPS_Aerosol_Index/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© NASA GIBS · OMPS UV Aerosol Index',
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
    // JAXA Himawari-9 AOT — see createJaxaAerosolLayer for the full
    // reasoning. Kept as a separate factory (not a gibsLayer() call)
    // because it is genuinely a different host with a different CORS
    // contract, not a variant of the same thing.
    jaxaAerosol: createJaxaAerosolLayer(pane),
  }
}

// ── ตามรอยเผา (Tam Roy Pao) — agricultural burn scars ──────────────────
//
// The layer this dashboard was missing. Everything else here sees SMOKE
// or HEAT; this sees the burned ground itself, and — uniquely — knows
// which CROP it was. Sentinel-2 at 20 m, classified into rice / sugarcane
// / maize, with urban, orchard and legally-defined forest masked out
// first using Land Development Department land-use layers. So unlike a
// raw hotspot count, agricultural burning is already separated from
// forest fire at the source rather than inferred by us.
//
// Built by HII + Kasetsart University under an NRCT-funded project, with
// cane ground-truth from Khon Kaen Sugar. Their published accuracy:
// 87.66% on cane plots (88,403 of 100,853 rai), 80.84% overall multi-crop
// in Khon Kaen. No API key, no auth.
//
// THREE THINGS TO KNOW BEFORE READING IT:
//   1. It is SEASONAL ACCUMULATION, not live. B3A sums the whole
//      dust-smoke season (พฤศจิกายน–เมษายน). The constant below is the
//      most recent COMPLETE season, Dec 2025 – Apr 2026. It answers
//      "where did it burn last season", which is the honest way to
//      anticipate the season that starts this November — it is not and
//      cannot be today's fires.
//   2. Coverage is PARTIAL. Verified 2026-09-10 by fetching tiles: the
//      NORTH mosaic returns imagery over Chiang Mai, the central plains
//      (Nakhon Sawan is the densest tile tested, 145 KB) and Bangkok,
//      but 404s over the Northeast (Ubon) and the South (Songkhla).
//      Absence of colour outside that footprint means NO DATA, not no
//      burning — the toggle label says so.
//   3. Tiles are TMS, so the y axis is inverted relative to XYZ. Leaflet
//      needs the {-y} placeholder; plain {y} 404s on every tile.
const TAMROYPAO_SEASON = { year: 2025, span: '202512_202604', region: 'NORTH' }

export function createBurnScarLayer(pane) {
  const { year, span, region } = TAMROYPAO_SEASON
  return L.tileLayer(
    `https://tamroypao.hii.or.th/tms/${year}/BURNSCAR_${region}_20M_${span}_B3A_COLOR/{z}/{x}/{-y}.png`,
    {
      maxNativeZoom: 12,
      maxZoom: 19,
      opacity: 0.78,
      pane,
      attribution: '© ตามรอยเผา HII/KU · Sentinel-2 burn scars',
      crossOrigin: true,
    },
  )
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
      { id: 'jaxaAerosol', th: 'ละอองลอย Himawari-9 (JAXA สด ทุก 10 นาที)', en: 'Himawari-9 aerosol (JAXA, live 10-min)', on: false, kind: 'sat' },
      { id: 'aodAqua3km', th: 'AOD 3 กม. (Aqua ความละเอียดสูง)', en: 'AOD 3 km (Aqua, high-res)', on: false, kind: 'sat' },
      { id: 'aerosolIndex', th: 'ดัชนีควัน UV (ควันดูดกลืนแสง)', en: 'UV smoke index (absorbing aerosol)', on: false, kind: 'sat' },
      { id: 'co', th: 'คาร์บอนมอนอกไซด์ (ควันไฟที่ลอยมา)', en: 'Carbon monoxide (transported smoke)', on: false, kind: 'sat' },
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
      { id: 'drought', th: 'ความเสี่ยงภัยแล้งรายสัปดาห์ (GISTDA)', en: 'weekly drought risk (GISTDA)', on: false },
      { id: 'burnscar', th: 'รอยเผาภาคเกษตร ฤดูล่าสุด (เหนือ+กลาง)', en: 'Agri burn scars, last season (north+central)', on: false },
      { id: 'boundaries', th: 'ขอบเขตจังหวัด (data.go.th)', en: 'province boundaries (DOPA)', on: false },
      { id: 'osmbuild', th: 'อาคารพื้นที่เสี่ยง OSM', en: 'OSM buildings in risk areas', on: false },
    ],
  },
]

/** Flat list for toggle lookup. */
export function allLayerToggles() {
  return LAYER_GROUPS.flatMap((g) => g.layers)
}
