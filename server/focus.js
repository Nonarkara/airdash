// Focus areas — AirDash's "cities" manifest. Adding a dust-prone place is ONE
// row here: give it a center, zoom, and (optionally) the province name. The
// frontend renders a focus switcher that flies the map and scopes the panels;
// no per-city code. Everything else (stations, forecast, score) is filtered
// live from the national data by province/region.
//
// center is [lat, lng] (Leaflet order). bbox is [south, west, north, east].
//
// v2 enrichment — each focus area now carries rich metadata so the header
// plate can morph into a *city dashboard* with identity, context, and
// city-specific resources. All fields are optional; the frontend degrades
// gracefully when a field is absent.
//
//   geography    — 'basin' | 'plain' | 'coastal' | 'metro' | 'valley' | 'border'
//                  drives the city "personality" accent SVG in the plate.
//   accent_svg   — inline SVG path data for the city's signature silhouette
//                  (mountain range, grid, wave, etc.). Rendered at low opacity
//                  behind the city name. null = no accent.
//   hotlines     — city-specific hotlines beyond the national 1650/1422/1669.
//   custom_links — [{label_th, label_en, url}] for local AQ portals, province
//                  websites, or relevant official resources.
//   seasonal_note_th/en — what to expect during dust season in this place.
//   population   — approximate, for context in the city plate.
//   region_code  — 'north' | 'central' | 'northeast' | 'south' | 'bangkok'
//                  for grouping and regional filtering.

