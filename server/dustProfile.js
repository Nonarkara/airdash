// Dust Engines — the STRUCTURAL answer to "why does the air here go bad,
// and when?", as opposed to causes.js which answers "why is it bad RIGHT
// NOW".
//
// Why this module exists: causes.js only emits a hypothesis when the live
// PM2.5 is already elevated AND (for burning) the dust-season window is
// open. That is correct for live attribution — but it means that for the
// ~7 months a year when the air is clean, the dashboard could not answer
// the single most common question a citizen, a journalist, or a governor
// asks: "why is Bangkok always dusty in the winter?" / "what actually
// burns up north?". Those are questions about MECHANISM and CALENDAR, not
// about this hour's reading, so they must be answerable at any time.
//
// EPISTEMIC STATUS — read this before editing.
// Everything here is documented, widely-reported mechanism: the physics of
// a cool-season inversion, the agricultural calendar of cane and rice, the
// geography of a mountain basin. It is deliberately QUALITATIVE. We do NOT
// state source-apportionment percentages ("X% of Bangkok PM2.5 is
// traffic") because credible published estimates disagree substantially by
// study, season, and method, and a made-up precise number would be worse
// than an honest mechanism. Rank ordering is by typical contribution as
// reported in the literature, expressed in words, never in false decimals.
//
// Shape: profileFor(province_code) -> { archetype, summary_th/en,
//   engines: [{ id, title_th/en, mechanism_th/en, months:[1..12] }],
//   peak_months: [..] } | null
import { CAUSE_LABELS } from './causes.js'
import { isThaiProvinceCode } from './provinces.js'

// Month sets, 1 = January.
const DRY_BURN = [12, 1, 2, 3, 4]
const COOL_INVERSION = [11, 12, 1, 2]
const CANE_HARVEST = [12, 1, 2, 3, 4]   // pre-harvest cane burning window
const RICE_STUBBLE = [1, 2, 3, 11, 12]  // post-harvest stubble, central + NE
const SUMATRA_HAZE = [8, 9, 10]

