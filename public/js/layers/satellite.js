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
    // OMPS PyroCb UV Aerosol Index (Suomi-NPP) — the smoke-from-intense-fire
    // view. A "pyrocumulonimbus" is the towering thunderstorm a really hot
    // biomass fire can seed; OMPS reads the absorbing aerosol it injects
    // straight up to the stratosphere. That is also the smoke that travels
    // furthest, so this is the layer that flags a haze plume arriving from
    // across SE Asia BEFORE the AOD tile shows it and well before any
    // ground station downwind reads it. The positive UV aerosol index is
    // keyed to absorbing smoke and dust — exactly the spectrum we want
    // for "is this plume from a fire, or just humidity?".
    // Verified 2026-09-27: 81 KB PNG for the SE Asia tile. NASA GIBS hosts
    // this as a separate product from the standard OMPS AI on purpose, so
    // its colour ramp is biased to the high-altitude-smoke range.
    ompsPyroCb: L.tileLayer(
      `${GIBS}/OMPS_Aerosol_Index_PyroCumuloNimbus/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.78,
        pane,
        attribution: '© NASA GIBS · OMPS PyroCb UV Aerosol Index',
        crossOrigin: true,
      },
    ),
    // VIIRS NOAA-20 aerosol type (Deep Blue, land & ocean). The Deep
    // Blue retrieval sorts the AOD column into TYPE — smoke vs dust vs
    // sea salt vs sulphate — at 6 km native. This is the JAXA SGLI-class
    // layer the user originally asked about: where JAXA's own aerosol-type
    // product is gated behind G-Portal, NASA publishes VIIRS equivalent
    // keylessly on GIBS. Crucial for SE Asia where the smoke-vs-dust
    // attribution decides which policy lever actually moves the air-quality
    // number (ban the burn vs control construction / driving).
    // Verified 2026-09-27: 8130-byte PNG for the SE Asia tile today.
    viirsAerosolType: L.tileLayer(
      `${GIBS}/VIIRS_NOAA20_Aerosol_Type_Deep_Blue_Land_Ocean/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.72,
        pane,
        attribution: '© NASA GIBS · VIIRS NOAA-20 aerosol type (Deep Blue)',
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

    // ── 2026-09-28 — meaningful observations round-out ────────────────
    //
    // The seven layers below were probed live at SE Asia tile (z=4)
    // on 2026-09-28 and each returned a 200 image — unlike several other
    // NASA GIBS identifiers (VIIRS_Noaa20_CorrectedReflectance_TrueColor,
    // MODIS_Terra_Land_Surface_Temp_Day, OMI_Nitrogen_Dioxide_Tropo_Column)
    // that returned 400/404 from this network and are not included.
    //
    // MODIS_Terra_Aerosol_Optical_Depth_3km — the morning overpass (Terra
    // ~10:30 local) at 3-km pixel size. Pairs with the Aqua 3km product
    // already integrated: Terra picks up the morning-anchored plume, Aqua
    // the afternoon one — together they bracket the diurnal AOD swing
    // over Indochina.
    aodTerra3km: L.tileLayer(
      `${GIBS}/MODIS_Terra_Aerosol_Optical_Depth_3km/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.72,
        pane,
        attribution: '© NASA GIBS · MODIS Terra AOD 3km',
        crossOrigin: true,
      },
    ),
    // OMI UV Aerosol Index (Aura/OMI). Different sensor line than the
    // OMPS Suomi-NPP UV-AI already wired: OMI is a finer-resolution UV/vis
    // spectrometer (Dutch/Finnish instrument on NASA's Aura) and has been
    // running since 2004. Compares to OMPS-AI as another independent
    // daily read on absorbing smoke/dust — when both products agree on
    // a high-AI pixel over Chiang Rai tomorrow, the plume is real.
    omiAerosolIndex: L.tileLayer(
      `${GIBS}/OMI_Aerosol_Index/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© NASA GIBS · OMI UV Aerosol Index',
        crossOrigin: true,
      },
    ),
    // OMI Aerosol Optical Depth (Aura/OMI, UV retrieval at 388 nm).
    // This is the same physical quantity as the dark-target AOD layers
    // already integrated — but retrieved from a different part of the
    // spectrum. OMI's UV sees dust and absorbing aerosol where the
    // MODIS dark-target retrieval drops out over bright surfaces (sand,
    // salt flats, urban concrete), so the two together fill each
    // other's holes.
    omiAod: L.tileLayer(
      `${GIBS}/OMI_Aerosol_Optical_Depth/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© NASA GIBS · OMI AOD (UV, 388 nm)',
        crossOrigin: true,
      },
    ),
    // OMI Single Scattering Albedo (Aura/OMI). This is what tells SMOKE
    // apart from NON-ABSORBING HAZE: smoke from biomass burning has
    // SSA values < 0.85 (strongly absorbing), while sulphate and sea-salt
    // particles are non-absorbing and sit at SSA > 0.95. A winter haze
    // that reads SSA = 0.95 is urban combustion, not a regional burn;
    // SSA = 0.78 is from a forest fire. AQI is regulatory-agnostic on
    // WHAT is in the air but the policy lever (ban the burn vs
    // control traffic, vs dust storm warning) is entirely different.
    omiSsa: L.tileLayer(
      `${GIBS}/OMI_Single_Scattering_Albedo/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.72,
        pane,
        attribution: '© NASA GIBS · OMI Single Scattering Albedo',
        crossOrigin: true,
      },
    ),
    // AIRS L2 Dust Score Day (Aqua/AIRS). AIRS computes an explicit
    // DUST FLAG per pixel — separate from the smoke-dust mixing that
    // the OMPS/OMI AI products collapse into one number. Useful when a
    // haze episode is driven by trans-boundary dust (Mekong valley
    // picks up springtime dust from north China in years it does), vs
    // the agricultural-fire smoke that drives most burning-season air.
    // Both can read as "high AOD" but the policy lever differs.
    airsDust: L.tileLayer(
      `${GIBS}/AIRS_L2_Dust_Score_Day/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© NASA GIBS · AIRS L2 Dust Score',
        crossOrigin: true,
      },
    ),
    // TROPOMI (Sentinel-5P) tropospheric NO₂.
    //
    // Why this and not the OMI NO₂ already above it: OMI samples at 13×24 km,
    // TROPOMI at 5.5×3.5 km — an order of magnitude more detail over a city,
    // which is the only scale a resident cares about. Both are polar orbiters
    // covering the whole country, so this is an upgrade in resolution, not a
    // change in coverage.
    //
    // What NO₂ means here: it is a combustion tracer. Traffic corridors,
    // industrial estates and power stations show up as plumes. It is NOT a
    // PM2.5 measurement and not a dust measurement — a high NO₂ day in
    // Bangkok is a traffic-and-industry day, which is a different public-health
    // story from a burning season. Read it beside the AOD layers, not instead.
    //
    // Verified 2026-09-29 by fetching real tiles over Bangkok, Chiang Mai and
    // Nakhon Si Thammarat and decoding the pixels: 39-65% valid coverage
    // across four consecutive days, cloud-masked (the magenta wash) rather
    // than empty. Its sibling TEMPO layers are deliberately NOT here — those
    // are a North America instrument and serve striping garbage over Thailand.
    tropomiNo2: L.tileLayer(
      `${GIBS}/TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.7,
        pane,
        attribution: '© ESA/NASA GIBS · Sentinel-5P TROPOMI NO₂',
        crossOrigin: true,
      },
    ),
    // OMPS NOAA-20 SO₂ Middle Troposphere. Volcanic SO₂ rises into the
    // mid-troposphere before being sheared out across SE Asia — Mount
    // Sinila, Merapi, Dukono eruptions reach Thai airspace every few
    // years and produce a haze that visually looks identical to smoke
    // but is gas, not particulate. SO₂ retrieved in the mid-trop column
    // is the cleanest way to spot the difference.
    ompsNoaa20So2Mid: L.tileLayer(
      `${GIBS}/OMPS_NOAA20_SO2_Middle_Troposphere/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.68,
        pane,
        attribution: '© NASA GIBS · OMPS NOAA-20 SO₂ mid-tropo',
        crossOrigin: true,
      },
    ),
    // OMPS NOAA-20 SO₂ Lower Troposphere — boundary layer, i.e. the
    // smoke-air-mix from industrial stacks. Power plants (Mae Moh in
    // Lampang comes to mind, but also Map Ta Phut in Rayong) emit a
    // recognisable SO₂ signature here. Useful for separating industrial
    // haze from agricultural haze, which the Burning Season response
    // gets wrong at the regional level if you cannot tell the two
    // plumes apart on a single panel.
    ompsNoaa20So2Lower: L.tileLayer(
      `${GIBS}/OMPS_NOAA20_SO2_Lower_Troposphere/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
      {
        maxNativeZoom: 6,
        maxZoom: 19,
        opacity: 0.68,
        pane,
        attribution: '© NASA GIBS · OMPS NOAA-20 SO₂ boundary-layer',
        crossOrigin: true,
      },
    ),
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
      { id: 'aod', th: 'หมอกควัน/ละอองลอย (AOD ดาวเทียม)', en: 'Smoke / aerosol (satellite AOD)', on: false, kind: 'sat', note_th: 'ละอองลอยในชั้นบรรยากาศ (AOD) วัดว่าแสงถูกอนุภาคในอากาศกระจายไปเท่าใด', note_en: 'บอกได้ว่ามีฝุ่นลอยอยู่เหนือหัวเรา แต่บอกไม่ได้ว่าเป็นฝุ่นดินหรือควันไฟ และเป็นค่าทั้งเสา ไม่ใช่ระดับที่พื้นดิน', what_th: 'Aerosol optical depth — how much sunlight particles scatter on the way down.', what_en: 'Tells you a haze column is overhead. Cannot tell you whether it is dust or smoke, and it is a column total, not a ground-level concentration.' },
      { id: 'jaxaAerosol', th: 'ละอองลอย Himawari-9 (JAXA สด ทุก 10 นาที)', en: 'Himawari-9 aerosol (JAXA, live 10-min)', on: false, kind: 'sat', note_th: 'AOT จาก Himawari-9 ปรับใหม่ทุก 10 นาทีในเวลากลางวัน', note_en: 'วัดเหมือน AOD แต่ใหม่พอที่จะเห็นพลังควันเคลื่อนที่ระหว่างวันได้ ที่กลางคืนจะไม่มีภาพ — นั่นคือเครื่องทำงานตามเวลา ไม่ใช่ข้อมูลเสีย', what_th: 'Himawari-9 aerosol optical thickness, reprocessed every 10 minutes during Thai daylight.', what_en: 'The same measurement as AOD but fresh enough to watch a plume move. Blank at night is the instrument working correctly, not a fault.' },
      { id: 'aodAqua3km', th: 'AOD 3 กม. (Aqua ความละเอียดสูง)', en: 'AOD 3 km (Aqua, high-res)', on: false, kind: 'sat', note_th: 'AOD ความละเอียด 3 กม. จาก Aqua', note_en: 'ละเอียดกว่าภาพรวมรายวัน ทำให้เมืองหนึ่งจังหวัดกินพิกเซลเดียวแทนที่จะกระจายหลายพิกเซล', what_th: 'MODIS Aqua AOD at 3 km resolution.', what_en: 'Sharper than the daily composite, so a city fills one pixel instead of spilling across four. Still only re-read on overpass.' },
      { id: 'aodTerra3km', th: 'AOD 3 กม. (Terra — เช้า)', en: 'AOD 3 km (Terra — morning overpass)', on: false, kind: 'sat', note_th: 'AOD ความละเอียด 3 กม. จาก Terra (เที่ยวบินตอนเช้า)', note_en: 'อยู่คนละวงโคจรกับ Aqua จึงเห็นฝุ่นในช่วงที่ Aqua มองไม่เห็น สองชั้นนี้ช่วยกันลดช่องว่างได้ครึ่งหนึ่ง', what_th: 'MODIS Terra AOD, morning overpass.', what_en: 'A different orbit from Aqua, so it catches haze Aqua missed. Two passes a day still leaves most of the day uncovered.' },
      { id: 'aerosolIndex', th: 'ดัชนีควัน UV (ควันดูดกลืนแสง)', en: 'UV smoke index (absorbing aerosol)', on: false, kind: 'sat', note_th: 'ดัชนีควันจากรังสี UV', note_en: 'ควันดูดกลืนแสง UV ในความยาวคลื่นที่ฝุ่นดินไม่ดูดกลืน จึงใช้แยกไฟไหม้ออกจากฝุ่นที่พัดมาได้', what_th: 'UV smoke index — absorbing aerosol.', what_en: 'Separates smoke from blowing dust, because smoke absorbs UV at wavelengths dust does not. A thin cloud can imitate it.' },
      { id: 'omiAerosolIndex', th: 'OMI UV Aerosol Index (อิสระจาก OMPS)', en: 'OMI UV AI (independent of OMPS)', on: false, kind: 'sat', note_th: 'ดัชนีควัน UV จากเครื่อง OMI (อิสระจาก OMPS)', note_en: 'วัดสิ่งเดียวกับชั้นด้านบนแต่คนละเครื่อง เมื่อสองชั้นไม่ตรงกัน ความต่างนั้นคือข้อมูล — แปลว่ามีเครื่องหนึ่งถูกเมฆบัง', what_th: 'OMI UV aerosol index, an independent instrument from the OMPS index above.', what_en: 'Agreement with the layer above is a cross-check; disagreement usually means one of them is cloud-contaminated, not that the air changed.' },
      { id: 'omiAod', th: 'AOD ย่าน UV (OMI 388 นาโนเมตร เห็นฝุ่นเหนือพื้นสว่าง)', en: 'AOD UV band (OMI 388 nm — sees dust over bright land)', on: false, kind: 'sat', note_th: 'AOD ย่าน UV 388 นาโนเมตร', note_en: 'พื้นดินสว่างเป็นปัญหาหลักของการวัด AOD — การอ่านในย่าน UV คือสิ่งที่ทำให้ฝุ่นเหนือดินสีอ่อนของไทยมองเห็นได้เลย', what_th: 'AOD at 388 nm, in the ultraviolet.', what_en: 'This is the band that makes dust over Thailand\'s pale soils visible at all. A bright surface still biases the retrieval upward.' },
      { id: 'omiSsa', th: 'Single Scattering Albedo (จำแนกควันจากการเผา vs ละอองซัลเฟต/ทะเล)', en: 'Single Scattering Albedo (smoke vs sulphate/sea-salt)', on: false, kind: 'sat', note_th: 'การกระจายแสงครั้งเดียว (SSA)', note_en: 'ฝุ่นสะท้อนแสงมาก (ซัลเฟต เกลือทะเล) หรือดูดกลืนมาก (ควัน) — นี่คือคำตอบจากดาวเทียมที่ใกล้เคียงที่สุดของคำถามว่า \'เป็นควันไหม\'', what_th: 'Single scattering albedo — how much light a particle reflects rather than absorbs.', what_en: 'The closest thing a satellite gives to \'is it smoke\'. It is a particle property, not a concentration: a high SSA over a city is normal.' },
      { id: 'ompsPyroCb', th: 'ดัชนีควัน PyroCb (ชั้นบรรยากาศบน — ควันข้ามพรมแดน)', en: 'PyroCb smoke index (upper-air — cross-border smoke transport)', on: false, kind: 'sat', note_th: 'ดัชนีควัน PyroCb (ชั้นบรรยากาศบน)', note_en: 'ควันที่ลอยขึ้นสูงแล้ว เดินทางได้หลายร้อยกิโลเมตรในหนึ่งวัน และอาจกลับมาถึงเราบนลมคนละทิศ', what_th: 'Pyro-cumulonimbus smoke — smoke that has risen into the upper troposphere.', what_en: 'High smoke travels far and fast. It tells you where the plume is, never how much is at your feet.' },
      { id: 'viirsAerosolType', th: 'ชนิดละอองลอย VIIRS (ควัน vs ฝุ่น vs ละอองเกลือทะเล)', en: 'VIIRS aerosol type (smoke vs dust vs sea-salt)', on: false, kind: 'sat', note_th: 'ชนิดละอองลอย VIIRS (ควัน / ฝุ่น / เกลือทะเล)', note_en: 'ชั้นเดียวในรายการนี้ที่ตอบว่า \'อะไร\' ไม่ใช่แค่ \'เท่าไร\' — ทุกพิกเซลถูกจัดเป็นฝุ่น ควัน หรือเกลือทะเล', what_th: 'VIIRS aerosol type — each pixel classified as dust, smoke or sea salt.', what_en: 'The only layer here that answers what the particles ARE. Deep Blue needs clear sky, so in the wet season most pixels are empty and it looks broken when it is merely occluded.' },
      { id: 'co', th: 'คาร์บอนมอนอกไซด์ (ควันไฟที่ลอยมา)', en: 'Carbon monoxide (transported smoke)', on: false, kind: 'sat', note_th: 'คาร์บอนมอนอกไซด์ (ควันที่เดินทางมาไกล)', note_en: 'CO เสถียรกว่า PM ประมาณพันเท่า จึงลอยไกลมาก — ใช้ตามหลังว่าควันนี้มาจากไหนและเดินทางมานานแค่ไหน', what_th: 'Carbon monoxide — a smoke tracer that travels for days.', what_en: 'Reactive a thousand times more slowly than particulate, so it is a good origin tracer and a bad concentration measure.' },
      { id: 'airsDust', th: 'AIRS Dust Score (ตรวจฝุ่นจากทะเลทราย/ดิน)', en: 'AIRS Dust Score (desert/soil dust detector)', on: false, kind: 'sat', note_th: 'AIRS Dust Score', note_en: 'เครื่องวัดไมโครเวฟ จึงเห็นฝุ่นได้ทั้งกลางคืนและผ่านเมฆบาง ๆ — ตัวเดียวในรายการที่ยังทำงานตอนที่เครื่องอื่นมองไม่เห็น', what_th: 'AIRS dust score — a microwave sounder.', what_en: 'Works at night and through thin cloud, which is exactly when the optical layers are blank. It is a mineral-dust detector: it ignores smoke.' },
      { id: 'tropomiNo2', th: 'NO₂ ชั้นใกล้พื้น (TROPOMI 5 กม. — ไอเสียการเผาไหม้และการจราจร)', en: 'Tropospheric NO₂ (TROPOMI 5 km — combustion tracer)', on: false, kind: 'sat', note_th: 'NO₂ ชั้นใกล้พื้น ความละเอียด 5 กม.', note_en: 'ร่องรอยของการเผาไหม้ — การจราจร อุตสาหกรรม โรงไฟฟ้า ไม่ใช่ตัววัดฝุ่น และไม่ใช่ค่า PM2.5 วันที่ NO₂ สูงคือวันที่คนจมากและโรงงานทำงาน', what_th: 'Tropospheric NO2 at 5 km — a combustion tracer.', what_en: 'Not a dust measurement and not a PM2.5 one. A high-NO2 day is a traffic-and-industry day, which is a different public-health story from a burning season.' },
      { id: 'ompsNoaa20So2Mid', th: 'OMPS SO₂ กลางบรรยากาศ (ภูเขาไฟ Indone./ข้ามพรมแดน)', en: 'OMPS SO₂ mid-tropo (volcanic / cross-border gas)', on: false, kind: 'sat', note_th: 'SO₂ กลางชั้นบรรยากาศ', note_en: 'SO₂ จากภูเขาไฟลอยสูงก่อนถูกลมพัดกระจาย ภูเขาไฟอินโดนีเซียทะลุถึงน่านฟ้าไทยทุกไม่กี่ปี ให้หมอกที่หน้าตาเหมือนควันแต่เป็นแก๊ส', what_th: 'SO2 in the mid-troposphere — volcanic plumes.', what_en: 'A gas, not a particle. It can look exactly like smoke and is chemically unrelated to it, which is the whole point of plotting it.' },
      { id: 'ompsNoaa20So2Lower', th: 'OMPS SO₂ ระดับพื้น (มลพิษอุตสาหกรรม)', en: 'OMPS SO₂ boundary-layer (industrial pollution)', on: false, kind: 'sat', note_th: 'SO₂ ระดับพื้น (มลพิษอุตสาหกรรม)', note_en: 'SO₂ ที่อยู่ใกล้พื้น — อุตสาหกรรม และภูเขาไฟที่ยังไม่ลอยสูง ผลต่างของสองชั้นนี้คือความสูงของแก๊ส', what_th: 'SO2 in the boundary layer — industrial and low-lying volcanic sources.', what_en: 'Compare it against the mid-troposphere layer to infer how high the gas has risen. Neither layer measures particulate.' },
      { id: 'nightlights', th: 'แสงไฟกลางคืน (เผากลางคืน/ฟุ้งกระจาย)', en: 'Night lights (night burning / haze glow)', on: false, kind: 'sat', note_th: 'แสงไฟกลางคืน', note_en: 'การเผากลางคืนทิ้งร่องรอยที่ชั้นละอองลอยในตอนกลางวันมองไม่เห็น และถ้าเห็นฟ้าเรืองสีส้ม นั่นแปลว่ามีคนเห็นมันด้วยตา', what_th: 'VIIRS night lights — night burning.', what_en: 'Brightness is a proxy for population as much as for burning, so a city glows for reasons that have nothing to do with fire.' },
      { id: 'gsmap', th: 'GSMaP/GPM ฝนดาวเทียม', en: 'GSMaP/GPM rain', on: false, kind: 'sat', note_th: 'ฝนจากดาวเทียม GSMaP/GPM', note_en: 'ไม่ใช่คุณภาพอากาศโดยตรง แต่ฝนคือสิ่งเดียวที่กวาดอนุภาคออกได้จริง ๆ นี่คือเหตุผลที่ระบบล้างฝุ่นด้วยฝนมีอยู่', what_th: 'GSMaP/GPM precipitation, half-hourly.', what_en: 'Not an air-quality layer. It is here because rain is the only reliable washout mechanism, and the washout engine depends on it.' },
      { id: 'himawari', th: 'Himawari-9 เมฆ IR', en: 'Himawari-9 IR', on: false, kind: 'sat', note_th: 'เมฆอินฟราเรด Himawari-9', note_en: 'ตัวตามติดพายุ และเป็นวิธีที่ชัดที่สุดในการดูว่าพลังควันกระจายไปถึงไหน', what_th: 'Himawari-9 infrared cloud tops.', what_en: 'A cloud-top product. A clear night-time frame is normal — it is a thermal infrared band, not a visible one.' },
      { id: 'modis', th: 'MODIS ภาพจริง', en: 'MODIS true colour', on: false, kind: 'sat', note_th: 'ภาพสีจริง MODIS', note_en: 'ชั้นที่ให้คุณมองแผนที่แทนการอ่านตารางสี', what_th: 'MODIS true colour.', what_en: 'Nothing is measured by it. It is the layer that lets you check whether the other layers are telling the truth about a place you know.' },
      { id: 'radar', th: 'เรดาร์ฝน', en: 'rain radar', on: true, kind: 'radar', note_th: 'เรดาร์ฝนประเทศไทย', note_en: 'วนฝนจริงที่กำลังตก อัปเดตทุก 10 นาที', what_th: 'Thai rain radar loop.', what_en: 'Shows rain, not pollution. Useful for planning, not for reading the air.' },
    ],
  },
  {
    id: 'ground',
    th: 'ข้อมูลภาคสนาม',
    en: 'GROUND OBSERVATIONS',
    layers: [
      { id: 'air', th: 'สถานีคุณภาพอากาศ (Air4Thai)', en: 'AQ stations (Air4Thai)', on: true, note_th: 'สถานีตรวจวัดคุณภาพอากาศ PCD (Air4Thai)', note_en: 'เครือข่ายมาตรฐานรายชั่วโมงราว 170 สถานี นี่คือข้อมูลที่ทางการ ส่วนอื่นเป็นเพียงเบาะแสว่าสถานีเหล่านี้กำลังบอกอะไร', what_th: 'PCD Air4Thai regulatory stations — hourly.', what_en: 'The authority. The interpolated layers around it are an estimate of what these stations say, and where the two disagree the station wins.' },
      { id: 'visibility', th: 'ระยะมองสนามบิน (METAR — สัญญาณฝุ่นเร็วที่สุด ทุก 30 นาที)', en: 'Airport visibility (METAR — fastest dust signal, 30-min)', on: false, kind: 'visibility', note_th: 'ระยะมองสนามบิน (METAR ทุก 30 นาที)', note_en: 'วัดการลดทอดแสงโดยตรงตามทฤษฎี Koschmieder และเป็นสัญญาณฝุ่นที่เร็วที่สุดในระบบ — ระยะมองลดลงไม่เท่ากับมีฝุ่น เพราะฝนและหมอกก็ทำได้เช่นกัน การ์ดจะระบุสาเหตุให้ทุกครั้ง', what_th: 'Airport visibility every 30 minutes — a direct measurement of light extinction.', what_en: 'The fastest dust signal here, and NOT a dust measurement on its own: a 5 km reading means rain just as often as dust. The card names the cause, and records no aerosol figure unless the METAR itself does.' },
      { id: 'aeronet', th: 'สถานี AERONET (ภาคพื้นดิน — สอบเทียบ AOD ดาวเทียม)', en: 'AERONET stations (ground truth — satellite AOD calibration)', on: false, kind: 'aeronet', note_th: 'สถานี AERONET (ค่าอ้างอิงภาคพื้นดิน)', note_en: 'เครื่องวัด AOD ด้วยแสงอาทิตย์จากพื้นดิน ด้วยฟิสิกส์ชุดเดียวกับที่ดาวเทียมอนุมาน — นี่คือวิธีตรวจงานชั้นดาวเทียม', what_th: 'AERONET sunphotometers — ground-truth AOD.', what_en: 'The calibration reference for the satellite AOD layers. AERONET is sparse and clear-sky only: a blank reading is missing data, never a clean-air finding.' },
      { id: 'citizen', th: 'รายงานหมอกควันจากผู้ใช้และสื่อ (ผูกพิกัดอัตโนมัติ)', en: 'Citizen & press haze reports (auto-pinned)', on: false, kind: 'citizen', note_th: 'รายงานหมอกควันจากผู้ใช้และสื่อ', note_en: 'ผูกพิกัดอัตโนมัติจากชื่อสถานที่ในพาดหัว ทุกรายการระบุแหล่งที่มาและลิงก์ต้นฉบับ — มีประโยชน์เพราะข่าวเคลื่อนที่ก่อนเครื่องมือใด ๆ', what_th: 'Credited news and social haze reports, pinned by place name.', what_en: 'A report is not a measurement, and a province pin is a centroid rather than a reported location. Read the precision on each pin.' },
      { id: 'heatmap', th: 'ฮีทแมป PM2.5', en: 'PM2.5 heat map', on: false, note_th: 'แผนที่ความร้อน PM2.5', note_en: 'แสดงรูปร่างของทั้งภูมิภาค ไม่ใช่ค่าที่วัด — สถานีข้างใต้คือข้อมูลจริง', what_th: 'PM2.5 interpolated into a surface.', what_en: 'A shape, not a measurement. Interpolation invents values between stations, so do not read a number off this that no station reported.' },
      { id: 'rain', th: 'ฝนสะสม 24 ชม. (ล้างฝุ่น)', en: 'rain 24h (washout)', on: false, note_th: 'ฝน 24 ชั่วโมง', note_en: 'ฝนคือการล้างฝุ่น — ยิ่งฝนตกมาก ฝุ่นยิ่งถูกกวาดออก', what_th: '24-hour rain.', what_en: 'Rain now does not mean clean air later — re-entrainment and regional transport can bring it straight back.' },
      { id: 'newsfire', th: 'ข่าวไฟป่า/มลพิษ', en: 'fire & pollution news', on: true, note_th: 'ข่าวไฟไหม้และมลพิษใกล้คุณ', note_en: 'สิ่งที่คนรายงานว่าเกิดขึ้น ช่วยจับบริเวณที่เครื่องมือยังไม่ทัน', what_th: 'Fire and pollution headlines near you.', what_en: 'Reporting lags and over-reports. It is a prompt to look, not a finding.' },
      { id: 'cctv', th: 'กล้อง CCTV (ภาพสด · สีขอบ = PM2.5 สถานี · จุดมุม = ภาพดูควัน/หมอก)', en: 'CCTV (live · ring = station PM2.5 · corner = picture looks smoky/foggy)', on: false, note_th: 'กล้อง 1,369 ตัว (จับคู่กับสถานีใกล้สุด)', note_en: 'วงแหวนคือค่า PM2.5 ของสถานี เครื่องหมายมุมแปลว่าภาพเองดูมีควันหรือมีหมอก — คะแนนจากภาพเป็นเพียงตัวช่วยคัดกรอง ยังไม่ใช่ค่าความเข้มข้น', what_th: '1,369 cameras paired to their nearest station, each frame analysed for haze.', what_en: 'The RING is the station\'s PM2.5 — that is a measurement. The CORNER MARK and the picture score come from the image and are a triage aid only, never calibrated to µg/m³. Most cameras serve no readable frame at all; the wall says why on each card.' },
    ],
  },
  {
    id: 'analysis',
    th: 'วิเคราะห์ · อ้างอิง',
    en: 'ANALYSIS · REFERENCE',
    layers: [
      { id: 'risk', th: 'ชั้นความเสี่ยงจังหวัด', en: 'province risk', on: true, note_th: 'คะแนนเฝ้าระวังรายจังหวัด (0–100)', note_en: 'คะแนนรวมหลายปัจจัยของแต่ละจังหวัด ใช้เรียงลำดับว่าที่ไหนควรสนใจก่อน', what_th: 'Province watch score, 0–100.', what_en: 'A composite for RANKING provinces, not a concentration. A low score is a reason to look elsewhere, not a guarantee.' },
      { id: 'drought', th: 'ความเสี่ยงภัยแล้งรายสัปดาห์ (GISTDA)', en: 'weekly drought risk (GISTDA)', on: false, note_th: 'ความเสี่ยงภัยแล้งรายสัปดาห์ (GISTDA)', note_en: 'ดินแห้งและน้ำน้อยคือสิ่งที่ทำให้ฤดูไฟหน้าปีหน้าแย่กว่าเดิม', what_th: 'Weekly drought risk from GISTDA.', what_en: 'A seasonal leading indicator measured in weeks. It says nothing about today\'s air.' },
      { id: 'burnscar', th: 'รอยเผาภาคเกษตร ฤดูล่าสุด (เหนือ+กลาง)', en: 'Agri burn scars, last season (north+central)', on: false, note_th: 'ร่องรอยการเผาเกษตรฤดูผ่านมา', note_en: 'แผนที่ของเชื้อเพลิงที่ยังอยู่ — ยิ่งมีเชื้อเพลิงเยอะ ฤดูไฟหน้าถึงหนัก', what_th: 'Agricultural burn scars from last season.', what_en: 'Historical. A scar says where fuel was, not that anything will be lit there this year.' },
      { id: 'boundaries', th: 'ขอบเขตจังหวัด (data.go.th)', en: 'province boundaries (DOPA)', on: false, note_th: 'เขตแดนจังหวัด (กรมการปกครอง)', note_en: 'เส้นอ้างอิง ไม่ใช่ข้อมูล', what_th: 'Province boundaries (DOPA).', what_en: 'Reference geometry. Nothing here is a measurement.' },
      { id: 'osmbuild', th: 'อาคารพื้นที่เสี่ยง OSM', en: 'OSM buildings in risk areas', on: false, note_th: 'อาคารในพื้นที่เสี่ยง (OSM)', note_en: 'ช่วยคิดว่าใครอยู่ใกล้พื้นที่เสี่ยง ไม่ใช่ค่ามลพิษ', what_th: 'OSM buildings in high-risk areas.', what_en: 'Context for judging exposure. A building has no air quality of its own; it is only where a person might be standing.' },
    ],
  },
]

/** Flat list for toggle lookup. */
export function allLayerToggles() {
  return LAYER_GROUPS.flatMap((g) => g.layers)
}