export const FOCUS_AREAS = [
  {
    id: 'thailand', name_th: 'ทั้งประเทศ', name_en: 'All Thailand',
    center: [13.2, 101.0], zoom: 6, bbox: [5.5, 97.3, 20.5, 105.7],
    province_th: null, reaches: [],
    blurb_th: 'ภาพรวมทั้งประเทศ', blurb_en: 'National overview',
    geography: null, accent_svg: null, population: null, region_code: null,
    hotlines: [], custom_links: [], seasonal_note_th: null, seasonal_note_en: null,
  },
  {
    id: 'chiangmai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai',
    center: [18.79, 98.99], zoom: 10, bbox: [18.4, 98.6, 19.2, 99.4],
    province_th: 'เชียงใหม่', reaches: [],
    blurb_th: 'แอ่งเชียงใหม่-ลำพูน — หมอกควันไฟป่า/การเผา ติดอันดับโลกทุกฤดูแล้ง',
    blurb_en: 'Chiang Mai basin — world-ranking burning-season haze every dry season',
    geography: 'basin', population: 1_800_000, region_code: 'north',
    accent_svg: 'M0 38 L8 22 L16 30 L26 12 L36 26 L46 18 L56 28 L66 14 L80 38 Z',
    hotlines: [
      { num: '053-112-114', label_th: 'ศูนย์ป้องกันและแก้ปัญหามลพิษ ภาคเหนือตอนบน', label_en: 'Upper Northern Pollution Response Center' },
    ],
    custom_links: [
      { label_th: 'สำนักงานเขตพื้นที่อุตุนิยมวิทยา ภาคเหนือตอนบน', label_en: 'Upper Northern Meteorological Center', url: 'https://www.tmd.go.th' },
      { label_th: 'ศูนย์เฝ้าระวังและเตือนภัยพิบัติ จ.เชียงใหม่', label_en: 'Chiang Mai Disaster Warning Center', url: 'https://www.chiangmai.go.th' },
    ],
    seasonal_note_th: 'กุมภาพันธ์–เมษายน: ชั้นผกผัน + ไฟป่า + การเผาทำให้ PM2.5 พุ่งเป็นอันดับต้นของโลกซ้ำแล้วซ้ำเล่า คาดว่าจะรุนแรงที่สุดในช่วงเดือนมีนาคม',
    seasonal_note_en: 'Feb–Apr: temperature inversions + wildfires + agricultural burning push PM2.5 to world-top rankings repeatedly. March is typically the worst month.',
  },
  {
    id: 'chiangrai', name_th: 'เชียงราย', name_en: 'Chiang Rai',
    center: [19.91, 99.83], zoom: 10, bbox: [19.5, 99.3, 20.4, 100.4],
    province_th: 'เชียงราย', reaches: [],
    blurb_th: 'ชายแดนสามเหลี่ยมทองคำ — รับควันข้ามแดนจากเมียนมา/ลาว',
    blurb_en: 'Golden Triangle border — transboundary smoke from Myanmar/Laos',
    geography: 'border', population: 1_300_000, region_code: 'north',
    accent_svg: 'M0 35 L10 28 L20 32 L30 24 L40 30 L50 22 L60 28 L70 20 L80 32 Z',
    hotlines: [],
    custom_links: [
      { label_th: 'จังหวัดเชียงราย', label_en: 'Chiang Rai Province', url: 'https://www.chiangrai.go.th' },
    ],
    seasonal_note_th: 'ควันข้ามแดนจากการเผาป่าในเมียนมาและลาวพัดเข้ามาในช่วงฤดูแล้ง โดยเฉพาะกุมภาพันธ์–เมษายน',
    seasonal_note_en: 'Transboundary smoke from forest burning in Myanmar and Laos blows in during the dry season, especially Feb–Apr.',
  },
  {
    id: 'maehongson', name_th: 'แม่ฮ่องสอน', name_en: 'Mae Hong Son',
    center: [19.30, 97.97], zoom: 10, bbox: [18.9, 97.6, 19.7, 98.4],
    province_th: 'แม่ฮ่องสอน', reaches: [],
    blurb_th: 'หุบเขาปิดล้อม — ควันสะสมหนาแน่นที่สุดของประเทศช่วงฤดูเผา',
    blurb_en: 'Enclosed mountain valleys — the deepest smoke pooling in the country',
    geography: 'valley', population: 250_000, region_code: 'north',
    accent_svg: 'M0 40 L7 15 L14 32 L22 8 L30 28 L38 12 L46 30 L54 6 L62 26 L70 16 L80 40 Z',
    hotlines: [],
    custom_links: [
      { label_th: 'จังหวัดแม่ฮ่องสอน', label_en: 'Mae Hong Son Province', url: 'https://www.maehongson.go.th' },
    ],
    seasonal_note_th: 'ภูมิประเทศหุบเขาปิดล้อมทำให้ควันจากไฟป่าและการเผาสะสมไม่ระบาย มักเป็นจังหวัดที่ PM2.5 สูงที่สุดของประเทศในช่วงมีนาคม–เมษายน',
    seasonal_note_en: 'The enclosed valley terrain traps wildfire and burning smoke with no dispersion — frequently the highest PM2.5 province in Thailand during Mar–Apr.',
  },
  {
    id: 'bangkok', name_th: 'กรุงเทพฯ', name_en: 'Bangkok',
    center: [13.74, 100.52], zoom: 10, bbox: [13.4, 100.2, 14.1, 100.9],
    province_th: 'กรุงเทพมหานคร', reaches: [],
    blurb_th: 'มหานคร — ฝุ่นจราจร + อุตสาหกรรม + อากาศปิดฤดูหนาว',
    blurb_en: 'The metropolis — traffic + industry + winter inversion smog',
    geography: 'metro', population: 10_500_000, region_code: 'bangkok',
    accent_svg: 'M0 40 L0 20 L12 20 L12 8 L24 8 L24 20 L36 20 L36 8 L48 8 L48 20 L60 20 L60 8 L72 8 L72 20 L80 20 L80 40 Z',
    hotlines: [
      { num: '1555', label_th: 'ศูนย์รับแจ้งมลพิษ กรุงเทพมหานคร', label_en: 'Bangkok Pollution Hotline' },
    ],
    custom_links: [
      { label_th: 'กรมควบคุมมลพิษ (กค.) — สถานี BDMS', label_en: 'PCD Air4Thai Bangkok Stations', url: 'https://air4thai.pcd.go.th' },
      { label_th: 'Air BKK — แอปพลิเคชัน BMA', label_en: 'Air BKK — BMA Air Quality App', url: 'https://airbkk.com' },
      { label_th: 'กรุงเทพมหานคร', label_en: 'Bangkok Metropolitan Administration', url: 'https://www.bangkok.go.th' },
    ],
    seasonal_note_th: 'พฤศจิกายน–กุมภาพันธ์: อากาศเย็น + ชั้นผกผัน + จราจรทำให้ PM2.5 สะสมในตอนเช้ามืด โดยเฉพาะ 6:00–9:00 น.',
    seasonal_note_en: 'Nov–Feb: cool air + temperature inversions + traffic cause morning PM2.5 peaks, especially 6–9 AM.',
  },
  {
    id: 'khonkaen', name_th: 'ขอนแก่น', name_en: 'Khon Kaen',
    center: [16.44, 102.83], zoom: 10, bbox: [16.0, 102.4, 16.9, 103.3],
    province_th: 'ขอนแก่น', reaches: [],
    blurb_th: 'ศูนย์กลางอีสาน — การเผาตอซังอ้อย/นาข้าวรอบเมือง',
    blurb_en: 'Isan hub — sugarcane and rice-stubble burning around the city',
    geography: 'plain', population: 1_800_000, region_code: 'northeast',
    accent_svg: 'M0 32 L16 32 L32 32 L48 32 L64 32 L80 32 Z',
    hotlines: [],
    custom_links: [
      { label_th: 'จังหวัดขอนแก่น', label_en: 'Khon Kaen Province', url: 'https://www.khonkaen.go.th' },
    ],
    seasonal_note_th: 'มกราคม–มีนาคม: การเผาตอซังอ้อยและนาข้าวบริเวณรอบเมืองเป็นแหล่งฝุ่นหลัก ลมตะวันออกเฉียงเหนือพัดควันเข้าเมือง',
    seasonal_note_en: 'Jan–Mar: sugarcane and rice-stubble burning around the city is the primary dust source. NE winds carry the smoke into the urban area.',
  },
  {
    id: 'saraburi', name_th: 'สระบุรี · หน้าพระลาน', name_en: 'Saraburi · Na Phra Lan',
    center: [14.68, 100.91], zoom: 11, bbox: [14.4, 100.6, 15.0, 101.3],
    province_th: 'สระบุรี', reaches: [],
    blurb_th: 'เขตโรงโม่หิน-ปูนซีเมนต์ — PM10 สูงสุดของประเทศต่อเนื่องหลายปี',
    blurb_en: "Quarry & cement belt — the country's worst PM10 for years running",
    geography: 'valley', population: 600_000, region_code: 'central',
    accent_svg: 'M0 36 L8 28 L16 34 L24 22 L32 30 L40 18 L48 28 L56 20 L64 30 L72 24 L80 36 Z',
    hotlines: [],
    custom_links: [
      { label_th: 'จังหวัดสระบุรี', label_en: 'Saraburi Province', url: 'https://www.saraburi.go.th' },
    ],
    seasonal_note_th: 'ตลอดปี: กิจกรรมโรงโม่หินและโรงงานปูนซีเมนต์ในพื้นที่หน้าพระลานทำให้ PM10 สูงต่อเนื่อง รุนแรงขึ้นในฤดูแล้งเมื่อฝนไม่ชะล้าง',
    seasonal_note_en: 'Year-round: quarrying and cement factories in Na Phra Lan keep PM10 chronically high, worsening in the dry season when there is no rain to wash it out.',
  },
  {
    id: 'hatyai', name_th: 'หาดใหญ่ · สงขลา', name_en: 'Hat Yai · Songkhla',
    center: [7.02, 100.47], zoom: 11, bbox: [6.6, 100.1, 7.4, 100.9],
    province_th: 'สงขลา', reaches: [],
    blurb_th: 'ภาคใต้ — รับหมอกควันข้ามแดนจากไฟป่าพรุอินโดนีเซียบางปี',
    blurb_en: 'The South — episodic transboundary haze from Indonesian peat fires',
    geography: 'coastal', population: 1_500_000, region_code: 'south',
    accent_svg: 'M0 30 Q10 22 20 28 T40 26 T60 28 T80 26 L80 40 L0 40 Z',
    hotlines: [],
    custom_links: [
      { label_th: 'จังหวัดสงขลา', label_en: 'Songkhla Province', url: 'https://www.songkhla.go.th' },
    ],
    seasonal_note_th: 'สิงหาคม–ตุลาคม (บางปี): หมอกควันจากการเผาพรุในอินโดนีเซียพัดข้ามมหาสมุทรเข้าภาคใต้ ขึ้นกับทิศทางลมมรสุมตะวันตกเฉียงใต้',
    seasonal_note_en: 'Aug–Oct (some years): peat-fire haze from Indonesia crosses the ocean into southern Thailand, depending on the SW monsoon wind direction.',
  },
]

export const FOCUS_BY_ID = new Map(FOCUS_AREAS.map((f) => [f.id, f]))