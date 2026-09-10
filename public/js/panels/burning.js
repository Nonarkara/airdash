// ── Agricultural burning — the research tab ─────────────────────────────
//
// Thailand's burning debate runs on a single question ("is it the
// farmers?") that has no single answer, because the mix of what is
// burning INVERTS across the year. This panel exists to show that
// inversion with real counts rather than settle the argument with a
// slogan.
//
// Every figure here was read off a named source and is labelled with it.
// Where two credible sources disagree (they do, by an order of
// magnitude), both numbers are shown rather than the flattering one.
import { store, on } from '../state.js?v=2.4.24'

function tr(th, en) { return store.lang === 'th' ? th : en }

// GISTDA disaster dashboard, "ไฟป่า" tab, sensor = Suomi NPP, the
// rolling 7-day window 4–10 Sep 2569 (2026). Read from the dashboard UI
// at https://disaster.gistda.or.th/dashboard — the machine-readable
// equivalent is /features/viirs/7days on the GISTDA open API, which
// returns 407 without an API key.
const GISTDA_SEP = {
  total: 415,
  window: '4–10 ก.ย. 2569 · 4–10 Sep 2026',
  classes: [
    { th: 'พื้นที่เกษตร', en: 'Agricultural land', n: 300 },
    { th: 'ชุมชนและอื่น ๆ', en: 'Community & other', n: 45 },
    { th: 'เขต ส.ป.ก.', en: 'Land-reform (ALRO) area', n: 25 },
    { th: 'ป่าอนุรักษ์', en: 'Conservation forest', n: 24 },
    { th: 'ป่าสงวนแห่งชาติ', en: 'National reserved forest', n: 11 },
    { th: 'พื้นที่ริมทางหลวง', en: 'Roadside', n: 10 },
  ],
  provinces: [
    { th: 'นครสวรรค์', en: 'Nakhon Sawan', n: 72 },
    { th: 'พระนครศรีอยุธยา', en: 'Phra Nakhon Si Ayutthaya', n: 61 },
    { th: 'สุพรรณบุรี', en: 'Suphan Buri', n: 61 },
    { th: 'ชัยนาท', en: 'Chai Nat', n: 29 },
    { th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat', n: 27 },
  ],
}


// ตามรอยเผา (HII/KU) monthly province CSVs, summed across all 77 provinces
// for the 2025/26 dust-smoke season. Fetched and totalled directly from
// https://tamroypao.hii.or.th/openburn/tamroypao/data/csv/province/<Y>/
// on 2026-09-10 — these are sums of published values, not estimates.
// Units: rai. Sentinel-2, 20 m, crop-classified.
const SEASON_2526 = {
  total: 12283528,
  months: [
    { m: '202511', th: 'พ.ย.', en: 'Nov', paddy: 21752, cane: 18949, corn: 8488, total: 49320 },
    { m: '202512', th: 'ธ.ค.', en: 'Dec', paddy: 469688, cane: 224126, corn: 64881, total: 759612 },
    { m: '202601', th: 'ม.ค.', en: 'Jan', paddy: 2259820, cane: 1202829, corn: 320103, total: 3794197 },
    { m: '202602', th: 'ก.พ.', en: 'Feb', paddy: 1272929, cane: 1212011, corn: 375073, total: 2871487 },
    { m: '202603', th: 'มี.ค.', en: 'Mar', paddy: 823958, cane: 1263557, corn: 361941, total: 2462442 },
    { m: '202604', th: 'เม.ย.', en: 'Apr', paddy: 1436263, cane: 713441, corn: 190360, total: 2346470 },
  ],
}

function barRow(label, n, max, accent) {
  const pct = Math.max(1, Math.round((n / max) * 100))
  return `
    <div class="bn-row">
      <div class="bn-row-label">${label}</div>
      <div class="bn-row-track"><div class="bn-row-fill" style="width:${pct}%;background:${accent}"></div></div>
      <div class="bn-row-val">${n.toLocaleString()}</div>
    </div>`
}

// The whole argument in one figure: the same country, two different
// months, two opposite answers.
function svgSeasonInversion() {
  const bars = [
    { m: tr('มี.ค. (ฤดูฝุ่น)', 'March (dust season)'), forest: 84, agri: 7, note: tr('ยอดรวมหลายปี', 'multi-year totals') },
    { m: tr('ก.ย. (ฤดูข้าว)', 'September (rice season)'), forest: 8, agri: 72, note: tr('7 วัน · GISTDA', '7-day · GISTDA') },
  ]
  const rows = bars.map((b, i) => {
    const y = 34 + i * 62
    return `
      <text x="0" y="${y - 8}" class="bn-svg-lbl">${b.m}</text>
      <rect x="0" y="${y}" width="${b.forest * 4.4}" height="18" fill="var(--th-sage)"/>
      <rect x="${b.forest * 4.4}" y="${y}" width="${b.agri * 4.4}" height="18" fill="var(--th-amber)"/>
      <text x="${Math.max(b.forest * 4.4, 30) / 2}" y="${y + 13}" class="bn-svg-num" text-anchor="middle">${b.forest}%</text>
      <text x="${b.forest * 4.4 + b.agri * 4.4 / 2}" y="${y + 13}" class="bn-svg-num" text-anchor="middle">${b.agri}%</text>
      <text x="${b.forest * 4.4 + b.agri * 4.4 + 8}" y="${y + 13}" class="bn-svg-sub">${b.note}</text>`
  }).join('')
  return `
    <svg viewBox="0 0 440 150" class="bn-svg" role="img"
         aria-label="${tr('สัดส่วนจุดความร้อนสลับกันระหว่างฤดู', 'Hotspot share inverts between seasons')}">
      ${rows}
      <g transform="translate(0,140)">
        <rect x="0" y="-9" width="11" height="11" fill="var(--th-sage)"/>
        <text x="16" y="0" class="bn-svg-sub">${tr('ป่า', 'forest')}</text>
        <rect x="62" y="-9" width="11" height="11" fill="var(--th-amber)"/>
        <text x="78" y="0" class="bn-svg-sub">${tr('เกษตร', 'agriculture')}</text>
      </g>
    </svg>`
}

function sectionLede() {
  return `
    <section class="rp-section bn-lede">
      <h2>${tr('การเผาในภาคเกษตร — อ่านตัวเลขให้ตรง', 'Agricultural burning — reading the numbers honestly')}</h2>
      <p class="rp-lead">${tr(
        'คำถามที่ได้ยินบ่อยที่สุดคือ “ฝุ่นนี้เกษตรกรเผาใช่ไหม” คำตอบเปลี่ยนไปตามเดือนที่ถาม และนั่นคือประเด็นสำคัญที่สุดของหน้านี้',
        'The most common question is "is this the farmers burning?" The answer changes depending on which month you ask — and that is the single most important thing on this page.'
      )}</p>
    </section>`
}

function sectionInversion() {
  return `
    <section class="rp-section">
      <h2>${tr('1. สัดส่วนการเผาสลับกันระหว่างฤดู', '1. The burning mix inverts between seasons')}</h2>
      <div class="rp-figure">${svgSeasonInversion()}</div>
      <p>${tr(
        'เมื่อรวมทั้งปีหลายปีเข้าด้วยกัน จุดความร้อนราว 82–84% อยู่ในพื้นที่ป่า (ป่าอนุรักษ์และป่าสงวน) และมีเพียงราว 7% ที่อยู่ในพื้นที่เกษตร — เพราะยอดรวมทั้งปีถูกครอบงำด้วยยอดพุ่งของไฟป่าในเดือนมีนาคม แต่ถ้าดูเฉพาะสัปดาห์ในเดือนกันยายน ภาพกลับด้านโดยสิ้นเชิง',
        'Summed across whole years, roughly 82–84% of hotspot detections fall on forest land (conservation and reserved forest) and only about 7% on agricultural land — because the annual total is dominated by the March forest-fire peak. Look at a single week in September and the picture inverts completely.'
      )}</p>
      <p>${tr(
        'ทั้งสองตัวเลขเป็นความจริง และการอ้างตัวเลขใดตัวเลขหนึ่งโดยไม่บอกเดือน คือการทำให้เข้าใจผิด',
        'Both figures are true. Quoting either one without naming the month is how this debate gets distorted.'
      )}</p>
    </section>`
}

function sectionSeptember() {
  const max = Math.max(...GISTDA_SEP.classes.map((c) => c.n))
  const rows = GISTDA_SEP.classes
    .map((c) => barRow(tr(c.th, c.en), c.n, max, c.n === max ? 'var(--th-amber)' : 'var(--ink-low)'))
    .join('')
  const pmax = Math.max(...GISTDA_SEP.provinces.map((p) => p.n))
  const prov = GISTDA_SEP.provinces
    .map((p) => barRow(tr(p.th, p.en), p.n, pmax, 'var(--aqi-watch)'))
    .join('')
  const agri = GISTDA_SEP.classes[0].n
  const pct = Math.round((agri / GISTDA_SEP.total) * 100)
  return `
    <section class="rp-section">
      <h2>${tr('2. หน้าตาของฤดูเผาเกษตร', '2. What the agricultural burning season looks like')}</h2>
      <p class="rp-lead">${tr(
        `จุดความร้อน ${GISTDA_SEP.total} จุด · ${GISTDA_SEP.window} · เซนเซอร์ Suomi NPP (VIIRS) · ข้อมูล GISTDA`,
        `${GISTDA_SEP.total} hotspots · ${GISTDA_SEP.window} · Suomi NPP (VIIRS) · GISTDA`
      )}</p>
      <div class="bn-bars">${rows}</div>
      <p>${tr(
        `ในสัปดาห์นี้ ${agri} จาก ${GISTDA_SEP.total} จุด (${pct}%) อยู่ในพื้นที่เกษตร ส่วนป่าอนุรักษ์และป่าสงวนรวมกันได้เพียง 35 จุด`,
        `In this week ${agri} of ${GISTDA_SEP.total} detections (${pct}%) sat on agricultural land, while conservation and reserved forest together accounted for just 35.`
      )}</p>
      <h3>${tr('จังหวัดที่พบมากที่สุด', 'Where it concentrates')}</h3>
      <div class="bn-bars">${prov}</div>
      <p>${tr(
        'สังเกตว่าไม่มีจังหวัดภาคเหนือที่มักเป็นข่าวเรื่องหมอกควันเลย ทั้งห้าจังหวัดแรกอยู่ในที่ราบภาคกลางและภาคใต้ ซึ่งเป็นพื้นที่ปลูกข้าวเป็นหลัก นี่คือฤดูเผาคนละฤดูกับที่คนทั่วไปนึกถึง',
        'None of the northern provinces that dominate haze coverage appear here. All five are central-plains and southern rice country. This is a different burning season from the one the public argues about.'
      )}</p>
    </section>`
}


// Stacked monthly columns. The shape IS the argument: rice front-loads
// the season, cane peaks two months later, and the two together make
// January-March the wall.
function svgCalendar() {
  const M = SEASON_2526.months
  const max = Math.max(...M.map((x) => x.total))
  const W = 62, H = 118, GAP = 8
  const cols = M.map((x, i) => {
    const px = i * (W + GAP)
    const h = (v) => Math.round((v / max) * H)
    const hp = h(x.paddy), hc = h(x.cane), hk = h(x.corn)
    let y = H
    const seg = (hh, fill) => { y -= hh; return `<rect x="${px}" y="${y}" width="${W}" height="${hh}" fill="${fill}"/>` }
    const bars = seg(hp, 'var(--aqi-watch)') + seg(hc, 'var(--th-red)') + seg(hk, 'var(--th-sage)')
    return `${bars}
      <text x="${px + W / 2}" y="${H + 13}" class="bn-svg-lbl" text-anchor="middle">${tr(x.th, x.en)}</text>
      <text x="${px + W / 2}" y="${y - 4}" class="bn-svg-sub" text-anchor="middle">${(x.total / 1e6).toFixed(1)}M</text>`
  }).join('')
  return `
    <svg viewBox="0 0 ${M.length * (W + GAP)} ${H + 42}" class="bn-svg bn-svg--wide" role="img"
         aria-label="${tr('พื้นที่เผาไหม้รายเดือน แยกตามพืช', 'Monthly burned area by crop')}">
      ${cols}
      <g transform="translate(0,${H + 34})">
        <rect x="0" y="-9" width="11" height="11" fill="var(--aqi-watch)"/><text x="16" y="0" class="bn-svg-sub">${tr('ข้าว', 'rice')}</text>
        <rect x="62" y="-9" width="11" height="11" fill="var(--th-red)"/><text x="78" y="0" class="bn-svg-sub">${tr('อ้อย', 'sugarcane')}</text>
        <rect x="140" y="-9" width="11" height="11" fill="var(--th-sage)"/><text x="156" y="0" class="bn-svg-sub">${tr('ข้าวโพด', 'maize')}</text>
      </g>
    </svg>`
}

function sectionCalendar() {
  const t = SEASON_2526.total
  return `
    <section class="rp-section">
      <h2>${tr('3. ปฏิทินการเผา — พืชแต่ละชนิดเผาคนละเดือน', '3. The burning calendar — each crop burns in a different month')}</h2>
      <p class="rp-lead">${tr(
        `ฤดูหมอกควัน 2568/69 (พ.ย.–เม.ย.) รวม ${t.toLocaleString()} ไร่ · ดาวเทียม Sentinel-2 ความละเอียด 20 ม. · ระบบตามรอยเผา (สสน. + ม.เกษตรศาสตร์)`,
        `2025/26 dust-smoke season (Nov–Apr): ${t.toLocaleString()} rai burned · Sentinel-2 at 20 m · ตามรอยเผา (HII + Kasetsart University)`
      )}</p>
      <div class="rp-figure">${svgCalendar()}</div>
      <p>${tr(
        'ข้าวเผาก่อน — สูงสุดในเดือนมกราคม (2.26 ล้านไร่) ส่วนอ้อยขึ้นถึงจุดสูงสุดช้ากว่าสองเดือน คือเดือนมีนาคม (1.26 ล้านไร่) เพราะอ้อยเผาตามรอบการเข้าหีบของโรงงานน้ำตาล ไม่ใช่ตามรอบเก็บเกี่ยวข้าว ทั้งสองอย่างซ้อนกันในเดือนมกราคมถึงมีนาคม ซึ่งเป็นช่วงที่ค่าฝุ่นแย่ที่สุดของปี',
        'Rice burns first, peaking in January (2.26 M rai). Sugarcane peaks two months later, in March (1.26 M rai), because cane burning follows the sugar mills\' crushing window rather than the rice harvest. The two overlap through January–March — which is exactly when PM2.5 is worst.'
      )}</p>
      <p class="bn-callout">${tr(
        'สิ่งที่ปฏิทินนี้บอกและตัวเลขรวมทั้งปีบอกไม่ได้ คือมาตรการที่ได้ผลกับข้าวในเดือนธันวาคมแทบไม่มีผลกับอ้อยในเดือนมีนาคม เพราะเป็นพืชคนละชนิด คนละเหตุผล และคนละรอบเวลา',
        'What the calendar shows and an annual total cannot: a measure that works on rice in December does almost nothing for cane in March. Different crop, different reason, different clock.'
      )}</p>
    </section>`
}

function sectionEconomics() {
  return `
    <section class="rp-section">
      <h2>${tr('4. ทำไมถึงเผา — เหตุผลทางเศรษฐกิจ ไม่ใช่ความมักง่าย', '4. Why they burn — the economics, not carelessness')}</h2>
      <p>${tr(
        'งานสำรวจเกษตรกร 500 รายของ TDRI (ร้อยเอ็ด เชียงราย นครสวรรค์ ปราจีนบุรี) ชี้ว่าเหตุผลอันดับหนึ่งของการเผาตอซังข้าวไม่ใช่เรื่องนิสัย แต่เป็นเรื่องเครื่องมือ — ฟางติดเครื่องไถพรวนแบบโรตารี ส่วนอ้อยคือ “การเผามีต้นทุนต่ำที่สุด”',
        'TDRI surveyed 500 farmers (Roi Et, Chiang Rai, Nakhon Sawan, Prachinburi). The top reason for burning rice stubble is not habit but equipment — straw clogs the rotary tiller. For cane, burning is simply the cheapest option available.'
      )}</p>
      <p>${tr(
        'ตัวเลขที่อธิบายได้ดีที่สุดคือเรื่องกระแสเงินสด การไถกลบให้ผลตอบแทนสุทธิราว 253 บาท/ไร่ แต่มาในรูปค่าปุ๋ยที่ประหยัดได้ ซึ่งต้องรอ 110–120 วัน ขณะที่ชาวไร่อ้อยที่เผาได้ผลตอบแทนสุทธิเพียงราว 180 บาท/ไร่ แต่ได้เป็นเงินสดทันทีที่หน้าโรงงาน บวกเงินอุดหนุนจากรัฐอีก 120 บาท/ไร่',
        'The clearest number is a cash-flow one. Ploughing residue back in nets about 253 THB/rai — but as a deferred fertiliser saving that takes 110–120 days to arrive. A cane grower who burns nets only about 180 THB/rai, yet receives it as cash at the mill gate, plus a 120 THB/rai state payment.'
      )}</p>
      <p class="bn-callout">${tr(
        'เกษตรกรที่เลือกเผาจึงไม่ได้เลือกทางที่ให้ผลตอบแทนน้อยกว่าอย่างไร้เหตุผล แต่เลือกเงินวันนี้แทนเงินอีกสี่เดือนข้างหน้า มาตรการที่ไม่แก้เรื่องจังหวะเวลาของเงิน จึงเป็นการขอให้คนที่ไม่มีเงินสำรองไปกู้มาเพื่ออากาศสะอาด',
        'A farmer who burns is not irrationally choosing the smaller return — they are choosing money today over money in four months. Any measure that does not fix the timing of the money is asking people without a cash buffer to borrow in order to supply clean air.'
      )}</p>
      <p>${tr(
        'อีกจุดที่มักถูกมองข้าม คือข้าวนาปรังถูกเผาในสัดส่วนราว 57% ของพื้นที่ เทียบกับนาปีที่ราว 29% (TEI 2565) นาปรังจึงเป็นเป้าหมายที่ตรงกว่าการรณรงค์กับชาวนาทั้งประเทศ',
        'One target often missed: off-season rice (นาปรัง) is burned on about 57% of its area against roughly 29% for main-season rice (นาปี) (TEI 2022). That makes off-season rice a far sharper target than a nationwide campaign.'
      )}</p>
    </section>`
}

function sectionSensor() {
  return `
    <section class="rp-section">
      <h2>${tr('5. ตัวเลขจุดความร้อนไม่มีความหมายถ้าไม่บอกดาวเทียม', '5. A hotspot count means nothing without naming the sensor')}</h2>
      <p>${tr(
        'GISTDA ให้เลือกเซนเซอร์ได้ระหว่าง VIIRS (Suomi NPP, NOAA-20, NOAA-21) และ MODIS (Terra, Aqua) การเลือกนี้ไม่ใช่รายละเอียดทางเทคนิค แต่เปลี่ยนตัวเลขได้หลายเท่า',
        'GISTDA lets you switch between VIIRS (Suomi NPP, NOAA-20, NOAA-21) and MODIS (Terra, Aqua). That choice is not a technical footnote — it changes the answer several times over.'
      )}</p>
      <p>${tr(
        'ในข้อมูลจุดความร้อนของ HRDI จังหวัดพะเยาในปีเดียวกัน VIIRS ตรวจพบ 2,536 จุด ขณะที่ MODIS พบ 217 จุด ต่างกันราว 12 เท่า เพราะ VIIRS มีความละเอียด 375 เมตร ส่วน MODIS 1 กิโลเมตร จึงเห็นไฟกองเล็กที่ MODIS มองไม่เห็น',
        'In the HRDI hotspot record, Phayao in the same year shows 2,536 VIIRS detections against 217 from MODIS — roughly 12×. VIIRS resolves 375 m against MODIS at 1 km, so it catches small field fires MODIS never registers.'
      )}</p>
      <p class="bn-callout">${tr(
        'ดังนั้นการเทียบตัวเลขจุดความร้อนข้ามปีหรือข้ามรายงาน ต้องตรวจสอบก่อนว่าใช้ดาวเทียมตัวเดียวกันหรือไม่ มิฉะนั้นการเปลี่ยนเซนเซอร์จะดูเหมือนสถานการณ์ดีขึ้นหรือแย่ลง ทั้งที่ไฟเท่าเดิม',
        'So comparing hotspot counts across years or across reports requires checking they used the same satellite. Otherwise a change of sensor looks like a change in the fires.'
      )}</p>
    </section>`
}

function sectionEnforcement() {
  return `
    <section class="rp-section">
      <h2>${tr('6. ข้อมูลการบังคับใช้กฎหมายอ่านเป็นระดับการเผาไม่ได้', '6. Enforcement records cannot be read as a burning signal')}</h2>
      <p>${tr(
        'ในชุดข้อมูลที่เผยแพร่ เชียงใหม่มีการดำเนินคดี 21 ราย เทียบกับจุดความร้อน 13,343 จุด และสกลนครรายงานเรื่องร้องเรียนเป็นศูนย์ติดต่อกันสี่ปี',
        'In the published datasets, Chiang Mai logged 21 prosecutions against 13,343 hotspot detections, and Sakon Nakhon recorded zero complaints four years running.'
      )}</p>
      <p class="bn-callout">${tr(
        'ศูนย์เรื่องร้องเรียนไม่ได้แปลว่าอากาศสะอาด แต่แปลว่าไม่มีการรายงาน การนำตัวเลขเหล่านี้ไปจัดอันดับจังหวัดจะให้ผลกลับด้านกับความเป็นจริง',
        'Zero complaints does not mean clean air; it means nothing was recorded. Ranking provinces on these figures produces the opposite of the truth.'
      )}</p>
    </section>`
}

function sectionSatellite() {
  return `
    <section class="rp-section">
      <h2>${tr('7. ดาวเทียมบอกอะไรได้ และบอกไม่ได้', '7. What satellites can and cannot tell you')}</h2>
      <p>${tr(
        'ดาวเทียมตรวจจับ “จุดที่ร้อนผิดปกติ” ไม่ใช่ “ใครเป็นคนจุดไฟและเผาอะไร” การแยกว่าเป็นการเผาเกษตรหรือไฟป่าเกิดจากการซ้อนตำแหน่งจุดความร้อนกับแผนที่การใช้ประโยชน์ที่ดิน ไม่ใช่จากตัวเซนเซอร์เอง',
        'A satellite detects a thermal anomaly — a hot pixel. It does not detect who lit it or what is burning. Separating agricultural burning from forest fire comes from overlaying those points on a land-use map, not from the sensor itself.'
      )}</p>
      <ul class="bn-list">
        <li><strong>${tr('ชั้นควัน (AOD)', 'Aerosol (AOD)')}</strong> — ${tr('ปริมาณละอองลอยทั้งคอลัมน์อากาศ เห็นกลุ่มควันก่อนสถานีภาคพื้นดินปลายลม', 'column aerosol loading; sees a plume before downwind ground stations do')}</li>
        <li><strong>${tr('ดัชนีควัน UV', 'UV smoke index')}</strong> — ${tr('ตอบสนองต่อควันที่ดูดกลืนแสง ใช้ได้แม้เหนือพื้นสว่างที่ AOD อ่านไม่ได้', 'responds to absorbing smoke and still works over bright surfaces where AOD drops out')}</li>
        <li><strong>${tr('คาร์บอนมอนอกไซด์ (CO)', 'Carbon monoxide (CO)')}</strong> — ${tr('ตัวชี้วัดการเผาชีวมวล ที่ระดับ 500 hPa คือควันที่ลอยมาแล้ว ไม่ใช่ไฟใต้ตำแหน่งนั้น', 'the biomass-burning tracer; at 500 hPa it is smoke already travelling, not fire below')}</li>
        <li><strong>${tr('แสงไฟกลางคืน', 'Night lights')}</strong> — ${tr('การเผามักจุดตอนหัวค่ำ จึงเห็นได้ก่อนภาพกลางวัน แต่แสงจันทร์ก็ทำให้สว่างขึ้นเช่นกัน', 'burning is often lit in the evening, so it shows before daytime imagery — but moonlight brightens the scene too')}</li>
      </ul>
      <p class="bn-callout">${tr(
        'ไม่มีชั้นข้อมูล CO₂ ในระบบนี้โดยตั้งใจ CO₂ กระจายตัวสม่ำเสมอทั่วบรรยากาศและอยู่ได้นาน CO₂ เหนือแปลงนาที่กำลังเผาจึงแยกไม่ออกจาก CO₂ ที่อื่นบนโลก ใช้ระบุตำแหน่งไฟไม่ได้ และไม่บอกคุณภาพอากาศที่เราหายใจ',
        'There is deliberately no CO₂ layer here. CO₂ is well-mixed and long-lived, so CO₂ over a burning field is indistinguishable from CO₂ anywhere else on Earth. It cannot locate a fire and says nothing about the air you breathe.'
      )}</p>
    </section>`
}

function sectionGaps() {
  return `
    <section class="rp-section">
      <h2>${tr('8. สิ่งที่ข้อมูลชุดนี้ยังตอบไม่ได้', '8. What this data still cannot answer')}</h2>
      <ul class="bn-list">
        <li>${tr(
          'ตัวเลขเดือนกันยายนข้างต้นมาจากหน้าต่างเวลาเพียง 7 วัน เป็นภาพหนึ่งสัปดาห์ ไม่ใช่แนวโน้ม',
          'The September figures above come from a single 7-day window. That is one week, not a trend.'
        )}</li>
        <li>${tr(
          'GISTDA เปิด API สาธารณะ (จุดความร้อน VIIRS, พื้นที่เผาไหม้ซ้ำซาก, ร่องรอยเผาไหม้) แต่ต้องใช้ API key ระบบนี้จึงยังอ่านตัวเลขจากหน้าแดชบอร์ด ไม่ได้ดึงอัตโนมัติ',
          'GISTDA publishes an open API (VIIRS hotspots, repeat-burn areas, burn scars) but it requires an API key. These figures were read from the dashboard, not pulled automatically.'
        )}</li>
        <li>${tr(
          'การ์ด “พื้นที่เผาไหม้ 10 วันล่าสุด” บนแดชบอร์ด GISTDA แสดงช่วงวันที่ 11–20 พ.ค. 2569 ซึ่งเก่ากว่าที่ป้ายบอกหลายเดือน จึงไม่นำมาแสดงเป็นข้อมูลปัจจุบันที่นี่',
          'The GISTDA dashboard card labelled "burn scar, last 10 days" showed 11–20 May 2569 — months older than its own label. It is therefore not reproduced here as current.'
        )}</li>
        <li>${tr(
          'ยังไม่มีการเชื่อมโยงเชิงสาเหตุระหว่างจุดความร้อนกับค่า PM2.5 ที่สถานีใดสถานีหนึ่ง ลมและความสูงของชั้นควันเป็นตัวกำหนดว่าควันจะตกที่ไหน',
          'Nothing here establishes a causal link between a given hotspot and a given station PM2.5 reading. Wind and plume height decide where smoke lands.'
        )}</li>
      </ul>
    </section>`
}

function sectionSources() {
  const rows = [
    ['GISTDA — ระบบภัยพิบัติ / disaster dashboard', 'https://disaster.gistda.or.th/dashboard'],
    ['GISTDA — Open API (ต้องใช้ key / API key required)', 'https://disaster.gistda.or.th/services/open-api?type=fire'],
    ['HRDI — จุดความร้อน / hotspot records', 'https://data.go.th/'],
    ['กรมอุทยานฯ (DNP) — การเข้าดับไฟป่า / fire response', 'https://data.go.th/'],
    ['ตามรอยเผา (สสน./ม.เกษตรศาสตร์) — รอยเผาภาคเกษตร Sentinel-2 / agri burn scars', 'https://tamroypao.hii.or.th/openburn/map.jsp'],
    ['TDRI — เศรษฐศาสตร์การจัดการชีวมวล / biomass management economics', 'https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/'],
    ['กรมส่งเสริมการเกษตร — แผนที่เสี่ยงเผา / DOAE burn-risk map', 'https://riskmap.doae.go.th/hnb_page'],
    ['NASA GIBS — AOD, UV aerosol index, CO, night lights', 'https://gibs.earthdata.nasa.gov/'],
  ].map(([n, u]) => `<li><span>${n}</span><a href="${u}" target="_blank" rel="noopener">${u}</a></li>`).join('')
  return `
    <section class="rp-section">
      <h2>${tr('แหล่งข้อมูลของหน้านี้', 'Sources for this page')}</h2>
      <ul class="bn-src">${rows}</ul>
    </section>`
}

function paint() {
  const el = document.getElementById('burning-content')
  if (!el) return
  el.innerHTML = [
    sectionLede(),
    sectionInversion(),
    sectionSeptember(),
    sectionCalendar(),
    sectionEconomics(),
    sectionSensor(),
    sectionEnforcement(),
    sectionSatellite(),
    sectionGaps(),
    sectionSources(),
  ].join('')
}

let wired = false

export function initBurning() {
  const overlay = document.getElementById('about-overlay')
  if (!overlay || wired) return
  wired = true
  for (const tab of overlay.querySelectorAll('.about-tab')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.aboutPane === 'burning') paint()
    })
  }
  on('lang', () => {
    if (document.querySelector('.about-pane[data-about-pane="burning"]')?.classList.contains('active')) paint()
  })
}
