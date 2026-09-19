// AirDash API reference — the tab that lets someone else build on this.
//
// Ported from the FloodDash twin (public/js/panels/apidocs.js there,
// 2026-09-08) on 2026-09-16, the same day AirDash first sent a CORS header:
// until then the API existed, was open, and could not be read from any
// other origin — and the only way to discover it was the source or the
// network tab. The rules travel with the port:
//   1. Every endpoint listed here EXISTS (scripts/check-api-docs.mjs fails
//      the build on a documented route that is not in server/api.js, and on
//      a public route that is not documented here).
//   2. Every parameter named here is one the handler actually reads.
//   3. The honesty contract travels with the data.
//   4. No invented versioning, no invented SLA, no invented auth scheme.
import { store, on } from '../state.js?v=2.4.33'
import { escapeHtml } from '../fmt.js?v=2.4.33'

function tr(th, en) { return store.lang === 'th' ? th : en }

const BASE = 'https://air.nonarkara.org'
const FLOOD = 'https://flood.nonarkara.org'

// ── Endpoint catalogue ─────────────────────────────────────────────────────
// group  — how a builder thinks about the job, not how the server is filed
// path   — exact route            params — [name, required, description]
// note   — the caveat that stops a wrong integration
function GROUPS() {
  return [
    {
      id: 'start', icon: '⚡', title_th: 'เริ่มที่นี่ — ภาพรวมทั้งประเทศ', title_en: 'Start here — the whole country',
      blurb_th: 'สามปลายทางที่แดชบอร์ดส่วนใหญ่ต้องการ: สแนปช็อตทั้งระบบ คะแนนเฝ้าระวังรายจังหวัด และ Twin API สำหรับต่อกับ FloodDash',
      blurb_en: 'The three endpoints most dashboards need: the whole-system snapshot, the per-province watch score, and the Twin API for joining with FloodDash.',
      rows: [
        { path: '/api/snapshot', cache: tr('6 วินาที', '6 s'),
          th: 'ทุกอย่างในหนึ่งคำขอ: สถานี ค่าล่าสุดทุกตัวชี้วัด ความเสี่ยงรายจังหวัด ข่าว การแจ้งเตือน สถานะแหล่งข้อมูล (~1 MB, gzip)',
          en: 'Everything in one request: stations, latest readings for every metric, per-province risk, news, alerts, source health (~1 MB, gzipped).',
          note_th: 'ใหญ่ — ถ้าต้องการแค่จังหวัดให้ใช้ /api/risk; ถ้าต้องการสด ให้ใช้ /api/tap แทนการเรียกซ้ำ',
          note_en: 'Large — use /api/risk if you only need provinces; use /api/tap instead of re-polling for live updates.' },
        { path: '/api/risk', cache: tr('1 นาที', '1 min'),
          th: 'คะแนนเฝ้าระวังอากาศ 0–100 ทั้ง 77 จังหวัด พร้อมแบนด์ การ์ดคำแนะนำ (ระดับ หัวข้อ เหตุผล การกระทำ) พยากรณ์ 24/48 ชม. การชะล้างด้วยฝน และ Danger Score',
          en: 'Air Watch Score 0–100 for all 77 provinces with band, the verdict card (level, headline, reasons, action), 24/48 h forecast, rain washout and the Danger Score.',
          note_th: 'reasons ใน card คือหลักฐานที่ทำให้ได้แบนด์นี้ — แสดงต่อผู้ใช้ อย่าแสดงแค่ตัวเลข · flood คือคำตัดสินน้ำท่วมของจังหวัดเดียวกันจาก FloodDash (null เมื่อไม่มี)',
          note_en: 'card.reasons is the evidence behind the band — show it to people, never the number alone · flood is the same province\'s flood verdict relayed from FloodDash (null when absent).' },
        { path: '/api/twin', cache: tr('30 วินาที', '30 s'),
          th: 'Twin API: สรุปรายจังหวัดแบบกะทัดรัด (code, score, band, level, หัวข้อ+เหตุผลสองภาษา, pm25, aqi, พยากรณ์, washout, danger) รูปแบบเดียวกับ FloodDash เพื่อ join ด้วยรหัสจังหวัด',
          en: 'The Twin API: a compact per-province summary (code, score, band, level, bilingual headline + top reason, pm25, aqi, forecast, washout, danger) in the same shape FloodDash publishes, for joining on province code.',
          note_th: `คู่แฝดอยู่ที่ ${FLOOD}/api/twin — สัญญาข้อมูลอยู่ใน docs/TWIN-API.md ของทั้งสองรีโป`,
          note_en: `The twin lives at ${FLOOD}/api/twin — the contract is docs/TWIN-API.md in both repos.` },
        { path: '/api/weather', cache: tr('1 นาที', '1 min'),
          th: 'อากาศจากกรมอุตุนิยมวิทยาทั้งประเทศ (ผ่านระบบแฝด FloodDash): พยากรณ์ 7 วัน 77 จังหวัด + พัทยา หัวหิน เกาะสมุย หาดใหญ่ และสถานีตรวจอากาศ 125 แห่งราย 3 ชม.',
          en: 'The whole country\'s TMD weather (relayed from the FloodDash twin): the 7-day forecast for 77 provinces + Pattaya, Hua Hin, Ko Samui, Hat Yai, and 125 synoptic stations\' 3-hourly observations.',
          note_th: 'ข้อมูลของกรมอุตุฯ โดยตรง ไม่ใช่ดัชนีของเรา · ต้นทางเดียวกับ flood.nonarkara.org/api/weather',
          note_en: 'TMD\'s own data, not our index · same relay as flood.nonarkara.org/api/weather.' },
        { path: '/api/weather/at',
          th: 'อากาศ ณ จุดหนึ่ง: พยากรณ์ 5 วันของจังหวัด (หรือของพัทยา/หัวหิน/สมุย/หาดใหญ่ในรัศมี 30 กม.) และสถานีตรวจอากาศที่ใกล้ที่สุดพร้อมระยะทางและอายุข้อมูล',
          en: 'Weather at a point: the province\'s 5-day forecast (or a TMD destination\'s when within 30 km) and the nearest synoptic station with distance and age.',
          params: [['lat', true, tr('ละติจูด', 'latitude')], ['lng', true, tr('ลองจิจูด', 'longitude')], ['province', false, tr('รหัส DOPA', 'DOPA code')]], limit: '60/min',
          note_th: 'สถานีไกลกว่า 80 กม. หรือเงียบเกิน 6 ชม. ไม่แสดง — ไม่มีก็บอกว่าไม่มี', note_en: 'A station farther than 80 km or silent >6 h is not shown — absence is stated, never faked.' },
        { path: '/api/skill', cache: tr('1 ชม.', '1 h'), limit: '6/min',
          th: 'วัดผลตนเอง: พยากรณ์ CAMS 24 ชม. และแบนด์คะแนนเฝ้าระวัง จับการข้ามเส้น 37.5 µg/m³ ได้กี่เปอร์เซ็นต์ (POD) เตือนผิดกี่เปอร์เซ็นต์ (FAR) ใน 60 วันล่าสุด — เมื่อเหตุการณ์ไม่พอ ระบบจะบอกว่า "ยังวัดไม่ได้" แทนตัวเลข',
          en: 'Self-measurement: how often the CAMS 24-h forecast and the Air Watch Score band caught a 37.5 µg/m³ crossing (POD) and how often they cried wolf (FAR) over the last 60 days — when there are too few events it says "not measurable yet" instead of a number.',
          note_th: 'บันทึกคะแนนรายชั่วโมงเริ่ม 17 ก.ย. 2569 — ทักษะของคะแนนวัดได้หลัง 14 วันและ 5 เหตุการณ์', note_en: 'Hourly score recording began 17 Sep 2026 — score skill becomes measurable after 14 days and 5 events.' },
        { path: '/api/danger', cache: tr('1 นาที', '1 min'),
          th: 'Danger Score “ออกไปข้างนอกตอนนี้ปลอดภัยไหม” รายจังหวัด: PM2.5 + ความร้อน + ความชื้น + เสียง − ฝน',
          en: 'The right-now Danger Score per province: PM2.5 + heat + humidity + noise − rain.' },
        { path: '/api/health', cache: tr('สด', 'live'),
          th: 'ระบบยังเดินอยู่ไหม: เวอร์ชัน อายุของทุกแหล่งข้อมูล ขนาดฐานข้อมูล จำนวนสตรีมสด',
          en: 'Is the pipeline alive: version, age of every source feed, database size, live-stream count.',
          note_th: 'ดู data_freshness ก่อนเชื่อตัวเลขใด ๆ — ฟีดที่เงียบไม่ใช่อากาศดี',
          note_en: 'Read data_freshness before trusting any number — a silent feed is not clean air.' },
      ],
    },
    {
      id: 'live', icon: '📡', title_th: 'สด — สถานี ค่าล่าสุด และสตรีม', title_en: 'Live — stations, latest readings and the stream',
      rows: [
        { path: '/api/stations', th: 'ค้นสถานีตรวจวัดด้วยชื่อ จังหวัด หรือรหัส', en: 'Find monitoring stations by name, province or code.',
          params: [['q', true, tr('ข้อความค้นหา (ไทยหรืออังกฤษ)', 'search text, Thai or English')]] },
        { path: '/api/cctv/all', th: 'กล้อง CCTV ทั่วประเทศ (GISTDA · iTIC · NST) ที่ตรวจแล้วว่าภาพสดจริง พร้อมค่า PM2.5 ที่ใกล้กล้องที่สุดในฟิลด์ air',
          en: 'Nationwide CCTV catalog (GISTDA · iTIC · NST), health-checked every 30 min; each camera carries `air`, the nearest fresh PM2.5 reading.',
          params: [['live', false, tr('1 = เฉพาะสตรีมที่พิสูจน์แล้วว่าสด', '1 = only streams proven alive')], ['near', false, tr('lat,lng — เรียงตามระยะ', 'lat,lng — sort by distance')], ['radius_km', false, tr('รัศมี (ค่าเริ่มต้น 50)', 'radius (default 50)')], ['limit', false, tr('จำนวนสูงสุดเมื่อใช้ near (ค่าเริ่มต้น 8)', 'max with near (default 8)')]],
          note_th: 'stream_status: live / flaky / down / unknown / embed · กล้องที่สตรีมตายจะถูกซ่อน · ภาพและค่าฝุ่นเป็นข้อมูลอ้างอิง ไม่ใช่ประกาศราชการ', note_en: 'stream_status: live / flaky / down / unknown / embed · dead streams are hidden · pictures and readings are for reference, not an official announcement' },
        { path: '/api/cctv/haze-eyes', th: 'กล้องที่กำลังมองพื้นที่ฝุ่นหนักที่สุดตอนนี้ — เรียงตาม PM2.5 จากมากไปน้อย เลือกเฉพาะกล้องที่ใช้งานได้จริง',
          en: 'The cameras looking at the worst air right now — highest PM2.5 first, only cameras that actually work.',
          params: [['limit', false, tr('จำนวน 1–24 (ค่าเริ่มต้น 12)', 'count 1–24 (default 12)')], ['min_pm25', false, tr('เกณฑ์ PM2.5 ขั้นต่ำ (ค่าเริ่มต้น 25)', 'minimum PM2.5 (default 25)')]] },
        { path: '/api/stations/nearest', th: 'สถานีที่ใกล้จุดที่กำหนดที่สุด พร้อมค่าล่าสุดและระยะทาง', en: 'Nearest stations to a point with their latest reading and distance.',
          params: [['lat', true, tr('ละติจูด', 'latitude')], ['lng', true, tr('ลองจิจูด', 'longitude')], ['limit', false, tr('จำนวน (ค่าเริ่มต้น 5)', 'count (default 5)')]] },
        { path: '/api/series', th: 'อนุกรมเวลารายชั่วโมงของสถานีหนึ่ง ตัวชี้วัดหนึ่ง', en: 'Hourly time series for one station and one metric.',
          params: [['source', true, tr('แหล่ง เช่น air4thai', 'source id, e.g. air4thai')], ['station', true, tr('รหัสสถานี', 'station key')], ['metric', true, tr('เช่น pm25, aqi, o3', 'e.g. pm25, aqi, o3')], ['hours', false, tr('ย้อนหลังกี่ชั่วโมง (ค่าเริ่มต้น 48)', 'look-back hours (default 48)')]],
          note_th: 'obs_time เป็นเวลาไทย (+07:00) — ความสดต้องดูจากค่านี้', note_en: 'obs_time is Thai local time (+07:00) — judge freshness from it.' },
        { path: '/api/series/daily', th: 'ค่าเฉลี่ยรายวันทั้งประเทศ (PM2.5, AQI, ฝน, ลม) ย้อนหลัง', en: 'Daily national aggregates (PM2.5, AQI, rain, wind) over a look-back window.',
          params: [['days', false, tr('จำนวนวัน (ค่าเริ่มต้น 30)', 'days (default 30)')]] },
        { path: '/api/tap', sse: true, th: 'สตรีม Server-Sent Events: ทุกการแจ้งเตือนและทุกรอบการดึงข้อมูล ทันทีที่เกิด', en: 'Server-Sent Events stream: every alert and ingest cycle the moment it happens.',
          note_th: 'จำกัดจำนวนสตรีมพร้อมกัน ได้ 503 เมื่อเต็ม — EventSource จะลองใหม่เอง', note_en: 'Concurrent streams are capped; 503 when full — EventSource retries on its own.' },
        { path: '/api/tap/recent', th: 'เหตุการณ์ล่าสุดของสตรีม สำหรับเติมหน้าจอก่อนเปิด SSE', en: 'The most recent stream events, to backfill a screen before opening the SSE.',
          params: [['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/alerts', th: 'การแจ้งเตือนที่ระบบยกขึ้นล่าสุด', en: 'The alerts the system has raised most recently.', params: [['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/news', th: 'ข่าวคุณภาพอากาศที่ดึงมาและจัดประเภทแล้ว', en: 'Fetched and classified air-quality news.', params: [['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/sensors/health', th: 'สุขภาพของสถานี: สถานีที่เงียบ ค่านิ่ง หรือค่ากระโดด — สำหรับรายงาน คพ.', en: 'Station health: silent, flat-lined or spiking sensors — for reporting to PCD.' },
        { path: '/api/sensors/dead.csv', th: 'รายชื่อสถานีที่เงียบเป็น CSV', en: 'Silent stations as CSV.' },
      ],
    },
    {
      id: 'forecast', icon: '🌧', title_th: 'พยากรณ์ ฝน และการชะล้าง', title_en: 'Forecast, rain and washout',
      rows: [
        { path: '/api/forecast', cache: tr('1 นาที', '1 min'), th: 'PM2.5 และฝุ่นทะเลทราย 24/48 ชม. รายจังหวัด จาก CAMS ผ่าน Open-Meteo', en: 'Per-province 24/48 h PM2.5 and desert-dust forecast from CAMS via Open-Meteo.' },
        { path: '/api/washout', th: 'ฝนที่จะมาช่วยชะล้างฝุ่นได้แค่ไหน รายจังหวัด (band, expected %, relief %)', en: 'How much the coming rain may wash the dust out, per province (band, expected %, relief %).',
          note_th: 'ฝนที่ชะล้างฝุ่นอาจทำให้แม่น้ำขึ้นด้วย — ดูจังหวัดเดียวกันใน FloodDash', note_en: 'The rain that clears the dust may also raise the rivers — check the same province in FloodDash.' },
        { path: '/api/wetness', th: 'ความชื้นดินสะสม (antecedent) ที่กดฝุ่นดินและควบคุมการเผา', en: 'Antecedent soil wetness — suppresses soil dust and gates burning.' },
        { path: '/api/whatif', th: 'ถ้าฝนตก X มม. ฝุ่นจะเหลือเท่าไร — เครื่องคิดเลขการชะล้าง', en: 'If X mm of rain fell, what PM2.5 remains — the washout calculator.',
          params: [['rain', false, tr('มม. ฝน', 'rain in mm')]] },
        { path: '/api/enso', th: 'สถานะเอลนีโญ/ลานีญา (ONI) และผลต่อฤดูฝุ่น', en: 'ENSO state (ONI) and what it means for the dust season.' },
      ],
    },
    {
      id: 'cause', icon: '🔥', title_th: 'สาเหตุ — การเผา ไฟ และภัยแล้ง', title_en: 'Causes — burning, fire and drought',
      rows: [
        { path: '/api/causes', th: 'สมมติฐานสาเหตุจัดอันดับรายจังหวัด (เผาในพื้นที่ ควันข้ามแดน อากาศนิ่ง จราจร) พร้อมความเชื่อมั่น', en: 'Ranked cause hypotheses per province (local burning, transboundary smoke, stagnation, traffic) with confidence.' },
        { path: '/api/dust-engines', th: 'เครื่องยนต์ฝุ่นของจังหวัดเดียว: สัดส่วนแต่ละแหล่งตามฤดูกาล', en: 'One province\'s dust engines: the seasonal share of each source.',
          params: [['province', true, tr('รหัส DOPA เช่น 50', 'DOPA code, e.g. 50')]] },
        { path: '/api/patterns', th: 'รูปแบบซ้ำที่ระบบพบในจังหวัด (วันในสัปดาห์ ชั่วโมง ฤดู)', en: 'Recurring patterns the system found for a province (weekday, hour, season).',
          params: [['province', true, tr('รหัส DOPA', 'DOPA code')]] },
        { path: '/api/burn-area', th: 'พื้นที่เผาไหม้จาก GISTDA ต่อฤดูกาล', en: 'GISTDA burn-scar area per season.',
          params: [['season', false, tr('รูปแบบ 2025/26', 'format 2025/26')], ['province', false, tr('รหัส DOPA', 'DOPA code')]] },
        { path: '/api/regional-fire-share', th: 'สัดส่วนจุดความร้อนไทยเทียบเพื่อนบ้าน (FIRMS) — ควันข้ามแดนมาจากไหน', en: 'Thailand\'s share of regional hotspots (FIRMS) — where transboundary smoke comes from.',
          params: [['days', false, tr('ย้อนหลังกี่วัน', 'look-back days')]] },
        { path: '/api/drought', th: 'ดัชนีภัยแล้งและการคายระเหยของพืช (ตัวตั้งของฤดูเผา)', en: 'Drought index and crop evapotranspiration (the setup for the burning season).',
          params: [['province', false, tr('รหัส DOPA', 'DOPA code')], ['view', false, tr('series ต้องมี province', 'series requires province')]] },
        { path: '/api/harm', th: 'ผลกระทบสุขภาพประมาณการรายจังหวัด', en: 'Estimated health harm per province.' },
        { path: '/api/insights', th: 'ข้อค้นพบที่ระบบสรุปให้แล้ว พร้อมหลักฐาน', en: 'Findings the system has already summarised, with evidence.' },
        { path: '/api/science', th: 'เครื่องยนต์วิทยาศาสตร์: การเปิดรับสัมผัสและปริมาณสะสม', en: 'The science engine: exposure and cumulative dose.' },
        { path: '/api/science/personal', th: 'ปริมาณสัมผัสส่วนบุคคล จากค่าฝุ่นและเวลากลางแจ้ง', en: 'Personal exposure dose from a PM2.5 value and outdoor minutes.',
          params: [['pm25', true, tr('µg/m³', 'µg/m³')], ['outdoorMin', true, tr('นาทีกลางแจ้ง', 'minutes outdoors')], ['province', false, tr('รหัส DOPA', 'DOPA code')], ['profile', false, tr('adult / child / elderly', 'adult / child / elderly')], ['activity', false, tr('rest / walk / run', 'rest / walk / run')]] },
      ],
    },
    {
      id: 'place', icon: '📍', title_th: 'สถานที่ — ค้นหาและระบุตำแหน่ง', title_en: 'Places — search and geocoding',
      rows: [
        { path: '/api/place', th: 'สภาพอากาศ ณ จุด: สถานีใกล้สุด ค่าล่าสุด และคำตัดสินของจังหวัด', en: 'Air at a point: nearest stations, latest values and the province verdict.',
          params: [['lat', true, tr('ละติจูด', 'latitude')], ['lng', true, tr('ลองจิจูด', 'longitude')], ['province', false, tr('บังคับจังหวัด', 'force a province')], ['radius', false, tr('กม.', 'km')]] },
        { path: '/api/place/slug/:slug', th: 'สถานที่ตาม slug ที่แชร์ได้ (ลิงก์ในหน้า “ที่ของฉัน”)', en: 'A place by shareable slug (the links on the citizen page).' },
        { path: '/api/search', th: 'ค้นทุกอย่าง: จังหวัด อำเภอ ตำบล สถานี', en: 'Search everything: provinces, districts, tambons, stations.',
          params: [['q', true, tr('ข้อความ', 'text')], ['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/search/districts', th: 'ค้นอำเภอ', en: 'Search districts.', params: [['q', true, tr('ข้อความ', 'text')], ['lang', false, 'th / en'], ['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/search/tambons', th: 'ค้นตำบล', en: 'Search tambons.', params: [['q', true, tr('ข้อความ', 'text')], ['lang', false, 'th / en'], ['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/postal', th: 'รหัสไปรษณีย์ → ตำบล/อำเภอ/จังหวัด', en: 'Postal code → tambon / district / province.',
          params: [['zip', false, tr('รหัสไปรษณีย์ 5 หลัก', '5-digit postcode')], ['q', false, tr('ค้นด้วยชื่อ', 'search by name')], ['lang', false, 'th / en']] },
        { path: '/api/lookup', th: 'แปลงรหัส DOPA เป็นชื่อ', en: 'Resolve a DOPA code to names.',
          params: [['kind', true, 'province / district / tambon'], ['code', true, tr('รหัส', 'code')], ['lang', false, 'th / en']] },
        { path: '/api/province-boundaries', cache: tr('คงที่', 'static'), th: 'ขอบเขตจังหวัด GeoJSON (gzip)', en: 'Province boundaries as GeoJSON (gzipped).' },
        { path: '/api/focus', th: 'พื้นที่โฟกัสที่ระบบติดตามเป็นพิเศษ', en: 'Focus areas the system tracks closely.' },
        { path: '/api/focus/:id', th: 'พื้นที่โฟกัสหนึ่งแห่ง', en: 'One focus area.' },
      ],
    },
    {
      id: 'bulk', icon: '📦', title_th: 'ข้อมูลย้อนหลังและการส่งออก', title_en: 'History and bulk export',
      blurb_th: 'สำหรับงานวิจัย: ทั้งวันเป็นไฟล์เดียว หรือทั้งฐานข้อมูลเป็น tar.gz', blurb_en: 'For research: a whole day in one file, or the whole database as a tar.gz.',
      rows: [
        { path: '/api/export/days', th: 'วันที่มีข้อมูลให้ส่งออก', en: 'Days available for export.', params: [['limit', false, tr('จำนวนวัน', 'day count')]] },
        { path: '/api/export/daily', th: 'ทุกค่าที่วัดได้ในหนึ่งวัน', en: 'Every reading from one day.',
          params: [['date', true, 'YYYY-MM-DD'], ['format', false, 'json / csv']] },
        { path: '/api/export/full', th: 'ทั้งชุดข้อมูลปัจจุบัน', en: 'The whole current dataset.', params: [['format', false, 'json / csv']],
          note_th: 'หนัก — เรียกวันละครั้งพอ', note_en: 'Heavy — once a day is enough.' },
        { path: '/api/exports', th: 'รายการไฟล์ส่งออกรายสัปดาห์ (tar.gz)', en: 'The weekly export archives (tar.gz).' },
        { path: '/api/exports/latest', th: 'ไฟล์ส่งออกล่าสุด (รองรับ Range เพื่อดาวน์โหลดต่อ)', en: 'The latest export archive (Range requests honoured for resume).' },
        { path: '/api/exports/:filename', th: 'ไฟล์ส่งออกตามชื่อ', en: 'One export archive by name.' },
        { path: '/api/sources', th: 'แคตตาล็อกแหล่งข้อมูลทั้งหมด: หน่วยงาน ความถี่ URL ตัวชี้วัด ใบอนุญาต', en: 'The full source catalogue: agency, cadence, URL, metrics, licence.' },
        { path: '/api/reports', th: 'รายงานจากประชาชน (LINE) ที่ผ่านการตรวจแล้ว', en: 'Moderated citizen reports (LINE).', params: [['limit', false, tr('จำนวน', 'count')], ['since', false, tr('ISO time', 'ISO time')]] },
      ],
    },
    {
      id: 'library', icon: '📚', title_th: 'ห้องสมุดและผู้ช่วย', title_en: 'Library and assistant',
      rows: [
        { path: '/api/library/toc', th: 'สารบัญห้องสมุดฝุ่น', en: 'The dust library\'s table of contents.' },
        { path: '/api/library/search', th: 'ค้นในห้องสมุด', en: 'Search the library.', params: [['q', true, tr('ข้อความ', 'text')], ['lang', false, 'th / en'], ['limit', false, tr('จำนวน', 'count')]] },
        { path: '/api/library/doc', th: 'เอกสารหนึ่งชิ้น', en: 'One document.', params: [['key', true, tr('คีย์จาก toc', 'key from the toc')], ['lang', false, 'th / en']] },
        { path: '/api/chat/status', th: 'ผู้ช่วยตอบคำถามพร้อมไหม (โมเดล คิว)', en: 'Is the assistant available (model, queue).' },
        { path: '/api/chat', method: 'POST', limit: '10/min', th: 'ถามผู้ช่วยด้วยภาษาคน — ตอบจากข้อมูลสดและห้องสมุด (body: {message, lang})', en: 'Ask the assistant in plain language — answers from live data and the library (body: {message, lang}).',
          note_th: 'ไม่ใช่ CORS สาธารณะ: POST เรียกจากหน้าเว็บอื่นไม่ได้ ใช้จากเซิร์ฟเวอร์ของคุณ', note_en: 'Not public-CORS: a POST cannot be called from another origin\'s page — call it from your server.' },
      ],
    },
  ]
}

const SAMPLES = [
  {
    id: 'curl', label: 'curl',
    code: `# The whole country, one request
curl -s ${BASE}/api/risk | jq '.provinces[0] | {province_en, score, band, level: .card.level}'

# Why is Chiang Mai in this band?
curl -s ${BASE}/api/risk \\
  | jq '.provinces[] | select(.province_en=="Chiang Mai") | .card.reasons[] | .en'

# Is the pipeline alive, and how old is each feed?
curl -s ${BASE}/api/health | jq '{version, ok, data_freshness}'`,
  },
  {
    id: 'js', label: 'JavaScript',
    code: `// Runs in a browser page on any origin — no key, no proxy.
const res = await fetch('${BASE}/api/twin')
if (!res.ok) throw new Error('AirDash ' + res.status)
const air = await res.json()

// Join the twin: same province codes, the flood side of the same rain.
const flood = await (await fetch('${FLOOD}/api/twin')).json()
const byCode = new Map(flood.provinces.map((p) => [p.code, p]))
for (const p of air.provinces) {
  const f = byCode.get(p.code)
  if (p.level !== 'safe' && f && f.level !== 'safe')
    console.log(p.en, 'air:', p.level, p.reason_en, '· flood:', f.level, f.reason_en)
}

// Freshness is a property of the DATA, not of your fetch succeeding.
const ageMin = (Date.now() - Date.parse(air.updated)) / 60000
if (ageMin > 90) console.warn('AirDash data is', Math.round(ageMin), 'min old')`,
  },
  {
    id: 'py', label: 'Python',
    code: `import requests

BASE = "${BASE}"

# Nearest stations to a point, with their latest PM2.5
r = requests.get(f"{BASE}/api/stations/nearest",
                 params={"lat": 18.79, "lng": 98.98, "limit": 3}, timeout=30)
r.raise_for_status()
for s in r.json()["stations"]:
    print(s["name_th"], s.get("pm25"), f'{s["distance_km"]:.1f} km')

# Hourly PM2.5 for one station, last 48 hours
s = requests.get(f"{BASE}/api/series",
                 params={"source": "air4thai", "station": "36t",
                         "metric": "pm25", "hours": 48}, timeout=30).json()
print(s["station"], len(s["points"]), "points")`,
  },
  {
    id: 'sse', label: 'Live stream',
    code: `// Push, not polling: every alert the moment it is raised.
const tap = new EventSource('${BASE}/api/tap')

tap.onmessage = (e) => {
  const ev = JSON.parse(e.data)
  if (ev.kind === 'alert') console.log(ev.severity, ev.title_en ?? ev.title_th)
}

// The server caps concurrent streams; always handle the drop.
tap.onerror = () => console.warn('stream dropped — EventSource will retry')`,
  },
]

function paramsTable(params) {
  if (!params?.length) return ''
  return `
    <table class="api-params">
      <thead><tr>
        <th>${tr('พารามิเตอร์', 'Parameter')}</th>
        <th>${tr('จำเป็น', 'Required')}</th>
        <th>${tr('ความหมาย', 'Meaning')}</th>
      </tr></thead>
      <tbody>
        ${params.map(([name, req, desc]) => `
          <tr>
            <td><code>${escapeHtml(name)}</code></td>
            <td class="${req ? 'api-req' : 'api-opt'}">${req ? tr('ใช่', 'yes') : tr('ไม่', 'no')}</td>
            <td>${escapeHtml(desc || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`
}

function endpointCard(row) {
  const qs = (row.params ?? []).filter(([, req]) => req).map(([n]) => `${n}=…`).join('&')
  const full = `${BASE}${row.path}${qs ? '?' + qs : ''}`
  // The method badge used to be hard-coded to GET unless the row was SSE.
  // /api/chat is POST, so it would have been advertised as a GET and its
  // "open live response" link would have been a dead end — the exact wrong
  // turn to hand someone who is trying to integrate with us.
  const method = row.method ?? (row.sse ? 'SSE' : 'GET')
  const openable = method === 'GET'
  const badges = [
    row.sse ? `<span class="api-badge api-badge-sse">SSE</span>`
      : `<span class="api-badge">${escapeHtml(method)}</span>`,
    row.cache ? `<span class="api-badge api-badge-soft">${tr('อัปเดต', 'updates')} ${escapeHtml(row.cache)}</span>` : '',
    row.limit ? `<span class="api-badge api-badge-soft">${escapeHtml(row.limit)}</span>` : '',
  ].filter(Boolean).join('')
  return `
    <article class="api-endpoint">
      <div class="api-endpoint-head">
        <div class="api-endpoint-path">${badges}<code>${escapeHtml(row.path)}</code></div>
        <button type="button" class="api-copy" data-copy="${escapeHtml(full)}"
          title="${tr('คัดลอก URL', 'copy URL')}">${tr('คัดลอก', 'Copy')}</button>
      </div>
      <p class="api-endpoint-desc">${escapeHtml(tr(row.th, row.en))}</p>
      ${paramsTable(row.params)}
      ${row.note_th ? `<p class="api-endpoint-note">⚠ ${escapeHtml(tr(row.note_th, row.note_en))}</p>` : ''}
      ${openable ? `<a class="api-try" href="${escapeHtml(full)}" target="_blank" rel="noopener">
        ${tr('เปิดดูข้อมูลจริง', 'Open live response')} ↗
      </a>` : `<p class="api-endpoint-note">${tr(
        'ปลายทางนี้เป็น POST — เปิดในเบราว์เซอร์ตรง ๆ ไม่ได้ ดูตัวอย่างโค้ดด้านล่าง',
        'This endpoint is POST — it cannot be opened in a browser tab. See the code samples below.')}</p>`}
    </article>`
}

function render() {
  const groups = GROUPS()
  return `
    <div class="rp-hero api-hero">
      <div class="rp-hero-eyebrow">AIRDASH API · ${tr('เอกสารสำหรับนักพัฒนา', 'DEVELOPER DOCUMENTATION')}</div>
      <h1 class="rp-hero-title">${tr('สร้างระบบของคุณเองบนข้อมูลชุดเดียวกับที่เราใช้',
        'Build your own system on the same data we run on')}</h1>
      <div class="rp-hero-meta">
        ${tr('ไม่ต้องมีคีย์ · ไม่ต้องลงทะเบียน · เรียกจากเว็บของคุณได้โดยตรง',
             'No key · No registration · Callable directly from your own web page')}
        · <code>${BASE}</code>
      </div>
    </div>

    <section class="rp-section api-start">
      <h2>${tr('เริ่มใน 30 วินาที', 'Working in 30 seconds')}</h2>
      <pre class="api-code api-code-hero"><code>curl -s ${BASE}/api/snapshot</code></pre>
      <p>${tr(
        'ไม่มีการยืนยันตัวตน ไม่มีคีย์ ไม่มีขั้นตอนลงทะเบียน ทุกปลายทางที่เป็นการอ่านตอบทุกโดเมน (CORS <code>*</code>) — โค้ดในหน้าเว็บของหน่วยงานคุณเรียกได้ตรง ๆ โดยไม่ต้องทำพร็อกซี',
        'No authentication, no key, no registration. Every read-only endpoint answers any origin (CORS <code>*</code>), so code running on your own page can call it directly — no proxy needed.')}</p>
    </section>

    <section class="rp-section api-facts">
      <h2>${tr('ข้อกำหนดที่ต้องรู้ก่อนต่อระบบ', 'What you need to know before you integrate')}</h2>
      <div class="api-fact-grid">
        <div class="api-fact">
          <div class="api-fact-k">${tr('การยืนยันตัวตน', 'Authentication')}</div>
          <div class="api-fact-v">${tr('ไม่มี', 'None')}</div>
          <div class="api-fact-n">${tr('ข้อมูลสาธารณะทั้งหมด ไม่มีคุกกี้ ไม่มีโทเคน', 'Public data throughout. No cookies, no tokens.')}</div>
        </div>
        <div class="api-fact">
          <div class="api-fact-k">${tr('รูปแบบ', 'Format')}</div>
          <div class="api-fact-v">JSON · UTF-8</div>
          <div class="api-fact-n">${tr('ทุกชื่อมีทั้งไทยและอังกฤษ (<code>name_th</code> / <code>name_en</code>)', 'Every name is bilingual (<code>name_th</code> / <code>name_en</code>).')}</div>
        </div>
        <div class="api-fact">
          <div class="api-fact-k">${tr('เวลา', 'Timestamps')}</div>
          <div class="api-fact-v">ICT (UTC+7)</div>
          <div class="api-fact-n">${tr('<code>obs_time</code> คือเวลาที่ “วัดได้” ตามเวลาไทย ส่วน <code>fetched_at</code> เป็น ISO UTC — ความสดต้องดูจาก obs_time เท่านั้น', '<code>obs_time</code> is the observation time in Thai local time; <code>fetched_at</code> is ISO UTC. Judge freshness from obs_time only.')}</div>
        </div>
        <div class="api-fact">
          <div class="api-fact-k">${tr('อัตราการเรียก', 'Rate limit')}</div>
          <div class="api-fact-v">300 / ${tr('นาที', 'min')}</div>
          <div class="api-fact-n">${tr('ต่อหนึ่ง IP ทั้งระบบ บางปลายทางที่คำนวณหนักจำกัดแยก (เช่น /api/chat 10/นาที) เกินแล้วได้ <code>429</code>', 'Per IP, system-wide. A few expensive endpoints are tighter (e.g. /api/chat at 10/min). Over the line you get <code>429</code>.')}</div>
        </div>
        <div class="api-fact">
          <div class="api-fact-k">${tr('ความถี่ที่ควรเรียก', 'Polling cadence')}</div>
          <div class="api-fact-v">${tr('10 นาที', '10 minutes')}</div>
          <div class="api-fact-n">${tr('Air4Thai ส่งข้อมูลรายชั่วโมง ส่วน CAMS/Open-Meteo ทุก 6 ชั่วโมง เรียกถี่กว่า 10 นาทีได้ข้อมูลเดิม ถ้าต้องการทันที ให้ใช้ <code>/api/tap</code>', 'Air4Thai publishes hourly, CAMS/Open-Meteo 6-hourly; polling faster than 10 min returns the same rows. For instant delivery use <code>/api/tap</code>.')}</div>
        </div>
        <div class="api-fact">
          <div class="api-fact-k">${tr('ความเสถียร', 'Stability')}</div>
          <div class="api-fact-v">${tr('เพิ่มฟิลด์ได้ ไม่ลบ', 'Additive')}</div>
          <div class="api-fact-n">${tr('เราเพิ่มฟิลด์ใหม่ได้เสมอ ให้เขียนโค้ดแบบข้ามฟิลด์ที่ไม่รู้จัก การถอดฟิลด์จะประกาศใน CHANGELOG ก่อน', 'New fields may appear at any time — ignore what you do not recognise. Removals are announced in the CHANGELOG first.')}</div>
        </div>
      </div>
    </section>

    <section class="rp-section">
      <h2>${tr('ตัวอย่างที่ใช้ได้จริง', 'Working examples')}</h2>
      <div class="api-tabs" role="tablist">
        ${SAMPLES.map((s, i) => `<button type="button" class="api-tab${i === 0 ? ' active' : ''}" role="tab" data-sample="${s.id}">${escapeHtml(s.label)}</button>`).join('')}
      </div>
      ${SAMPLES.map((s, i) => `
        <div class="api-sample${i === 0 ? ' active' : ''}" data-sample="${s.id}">
          <button type="button" class="api-copy api-copy-block" data-copy="${escapeHtml(s.code)}">${tr('คัดลอกโค้ด', 'Copy code')}</button>
          <pre class="api-code"><code>${escapeHtml(s.code)}</code></pre>
        </div>`).join('')}
    </section>

    <section class="rp-section api-errors">
      <h2>${tr('รหัสตอบกลับ', 'Response codes')}</h2>
      <table class="api-params api-codes">
        <tbody>
          <tr><td><code>200</code></td><td>${tr('สำเร็จ', 'Success')}</td></tr>
          <tr><td><code>400</code></td><td>${tr('พารามิเตอร์ไม่ครบหรือไม่ถูกต้อง — ตัวข้อความบอกว่าขาดอะไร เช่น <code>{"error":"lat and lng required"}</code>', 'Missing or invalid parameters — the body names what is missing, e.g. <code>{"error":"lat and lng required"}</code>')}</td></tr>
          <tr><td><code>429</code></td><td>${tr('เรียกถี่เกินไป ให้รอตามหัวข้อ <code>retry-after</code>', 'Too many requests — honour the <code>retry-after</code> header')}</td></tr>
          <tr><td><code>503</code></td><td>${tr('ยังคำนวณไม่เสร็จ (เช่น เครื่องยนต์วิทยาศาสตร์หลังรีสตาร์ท) ให้ลองใหม่ ไม่ใช่ข้อผิดพลาดถาวร', 'Still building (e.g. the science engine after a restart) — retry; this is not a permanent error')}</td></tr>
        </tbody>
      </table>
      <p>${tr('ข้อผิดพลาดทุกแบบเป็น JSON ที่มีคีย์ <code>error</code> เสมอ ไม่มีหน้า HTML แสดงข้อผิดพลาด',
              'Every error is JSON with an <code>error</code> key. No HTML error pages, ever.')}</p>
    </section>

    ${groups.map((g) => `
      <section class="rp-section api-group" id="api-group-${g.id}">
        <h2>${g.icon} ${tr(g.title_th, g.title_en)}</h2>
        ${g.blurb_th ? `<p class="rp-lead">${escapeHtml(tr(g.blurb_th, g.blurb_en))}</p>` : ''}
        <div class="api-endpoints">${g.rows.map(endpointCard).join('')}</div>
      </section>`).join('')}

    <section class="rp-section api-licence">
      <h2>${tr('การนำไปใช้ และหน้าที่ที่ติดมากับข้อมูล', 'Using this data, and the duty that comes with it')}</h2>
      <p>${tr(
        'ข้อมูลนี้เผยแพร่ให้ใช้ได้ฟรี ทั้งในงานราชการ งานวิจัย และงานเชิงพาณิชย์ ขอเพียงอ้างอิงที่มา: “AirDash · สำนักงานเมืองอัจฉริยะประเทศไทย (depa)” พร้อมลิงก์กลับมาที่ air.nonarkara.org และคงการอ้างอิงหน่วยงานต้นทางไว้ (คพ. / Air4Thai · CAMS · Open-Meteo · GISTDA · NASA FIRMS · สสน.)',
        'Free to use — in government, research and commercial work alike. Attribute it as "AirDash · Smart City Thailand Office (depa)" with a link back to air.nonarkara.org, and keep the upstream agency credits intact (PCD / Air4Thai · CAMS · Open-Meteo · GISTDA · NASA FIRMS · HII).')}</p>
      <div class="rp-warning api-duty">
        <strong>${tr('ข้อผูกพันเรื่องความปลอดภัยของชีวิต', 'The life-safety obligation')}</strong>
        <p>${tr(
          'ตัวเลขของเราเป็นดัชนีเฝ้าระวังจากเซ็นเซอร์และแบบจำลอง ไม่ใช่ประกาศของ คพ. หรือกระทรวงสาธารณสุข ถ้าคุณนำไปแสดงต่อประชาชน คุณรับหน้าที่เดียวกันนี้ต่อ: ให้ระบุอายุของข้อมูลเสมอ ถ้าสถานีเงียบให้บอกว่าเงียบ อย่าปล่อยให้ความเงียบถูกอ่านว่าอากาศดี ใช้คำว่า “อาจ” กับทุกการคาดการณ์ และแสดงสายด่วน คพ. 1650 · กรมควบคุมโรค 1422 · ฉุกเฉิน 1669 ไว้เสมอ',
          'Our numbers are a sensor- and model-derived watch index, not a PCD or Ministry of Public Health announcement. If you show them to the public you inherit the same duty: always show the age of the data; say so when a station is silent, and never let silence read as clean air; say "may" on every forecast; always carry the hotlines PCD 1650 · DDC 1422 · EMS 1669.')}</p>
      </div>
      <p class="api-contact">${tr(
        'ต้องการชุดข้อมูลย้อนหลัง ความถี่สูงกว่านี้ หรือร่วมพัฒนา ติดต่อผ่านแท็บ “เกี่ยวกับ”',
        'Need bulk history, a higher cadence, or a research collaboration? Reach us through the About tab.')}</p>
    </section>`
}

let painted = false

function copyFeedback(btn) {
  const original = btn.textContent
  btn.textContent = tr('คัดลอกแล้ว ✓', 'Copied ✓')
  btn.classList.add('is-copied')
  setTimeout(() => { btn.textContent = original; btn.classList.remove('is-copied') }, 1600)
}

function wire(root) {
  root.querySelectorAll('.api-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy ?? ''
      try {
        await navigator.clipboard.writeText(text)
        copyFeedback(btn)
      } catch {
        // Clipboard is blocked in some embedded/insecure contexts — select the
        // block instead of failing silently, so the user can still copy.
        const pre = btn.parentElement?.querySelector('pre')
        if (pre) {
          const r = document.createRange()
          r.selectNodeContents(pre)
          const sel = window.getSelection()
          sel?.removeAllRanges(); sel?.addRange(r)
        }
        btn.textContent = tr('กด Ctrl+C', 'Press Ctrl+C')
        setTimeout(() => { btn.textContent = tr('คัดลอก', 'Copy') }, 2200)
      }
    })
  })
  root.querySelectorAll('.api-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.sample
      root.querySelectorAll('.api-tab').forEach((t) => t.classList.toggle('active', t === tab))
      root.querySelectorAll('.api-sample').forEach((s) => s.classList.toggle('active', s.dataset.sample === id))
    })
  })
}

export function paintApiDocs() {
  const root = document.getElementById('apidocs-content')
  if (!root) return
  root.innerHTML = render()
  wire(root)
  painted = true
}

let wired = false

export function initApiDocs() {
  const overlay = document.getElementById('about-overlay')
  if (!overlay || wired) return
  wired = true
  for (const tab of overlay.querySelectorAll('.about-tab')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.aboutPane === 'apidocs') paintApiDocs()
    })
  }
  on('lang', () => {
    if (painted && document.querySelector('.about-pane[data-about-pane="apidocs"]')?.classList.contains('active')) {
      paintApiDocs()
    }
  })
}
