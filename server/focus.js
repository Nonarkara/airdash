// Focus areas — FloodDash's "cities" manifest, learned from unl-city-hub's
// CityConfig pattern. Adding a flood-prone place is ONE row here: give it a
// center, zoom, and (optionally) the province name and river reaches that
// belong to it. The frontend renders a focus switcher that flies the map and
// scopes the panels; no per-city code. Everything else (stations, rain, risk)
// is filtered live from the national data by province/region — like a
// "lite-tier" city that reuses the global pipelines.
//
// center is [lat, lng] (Leaflet order). bbox is [south, west, north, east].

export const FOCUS_AREAS = [
  {
    id: 'thailand', name_th: 'ทั้งประเทศ', name_en: 'All Thailand',
    center: [13.2, 101.0], zoom: 6, bbox: [5.5, 97.3, 20.5, 105.7],
    province_th: null, reaches: [],
    blurb_th: 'ภาพรวมทั้งประเทศ', blurb_en: 'National overview',
  },
  {
    id: 'hatyai', name_th: 'หาดใหญ่ · สงขลา', name_en: 'Hat Yai · Songkhla',
    center: [7.02, 100.47], zoom: 11, bbox: [6.6, 100.1, 7.4, 100.9],
    province_th: 'สงขลา', reaches: ['utaphao_hatyai'],
    blurb_th: 'ลุ่มคลองอู่ตะเภา — น้ำมาเร็ว ท่วมฉับพลัน เหตุการณ์ปี 2568',
    blurb_en: 'Khlong U-Taphao basin — flashy, fast-rising; the 2025 disaster',
  },
  {
    id: 'bangkok', name_th: 'กรุงเทพฯ', name_en: 'Bangkok',
    center: [13.74, 100.52], zoom: 10, bbox: [13.4, 100.2, 14.1, 100.9],
    province_th: 'กรุงเทพมหานคร', reaches: ['cp_bangkok'],
    blurb_th: 'ปลายลุ่มเจ้าพระยา — รับน้ำเหนือ + น้ำทะเลหนุน',
    blurb_en: 'Chao Phraya outlet — northern runoff meets tidal backwater',
  },
  {
    id: 'ayutthaya', name_th: 'อยุธยา', name_en: 'Ayutthaya',
    center: [14.35, 100.55], zoom: 10, bbox: [14.0, 100.2, 14.7, 100.9],
    province_th: 'พระนครศรีอยุธยา', reaches: ['cp_ayutthaya'],
    blurb_th: 'เมืองมรดกโลก — จมบาดาลปี 2554',
    blurb_en: 'World Heritage city — submerged in 2011',
  },
  {
    id: 'nakhonsawan', name_th: 'นครสวรรค์', name_en: 'Nakhon Sawan',
    center: [15.6, 100.1], zoom: 9, bbox: [15.2, 99.6, 16.1, 100.6],
    province_th: 'นครสวรรค์', reaches: ['cp_nakhonsawan', 'ping_tak', 'nan_phitsanulok', 'yom_sukhothai'],
    blurb_th: 'จุดบรรจบปิง-วัง-ยม-น่าน — ต้นกำเนิดแม่น้ำเจ้าพระยา',
    blurb_en: 'Ping–Wang–Yom–Nan confluence — birthplace of the Chao Phraya',
  },
  {
    id: 'chiangmai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai',
    center: [18.79, 98.99], zoom: 10, bbox: [18.4, 98.6, 19.2, 99.4],
    province_th: 'เชียงใหม่', reaches: ['ping_tak'],
    blurb_th: 'ลุ่มน้ำปิงตอนบน — น้ำป่าจากดอย',
    blurb_en: 'Upper Ping basin — mountain flash floods',
  },
  {
    id: 'ubon', name_th: 'อุบลราชธานี', name_en: 'Ubon Ratchathani',
    center: [15.24, 104.85], zoom: 9, bbox: [14.8, 104.3, 15.7, 105.4],
    province_th: 'อุบลราชธานี', reaches: ['mun_ubon', 'chi_mahasarakham', 'mun_korat'],
    blurb_th: 'จุดบรรจบชี-มูล ก่อนลงโขง — ท่วมใหญ่ปี 2562',
    blurb_en: 'Chi–Mun outlet to the Mekong — major flood in 2019',
  },
  {
    id: 'suratthani', name_th: 'สุราษฎร์ธานี', name_en: 'Surat Thani',
    center: [9.14, 99.33], zoom: 9, bbox: [8.7, 98.9, 9.6, 99.8],
    province_th: 'สุราษฎร์ธานี', reaches: ['tapi_surat'],
    blurb_th: 'ลุ่มน้ำตาปี — แม่น้ำใหญ่สุดของภาคใต้',
    blurb_en: "Tapi basin — the South's largest river",
  },
]

export const FOCUS_BY_ID = new Map(FOCUS_AREAS.map((f) => [f.id, f]))