// ── The engines ──────────────────────────────────────────────────────────
// One definition per mechanism, reused across archetypes so the wording
// stays identical everywhere the same physics applies.
const ENGINES = {
  inversion: {
    title_th: 'อากาศปิด (ผกผันอุณหภูมิ) ช่วงหน้าหนาว',
    title_en: 'Winter temperature inversion — the lid',
    mechanism_th: 'ในฤดูหนาว อากาศเย็นจมตัวอยู่ใกล้พื้น มีอากาศอุ่นกว่าลอยทับข้างบน เกิดเป็น "ฝาปิด" ที่กดชั้นอากาศผสมให้ตื้นลงมาก มลพิษปริมาณเท่าเดิมจึงถูกอัดอยู่ในปริมาตรอากาศที่เล็กลงหลายเท่า ค่าฝุ่นพุ่งขึ้นได้ทั้งที่การปล่อยไม่ได้เพิ่มเลย — นี่คือเหตุผลหลักที่กรุงเทพฯ ดูฝุ่นหนักเป็นพิเศษช่วง พ.ย.–ก.พ. และมักแย่ที่สุดตอนเช้ามืดก่อนแดดจะสลายฝาปิดนี้',
    mechanism_en: 'In the cool season a layer of warmer air sits on top of the cooler surface air, forming a lid that squeezes the mixing layer to a fraction of its usual depth. The same emissions are then packed into a much smaller volume of air, so concentrations spike without anyone emitting more. This is the main reason Bangkok looks dramatically dustier in Nov–Feb, and why the worst readings are usually just before dawn — sunlight later heats the ground and breaks the lid.',
    months: COOL_INVERSION,
  },
  traffic: {
    title_th: 'จราจร — โดยเฉพาะเครื่องยนต์ดีเซล',
    title_en: 'Road traffic — diesel above all',
    mechanism_th: 'ไอเสียดีเซล (รถบรรทุก รถกระบะ รถเมล์เก่า) ปล่อยเขม่าดำซึ่งเป็น PM2.5 โดยตรง ไม่ต้องผ่านปฏิกิริยาใด ๆ บวกกับฝุ่นจากการสึกของยาง ผ้าเบรก และฝุ่นบนผิวถนนที่ถูกรถกวนขึ้นมาใหม่ ในเมืองที่รถติด เครื่องยนต์เดินเบานาน ๆ ปล่อยต่อระยะทางสูงกว่าปกติมาก สังเกตได้จากค่าจะขึ้นตามชั่วโมงเร่งด่วนและลดลงชัดเจนในวันหยุดยาว',
    mechanism_en: 'Diesel exhaust — trucks, pickups, older buses — emits black-carbon soot that is PM2.5 immediately, with no atmospheric processing needed. Add tyre and brake wear plus road dust kicked back into the air by passing vehicles. In congested traffic, engines idle for long periods and emit far more per kilometre travelled. The signature is a rush-hour rhythm in the readings and a clear drop during long public holidays.',
    months: null,   // year-round
  },
  secondary: {
    title_th: 'ฝุ่นทุติยภูมิ — ฝุ่นที่ "ก่อตัวขึ้นเอง" ในอากาศ',
    title_en: 'Secondary aerosol — dust that forms in mid-air',
    mechanism_th: 'ส่วนสำคัญของ PM2.5 ในเมืองไม่ได้ถูกปล่อยออกมาเป็นฝุ่นตั้งแต่แรก แต่เกิดจากก๊าซ — ไนโตรเจนออกไซด์จากไอเสีย ซัลเฟอร์ไดออกไซด์จากการเผาเชื้อเพลิง แอมโมเนียจากเกษตรกรรม และสารอินทรีย์ระเหย — ทำปฏิกิริยากันในอากาศแล้วควบแน่นกลายเป็นอนุภาคในเวลาหลายชั่วโมงถึงเป็นวัน นี่คือส่วนที่ "ลึกลับ" ที่สุด เพราะฝุ่นอาจก่อตัวขึ้นห่างจากต้นตอที่ปล่อยก๊าซไปไกลมาก และไม่มีปล่องไหนให้ชี้',
    mechanism_en: 'A large share of urban PM2.5 was never emitted as particles at all. It forms in the air when gases — nitrogen oxides from exhaust, sulfur dioxide from fuel burning, ammonia from agriculture, and volatile organic compounds — react and condense into particles over hours to days. This is the genuinely counter-intuitive part: the dust can appear far downwind of whatever released the gases, and there is no chimney to point at.',
    months: null,
  },
  cane: {
    title_th: 'เผาอ้อยก่อนตัด',
    title_en: 'Pre-harvest sugarcane burning',
    mechanism_th: 'ไร่อ้อยมักถูกจุดไฟเผาใบก่อนตัด เพราะใบอ้อยคมและแน่น การเผาทำให้ตัดได้เร็วขึ้นและถูกกว่าจ้างแรงงานตัดสด ควันจากการเผาอ้อยลอยไกลหลายสิบถึงร้อยกิโลเมตร ดังนั้นเมืองที่ไม่มีไร่อ้อยเลยก็รับฝุ่นจากการเผาอ้อยได้เต็ม ๆ — รวมถึงกรุงเทพฯ ที่รับควันจากที่ราบภาคกลางฝั่งตะวันตกในบางวันของฤดูหีบอ้อย',
    mechanism_en: 'Cane fields are commonly burned before cutting: the leaves are sharp and dense, and burning makes harvesting far faster and cheaper than cutting green by hand. The smoke travels tens to hundreds of kilometres, so a city with no cane fields at all can still take the full load — including Bangkok, which on some days during the milling season receives smoke from the central plains to its west.',
    months: CANE_HARVEST,
  },
  stubble: {
    title_th: 'เผาตอซังข้าวและเศษวัสดุเกษตร',
    title_en: 'Rice stubble and crop-residue burning',
    mechanism_th: 'หลังเก็บเกี่ยว ตอซังและฟางที่เหลือในนามักถูกเผาเพื่อเคลียร์แปลงให้ทันรอบปลูกถัดไป เป็นวิธีที่เร็วและไม่มีต้นทุน เทียบกับการไถกลบที่ใช้เวลาและค่าน้ำมัน เมื่อเกษตรกรจำนวนมากเผาในช่วงเวลาใกล้กันเพราะปฏิทินเพาะปลูกตรงกัน ควันจึงสะสมเป็นวงกว้างพร้อมกันทั้งภูมิภาค',
    mechanism_en: 'After harvest, the stubble and straw left standing in the field are often burned to clear the plot in time for the next planting cycle — fast and free, versus ploughing it in, which costs time and diesel. Because the planting calendar is shared, a great many farmers burn within the same short window, so the smoke accumulates region-wide all at once.',
    months: RICE_STUBBLE,
  },
  forest: {
    title_th: 'ไฟป่าและการเผาในพื้นที่สูง',
    title_en: 'Forest fire and highland burning',
    mechanism_th: 'ปลายฤดูแล้งใบไม้แห้งสะสมหนาจนติดไฟง่ายมาก ไฟป่าเกิดได้ทั้งจากธรรมชาติและจากการจุดเพื่อหาของป่า ล่าสัตว์ หรือเปิดพื้นที่ทำกิน ไฟบนพื้นที่สูงชันดับยากและลามได้หลายวัน ปล่อยควันต่อเนื่องในปริมาณมหาศาล',
    mechanism_en: 'By late dry season the leaf litter is thick and tinder-dry. Fires start both naturally and from deliberate ignition — to flush game, to gather forest products, or to clear land for cultivation. On steep terrain they are hard to reach and hard to extinguish, so a single fire can burn for days, emitting continuously.',
    months: DRY_BURN,
  },
  basin: {
    title_th: 'ภูมิประเทศแอ่งกระทะ — ควันไม่มีทางออก',
    title_en: 'Basin topography — the smoke has nowhere to go',
    mechanism_th: 'เมืองที่ตั้งอยู่ในแอ่งหรือหุบเขาถูกภูเขาล้อมรอบ ลมพัดผ่านได้น้อย ในคืนที่อากาศนิ่ง อากาศเย็นจะไหลลงมากองก้นแอ่งพร้อมกับควันที่ลอยอยู่ ทำให้ความเข้มข้นสูงขึ้นเรื่อย ๆ ข้ามคืน นี่คือเหตุผลที่เชียงใหม่และแม่ฮ่องสอนติดอันดับเมืองที่อากาศแย่ที่สุดในโลกได้ในบางวัน ทั้งที่จำนวนประชากรไม่มาก',
    mechanism_en: 'A city sitting in a basin or valley is ringed by high ground, so there is little through-wind to flush it. On calm nights, cold air drains down the slopes and pools at the bottom, taking the smoke with it, and concentrations climb through the night. This is how Chiang Mai and Mae Hong Son reach the top of world air-quality rankings on their worst days despite modest populations.',
    months: DRY_BURN,
  },
  transboundary: {
    title_th: 'หมอกควันข้ามแดน',
    title_en: 'Transboundary smoke',
    mechanism_th: 'ควันไม่เคารพพรมแดน ในฤดูเผา ลมประจำฤดูพัดควันจากไฟในประเทศเพื่อนบ้านเข้ามาได้ในระดับที่วัดได้ชัด จังหวัดชายแดนจึงอาจมีค่าฝุ่นสูงแม้ในวันที่ไม่มีการเผาในพื้นที่ของตัวเองเลย — เป็นปัญหาที่แก้ด้วยมาตรการภายในประเทศอย่างเดียวไม่ได้',
    mechanism_en: 'Smoke does not respect borders. During the burning season the prevailing winds carry smoke from fires in neighbouring countries across at clearly measurable levels, so a border province can record high dust on a day with no local burning at all — a problem no purely domestic measure can fix.',
    months: DRY_BURN,
  },
  quarry: {
    title_th: 'โรงโม่หิน ปูนซีเมนต์ และฝุ่นหยาบ',
    title_en: 'Quarry, cement and coarse mineral dust',
    mechanism_th: 'การระเบิดหิน บด โม่ ขนถ่าย และรถบรรทุกหนักวิ่งบนถนนที่มีฝุ่นหิน ปล่อยฝุ่นแร่เป็นหลัก ลักษณะเด่นคือ PM10 สูงกว่า PM2.5 มาก (สัดส่วน PM2.5/PM10 ต่ำ) ต่างจากฝุ่นจากการเผาไหม้ที่อนุภาคละเอียดเป็นส่วนใหญ่',
    mechanism_en: 'Blasting, crushing, milling, transfer, and heavy trucks running over stone-dusted roads emit mainly mineral particles. The signature is PM10 far exceeding PM2.5 (a low PM2.5/PM10 ratio) — unlike combustion smoke, which is dominated by the fine fraction.',
    months: null,
  },
  sumatra: {
    title_th: 'หมอกควันจากอินโดนีเซีย (ส.ค.–ต.ค.)',
    title_en: 'Indonesian peat and forest haze (Aug–Oct)',
    mechanism_th: 'ภาคใต้มีฤดูฝุ่นคนละช่วงกับภาคเหนือ ในช่วง ส.ค.–ต.ค. ไฟป่าและไฟพรุในสุมาตราและกาลิมันตันส่งควันข้ามช่องแคบมาถึงภาคใต้ตอนล่าง ไฟพรุมีลักษณะเฉพาะคือคุกรุ่นใต้ดินได้นานเป็นสัปดาห์และดับยากมาก',
    mechanism_en: 'The South runs on a different dust calendar from the North. From August to October, forest and peat fires in Sumatra and Kalimantan push smoke across the strait into the lower southern provinces. Peat fires are distinctive: they smoulder underground for weeks and are extremely hard to put out.',
    months: SUMATRA_HAZE,
  },
}

