// Focus areas — AirDash's "cities" manifest. Adding a dust-prone place is ONE
// row here: give it a center, zoom, and (optionally) the province name. The
// frontend renders a focus switcher that flies the map and scopes the panels;
// no per-city code. Everything else (stations, forecast, score) is filtered
// live from the national data by province/region.
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
    id: 'chiangmai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai',
    center: [18.79, 98.99], zoom: 10, bbox: [18.4, 98.6, 19.2, 99.4],
    province_th: 'เชียงใหม่', reaches: [],
    blurb_th: 'แอ่งเชียงใหม่-ลำพูน — หมอกควันไฟป่า/การเผา ติดอันดับโลกทุกฤดูแล้ง',
    blurb_en: 'Chiang Mai basin — world-ranking burning-season haze every dry season',
  },
  {
    id: 'chiangrai', name_th: 'เชียงราย', name_en: 'Chiang Rai',
    center: [19.91, 99.83], zoom: 10, bbox: [19.5, 99.3, 20.4, 100.4],
    province_th: 'เชียงราย', reaches: [],
    blurb_th: 'ชายแดนสามเหลี่ยมทองคำ — รับควันข้ามแดนจากเมียนมา/ลาว',
    blurb_en: 'Golden Triangle border — transboundary smoke from Myanmar/Laos',
  },
  {
    id: 'maehongson', name_th: 'แม่ฮ่องสอน', name_en: 'Mae Hong Son',
    center: [19.30, 97.97], zoom: 10, bbox: [18.9, 97.6, 19.7, 98.4],
    province_th: 'แม่ฮ่องสอน', reaches: [],
    blurb_th: 'หุบเขาปิดล้อม — ควันสะสมหนาแน่นที่สุดของประเทศช่วงฤดูเผา',
    blurb_en: 'Enclosed mountain valleys — the deepest smoke pooling in the country',
  },
  {
    id: 'bangkok', name_th: 'กรุงเทพฯ', name_en: 'Bangkok',
    center: [13.74, 100.52], zoom: 10, bbox: [13.4, 100.2, 14.1, 100.9],
    province_th: 'กรุงเทพมหานคร', reaches: [],
    blurb_th: 'มหานคร — ฝุ่นจราจร + อุตสาหกรรม + อากาศปิดฤดูหนาว',
    blurb_en: 'The metropolis — traffic + industry + winter inversion smog',
  },
  {
    id: 'khonkaen', name_th: 'ขอนแก่น', name_en: 'Khon Kaen',
    center: [16.44, 102.83], zoom: 10, bbox: [16.0, 102.4, 16.9, 103.3],
    province_th: 'ขอนแก่น', reaches: [],
    blurb_th: 'ศูนย์กลางอีสาน — การเผาตอซังอ้อย/นาข้าวรอบเมือง',
    blurb_en: 'Isan hub — sugarcane and rice-stubble burning around the city',
  },
  {
    id: 'saraburi', name_th: 'สระบุรี · หน้าพระลาน', name_en: 'Saraburi · Na Phra Lan',
    center: [14.68, 100.91], zoom: 11, bbox: [14.4, 100.6, 15.0, 101.3],
    province_th: 'สระบุรี', reaches: [],
    blurb_th: 'เขตโรงโม่หิน-ปูนซีเมนต์ — PM10 สูงสุดของประเทศต่อเนื่องหลายปี',
    blurb_en: "Quarry & cement belt — the country's worst PM10 for years running",
  },
  {
    id: 'hatyai', name_th: 'หาดใหญ่ · สงขลา', name_en: 'Hat Yai · Songkhla',
    center: [7.02, 100.47], zoom: 11, bbox: [6.6, 100.1, 7.4, 100.9],
    province_th: 'สงขลา', reaches: [],
    blurb_th: 'ภาคใต้ — รับหมอกควันข้ามแดนจากไฟป่าพรุอินโดนีเซียบางปี',
    blurb_en: 'The South — episodic transboundary haze from Indonesian peat fires',
  },
]

export const FOCUS_BY_ID = new Map(FOCUS_AREAS.map((f) => [f.id, f]))