// ── Archetypes ───────────────────────────────────────────────────────────
const METRO = new Set(['10', '11', '12', '13', '73', '74'])
const NORTH_BASIN = new Set(['50', '58', '51', '52', '54', '55', '56', '57'])
const NORTH_OTHER = new Set(['53', '60', '61', '62', '63', '64', '65', '66', '67'])
const SOUTH_HAZE = new Set(['90', '91', '94', '95', '96'])
const CANE_BELT = new Set(['71', '72', '70', '76', '17', '18', '15', '16', '19'])
const isNortheast = (code) => { const n = Number(code); return n >= 30 && n <= 49 }

const ARCHETYPES = {
  metro: {
    engines: ['inversion', 'traffic', 'secondary', 'cane'],
    summary_th: 'กรุงเทพฯ และปริมณฑลไม่ได้ฝุ่นเยอะเพราะมีการเผาในเมือง แต่เพราะ "ฝาปิด" ของอากาศหน้าหนาวกดฝุ่นจากจราจรและฝุ่นทุติยภูมิให้อัดแน่นอยู่ใกล้พื้น แล้วบางวันยังรับควันเผาอ้อยจากที่ราบภาคกลางเข้ามาเสริม',
    summary_en: 'Bangkok and its vicinity are not dusty because the city burns — they are dusty because a winter lid traps traffic emissions and secondary aerosol near the ground, with cane smoke drifting in from the central plains on some days.',
    peak: COOL_INVERSION,
  },
  north_basin: {
    engines: ['basin', 'forest', 'transboundary', 'stubble'],
    summary_th: 'เมืองในแอ่งภาคเหนือรวมสามอย่างที่แย่ที่สุดเข้าด้วยกัน — ไฟป่าปลายฤดูแล้ง ควันข้ามแดน และภูมิประเทศที่ขังควันไว้ไม่ให้ระบายออก',
    summary_en: 'The northern basin cities combine the three worst factors at once — late-dry-season forest fire, transboundary smoke, and a bowl of terrain that holds it all in.',
    peak: [2, 3, 4],
  },
  north_other: {
    engines: ['forest', 'stubble', 'transboundary'],
    summary_th: 'ภาคเหนือตอนล่างและพื้นที่รอบ ๆ รับทั้งไฟป่าปลายฤดูแล้งและการเผาเศษวัสดุเกษตรตามปฏิทินเพาะปลูก',
    summary_en: 'The lower North takes both late-dry-season forest fire and crop-residue burning timed to the planting calendar.',
    peak: [2, 3, 4],
  },
  northeast: {
    engines: ['stubble', 'cane', 'forest', 'transboundary'],
    summary_th: 'ภาคอีสานเป็นพื้นที่เกษตรกว้างใหญ่ ฝุ่นหลักมาจากการเผาตอซังและเผาอ้อยที่เกิดพร้อมกันเป็นวงกว้างตามรอบเก็บเกี่ยว',
    summary_en: 'The Northeast is broad farmland: its dust comes chiefly from stubble and cane burning that happens across the whole region at once, following the harvest cycle.',
    peak: [1, 2, 3],
  },
  cane_belt: {
    engines: ['cane', 'quarry', 'stubble', 'traffic'],
    summary_th: 'ที่ราบภาคกลางเป็นแหล่งอ้อยและโรงโม่หิน ฝุ่นจึงมีทั้งควันจากการเผาอ้อยและฝุ่นหินหยาบจากอุตสาหกรรม',
    summary_en: 'The central plains carry both cane and quarrying, so the dust here is a mix of burning smoke and coarse mineral dust from industry.',
    peak: CANE_HARVEST,
  },
  south: {
    engines: ['sumatra', 'traffic'],
    summary_th: 'ภาคใต้มีฤดูฝุ่นสวนทางกับส่วนอื่นของประเทศ — ช่วงที่ต้องเฝ้าระวังคือ ส.ค.–ต.ค. จากหมอกควันข้ามช่องแคบ ไม่ใช่หน้าแล้งต้นปี',
    summary_en: 'The South runs the opposite calendar to the rest of the country — its watch window is Aug–Oct, driven by haze across the strait, not the early-year dry season.',
    peak: SUMATRA_HAZE,
  },
  general: {
    engines: ['traffic', 'stubble', 'transboundary'],
    summary_th: 'พื้นที่นี้ไม่มีแหล่งกำเนิดฝุ่นเด่นชัดเป็นพิเศษ ฝุ่นส่วนใหญ่มาจากจราจรในท้องถิ่นและการเผาเศษวัสดุเกษตรตามฤดูกาล',
    summary_en: 'No single dominant dust source here. Most of the load comes from local traffic plus seasonal crop-residue burning.',
    peak: DRY_BURN,
  },
}

function archetypeFor(code) {
  // DOPA codes are NOT contiguous — 00, 88 and 99 look like province codes
  // and pass a \d{1,2} format check but name no real province. Without
  // this the module would confidently describe the "dust engines" of a
  // place that does not exist, which is exactly the kind of quiet
  // fabrication the rest of this codebase refuses to do.
  if (!code || !isThaiProvinceCode(code)) return null
  if (METRO.has(code)) return 'metro'
  if (NORTH_BASIN.has(code)) return 'north_basin'
  if (NORTH_OTHER.has(code)) return 'north_other'
  if (SOUTH_HAZE.has(code)) return 'south'
  if (CANE_BELT.has(code)) return 'cane_belt'
  if (isNortheast(code)) return 'northeast'
  // Remaining southern codes (80–89, 92, 93) share the Sumatra window.
  const n = Number(code)
  if (n >= 80 && n <= 93) return 'south'
  return 'general'
}

/**
 * Structural dust profile for a province — always available, independent
 * of the current reading and the season. Returns null for unknown codes.
 */
export function profileFor(province_code) {
  const key = archetypeFor(String(province_code ?? '').trim())
  if (!key) return null
  const a = ARCHETYPES[key]
  const month = new Date(Date.now() + 7 * 3600_000).getUTCMonth() + 1  // Asia/Bangkok
  return {
    archetype: key,
    summary_th: a.summary_th,
    summary_en: a.summary_en,
    peak_months: a.peak,
    in_peak_now: a.peak.includes(month),
    engines: a.engines.map((id) => {
      const e = ENGINES[id]
      return {
        id,
        // Reuse the live-attribution vocabulary where the ids line up, so
        // a chip on the map and an engine in this list read the same.
        label_th: CAUSE_LABELS[id]?.th ?? e.title_th,
        label_en: CAUSE_LABELS[id]?.en ?? e.title_en,
        title_th: e.title_th,
        title_en: e.title_en,
        mechanism_th: e.mechanism_th,
        mechanism_en: e.mechanism_en,
        months: e.months,
        active_now: e.months === null ? true : e.months.includes(month),
      }
    }),
  }
}

export const DUST_PROFILE_METHOD = {
  th: 'กลไกเชิงโครงสร้าง — อธิบายว่าทำไมพื้นที่นี้ถึงมีฝุ่นและช่วงไหนของปี ไม่ใช่การวัดสัดส่วนแหล่งกำเนิดจริง และไม่ได้อ้างอิงค่าที่วัดได้ในขณะนี้',
  en: 'Structural mechanism — why this place gets dusty and in which months. This is not measured source apportionment and does not describe the current reading.',
}
